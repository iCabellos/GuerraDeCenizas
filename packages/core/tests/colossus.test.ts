/**
 * Colosos y la aritmética de la Puerta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Este archivo no comprueba que el Coloso «funcione». Comprueba que el     │
 * │ DISEÑO se cumple: que abrir una Puerta en solitario sale caro, que entre │
 * │ dos sale a cuenta, y que la Puerta se abre PARA TODOS.                   │
 * │                                                                          │
 * │ Si esas tres dejan de ser ciertas, el Coloso deja de ser un problema     │
 * │ diplomático y pasa a ser un peaje — y el sistema entero sobra.           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los tests fijan la **intención**, no las constantes: `attritionK` puede cambiar y
 * deben seguir pasando. Si se calibra hasta romperlos, es la calibración la que está
 * mal ([lección 6 de CLAUDE.md](../../CLAUDE.md)).
 */

import { describe, expect, it } from 'vitest';
import type { Force, GameState, PlayerCount, RegionId, Seat } from '../src/types/index';
import { createGame } from '../src/rules/setup';
import { ENGINE_VERSION, reduce } from '../src/rules/reduce';
import { BALANCE } from '../src/balance/constants';
import { totalOf } from '../src/rules/combat';

const CTX = { engineVersion: ENGINE_VERSION, now: 0 };
const FACTIONS = ['koldvik', 'vantera', 'saranth', 'meridia', 'oshara'] as const;

function game(players: PlayerCount = 5, seed = 2718): GameState {
  const state = createGame({
    gameId: 'col',
    seed,
    players,
    seats: Array.from({ length: players }, (_, i) => ({
      name: `P${i}`,
      factionId: FACTIONS[i]!,
    })),
  }).state;
  return { ...state, meta: { ...state.meta, turn: 1, phase: 'war' } };
}

/** La primera Puerta del Cerco 1→2 y la región donde espera su Coloso. */
function firstGate(state: GameState): { gateId: number; at: RegionId } {
  const gate = state.map.gates.find((g) => g.from === 1)!;
  return { gateId: gate.id, at: gate.outer };
}

/** Pone a `seats` peleando contra el Coloso con `power` de Línea cada uno. */
function siege(state: GameState, at: RegionId, seats: readonly Seat[], power: number): GameState {
  const forces: Force[] = seats.map((seat) => ({
    id: `S${seat}`,
    seat,
    regionId: at,
    line: power,
    fire: 0,
    sky: 0,
    posture: 'assault',
    unsupplied: 0,
  }));
  return {
    ...state,
    forces,
    // Sin control previo de la región: se ataca al Coloso, no se defiende nada.
    control: state.control.map((o, id) => (id === at ? null : o)) as (Seat | null)[],
  };
}

function colossusTotal(state: GameState, gateId: number): number {
  const colossus = state.colossi.find((c) => c.gateId === gateId);
  return colossus ? totalOf(colossus) : 0;
}

describe('el Coloso guarda su Puerta', () => {
  it('nunca se mueve', () => {
    const state = game();
    const { at } = firstGate(state);
    let current = state;
    for (let turn = 0; turn < 5; turn++) {
      current = reduce({ ...current, meta: { ...current.meta, turn: turn + 1 } }, {}, CTX).state;
    }
    expect(current.colossi.every((c) => c.regionId === state.colossi.find((o) => o.id === c.id)!.regionId))
      .toBe(true);
    expect(current.colossi.some((c) => c.regionId === at)).toBe(true);
  });

  it('se rehace si nadie lo toca: no se lima a picotazos gratis', () => {
    const base = game();
    const { gateId, at } = firstGate(base);
    const hurt: GameState = {
      ...base,
      colossi: base.colossi.map((c) =>
        c.gateId === gateId ? { ...c, line: c.line / 2, fire: c.fire / 2, sky: c.sky / 2 } : c,
      ),
    };
    const before = colossusTotal(hurt, gateId);
    const after = reduce(hurt, {}, CTX).state;
    expect(colossusTotal(after, gateId)).toBeGreaterThan(before);
    expect(at).toBeGreaterThanOrEqual(0);
  });

  it('mientras vive, la Puerta está sellada y nadie pasa', () => {
    const state = game();
    const gate = state.map.gates.find((g) => g.from === 1)!;
    const forces: Force[] = [
      { id: 'X', seat: 0, regionId: gate.outer, line: 20, fire: 0, sky: 0, posture: 'assault', unsupplied: 0 },
    ];
    const result = reduce(
      { ...state, forces },
      { 0: { turn: 1, moves: [{ forceId: 'X', to: gate.inner, posture: 'assault' }] } },
      CTX,
    );
    expect(result.events.some((e) => e.data['reason'] === 'ward_sealed')).toBe(true);
    expect(result.state.forces.find((f) => f.id === 'X')?.regionId).not.toBe(gate.inner);
  });
});

describe('la aritmética de la Puerta', () => {
  it('matarlo en solitario deja al matador POR DEBAJO de donde estaba', () => {
    const base = game();
    const { gateId, at } = firstGate(base);
    const power = 200; // de sobra para matarlo de un golpe

    const before = power;
    const result = reduce(siege(base, at, [0], power), {}, CTX);

    expect(result.events.some((e) => e.type === 'COLOSSUS_SLAIN')).toBe(true);
    const survivor = result.state.forces.find((f) => f.seat === 0);
    const after = survivor ? totalOf(survivor) : 0;

    // Pierde tropa de verdad, y el Despojo no lo compensa: el Despojo es material, y
    // el material no reconstruye un ejército dentro del mismo turno.
    expect(after).toBeLessThan(before);
    expect(result.state.gatesOpen[gateId]).toBe(true);
  });

  it('entre dos, cada uno pierde MENOS que yendo solo', () => {
    const base = game();
    const { at } = firstGate(base);
    const power = 40;

    const alone = reduce(siege(base, at, [0], power), {}, CTX);
    const aloneLeft = alone.state.forces.find((f) => f.seat === 0);
    const aloneLoss = power - (aloneLeft ? totalOf(aloneLeft) : 0);

    const together = reduce(siege(base, at, [0, 1], power), {}, CTX);
    const togetherLeft = together.state.forces.find((f) => f.seat === 0);
    const togetherLoss = power - (togetherLeft ? totalOf(togetherLeft) : 0);

    // Ésta es LA propiedad del sistema. Si deja de cumplirse, coordinarse no sirve de
    // nada y el Coloso pasa a ser una carrera por llegar el primero.
    expect(togetherLoss).toBeLessThan(aloneLoss);
  });

  it('entre dos también cae ANTES', () => {
    const base = game();
    const { gateId, at } = firstGate(base);
    const power = 30;

    const alone = reduce(siege(base, at, [0], power), {}, CTX).state;
    const together = reduce(siege(base, at, [0, 1], power), {}, CTX).state;

    expect(colossusTotal(together, gateId)).toBeLessThan(colossusTotal(alone, gateId));
  });

  it('al morir abre la Puerta PARA TODOS, no solo para quien lo mató', () => {
    const base = game();
    const { gateId, at } = firstGate(base);
    const result = reduce(siege(base, at, [0], 200), {}, CTX);

    expect(result.state.gatesOpen[gateId]).toBe(true);

    // Y el evento es público: quién pagó la Puerta lo ven los cinco. Es lo que
    // convierte el pago en una carta de negociación en vez de en un gasto privado.
    const opened = result.events.find((e) => e.type === 'GATE_OPENED');
    expect(opened).toBeDefined();
    expect(opened?.visibleTo.sort()).toEqual([0, 1, 2, 3, 4]);
    expect(opened?.data['forEveryone']).toBe(true);
  });

  it('el Despojo es del golpe final, y desempata por asiento ascendente', () => {
    const base = game();
    const { at } = firstGate(base);
    // Dos asientos exactamente iguales: gana el menor. Nunca al azar.
    const result = reduce(siege(base, at, [1, 3], 200), {}, CTX);
    const spoils = result.events.find((e) => e.type === 'SPOILS_TAKEN');
    expect(spoils?.seat).toBe(1);
  });

  it('el Despojo llega en material, y es público', () => {
    const base = game();
    const { at } = firstGate(base);
    const before = base.seats[0]!.resources;
    const result = reduce(siege(base, at, [0], 200), {}, CTX);

    const after = result.state.seats[0]!.resources;
    expect(after.ore + after.ember).toBeGreaterThan(before.ore + before.ember);

    const spoils = result.events.find((e) => e.type === 'SPOILS_TAKEN');
    expect(spoils?.visibleTo.sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('ante el Coloso no hay guerra', () => {
  it('dos asientos en la región del Coloso NO combaten entre sí', () => {
    const base = game();
    const { at } = firstGate(base);
    // Poco a poco: 20 cada uno no basta para matarlo este turno, así que si hubiera
    // combate entre asientos se vería en las bajas.
    const result = reduce(siege(base, at, [0, 1], 20), {}, CTX);

    expect(result.events.some((e) => e.type === 'COMBAT')).toBe(false);
    expect(result.events.some((e) => e.type === 'COLOSSUS_FOUGHT')).toBe(true);

    // Los dos siguen ahí, tocados por el Coloso pero no por el vecino.
    for (const seat of [0, 1] as Seat[]) {
      const force = result.state.forces.find((f) => f.seat === seat);
      expect(force).toBeDefined();
      expect(totalOf(force!)).toBeGreaterThan(0);
      expect(totalOf(force!)).toBeLessThan(20);
    }
  });

  it('en cuanto cae, la tregua se acaba', () => {
    const base = game();
    const { at } = firstGate(base);
    const dead = reduce(siege(base, at, [0, 1], 200), {}, CTX).state;
    expect(dead.colossi.find((c) => c.regionId === at)?.alive).toBe(false);

    // Al turno siguiente, los dos siguen en la misma casilla y ya no hay tregua.
    const next = reduce({ ...dead, meta: { ...dead.meta, turn: 2 } }, {}, CTX);
    expect(next.events.some((e) => e.type === 'COMBAT')).toBe(true);
  });
});

describe('el Coloso es información pública', () => {
  it('su potencia exacta llega a las cinco vistas', () => {
    const state = game();
    const { views } = reduce(state, {}, CTX);
    for (const seat of [0, 1, 2, 3, 4] as Seat[]) {
      expect(views[seat].colossi).toHaveLength(state.map.gates.length);
      for (const colossus of views[seat].colossi) {
        const real = state.colossi.find((c) => c.id === colossus.id)!;
        // Exacta y sin redondear: un Coloso previsible es un Coloso sobre el que se
        // puede prometer ayuda y comprobar después si la diste.
        expect(colossus.peak).toBe(real.peak);
      }
    }
  });

  it('los dos Cercos no cuestan lo mismo: el segundo es más caro', () => {
    const state = game();
    const first = state.colossi.find((c) => state.map.gates[c.gateId]!.from === 1)!;
    const second = state.colossi.find((c) => state.map.gates[c.gateId]!.from === 2)!;
    expect(totalOf(second)).toBeGreaterThan(totalOf(first));
    expect(BALANCE.colossus.spoils[1]!.ore).toBeGreaterThan(BALANCE.colossus.spoils[0]!.ore);
  });
});
