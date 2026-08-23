/**
 * Emparejamiento, contra el Postgres real.
 *
 * Lo que se prueba aquí no es que la cola funcione: es que **nadie se quede fuera**. Un
 * jugador que sale de la cola sin partida, o dos partidas que se reparten al mismo
 * jugador, son fallos de los que no se sale — y los dos son carreras, así que solo se ven
 * ejecutando la base de datos de verdad.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cancel, formMatch, search, status } from '../../lib/server/matchmaking';
import { rpc, scalar } from './rpc';

const PROFILES = Array.from(
  { length: 6 },
  (_, index) => `00000000-0000-4000-8000-0000000000b${index}`,
);

function sql(text: string): string {
  return scalar(text);
}

beforeEach(() => {
  sql(`truncate table public.matchmaking_queue, public.player_views, public.orders,
                      public.game_states, public.game_players, public.games,
                      public.cities, public.profiles restart identity cascade;
       delete from auth.users;`);
  PROFILES.forEach((id, index) => {
    // El perfil ya existe: lo crea el trigger de alta al insertar en `auth.users`
    // (migración 0009). Esto lo renombra para que los asertos puedan nombrarlo.
    sql(`insert into auth.users (id, email) values ('${id}', 'q${index}@ceniza.test');
         insert into public.profiles (id, display_name, faction_id)
         values ('${id}', 'Jugadora ${index}',
                 '${['vantera', 'koldvik', 'saranth', 'meridia', 'oshara', 'tarn'][index]}')
         on conflict (id) do update
           set display_name = excluded.display_name, faction_id = excluded.faction_id`);
  });
});

describe('la cola', () => {
  it('el primero espera y sabe cuántos faltan', async () => {
    const outcome = await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });

    expect(outcome.gameId).toBeUndefined();
    expect(outcome.waiting).toBe(1);
    expect(outcome.needed).toBe(3);
  });

  it('un perfil no puede ocupar dos sitios a la vez', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    await search(rpc, PROFILES[0]!, { playerCount: 5, cadence: 'daily' });

    expect(sql('select count(*) from public.matchmaking_queue')).toBe('1');
    expect(sql('select player_count from public.matchmaking_queue')).toBe('5');
  });

  it('cambiar de tamaño reinicia la antigüedad', async () => {
    // Si no, se podría esperar en la cola de 5 y saltar al principio de la de 2 en cuanto
    // conviniera, colándose delante de quien llevaba esperando de verdad.
    await search(rpc, PROFILES[0]!, { playerCount: 5, cadence: 'blitz' });
    sql(`update public.matchmaking_queue set joined_at = now() - interval '10 minutes'`);
    await search(rpc, PROFILES[0]!, { playerCount: 2, cadence: 'blitz' });

    expect(Number(sql(`select floor(extract(epoch from now() - joined_at))
                         from public.matchmaking_queue`))).toBeLessThan(5);
  });

  it('salir de la cola la deja vacía', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    await cancel(rpc, PROFILES[0]!);

    expect((await status(rpc, PROFILES[0]!)).queued).toBe(false);
    expect(sql('select count(*) from public.matchmaking_queue')).toBe('0');
  });

  it('las colas de distinto tamaño no se mezclan', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 2, cadence: 'blitz' });
    const second = await search(rpc, PROFILES[1]!, { playerCount: 3, cadence: 'blitz' });

    expect(second.gameId).toBeUndefined();
    expect(second.waiting).toBe(1);
  });

  it('la misma cadencia también separa', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 2, cadence: 'blitz' });
    const second = await search(rpc, PROFILES[1]!, { playerCount: 2, cadence: 'daily' });

    expect(second.gameId).toBeUndefined();
  });
});

describe('formar la partida', () => {
  it('al completarse el grupo, la partida empieza sola', async () => {
    // Sin sala de espera: es lo que convierte «jugar» en una sola pulsación.
    await search(rpc, PROFILES[0]!, { playerCount: 2, cadence: 'blitz' });
    const outcome = await search(rpc, PROFILES[1]!, { playerCount: 2, cadence: 'blitz' });

    expect(outcome.gameId).toBeDefined();
    expect(sql(`select status from public.games where id = '${outcome.gameId}'`)).toBe('active');
    expect(sql(`select count(*) from public.player_views
                 where game_id = '${outcome.gameId}' and turn = 0`)).toBe('2');
    expect(sql('select count(*) from public.matchmaking_queue')).toBe('0');
  });

  it('sienta a todos en el orden en que llegaron', async () => {
    for (const profile of PROFILES.slice(0, 3)) {
      await search(rpc, profile, { playerCount: 3, cadence: 'blitz' });
      sql(`update public.matchmaking_queue set joined_at = now()
            where profile_id = '${profile}'`);
    }
    const game = sql('select id from public.games limit 1');

    const seats = sql(`select string_agg(profile_id::text, ',' order by seat)
                         from public.game_players where game_id = '${game}'`);
    expect(seats).toBe(PROFILES.slice(0, 3).join(','));
  });

  it('cada asiento arranca con su propia facción', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 2, cadence: 'blitz' });
    await search(rpc, PROFILES[1]!, { playerCount: 2, cadence: 'blitz' });
    const game = sql('select id from public.games limit 1');

    expect(sql(`select string_agg(faction_id, ',' order by seat)
                  from public.game_players where game_id = '${game}'`)).toBe('vantera,koldvik');
  });

  it('nadie se queda esperando para siempre: los huecos los ocupa el Mando Automático', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    // El jugador lleva esperando más de lo tolerable.
    sql(`update public.matchmaking_queue set joined_at = now() - interval '5 minutes'`);

    const gameId = await formMatch(rpc, 3, 'blitz');

    expect(gameId).toBeTruthy();
    expect(sql(`select count(*) from public.game_players
                 where game_id = '${gameId}' and is_bot`)).toBe('2');
    expect(sql(`select status from public.games where id = '${gameId}'`)).toBe('active');
  });

  it('antes de ese plazo no se rellena con bots', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    expect(await formMatch(rpc, 3, 'blitz')).toBeNull();
    expect(sql('select count(*) from public.games')).toBe('0');
  });

  it('con la cola vacía no se crea nada', async () => {
    expect(await formMatch(rpc, 5, 'daily')).toBeNull();
    expect(sql('select count(*) from public.games')).toBe('0');
  });

  it('sobra gente en la cola: los que no entran siguen esperando', async () => {
    for (const profile of PROFILES.slice(0, 3)) {
      await search(rpc, profile, { playerCount: 2, cadence: 'blitz' });
    }
    // Dos formaron partida al segundo; el tercero se queda.
    expect(sql('select count(*) from public.matchmaking_queue')).toBe('1');
    expect(sql('select count(*) from public.games')).toBe('1');
  });
});

describe('concurrencia', () => {
  it('dos búsquedas simultáneas no reparten el mismo jugador a dos partidas', async () => {
    // `for update skip locked` es lo que lo impide: la segunda salta las filas que la
    // primera tiene cerradas, en vez de esperarlas y llevárselas después.
    await search(rpc, PROFILES[0]!, { playerCount: 2, cadence: 'blitz' });
    await search(rpc, PROFILES[1]!, { playerCount: 2, cadence: 'blitz' });
    await search(rpc, PROFILES[2]!, { playerCount: 2, cadence: 'blitz' });
    await search(rpc, PROFILES[3]!, { playerCount: 2, cadence: 'blitz' });

    const seated = sql(`select count(distinct profile_id) from public.game_players
                         where profile_id is not null`);
    const rows = sql('select count(*) from public.game_players where profile_id is not null');

    // Nadie sentado dos veces.
    expect(seated).toBe(rows);
    expect(sql('select count(*) from public.games')).toBe('2');
  });

  it('diez formaciones simultáneas sobre la misma cola no duplican partidas', async () => {
    for (const profile of PROFILES.slice(0, 2)) {
      await search(rpc, profile, { playerCount: 2, cadence: 'daily' });
    }
    // La partida ya se formó en el segundo `search`. Insistir no puede crear otra.
    const extra = await Promise.all(
      Array.from({ length: 10 }, () => formMatch(rpc, 2, 'daily')),
    );

    expect(extra.every((game) => game === null)).toBe(true);
    expect(sql('select count(*) from public.games')).toBe('1');
  });
});

describe('lo que el jugador ve mientras espera', () => {
  it('sabe cuántos hay y cuánto lleva, sin necesidad de una frase', async () => {
    await search(rpc, PROFILES[0]!, { playerCount: 5, cadence: 'daily' });
    await search(rpc, PROFILES[1]!, { playerCount: 5, cadence: 'daily' });

    const mine = await status(rpc, PROFILES[0]!);
    expect(mine.queued).toBe(true);
    expect(mine.waiting).toBe(2);
    expect(mine.player_count).toBe(5);
    expect(mine.waited_seconds).toBeGreaterThanOrEqual(0);
  });

  it('quien no está en cola lo sabe y ya', async () => {
    expect(await status(rpc, PROFILES[4]!)).toEqual({ ok: true, queued: false });
  });
});

/**
 * Rivales artificiales.
 *
 * Antes del despliegue no hay nadie más en la cola, así que el relleno con bots no es un
 * caso raro: **es el caso**. Lo que se comprueba es que un jugador solo entra en campaña
 * al instante y que la mesa que se encuentra parece una mesa — rivales con nombre y con
 * facción, no tres asientos etiquetados «Mando Automático».
 */
describe('rivales artificiales', () => {
  // `BOT_FILL_SECONDS=0` es lo que se despliega mientras el juego no está abierto. Se
  // activa aquí y solo aquí: con cero, la cola de humanos deja de tener sentido, y los
  // tests de más arriba cubren justamente eso para cuando se quite.
  beforeEach(() => { process.env['BOT_FILL_SECONDS'] = '0'; });
  afterEach(() => { delete process.env['BOT_FILL_SECONDS']; });

  it('quien busca solo entra en campaña al instante, sin esperar a nadie', async () => {
    const outcome = await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    expect(outcome.gameId, 'debería haber empezado ya').toBeDefined();
  });

  it('los asientos que sobran son bots con nombre y facción propios', async () => {
    const outcome = await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    const game = outcome.gameId!;

    const bots = sql(`select count(*) from public.game_players
                       where game_id = '${game}' and is_bot`);
    expect(Number(bots), 'dos asientos deberían ser bots').toBe(2);

    const anonymous = sql(`select count(*) from public.game_players
                            where game_id = '${game}' and is_bot
                              and (bot_name is null or faction_id is null)`);
    expect(Number(anonymous), 'ningún bot puede quedarse sin nombre ni facción').toBe(0);
  });

  it('el nombre del bot llega al estado de la partida, no la etiqueta del sistema', async () => {
    const outcome = await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    const names = sql(`select string_agg(coalesce(p.display_name, gp.bot_name), ',' order by gp.seat)
                         from public.game_players gp
                         left join public.profiles p on p.id = gp.profile_id
                        where gp.game_id = '${outcome.gameId}'`);

    expect(names).not.toContain('Mando Automático');
    expect(names.split(',')).toHaveLength(3);
  });

  it('es estable: la misma partida da siempre los mismos rivales', async () => {
    const outcome = await search(rpc, PROFILES[0]!, { playerCount: 3, cadence: 'blitz' });
    const game = outcome.gameId!;
    const once = sql(`select public.bot_display_name('${game}'::uuid, 1::smallint)`);
    const twice = sql(`select public.bot_display_name('${game}'::uuid, 1::smallint)`);
    expect(once).toBe(twice);
    expect(once.length).toBeGreaterThan(0);
  });
});
