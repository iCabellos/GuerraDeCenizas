/**
 * Reclamación Menor.
 *
 * Se comprueba la **intención** de los pesos, no los pesos: el GDD dice que favorecen lo
 * contestado sobre el territorio acumulado, así que un jugador con yacimientos y Núcleo
 * tiene que ganar a otro con más regiones. Un test que fijara `4 × yacimientos` bendeciría
 * cualquier reajuste que invirtiera esa intención sin tocar la fórmula.
 */

import { describe, expect, it } from 'vitest';
import { claimStandings, createGame, type GameState, type Seat } from '../src/index';

function game(): GameState {
  return createGame({
    gameId: '00000000-0000-4000-8000-0000000000ce',
    seed: 31415,
    players: 3,
    seats: [
      { name: 'Uno', factionId: 'vantera' },
      { name: 'Dos', factionId: 'koldvik' },
      { name: 'Tres', factionId: 'saranth' },
    ],
  }).state;
}

/** Reparte el control: `owner(regionId)` decide de quién es cada región. */
function withControl(state: GameState, owner: (id: number) => Seat | null): GameState {
  return { ...state, control: state.control.map((_, id) => owner(id)) };
}

describe('clasificación final', () => {
  it('todos los asientos aparecen, ordenados de mejor a peor', () => {
    const rows = claimStandings(game());
    expect(rows).toHaveLength(3);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1]!.score).toBeGreaterThanOrEqual(rows[i]!.score);
    }
  });

  it('lo contestado pesa más que el territorio: yacimientos y Núcleo ganan a extensión', () => {
    const base = game();
    const seams = base.map.regions.filter((r) => r.kind === 'seam').map((r) => r.id);
    const plains = base.map.regions.filter((r) => r.kind === 'plain').map((r) => r.id);
    expect(seams.length, 'el mapa debería tener yacimientos').toBeGreaterThan(0);

    // El 0 se queda tres yacimientos y el Núcleo; el 1, el doble de llanuras.
    const mine = new Set(seams.slice(0, 3));
    const theirs = new Set(plains.slice(0, mine.size * 2 + 6));
    const state = withControl(base, (id) => {
      if (id === base.map.coreId) return 0;
      if (mine.has(id)) return 0;
      if (theirs.has(id)) return 1;
      return null;
    });

    const rows = claimStandings(state);
    expect(rows[0]!.seat, `puntuaciones: ${rows.map((r) => `${r.seat}:${r.score}`).join(' ')}`).toBe(0);
  });

  it('quien vence se lleva más Ceniza que quien sobrevive', () => {
    const base = game();
    // Misma Ceniza para todos: lo que cambia el premio es el desenlace, no la reserva.
    const state = withControl(
      { ...base, seats: base.seats.map((s) => ({ ...s, resources: { ...s.resources, ash: 100 } })) },
      (id) => (id === base.map.coreId ? 0 : base.control[id] ?? null),
    );
    const rows = claimStandings(state);
    const winner = rows.find((r) => r.outcome === 'lesser');
    const rest = rows.filter((r) => r.outcome !== 'lesser');

    expect(winner, 'alguien tiene que ganar').toBeDefined();
    for (const other of rest) {
      expect(winner!.ashAwarded).toBeGreaterThan(other.ashAwarded);
    }
  });

  it('un empate exacto declara dos vencedores en vez de sortearlo', () => {
    const base = game();
    // Nadie controla nada y todos tienen la misma Ceniza: empate perfecto.
    const state = withControl(
      { ...base, seats: base.seats.map((s) => ({ ...s, resources: { ...s.resources, ash: 40 } })) },
      () => null,
    );
    const rows = claimStandings(state);
    expect(rows.filter((r) => r.outcome === 'lesser')).toHaveLength(3);
  });

  it('sin Bastión se sobrevive «reducido», que paga menos', () => {
    const base = game();
    const state = withControl(base, (id) => (id === base.map.bastions[0] ? 0 : null));
    const rows = claimStandings(state);
    const withoutBastion = rows.find((r) => r.seat === 1);
    expect(withoutBastion?.outcome).toBe('reduced');
  });

  it('es determinista: el mismo estado da la misma clasificación', () => {
    const state = game();
    expect(claimStandings(state)).toEqual(claimStandings(state));
  });
});
