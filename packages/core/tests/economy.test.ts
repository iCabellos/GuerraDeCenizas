/**
 * Tests de economía, suministro y producción.
 *
 * El caso «doblar el territorio da ~1,55×» está aquí porque es una **intención de
 * diseño declarada** en el GDD, no un número arbitrario: al implementar la fórmula, la
 * constante documentada daba 1,08× — expandirse dejaba de compensar, que es el error
 * contrario al que la regla pretendía evitar. El test fija la intención, no el valor.
 */

import { describe, expect, it } from 'vitest';
import type { Force, GameState, PlayerCount, RegionId, Seat } from '../src/types/index';
import { createGame } from '../src/rules/setup';
import { ENGINE_VERSION, reduce } from '../src/rules/reduce';
import { buildAdjacency } from '../src/mapgen/skeleton';
import { sectorSize } from '../src/mapgen/spec';
import { BALANCE, TERRAIN_YIELD } from '../src/balance/constants';
import { canProduceAt, diminishingFactor, grossIncome, supplyUpkeep } from '../src/rules/economy';

const CTX = { engineVersion: ENGINE_VERSION, now: 0 };

function game(players: PlayerCount = 5, seed = 2024) {
  const factions = ['koldvik', 'vantera', 'saranth', 'meridia', 'oshara'] as const;
  return createGame({
    gameId: 'eco',
    seed,
    players,
    seats: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      factionId: factions[i]!,
    })),
  }).state;
}

function toWar(state: GameState): GameState {
  return reduce(state, {}, CTX).state;
}

/** Da a un asiento exactamente `count` regiones, ignorando Bastiones ajenos. */
function withRegions(state: GameState, seat: Seat, count: number): GameState {
  const control = state.control.map(() => null) as (Seat | null)[];
  let given = 0;
  for (let id = 0; id < state.map.regions.length && given < count; id++) {
    if (state.map.regions[id]?.kind === 'core') continue;
    if (state.map.bastions.includes(id) && state.map.bastions[seat] !== id) continue;
    control[id] = seat;
    given++;
  }
  state.map.bastions.forEach((regionId, s) => { control[regionId] = s as Seat; });
  return { ...state, control };
}

describe('renta', () => {
  it('cada tipo de región aporta lo que dice la tabla', () => {
    const state = game(5);
    const seat: Seat = 0;
    const owned = state.control.reduce<RegionId[]>(
      (acc, o, id) => (o === seat ? [...acc, id] : acc), []);

    const expected = owned.reduce(
      (sum, id) => {
        const y = TERRAIN_YIELD[state.map.regions[id]!.kind];
        return {
          supply: sum.supply + y.supply,
          industry: sum.industry + y.industry,
          intel: sum.intel + y.intel,
          ash: sum.ash + y.ash,
        };
      },
      { supply: 0, industry: 0, intel: 0, ash: 0 },
    );

    expect(grossIncome(state, seat)).toEqual(expected);
  });

  it('hasta la parte justa no hay penalización', () => {
    const state = game(5);
    const fair = sectorSize(5);
    expect(diminishingFactor(withRegions(state, 0, fair), 0)).toBe(1);
    expect(diminishingFactor(withRegions(state, 0, fair - 5), 0)).toBe(1);
  });

  it('doblar el territorio da ~1,55× de renta, no ~1× ni ~2×', () => {
    const state = game(5);
    const fair = sectorSize(5);

    const atFair = withRegions(state, 0, fair);
    const atDouble = withRegions(state, 0, fair * 2);

    const netFair = fair * diminishingFactor(atFair, 0);
    const netDouble = fair * 2 * diminishingFactor(atDouble, 0);
    const ratio = netDouble / netFair;

    // Sublineal, pero sigue mereciendo la pena expandirse.
    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(1.7);
  });

  it('el factor es siempre decreciente y nunca supera 1', () => {
    const state = game(5);
    let previous = Infinity;
    for (const count of [5, 19, 30, 45, 60, 90]) {
      const factor = diminishingFactor(withRegions(state, 0, count), 0);
      expect(factor).toBeLessThanOrEqual(1);
      expect(factor).toBeLessThanOrEqual(previous);
      previous = factor;
    }
  });

  it('los recursos ordinarios tienen tope y la Ceniza no', () => {
    const base = toWar(game(5));
    let state: GameState = {
      ...base,
      seats: base.seats.map((s) => ({
        ...s,
        resources: { supply: 59, industry: 59, intel: 39, ash: 0 },
      })),
    };
    for (let turn = 0; turn < 6; turn++) state = reduce(state, {}, CTX).state;

    const seat = state.seats[0]!;
    expect(seat.resources.industry).toBeLessThanOrEqual(BALANCE.economy.caps.industry);
    expect(seat.resources.intel).toBeLessThanOrEqual(BALANCE.economy.caps.intel);
    expect(seat.resources.ash).toBeGreaterThan(0);
  });
});

describe('suministro', () => {
  it('cuesta más cuanto más lejos del Bastión', () => {
    const force: Force = {
      id: 'x', seat: 0, regionId: 0, line: 20, fire: 0, sky: 0,
      posture: 'hold', unsupplied: 0,
    };
    expect(supplyUpkeep(force, 4)).toBeGreaterThan(supplyUpkeep(force, 1));
    expect(supplyUpkeep(force, 0)).toBe(2); // ceil(20/10) × (1 + 0)
  });

  it('cuesta más cuanto mayor es la fuerza', () => {
    const small: Force = {
      id: 'a', seat: 0, regionId: 0, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0,
    };
    const big: Force = { ...small, id: 'b', line: 60 };
    expect(supplyUpkeep(big, 2)).toBeGreaterThan(supplyUpkeep(small, 2));
  });

  it('una fuerza sin suministro acumula turnos y pierde potencia', () => {
    const base = toWar(game(2, 31));
    let state: GameState = {
      ...base,
      seats: base.seats.map((s) => ({ ...s, resources: { ...s.resources, supply: 0 } })),
      // Se le quitan todas las regiones salvo el Bastión: sin renta de Suministro.
      control: base.control.map((_owner, id) =>
        base.map.bastions.includes(id) ? (base.map.bastions.indexOf(id) as Seat) : null,
      ),
      forces: [
        {
          id: 'far', seat: 0, regionId: base.map.coreId,
          line: 60, fire: 0, sky: 0, posture: 'hold', unsupplied: 0,
        },
      ],
    };

    for (let turn = 0; turn < 3; turn++) state = reduce(state, {}, CTX).state;

    const force = state.forces.find((f) => f.id === 'far');
    expect(force?.unsupplied).toBeGreaterThanOrEqual(1);
  });

  it('se abastece primero lo más cercano al Bastión', () => {
    const base = toWar(game(2, 44));
    const adjacency = buildAdjacency(base.map.regions.length, base.map.edges);
    const bastion = base.map.bastions[0] as RegionId;
    const near = (adjacency[bastion] as RegionId[])[0] as RegionId;

    const state: GameState = {
      ...base,
      seats: base.seats.map((s) =>
        s.seat === 0 ? { ...s, resources: { ...s.resources, supply: 3 } } : s,
      ),
      forces: [
        { id: 'near', seat: 0, regionId: near, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
        { id: 'far', seat: 0, regionId: base.map.coreId, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const next = reduce(state, {}, CTX).state;
    const near_ = next.forces.find((f) => f.id === 'near');
    const far = next.forces.find((f) => f.id === 'far');

    // La expedición lejana es la primera en quedarse sin abastecer.
    expect(near_?.unsupplied).toBe(0);
    expect(far?.unsupplied).toBeGreaterThanOrEqual(near_?.unsupplied ?? 0);
  });
});

describe('producción', () => {
  it('solo se produce en Bastión propio o Urbana propia', () => {
    const state = toWar(game(5));
    const bastion = state.map.bastions[0] as RegionId;
    expect(canProduceAt(state, 0, bastion)).toBe(true);

    const enemyBastion = state.map.bastions[1] as RegionId;
    expect(canProduceAt(state, 0, enemyBastion)).toBe(false);

    const neutralPlain = state.map.regions.findIndex(
      (r) => r.kind === 'plain' && state.control[r.id] === null,
    );
    expect(canProduceAt(state, 0, neutralPlain)).toBe(false);
  });

  it('gasta Industria y coloca la fuerza en el mismo turno', () => {
    const state = toWar(game(5));
    const bastion = state.map.bastions[0] as RegionId;
    const before = state.seats[0]!.resources.industry;

    const result = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [], production: [{ regionId: bastion, item: 'line', qty: 1 }] } },
      CTX,
    );

    const cost = BALANCE.production.line.industry;
    const gained = result.state.seats[0]!.resources.industry;
    // Se gastó el coste; la renta del turno se suma aparte.
    expect(gained).toBeLessThan(before + cost);
    expect(result.events.some((e) => e.type === 'PRODUCED')).toBe(true);

    const atBastion = result.state.forces.filter((f) => f.seat === 0 && f.regionId === bastion);
    expect(atBastion.reduce((s, f) => s + f.line, 0)).toBeGreaterThanOrEqual(
      BALANCE.production.line.strength,
    );
  });

  it('rechaza producir sin Industria suficiente', () => {
    const base = toWar(game(5));
    const state: GameState = {
      ...base,
      seats: base.seats.map((s) =>
        s.seat === 0 ? { ...s, resources: { ...s.resources, industry: 0 } } : s,
      ),
    };
    const bastion = state.map.bastions[0] as RegionId;

    const result = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [], production: [{ regionId: bastion, item: 'sky', qty: 3 }] } },
      CTX,
    );

    expect(
      result.events.some((e) => e.type === 'ORDER_REJECTED' && e.data['reason'] === 'not_enough_industry'),
    ).toBe(true);
  });

  it('la producción se fusiona con la fuerza que ya está allí', () => {
    const state = toWar(game(5));
    const bastion = state.map.bastions[0] as RegionId;
    const before = state.forces.filter((f) => f.seat === 0 && f.regionId === bastion).length;

    const result = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [], production: [{ regionId: bastion, item: 'line', qty: 1 }] } },
      CTX,
    );

    const after = result.state.forces.filter((f) => f.seat === 0 && f.regionId === bastion).length;
    expect(after).toBe(before); // no crea una fuerza nueva: engorda la existente
  });

  it('fortificar sube el nivel y respeta el tope', () => {
    const state = toWar(game(5));
    const bastion = state.map.bastions[0] as RegionId;

    const once = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [], production: [{ regionId: bastion, item: 'fort', qty: 9 }] } },
      CTX,
    ).state;

    expect(once.fortification[bastion]).toBe(BALANCE.combat.maxFortLevel);
  });
});

describe('agua y puentes', () => {
  it('Línea no cruza agua sin Puente, y Cielo sí', () => {
    const base = toWar(game(5, 7));
    const adjacency = buildAdjacency(base.map.regions.length, base.map.edges);
    const water = base.map.regions.findIndex((r) => r.kind === 'water');
    const shore = (adjacency[water] as RegionId[])[0] as RegionId;

    const state: GameState = {
      ...base,
      forces: [
        { id: 'L', seat: 0, regionId: shore, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
        { id: 'S', seat: 0, regionId: shore, line: 0, fire: 0, sky: 10, posture: 'hold', unsupplied: 0 },
      ],
    };

    const blocked = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [{ forceId: 'L', to: water, posture: 'assault' }] } },
      CTX,
    );
    expect(
      blocked.events.some((e) => e.data['reason'] === 'water_needs_bridge'),
    ).toBe(true);

    const flown = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [{ forceId: 'S', to: water, posture: 'assault' }] } },
      CTX,
    );
    expect(flown.state.forces.some((f) => f.regionId === water && f.sky > 0)).toBe(true);
  });

  it('con Puente, Línea sí cruza', () => {
    const base = toWar(game(5, 7));
    const adjacency = buildAdjacency(base.map.regions.length, base.map.edges);
    const water = base.map.regions.findIndex((r) => r.kind === 'water');
    const shore = (adjacency[water] as RegionId[])[0] as RegionId;

    const bridges = base.bridges.slice();
    bridges[water] = true;

    const state: GameState = {
      ...base,
      bridges,
      forces: [
        { id: 'L', seat: 0, regionId: shore, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const result = reduce(
      state,
      { 0: { turn: state.meta.turn, moves: [{ forceId: 'L', to: water, posture: 'assault' }] } },
      CTX,
    );
    expect(result.state.forces.some((f) => f.regionId === water && f.line > 0)).toBe(true);
  });
});
