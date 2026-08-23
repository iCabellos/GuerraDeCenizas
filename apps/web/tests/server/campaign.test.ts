/**
 * Una campaña entera en solitario, contra rivales artificiales.
 *
 * La pregunta que responde este archivo es la de producto, no la de unidad: **¿se puede
 * jugar de principio a fin sin más personas?** Antes del despliegue es la única forma de
 * probar el juego, así que si esto se rompe da igual que los 300 tests de abajo pasen.
 *
 * Se juegan los trece turnos (T0 Parlamento + T1–T12 de Guerra) por la capa de autoridad
 * de verdad, contra el Postgres de verdad: emparejar, enviar, resolver, repetir.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { GameState, Orders, Seat } from '@gdc/core';
import { search } from '../../lib/server/matchmaking';
import { resolveTurn } from '../../lib/server/resolve';
import { rpc, scalar } from './rpc';

const SOLO = '00000000-0000-4000-8000-0000000000c0';

const sql = (text: string): string => scalar(text);

/** El estado guardado de un turno, o `null` si ese turno todavía no existe. */
function stateAt(gameId: string, turn: number): GameState | null {
  const raw = sql(`select coalesce(
                     (select state::text from public.game_states
                       where game_id = '${gameId}' and turn = ${turn}), '')`);
  return raw ? (JSON.parse(raw) as GameState) : null;
}

function submit(gameId: string, turn: number, seat: Seat, orders: Orders): void {
  sql(`insert into public.orders (game_id, turn, seat, payload, submitted_at)
       values ('${gameId}', ${turn}, ${seat},
               '${JSON.stringify(orders).replace(/'/g, "''")}'::jsonb, now())
       on conflict (game_id, turn, seat) do update
         set payload = excluded.payload, submitted_at = now()`);
}

/** Lo mínimo que puede enviar una persona: quedarse quieta. */
function hold(state: GameState, seat: Seat): Orders {
  return {
    turn: state.meta.turn,
    moves: state.forces.filter((f) => f.seat === seat)
      .map((f) => ({ forceId: f.id, posture: 'hold' as const })),
  };
}

beforeEach(() => {
  process.env['BOT_FILL_SECONDS'] = '0';
  sql(`truncate table public.matchmaking_queue, public.player_views, public.orders,
                      public.game_states, public.game_players, public.games,
                      public.cities, public.profiles restart identity cascade;
       delete from auth.users;
       insert into auth.users (id, email) values ('${SOLO}', 'solo@ceniza.test');
       insert into public.profiles (id, display_name, faction_id)
       values ('${SOLO}', 'En Solitario', 'vantera')
       on conflict (id) do update set display_name = excluded.display_name;`);
});

afterEach(() => { delete process.env['BOT_FILL_SECONDS']; });

describe('campaña en solitario', () => {
  it('se juega entera contra bots, de la búsqueda al final', async () => {
    const found = await search(rpc, SOLO, { playerCount: 3, cadence: 'blitz' });
    expect(found.gameId, 'la búsqueda debería dar partida al instante').toBeDefined();
    const game = found.gameId!;

    // Los otros dos asientos son rivales artificiales, no huecos.
    expect(Number(sql(`select count(*) from public.game_players
                        where game_id = '${game}' and is_bot`))).toBe(2);

    let played = 0;
    for (let turn = 0; turn < 13; turn += 1) {
      const state = stateAt(game, turn);
      expect(state, `falta el estado del turno ${turn}`).not.toBeNull();

      // La persona envía; los bots no bloquean, así que esto basta para resolver.
      submit(game, turn, 0, hold(state!, 0));

      const outcome = await resolveTurn(rpc, game, new Date());
      expect(outcome.resolved, `el turno ${turn} no resolvió: ${outcome.skipped ?? ''}`).toBe(true);
      played += 1;
    }

    expect(played).toBe(13);
    expect(sql(`select status from public.games where id = '${game}'`)).toBe('finished');
    expect(Number(sql(`select turn from public.games where id = '${game}'`))).toBe(13);

    // Y queda constancia de cómo fue: sin esto la campaña se acaba y no hay nada que
    // enseñar, ni Ceniza que llevar a la Ciudad.
    expect(Number(sql(`select count(*) from public.match_results where game_id = '${game}'`)),
      'los tres asientos deberían tener resultado').toBe(3);
    expect(Number(sql(`select count(*) from public.match_results
                        where game_id = '${game}' and outcome = 'lesser'`)),
      'alguien tiene que ganar la Reclamación Menor').toBeGreaterThan(0);

    // La persona se lleva su parte a la Ciudad; los bots no tienen ciudad.
    const bank = Number(sql(`select ash_bank from public.cities where profile_id = '${SOLO}'`));
    const awarded = Number(sql(`select ash_awarded from public.match_results
                                 where game_id = '${game}' and profile_id = '${SOLO}'`));
    expect(bank).toBe(awarded);
  }, 120_000);

  it('los bots juegan de verdad: el mapa cambia de manos durante la campaña', async () => {
    // Si los rivales se quedaran quietos, el control del turno 12 sería el del turno 0 y
    // la partida de pruebas no probaría nada.
    const found = await search(rpc, SOLO, { playerCount: 3, cadence: 'blitz' });
    const game = found.gameId!;

    for (let turn = 0; turn < 8; turn += 1) {
      const state = stateAt(game, turn);
      if (!state) break;
      submit(game, turn, 0, hold(state, 0));
      await resolveTurn(rpc, game, new Date());
    }

    const first = stateAt(game, 0);
    const later = stateAt(game, 8);
    expect(later, 'debería haberse llegado al turno 8').not.toBeNull();
    expect(JSON.stringify(later!.control))
      .not.toBe(JSON.stringify(first!.control));
  }, 120_000);
});
