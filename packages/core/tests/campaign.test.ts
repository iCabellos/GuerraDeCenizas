/**
 * Campaña completa de 12 turnos con jugadores automáticos.
 *
 * Es el criterio de aceptación principal de la v0.2: «partida de 12 turnos jugable de
 * principio a fin». Un test que solo comprobara que no lanza excepciones no probaría
 * nada; este verifica además que la partida **evoluciona**: hay capturas, hay combates,
 * la economía se mueve y el mapa cambia de manos.
 *
 * El bot decide con la `PlayerView`, no con el `GameState`: si viera el estado completo
 * haría trampas, y la partida simulada dejaría de parecerse a una real.
 */

import { describe, expect, it } from 'vitest';
import type {
  GameState, MoveOrder, Orders, OrdersBySeat, PlayerCount, PlayerView, ProductionOrder,
  RegionId, Seat,
} from '../src/types/index';
import { createGame } from '../src/rules/setup';
import { ENGINE_VERSION, reduce } from '../src/rules/reduce';
import { buildAdjacency } from '../src/mapgen/skeleton';
import { BALANCE } from '../src/balance/constants';
import { checksum } from '../src/util/canonical';

const CTX = { engineVersion: ENGINE_VERSION, now: 0 };
const FACTIONS = ['koldvik', 'vantera', 'saranth', 'meridia', 'oshara'] as const;

function newGame(players: PlayerCount, seed: number): GameState {
  return createGame({
    gameId: `c${seed}`,
    seed,
    players,
    seats: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      factionId: FACTIONS[i]!,
    })),
  }).state;
}

/**
 * Bot codicioso: avanza hacia territorio no propio y produce Línea mientras pueda.
 * Deliberadamente simple — no es un jugador de referencia, es un generador de partidas
 * que se mueven. El simulador con perfiles reales llega en v0.8.
 */
function greedyOrders(view: PlayerView, turn: number): Orders {
  const adjacency = buildAdjacency(view.map.regions.length, view.map.edges);
  const moves: MoveOrder[] = [];

  for (const force of view.forces.filter((f) => f.own)) {
    if (force.line === null || force.line <= 0) continue;
    const neighbours = (adjacency[force.regionId] ?? []) as readonly RegionId[];

    // Preferir regiones no propias que no sean agua (sin puentes en este test).
    const target = neighbours.find(
      (r) => view.control[r] !== view.seat && view.map.regions[r]?.kind !== 'water',
    );
    if (target !== undefined) {
      moves.push({ forceId: force.id, to: target, posture: 'assault' });
    } else {
      moves.push({ forceId: force.id, posture: 'hold' });
    }
  }

  const production: ProductionOrder[] = [];
  const bastion = view.map.bastions[view.seat];
  if (bastion !== undefined && view.self.resources.industry >= BALANCE.production.line.industry) {
    production.push({ regionId: bastion, item: 'line', qty: 1 });
  }

  return { turn, moves, production };
}

function playCampaign(players: PlayerCount, seed: number) {
  let state = newGame(players, seed);
  const checksums: string[] = [];
  const events: string[] = [];
  const controlHistory: number[][] = [];

  for (let turn = 0; turn <= BALANCE.campaign.turns; turn++) {
    const preview = reduce(state, {}, CTX).views;
    const orders: OrdersBySeat = {};
    for (let seat = 0; seat < players; seat++) {
      orders[seat as Seat] = greedyOrders(preview[seat as Seat], state.meta.turn);
    }

    const result = reduce(state, orders, CTX);
    state = result.state;
    checksums.push(result.checksum);
    events.push(...result.events.map((e) => e.type));
    controlHistory.push(
      Array.from({ length: players }, (_, s) => state.control.filter((o) => o === s).length),
    );
  }

  return { state, checksums, events, controlHistory };
}

describe('campaña completa de 12 turnos', () => {
  it.each([2, 3, 5] as PlayerCount[])('llega al final sin romperse (%i jugadores)', (n) => {
    const { state } = playCampaign(n, 1234);
    expect(state.meta.turn).toBe(BALANCE.campaign.turns + 1);
    expect(state.meta.phase).toBe('war');
  });

  it('la partida evoluciona: hay capturas, combates y cambios de control', () => {
    const { events, controlHistory } = playCampaign(5, 99);

    expect(events).toContain('REGION_CAPTURED');
    expect(events).toContain('COMBAT');
    expect(events).toContain('INCOME');
    expect(events).toContain('PRODUCED');

    const first = controlHistory[0] as number[];
    const last = controlHistory[controlHistory.length - 1] as number[];
    expect(last.reduce((a, b) => a + b, 0)).toBeGreaterThan(first.reduce((a, b) => a + b, 0));
  });

  it('es reproducible byte a byte', () => {
    const a = playCampaign(5, 5150);
    const b = playCampaign(5, 5150);
    expect(a.checksums).toEqual(b.checksums);
    expect(checksum(a.state)).toBe(checksum(b.state));
  });

  it('los invariantes se mantienen durante toda la campaña', () => {
    for (const seed of [7, 21, 404]) {
      let state = newGame(5, seed);

      for (let turn = 0; turn <= BALANCE.campaign.turns; turn++) {
        const preview = reduce(state, {}, CTX).views;
        const orders: OrdersBySeat = {};
        for (let seat = 0; seat < 5; seat++) {
          orders[seat as Seat] = greedyOrders(preview[seat as Seat], state.meta.turn);
        }
        state = reduce(state, orders, CTX).state;

        // Ningún Bastión cambia de dueño jamás (ADR-013: no hay eliminación).
        state.map.bastions.forEach((regionId, seat) => {
          expect(state.control[regionId]).toBe(seat);
        });

        // Ninguna fuerza vacía sobrevive, ni con valores negativos.
        for (const force of state.forces) {
          expect(force.line + force.fire + force.sky).toBeGreaterThan(0);
          expect(Math.min(force.line, force.fire, force.sky)).toBeGreaterThanOrEqual(0);
        }

        // Los recursos nunca son negativos ni superan su tope.
        for (const seatState of state.seats) {
          const { supply, industry, intel, ash } = seatState.resources;
          expect(Math.min(supply, industry, intel, ash)).toBeGreaterThanOrEqual(0);
          expect(supply).toBeLessThanOrEqual(BALANCE.economy.caps.supply);
          expect(industry).toBeLessThanOrEqual(BALANCE.economy.caps.industry);
          expect(intel).toBeLessThanOrEqual(BALANCE.economy.caps.intel);
        }

        // Nadie tiene más fuerzas de las permitidas por región.
        for (let seat = 0; seat < 5; seat++) {
          const perRegion = new Map<RegionId, number>();
          for (const f of state.forces.filter((x) => x.seat === seat)) {
            perRegion.set(f.regionId, (perRegion.get(f.regionId) ?? 0) + 1);
          }
          for (const count of perRegion.values()) expect(count).toBe(1);
        }
      }
    }
  });

  it('ningún asiento queda sistemáticamente arrasado por su posición', () => {
    // Con bots idénticos y mapa simétrico, el territorio final debe repartirse de forma
    // parecida. Es la comprobación de equidad del mapa vista desde el juego real, no
    // desde las métricas del generador.
    const totals = [0, 0, 0, 0, 0];
    const seeds = [11, 22, 33, 44, 55, 66];

    for (const seed of seeds) {
      const { controlHistory } = playCampaign(5, seed);
      const last = controlHistory[controlHistory.length - 1] as number[];
      last.forEach((regions, seat) => { totals[seat] = (totals[seat] as number) + regions; });
    }

    const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
    for (const total of totals) {
      expect(Math.abs(total - mean) / mean).toBeLessThan(0.5);
    }
  });
});
