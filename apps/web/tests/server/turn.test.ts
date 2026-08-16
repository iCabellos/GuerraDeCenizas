/**
 * La capa de autoridad, contra un Postgres real.
 *
 * Los criterios de aceptación de v0.3 que se comprueban aquí:
 *
 *   □ 10 peticiones simultáneas de resolución ⇒ 1 sola resolución
 *   □ Un turno vencido se resuelve sin ningún cliente conectado
 *   □ 3 turnos sin enviar ⇒ Mando Automático
 *   □ Una partida reproducida desde (seed, órdenes) da el mismo checksum
 *
 * Ejecutan el código real de `lib/server/`, no un doble: lo único que se inyecta es el
 * transporte. Un test de concurrencia contra una base simulada no probaría nada, porque
 * lo que se está probando **es** la base de datos.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ENGINE_VERSION, reduce, type GameState, type Orders, type Seat } from '@gdc/core';
import { createGame, joinGame, startGame } from '../../lib/server/games';
import { resolveTurn } from '../../lib/server/resolve';
import { rpc, scalar } from './rpc';

const HOST = '00000000-0000-4000-8000-0000000000a0';
const GUEST_1 = '00000000-0000-4000-8000-0000000000a1';
const GUEST_2 = '00000000-0000-4000-8000-0000000000a2';
const PROFILES = [HOST, GUEST_1, GUEST_2];

function sql(text: string): string {
  return scalar(text);
}

function freshAccounts(): void {
  sql(`truncate table public.player_views, public.orders, public.game_states,
                      public.game_players, public.games, public.cities,
                      public.profiles restart identity cascade;
       delete from auth.users;`);
  PROFILES.forEach((id, index) => {
    // El alta en `auth.users` ya crea el perfil (migración 0009), así que esto lo
    // renombra en vez de crearlo. `do update` y no `do nothing`: los asertos de abajo
    // hablan de «Jugadora N» y de una facción concreta.
    sql(`insert into auth.users (id, email) values ('${id}', 'j${index}@ceniza.test');
         insert into public.profiles (id, display_name, faction_id)
         values ('${id}', 'Jugadora ${index}', '${['vantera', 'koldvik', 'saranth'][index]}')
         on conflict (id) do update
           set display_name = excluded.display_name, faction_id = excluded.faction_id;`);
  });
}

/** Partida de tres asientos ya empezada, en el turno 0. */
async function startedGame(cadence: 'blitz' | 'daily' = 'blitz') {
  const created = await createGame(rpc, HOST, {
    playerCount: 3, cadence, visibility: 'private',
  });
  expect(created.ok).toBe(true);

  for (const guest of [GUEST_1, GUEST_2]) {
    const joined = await joinGame(rpc, guest, created.invite_code!);
    expect(joined.ok, JSON.stringify(joined)).toBe(true);
  }

  const started = await startGame(rpc, {
    gameId: created.game_id, hostProfileId: HOST, now: new Date(),
  });
  expect(started.ok, JSON.stringify(started)).toBe(true);

  const seed = Number(sql(`select map_seed from public.games where id = '${created.game_id}'`));
  return { gameId: created.game_id, seed, code: created.invite_code! };
}

function loadState(gameId: string, turn: number): GameState {
  return JSON.parse(
    sql(`select state from public.game_states where game_id = '${gameId}' and turn = ${turn}`),
  ) as GameState;
}

function submitOrders(gameId: string, turn: number, seat: Seat, orders: Orders): void {
  sql(`insert into public.orders (game_id, turn, seat, payload, submitted_at)
       values ('${gameId}', ${turn}, ${seat},
               '${JSON.stringify(orders).replace(/'/g, "''")}'::jsonb, now())
       on conflict (game_id, turn, seat) do update
         set payload = excluded.payload, submitted_at = now()`);
}

function holdOrders(state: GameState, seat: Seat): Orders {
  return {
    turn: state.meta.turn,
    moves: state.forces.filter((f) => f.seat === seat)
      .map((f) => ({ forceId: f.id, posture: 'hold' as const })),
  };
}

beforeEach(() => {
  freshAccounts();
});

describe('crear, unirse y empezar', () => {
  it('la partida nace con todos los asientos y solo el creador sentado', async () => {
    const created = await createGame(rpc, HOST, {
      playerCount: 5, cadence: 'daily', visibility: 'private',
    });

    expect(created.ok).toBe(true);
    expect(created.invite_code).toMatch(/^[ACDEFGHJKMNPQRTUVWXY34679]{6}$/);
    expect(sql(`select count(*) from public.game_players where game_id = '${created.game_id}'`))
      .toBe('5');
    expect(sql(`select count(*) from public.game_players
                 where game_id = '${created.game_id}' and profile_id is not null`)).toBe('1');
  });

  it('el código de invitación no distingue mayúsculas: se dicta en voz alta', async () => {
    const created = await createGame(rpc, HOST, {
      playerCount: 3, cadence: 'blitz', visibility: 'private',
    });
    const joined = await joinGame(rpc, GUEST_1, created.invite_code!.toLowerCase());
    expect(joined.ok).toBe(true);
    expect(joined.seat).toBe(1);
  });

  it('reincorporarse no consume un segundo asiento', async () => {
    const created = await createGame(rpc, HOST, {
      playerCount: 3, cadence: 'blitz', visibility: 'private',
    });
    await joinGame(rpc, GUEST_1, created.invite_code!);
    const again = await joinGame(rpc, GUEST_1, created.invite_code!);

    expect(again.rejoined).toBe(true);
    expect(again.seat).toBe(1);
  });

  it('no se puede empezar con asientos vacíos', async () => {
    const created = await createGame(rpc, HOST, {
      playerCount: 3, cadence: 'blitz', visibility: 'private',
    });

    // Solo está el anfitrión: faltan dos. No puede lanzar una excepción — el jugador
    // merece «todavía falta gente», no un 500.
    const started = await startGame(rpc, {
      gameId: created.game_id, hostProfileId: HOST, now: new Date(),
    });
    expect(started.ok).toBe(false);
    expect(started.code).toBe('seats_empty');
  });

  it('solo el creador puede empezarla', async () => {
    const created = await createGame(rpc, HOST, {
      playerCount: 3, cadence: 'blitz', visibility: 'private',
    });
    await joinGame(rpc, GUEST_1, created.invite_code!);
    await joinGame(rpc, GUEST_2, created.invite_code!);

    const started = await startGame(rpc, {
      gameId: created.game_id, hostProfileId: GUEST_1, now: new Date(),
    });
    expect(started.ok).toBe(false);
    expect(started.code).toBe('not_the_host');
  });

  it('empezar deja el turno 0 escrito y una vista por asiento', async () => {
    const { gameId } = await startedGame();

    expect(sql(`select status from public.games where id = '${gameId}'`)).toBe('active');
    expect(sql(`select count(*) from public.game_states where game_id = '${gameId}'`)).toBe('1');
    expect(sql(`select count(*) from public.player_views
                 where game_id = '${gameId}' and turn = 0`)).toBe('3');
  });

  it('cada vista inicial trae solo su asiento', async () => {
    const { gameId } = await startedGame();
    for (const seat of [0, 1, 2]) {
      expect(sql(`select view->>'seat' from public.player_views
                   where game_id = '${gameId}' and turn = 0 and seat = ${seat}`))
        .toBe(String(seat));
    }
  });
});

describe('resolución del turno', () => {
  it('no resuelve mientras falte alguien por enviar', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    submitOrders(gameId, 0, 0, holdOrders(state, 0));

    const outcome = await resolveTurn(rpc, gameId, new Date());
    expect(outcome.resolved).toBe(false);
    expect(outcome.skipped).toBe('not_ready');
  });

  it('resuelve en cuanto envían todos, sin esperar al plazo', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, 0, seat, holdOrders(state, seat));

    const outcome = await resolveTurn(rpc, gameId, new Date());
    expect(outcome.resolved).toBe(true);
    expect(outcome.turn).toBe(1);
    expect(sql(`select turn from public.games where id = '${gameId}'`)).toBe('1');
    expect(sql(`select count(*) from public.player_views
                 where game_id = '${gameId}' and turn = 1`)).toBe('3');
  });

  it('un turno vencido se resuelve sin que nadie haya enviado nada', async () => {
    // Criterio de aceptación: la partida no puede depender de que haya alguien conectado.
    const { gameId } = await startedGame('blitz');
    sql(`update public.games set deadline_at = now() - interval '1 minute'
          where id = '${gameId}'`);

    const outcome = await resolveTurn(rpc, gameId, new Date());
    expect(outcome.resolved).toBe(true);
    expect(sql(`select count(*) from public.orders
                 where game_id = '${gameId}' and turn = 0 and source = 'standing'`)).toBe('3');
  });

  it('las órdenes generadas por ausencia quedan guardadas', async () => {
    // Sin ellas, reproducir la partida desde (semilla, órdenes) daría otro resultado.
    const { gameId } = await startedGame('blitz');
    sql(`update public.games set deadline_at = now() - interval '1 minute'
          where id = '${gameId}'`);
    await resolveTurn(rpc, gameId, new Date());

    expect(sql(`select count(*) from public.orders
                 where game_id = '${gameId}' and turn = 0 and applied is not null`)).toBe('3');
  });

  it('las ausencias suman y las presencias reinician el contador', async () => {
    const { gameId } = await startedGame('blitz');
    const state = loadState(gameId, 0);
    submitOrders(gameId, 0, 0, holdOrders(state, 0));
    sql(`update public.games set deadline_at = now() - interval '1 minute'
          where id = '${gameId}'`);
    await resolveTurn(rpc, gameId, new Date());

    expect(sql(`select missed_turns from public.game_players
                 where game_id = '${gameId}' and seat = 0`)).toBe('0');
    expect(sql(`select missed_turns from public.game_players
                 where game_id = '${gameId}' and seat = 1`)).toBe('1');
  });

  it('a los tres turnos sin enviar, el asiento pasa a Mando Automático', async () => {
    const { gameId } = await startedGame('blitz');
    sql(`update public.game_players set missed_turns = 3
          where game_id = '${gameId}' and seat = 2`);
    sql(`update public.games set deadline_at = now() - interval '1 minute'
          where id = '${gameId}'`);

    await resolveTurn(rpc, gameId, new Date());

    expect(sql(`select source from public.orders
                 where game_id = '${gameId}' and turn = 0 and seat = 2`)).toBe('autocommand');
    expect(sql(`select source from public.orders
                 where game_id = '${gameId}' and turn = 0 and seat = 1`)).toBe('standing');
  });

  it('un borrador no cuenta como turno enviado', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    for (const seat of [0, 1, 2] as Seat[]) {
      sql(`insert into public.orders (game_id, turn, seat, payload)
           values ('${gameId}', 0, ${seat},
                   '${JSON.stringify(holdOrders(state, seat))}'::jsonb)`);
    }
    expect((await resolveTurn(rpc, gameId, new Date())).skipped).toBe('not_ready');
  });
});

describe('enviar órdenes', () => {
  it('el asiento sale de quién eres, no de lo que mandes', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);

    const sent = await rpc('submit_orders', {
      p_game: gameId, p_profile: GUEST_2, p_turn: 0,
      p_payload: holdOrders(state, 0), p_submit: true,
    }) as { ok: boolean; seat: number };

    // GUEST_2 está en el asiento 2 aunque haya mandado las órdenes del 0.
    expect(sent.ok).toBe(true);
    expect(sent.seat).toBe(2);
    expect(sql(`select count(*) from public.orders
                 where game_id = '${gameId}' and turn = 0 and seat = 0`)).toBe('0');
  });

  it('quien no juega esta partida no puede enviar nada', async () => {
    const { gameId } = await startedGame('daily');
    sql(`insert into auth.users (id, email)
         values ('00000000-0000-4000-8000-0000000000ff', 'nadie@ceniza.test');
         insert into public.profiles (id, display_name)
         values ('00000000-0000-4000-8000-0000000000ff', 'Forastera')
         on conflict (id) do update set display_name = excluded.display_name`);

    const sent = await rpc('submit_orders', {
      p_game: gameId, p_profile: '00000000-0000-4000-8000-0000000000ff', p_turn: 0,
      p_payload: { turn: 0, moves: [] }, p_submit: true,
    }) as { ok: boolean; code: string };

    expect(sent.ok).toBe(false);
    expect(sent.code).toBe('not_your_seat');
  });

  it('un turno que no es el actual se rechaza', async () => {
    const { gameId } = await startedGame('daily');
    for (const turn of [1, 7]) {
      const sent = await rpc('submit_orders', {
        p_game: gameId, p_profile: HOST, p_turn: turn,
        p_payload: { turn, moves: [] }, p_submit: true,
      }) as { ok: boolean; code: string; turn: number };
      expect(sent.ok).toBe(false);
      expect(sent.code).toBe('wrong_turn');
      expect(sent.turn).toBe(0);
    }
  });

  it('guardar un borrador después de enviar no retira el envío', async () => {
    // Si lo retirase, un guardado automático a destiempo desharía el turno ya
    // comprometido y la partida se quedaría esperando a alguien que ya jugó.
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);

    await rpc('submit_orders', {
      p_game: gameId, p_profile: HOST, p_turn: 0,
      p_payload: holdOrders(state, 0), p_submit: true,
    });
    await rpc('submit_orders', {
      p_game: gameId, p_profile: HOST, p_turn: 0,
      p_payload: { turn: 0, moves: [] }, p_submit: false,
    });

    expect(sql(`select submitted_at is not null from public.orders
                 where game_id = '${gameId}' and turn = 0 and seat = 0`)).toBe('t');
  });

  it('dice cuántos faltan sin necesidad de otra petición', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);

    const first = await rpc('submit_orders', {
      p_game: gameId, p_profile: HOST, p_turn: 0,
      p_payload: holdOrders(state, 0), p_submit: true,
    }) as { pending: number };
    expect(first.pending).toBe(2);
  });
});

describe('concurrencia', () => {
  it('diez resoluciones simultáneas producen un solo turno', async () => {
    // El criterio de aceptación literal de v0.3. El arrendamiento evita trabajo
    // duplicado, pero quien garantiza la corrección es `state_version`.
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, 0, seat, holdOrders(state, seat));

    const now = new Date();
    const outcomes = await Promise.all(
      Array.from({ length: 10 }, () => resolveTurn(rpc, gameId, now)),
    );

    expect(outcomes.filter((o) => o.resolved)).toHaveLength(1);
    expect(sql(`select turn from public.games where id = '${gameId}'`)).toBe('1');
    expect(sql(`select count(*) from public.player_views
                 where game_id = '${gameId}' and turn = 1`)).toBe('3');
    expect(sql(`select state_version from public.games where id = '${gameId}'`)).toBe('2');
  });

  it('el arrendamiento vencido no bloquea la partida para siempre', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, 0, seat, holdOrders(state, seat));

    // Un resolutor que murió a media faena deja el arrendamiento puesto.
    sql(`update public.games set resolving_until = now() - interval '1 second'
          where id = '${gameId}'`);

    expect((await resolveTurn(rpc, gameId, new Date())).resolved).toBe(true);
  });

  it('un arrendamiento vivo rechaza al segundo resolutor', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, 0, seat, holdOrders(state, seat));
    sql(`update public.games set resolving_until = now() + interval '30 seconds'
          where id = '${gameId}'`);

    expect((await resolveTurn(rpc, gameId, new Date())).skipped).toBe('in_progress');
  });
});

describe('reproducibilidad', () => {
  it('la partida rejugada desde (semilla, órdenes) da el mismo checksum', async () => {
    // Es lo que hace auditable una campaña: cualquiera con la semilla y las órdenes
    // puede recomputar el resultado y comprobar que el servidor no hizo trampas.
    const { gameId } = await startedGame('daily');

    for (let turn = 0; turn < 3; turn += 1) {
      const state = loadState(gameId, turn);
      for (const seat of [0, 1, 2] as Seat[]) {
        submitOrders(gameId, turn, seat, holdOrders(state, seat));
      }
      expect((await resolveTurn(rpc, gameId, new Date())).resolved).toBe(true);
    }

    const stored = sql(`select checksum from public.game_states
                         where game_id = '${gameId}' and turn = 3`);

    // Rejugada desde el turno 0 con las órdenes que quedaron guardadas.
    let replay = loadState(gameId, 0);
    for (let turn = 0; turn < 3; turn += 1) {
      const rows = JSON.parse(
        sql(`select coalesce(jsonb_agg(jsonb_build_object('seat', seat, 'applied', applied)
                              order by seat), '[]'::jsonb)
               from public.orders where game_id = '${gameId}' and turn = ${turn}`),
      ) as { seat: number; applied: Orders }[];
      const orders = Object.fromEntries(rows.map((row) => [row.seat, row.applied]));
      const deadline = Number(
        sql(`select extract(epoch from deadline_at) * 1000 from public.games
              where id = '${gameId}'`),
      );
      replay = reduce(replay, orders, { engineVersion: ENGINE_VERSION, now: deadline }).state;
    }

    // El checksum no depende de `now`: el estado no lo guarda. Si algún día lo guardara,
    // este test lo cazaría de inmediato.
    const { checksum } = await import('@gdc/core');
    expect(checksum(replay)).toBe(stored);
  });

  it('el estado guardado no incluye el reloj', async () => {
    const { gameId } = await startedGame('daily');
    const state = loadState(gameId, 0);
    for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, 0, seat, holdOrders(state, seat));
    await resolveTurn(rpc, gameId, new Date());

    const next = loadState(gameId, 1);
    expect(JSON.stringify(next)).not.toMatch(/"(now|at|timestamp|deadline)"\s*:/);
  });
});

describe('retención', () => {
  it('los estados intermedios se descartan y se conservan los múltiplos de 4', async () => {
    const { gameId } = await startedGame('daily');
    for (let turn = 0; turn < 6; turn += 1) {
      const state = loadState(gameId, turn);
      for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, turn, seat, holdOrders(state, seat));
      await resolveTurn(rpc, gameId, new Date());
    }

    const kept = sql(`select string_agg(turn::text, ',' order by turn)
                        from public.game_states where game_id = '${gameId}'`);
    expect(kept).toBe('0,4,6');
  });

  it('solo se guardan las vistas de los últimos turnos', async () => {
    const { gameId } = await startedGame('daily');
    for (let turn = 0; turn < 5; turn += 1) {
      const state = loadState(gameId, turn);
      for (const seat of [0, 1, 2] as Seat[]) submitOrders(gameId, turn, seat, holdOrders(state, seat));
      await resolveTurn(rpc, gameId, new Date());
    }

    // Retención documentada: los tres últimos turnos (TECHNICAL_DESIGN §5.3). El
    // historial anterior se reconstruye a demanda desde (semilla, órdenes).
    const turns = sql(`select string_agg(distinct turn::text, ',' order by turn::text)
                         from public.player_views where game_id = '${gameId}'`);
    expect(turns).toBe('3,4,5');
  });
});
