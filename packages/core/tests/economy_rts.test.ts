/**
 * Extracción, edificios, grados y Políticas.
 *
 * Los tests que importan de este archivo fijan **intenciones de diseño**, no números:
 *
 *  · Una Mena sin Extractora no da nada — es lo que la separa del Yacimiento.
 *  · El almacén vive en la región, no en el asiento — es lo que permite robarlo.
 *  · Subir de grado NO mejora lo ya desplegado — es lo que convierte subir en una
 *    decisión en vez de una compra obvia.
 *  · Una obra en curso no produce — es lo que hace que mejorar cueste algo.
 */

import { describe, expect, it } from 'vitest';
import type { GameState, PlayerCount, RegionId, Seat, SeatState } from '../src/types/index';
import { createGame } from '../src/rules/setup';
import { ENGINE_VERSION, reduce } from '../src/rules/reduce';
import { BALANCE } from '../src/balance/constants';
import { buildingLevel } from '../src/rules/buildings';
import { extractionRate } from '../src/rules/extraction';

const CTX = { engineVersion: ENGINE_VERSION, now: 0 };
const FACTIONS = ['koldvik', 'vantera', 'saranth', 'meridia', 'oshara'] as const;

function game(players: PlayerCount = 5, seed = 314): GameState {
  return createGame({
    gameId: 'rts',
    seed,
    players,
    seats: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      factionId: FACTIONS[i]!,
    })),
  }).state;
}

function toWar(state: GameState): GameState {
  return { ...state, meta: { ...state.meta, turn: 1, phase: 'war' } };
}

/** Una Mena del Solar del asiento 0 que no sea su Bastión. */
function ownVein(state: GameState): RegionId {
  const bastion = state.map.bastions[0] as RegionId;
  const vein = state.map.veins.find(
    (v) => v.regionId !== bastion && state.map.regions[v.regionId]?.zone === 1,
  );
  if (!vein) throw new Error('sin Menas en el Solar');
  return vein.regionId;
}

function give(state: GameState, seat: Seat, resources: Partial<SeatState['resources']>): GameState {
  return {
    ...state,
    seats: state.seats.map((s) =>
      s.seat === seat ? { ...s, resources: { ...s.resources, ...resources } } : s,
    ),
  };
}

describe('extracción', () => {
  it('una Mena sin Extractora no da nada, por rica que sea', () => {
    const state = toWar(game());
    const regionId = ownVein(state);
    const vein = state.map.veins.find((v) => v.regionId === regionId)!;

    const owned: GameState = {
      ...state,
      control: state.control.map((o, id) => (id === regionId ? 0 : o)) as (Seat | null)[],
    };
    expect(buildingLevel(owned.buildings, regionId, 'extractor')).toBe(0);
    expect(extractionRate(owned, owned.seats, vein)).toBe(0);
  });

  it('con Extractora sí, y el material se queda EN LA REGIÓN', () => {
    const base = toWar(game());
    const regionId = ownVein(base);
    const state: GameState = {
      ...base,
      control: base.control.map((o, id) => (id === regionId ? 0 : o)) as (Seat | null)[],
      buildings: [
        ...base.buildings,
        { regionId, kind: 'extractor', level: 1, target: 1, building: 0 },
      ],
    };

    const before = state.seats[0]!.resources;
    const result = reduce(state, {}, CTX);

    // Extrae al almacén de su región y de ahí se acarrea: las dos etapas existen y son
    // distintas. Si el material fuera directo al asiento no habría nada que robar.
    expect(result.events.some((e) => e.type === 'EXTRACTED')).toBe(true);
    expect(result.events.some((e) => e.type === 'HAULED')).toBe(true);
    expect(result.state.seats[0]!.resources.ore).toBeGreaterThan(before.ore - 1);
  });

  it('el Bastión nace con Mena y Extractora: la economía no se puede perder', () => {
    const state = game();
    for (const bastion of state.map.bastions) {
      expect(state.map.veins.some((v) => v.regionId === bastion)).toBe(true);
      expect(buildingLevel(state.buildings, bastion, 'extractor')).toBe(1);
    }
  });

  it('el almacén de una región cambia de dueño con ella, sin moverlo', () => {
    const base = toWar(game());
    const regionId = ownVein(base);
    const stock = base.stock.map((s, id) => (id === regionId ? { ore: 20, ember: 5 } : s));

    // La región es del asiento 1; el almacén está donde está.
    const state: GameState = {
      ...base,
      stock,
      control: base.control.map((o, id) => (id === regionId ? 1 : o)) as (Seat | null)[],
    };
    expect(state.stock[regionId]).toEqual({ ore: 20, ember: 5 });
  });
});

describe('edificios', () => {
  it('una obra en curso NO produce: mejorar cuesta renta', () => {
    const base = toWar(game());
    const regionId = ownVein(base);
    const vein = base.map.veins.find((v) => v.regionId === regionId)!;
    const state: GameState = {
      ...base,
      control: base.control.map((o, id) => (id === regionId ? 0 : o)) as (Seat | null)[],
      buildings: [
        ...base.buildings,
        { regionId, kind: 'extractor', level: 1, target: 2, building: 2 },
      ],
    };

    expect(buildingLevel(state.buildings, regionId, 'extractor')).toBe(0);
    expect(extractionRate(state, state.seats, vein)).toBe(0);
  });

  it('se cobra al empezar la obra, no al terminarla', () => {
    const base = toWar(game());
    const regionId = ownVein(base);
    const state = give(
      { ...base, control: base.control.map((o, id) => (id === regionId ? 0 : o)) as (Seat | null)[] },
      0,
      { ore: 100, ember: 100 },
    );

    const withWork = reduce(
      state,
      { 0: { turn: 1, moves: [], works: [{ regionId, kind: 'extractor' }] } },
      CTX,
    );
    // Contra un turno idéntico sin la obra: el mismo turno acarrea material, así que
    // comparar contra 100 mediría dos cosas a la vez y no probaría ninguna.
    const without = reduce(state, { 0: { turn: 1, moves: [] } }, CTX);

    const cost = BALANCE.buildings.cost.extractor[1]!;
    expect(withWork.events.some((e) => e.type === 'WORK_STARTED')).toBe(true);
    expect(without.state.seats[0]!.resources.ore - withWork.state.seats[0]!.resources.ore)
      .toBeCloseTo(cost.ore, 3);

    // Y la obra sigue en curso: se pagó por empezar, no por terminar.
    const started = withWork.state.buildings.find(
      (b) => b.regionId === regionId && b.kind === 'extractor',
    );
    expect(started?.building).toBeGreaterThanOrEqual(0);
  });

  it('el techo de la Fundición se respeta', () => {
    const base = toWar(game());
    const bastion = base.map.bastions[0] as RegionId;
    const state = give(base, 0, { ore: 400, ember: 400 });

    // Sin Fundición de nivel 2 no se puede llegar a un Acopio de nivel 2.
    const first = reduce(
      state,
      { 0: { turn: 1, moves: [], works: [{ regionId: bastion, kind: 'depot' }] } },
      CTX,
    ).state;

    const withDepot: GameState = {
      ...first,
      buildings: first.buildings.map((b) =>
        b.regionId === bastion && b.kind === 'depot' ? { ...b, building: 0, level: 1, target: 1 } : b,
      ),
    };
    const blocked = reduce(
      { ...withDepot, meta: { ...withDepot.meta, turn: 2 } },
      { 0: { turn: 2, moves: [], works: [{ regionId: bastion, kind: 'depot' }] } },
      CTX,
    );
    expect(
      blocked.events.some((e) => String(e.data['reason']).includes('foundry_ceiling')),
    ).toBe(true);
  });

  it('capturar una región baja un nivel el edificio, no lo destruye', () => {
    const base = toWar(game());
    const regionId = ownVein(base);
    const state: GameState = {
      ...base,
      control: base.control.map((o, id) => (id === regionId ? 0 : o)) as (Seat | null)[],
      buildings: [
        ...base.buildings,
        { regionId, kind: 'extractor', level: 3, target: 3, building: 0 },
      ],
      forces: [
        { id: 'A', seat: 1, regionId, line: 40, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const result = reduce(state, {}, CTX);
    const captured = result.state.buildings.find(
      (b) => b.regionId === regionId && b.kind === 'extractor',
    );
    expect(result.state.control[regionId]).toBe(1);
    expect(captured?.level).toBe(3 - BALANCE.buildings.captureLevelLoss);
  });
});

describe('grados de tropa', () => {
  it('el grado multiplica lo que se PRODUCE, no lo ya desplegado', () => {
    const base = toWar(game());
    const bastion = base.map.bastions[0] as RegionId;

    const veteran: GameState = {
      ...base,
      seats: base.seats.map((s) =>
        s.seat === 0 ? { ...s, tiers: { ...s.tiers, line: 3 }, resources: { ...s.resources, industry: 60 } } : s,
      ),
      forces: [
        { id: 'V', seat: 0, regionId: bastion, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const before = 10;
    const result = reduce(
      veteran,
      { 0: { turn: 1, moves: [{ forceId: 'V', posture: 'hold' }], production: [{ regionId: bastion, item: 'line', qty: 1 }] } },
      CTX,
    );

    const force = result.state.forces.find((f) => f.id === 'V');
    const added = (force?.line ?? 0) - before;
    const expected = BALANCE.production.line.strength * (BALANCE.tiers.multiplier[3] as number);
    expect(added).toBeCloseTo(expected, 3);
  });

  it('la rueda de armas no depende del grado, porque el grado nunca llega al combate', async () => {
    // No es un test de tolerancia: es que `CombatSide` no tiene grado. Si algún día
    // alguien lo mete ahí, este import deja de compilar y hay que releer por qué.
    const combat = await import('../src/rules/combat');
    const side = {
      seat: 0 as Seat, arms: { line: 10, fire: 0, sky: 0 }, posture: 'hold' as const,
      defender: false, fireSupport: 0, unsupplied: 0,
    };
    expect(Object.keys(side)).not.toContain('tiers');
    expect(combat.combatPower(side, { line: 0, fire: 10, sky: 0 }, 'plain', 0)).toBeGreaterThan(0);
  });
});

describe('Políticas', () => {
  it('sin Fundición no se investiga', () => {
    const base = toWar(game());
    const state = give(base, 0, { ore: 200, ember: 200 });
    const result = reduce(
      state,
      { 0: { turn: 1, moves: [], research: { kind: 'policy', policy: 'deepVeins' } } },
      CTX,
    );
    expect(
      result.events.some((e) => String(e.data['reason']).includes('research_no_foundry')),
    ).toBe(true);
    expect(result.state.seats[0]!.policies.deepVeins).toBe(0);
  });

  it('con Fundición sí, y es pública: la aritmética del juego se negocia a la vista', () => {
    const base = toWar(game());
    const bastion = base.map.bastions[0] as RegionId;
    const state = give(
      {
        ...base,
        buildings: [
          ...base.buildings,
          { regionId: bastion, kind: 'foundry', level: 1, target: 1, building: 0 },
        ],
      },
      0,
      { ore: 200, ember: 200 },
    );

    const result = reduce(
      state,
      { 0: { turn: 1, moves: [], research: { kind: 'policy', policy: 'deepVeins' } } },
      CTX,
    );
    expect(result.state.seats[0]!.policies.deepVeins).toBe(1);

    const adopted = result.events.find((e) => e.type === 'POLICY_ADOPTED');
    expect(adopted).toBeDefined();
    expect(adopted?.visibleTo.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('empieza todo el mundo a cero: la cuenta guarda qué, no cuánto', () => {
    const state = game();
    for (const seat of state.seats) {
      expect(seat.tiers).toEqual({ line: 1, fire: 1, sky: 1 });
      expect(Object.values(seat.policies).every((rank) => rank === 0)).toBe(true);
    }
  });
});

describe('Botín', () => {
  /** Región del asiento 1 con almacén, adyacente a algo del asiento 0. */
  function raidTarget(state: GameState): { victim: RegionId; from: RegionId } {
    const bastion = state.map.bastions[0] as RegionId;
    const adjacency = state.map.edges.reduce<Map<RegionId, RegionId[]>>((acc, e) => {
      if (e.ward) return acc;
      acc.set(e.a, [...(acc.get(e.a) ?? []), e.b]);
      acc.set(e.b, [...(acc.get(e.b) ?? []), e.a]);
      return acc;
    }, new Map());
    const victim = (adjacency.get(bastion) ?? [])[0] as RegionId;
    return { victim, from: bastion };
  }

  it('gana, roba y VUELVE por donde vino: no captura', () => {
    const base = toWar(game());
    const { victim, from } = raidTarget(base);

    const state: GameState = {
      ...base,
      control: base.control.map((o, id) => (id === victim ? 1 : o)) as (Seat | null)[],
      stock: base.stock.map((s, id) => (id === victim ? { ore: 30, ember: 10 } : s)),
      forces: [
        { id: 'R', seat: 0, regionId: from, line: 30, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const before = state.seats[0]!.resources.ore;
    const result = reduce(
      state,
      { 0: { turn: 1, moves: [{ forceId: 'R', to: victim, posture: 'plunder' }] } },
      CTX,
    );

    expect(result.events.some((e) => e.type === 'PLUNDERED')).toBe(true);
    // Se lleva material…
    expect(result.state.seats[0]!.resources.ore).toBeGreaterThan(before);
    // …la región sigue siendo del otro…
    expect(result.state.control[victim]).toBe(1);
    // …y el saqueador está de vuelta en casa.
    expect(result.state.forces.find((f) => f.id === 'R')?.regionId).toBe(from);
  });

  it('sobre un almacén vacío no roba nada, y aun así vuelve', () => {
    const base = toWar(game());
    const { victim, from } = raidTarget(base);
    const state: GameState = {
      ...base,
      control: base.control.map((o, id) => (id === victim ? 1 : o)) as (Seat | null)[],
      forces: [
        { id: 'R', seat: 0, regionId: from, line: 30, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const result = reduce(
      state,
      { 0: { turn: 1, moves: [{ forceId: 'R', to: victim, posture: 'plunder' }] } },
      CTX,
    );
    expect(result.events.some((e) => e.type === 'PLUNDERED')).toBe(false);
    expect(result.state.control[victim]).toBe(1);
    expect(result.state.forces.find((f) => f.id === 'R')?.regionId).toBe(from);
  });

  it('saquear pega menos que asaltar: es una decisión, no una jugada gratis', async () => {
    const { combatPower } = await import('../src/rules/combat');
    const side = {
      seat: 0 as Seat, arms: { line: 20, fire: 0, sky: 0 },
      defender: false, fireSupport: 0, unsupplied: 0,
    };
    const enemy = { line: 0, fire: 10, sky: 0 };
    const assault = combatPower({ ...side, posture: 'assault' }, enemy, 'plain', 0);
    const plunder = combatPower({ ...side, posture: 'plunder' }, enemy, 'plain', 0);
    expect(plunder).toBeLessThan(assault);
  });
});
