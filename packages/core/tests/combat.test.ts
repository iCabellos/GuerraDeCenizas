/**
 * Tests del combate determinista.
 *
 * Dos son criterios de aceptación de la v0.2:
 *  - **la previsualización coincide exactamente con el resultado** (si no, el jugador
 *    no puede prometer nada, y ahí se cae la diplomacia entera);
 *  - **ninguna composición monoarma vence a todas las demás** (si no, hay una unidad
 *    imprescindible y el sistema de armas sobra).
 */

import { describe, expect, it } from 'vitest';
import type { Arms, PlayerView, Posture, Seat, TerrainKind } from '../src/types/index';
import {
  combatPower, previewAttack, previewCombat, resolveCombat, totalOf, type CombatSide,
} from '../src/rules/combat';
import { BALANCE } from '../src/balance/constants';

function side(
  seat: Seat,
  arms: Partial<Arms>,
  extra: Partial<Omit<CombatSide, 'seat' | 'arms'>> = {},
): CombatSide {
  return {
    seat,
    arms: { line: 0, fire: 0, sky: 0, ...arms },
    posture: 'hold',
    defender: false,
    fireSupport: 0,
    unsupplied: 0,
    ...extra,
  };
}

describe('la rueda: Fuego > Línea > Cielo > Fuego', () => {
  const pairs: [keyof Arms, keyof Arms][] = [
    ['fire', 'line'],
    ['line', 'sky'],
    ['sky', 'fire'],
  ];

  it.each(pairs)('%s vence a %s con fuerzas iguales', (winner, loser) => {
    const outcome = resolveCombat(
      [side(0, { [winner]: 20 }), side(1, { [loser]: 20 })],
      'plain',
      0,
    );
    expect(outcome.winner).toBe(0);
  });

  it('la ventaja escala con la proporción del enemigo que se contrarresta', () => {
    // Fuego contra un enemigo TODO Línea rinde más que contra uno mitad Línea.
    const pure = combatPower(side(0, { fire: 20 }), { line: 20, fire: 0, sky: 0 }, 'plain', 0);
    const mixed = combatPower(side(0, { fire: 20 }), { line: 10, fire: 10, sky: 0 }, 'plain', 0);
    expect(pure).toBeGreaterThan(mixed);
  });

  it('sin enemigo no hay ni bonificación ni penalización', () => {
    const alone = combatPower(side(0, { line: 10 }), { line: 0, fire: 0, sky: 0 }, 'plain', 0);
    expect(alone).toBe(10);
  });
});

describe('ninguna composición monoarma domina', () => {
  it('cada arma pura es derrotada por otra arma pura', () => {
    const arms: (keyof Arms)[] = ['line', 'fire', 'sky'];
    for (const mine of arms) {
      const beatenBySomething = arms.some((theirs) => {
        if (theirs === mine) return false;
        const outcome = resolveCombat(
          [side(0, { [mine]: 20 }), side(1, { [theirs]: 20 })],
          'plain',
          0,
        );
        return outcome.winner === 1;
      });
      expect(beatenBySomething).toBe(true);
    }
  });
});

describe('terreno, postura y fortificación', () => {
  it('la Urbana favorece a Línea y castiga a Cielo', () => {
    const line = combatPower(side(0, { line: 10 }), { line: 0, fire: 0, sky: 0 }, 'urban', 0);
    const sky = combatPower(side(0, { sky: 10 }), { line: 0, fire: 0, sky: 0 }, 'urban', 0);
    expect(line).toBeGreaterThan(10);
    expect(sky).toBeLessThan(10);
  });

  it('el bono de terreno defensivo solo lo recibe el defensor', () => {
    const enemy = { line: 10, fire: 0, sky: 0 };
    const attacker = combatPower(side(0, { line: 10 }), enemy, 'high', 0);
    const defender = combatPower(side(0, { line: 10 }, { defender: true }), enemy, 'high', 0);
    expect(defender).toBeGreaterThan(attacker);
  });

  it('Asalto ataca mejor y defiende peor; Firme al revés', () => {
    const enemy = { line: 10, fire: 0, sky: 0 };
    const assaultAtk = combatPower(side(0, { line: 10 }, { posture: 'assault' }), enemy, 'plain', 0);
    const holdAtk = combatPower(side(0, { line: 10 }, { posture: 'hold' }), enemy, 'plain', 0);
    expect(assaultAtk).toBeGreaterThan(holdAtk);

    const assaultDef = combatPower(
      side(0, { line: 10 }, { posture: 'assault', defender: true }), enemy, 'plain', 0);
    const holdDef = combatPower(
      side(0, { line: 10 }, { posture: 'hold', defender: true }), enemy, 'plain', 0);
    expect(holdDef).toBeGreaterThan(assaultDef);
  });

  it('la fortificación solo ayuda al defensor y tiene tope', () => {
    const enemy = { line: 10, fire: 0, sky: 0 };
    const base = combatPower(side(0, { line: 10 }, { defender: true }), enemy, 'plain', 0);
    const fort1 = combatPower(side(0, { line: 10 }, { defender: true }), enemy, 'plain', 1);
    const fort9 = combatPower(side(0, { line: 10 }, { defender: true }), enemy, 'plain', 9);
    const fortMax = combatPower(
      side(0, { line: 10 }, { defender: true }), enemy, 'plain', BALANCE.combat.maxFortLevel);

    expect(fort1).toBeGreaterThan(base);
    expect(fort9).toBe(fortMax);

    const attacker = combatPower(side(0, { line: 10 }), enemy, 'plain', 2);
    expect(attacker).toBe(10);
  });

  it('la falta de suministro degrada un 15 % acumulativo', () => {
    const enemy = { line: 0, fire: 0, sky: 0 };
    const fresh = combatPower(side(0, { line: 100 }), enemy, 'plain', 0);
    const one = combatPower(side(0, { line: 100 }, { unsupplied: 1 }), enemy, 'plain', 0);
    const two = combatPower(side(0, { line: 100 }, { unsupplied: 2 }), enemy, 'plain', 0);

    expect(one).toBeCloseTo(fresh * 0.85, 2);
    expect(two).toBeCloseTo(fresh * 0.85 * 0.85, 2);
  });
});

describe('resolución', () => {
  it('el vencedor pierde la fracción proporcional a la potencia rival', () => {
    const outcome = resolveCombat(
      [side(0, { line: 40 }), side(1, { line: 10 })],
      'plain',
      0,
    );
    const winner = outcome.sides.find((s) => s.seat === 0);
    const loser = outcome.sides.find((s) => s.seat === 1);

    expect(outcome.winner).toBe(0);
    expect(winner?.losses).toBeCloseTo(0.25, 2);
    expect(loser?.destroyed).toBe(true);
    expect(totalOf(loser!.survivors)).toBe(0);
  });

  it('las bajas se reparten proporcionalmente entre armas', () => {
    const outcome = resolveCombat(
      [side(0, { line: 40, fire: 20 }), side(1, { line: 15 })],
      'plain',
      0,
    );
    const winner = outcome.sides.find((s) => s.seat === 0)!;
    // La proporción Línea:Fuego se conserva: perder no recompone la fuerza.
    expect(winner.survivors.line / winner.survivors.fire).toBeCloseTo(2, 1);
  });

  it('un empate exacto no tiene vencedor y destruye a todos', () => {
    const outcome = resolveCombat(
      [side(0, { line: 10 }), side(1, { line: 10 })],
      'plain',
      0,
    );
    expect(outcome.winner).toBeNull();
    expect(outcome.sides.every((s) => s.destroyed)).toBe(true);
  });

  it('con tres bandos gana el más fuerte contra la suma de los otros', () => {
    const outcome = resolveCombat(
      [side(0, { line: 50 }), side(1, { line: 20 }), side(2, { line: 15 })],
      'plain',
      0,
    );
    expect(outcome.winner).toBe(0);
    expect(outcome.sides.filter((s) => s.destroyed).map((s) => s.seat)).toEqual([1, 2]);
  });

  it('Pantalla se retira dejando la mitad en vez de morir', () => {
    const outcome = resolveCombat(
      [side(0, { line: 50 }), side(1, { line: 10 }, { posture: 'screen' })],
      'plain',
      0,
    );
    const screened = outcome.sides.find((s) => s.seat === 1)!;

    expect(screened.destroyed).toBe(false);
    expect(screened.retreated).toBe(true);
    expect(screened.losses).toBe(BALANCE.combat.screenRetreatLoss);
    expect(totalOf(screened.survivors)).toBeCloseTo(5, 2);
  });

  it('el apoyo de Fuego suma potencia pero no recibe bajas', () => {
    const withSupport = resolveCombat(
      [side(0, { line: 10 }, { fireSupport: 30 }), side(1, { line: 20 })],
      'plain',
      0,
    );
    const without = resolveCombat(
      [side(0, { line: 10 }), side(1, { line: 20 })],
      'plain',
      0,
    );
    expect(without.winner).toBe(1);
    expect(withSupport.winner).toBe(0);

    // Los supervivientes salen de las armas reales, no del apoyo prestado.
    const supported = withSupport.sides.find((s) => s.seat === 0)!;
    expect(supported.survivors.fire).toBe(0);
  });

  it('el orden de los bandos no altera el resultado', () => {
    const a = resolveCombat([side(0, { line: 30 }), side(1, { fire: 25 })], 'plain', 0);
    const b = resolveCombat([side(1, { fire: 25 }), side(0, { line: 30 })], 'plain', 0);
    expect(a.winner).toBe(b.winner);
    expect(a.sides).toEqual(b.sides);
  });
});

describe('previsualización', () => {
  it('coincide EXACTAMENTE con la resolución', () => {
    const terrains: TerrainKind[] = ['plain', 'urban', 'high', 'forest', 'bastion', 'core'];
    const postures: Posture[] = ['assault', 'hold', 'screen'];

    for (const terrain of terrains) {
      for (const posture of postures) {
        for (const fort of [0, 1, 2]) {
          const sides = [
            side(0, { line: 23, fire: 11, sky: 4 }, { posture }),
            side(1, { line: 9, fire: 17, sky: 13 }, { defender: true }),
          ];
          const preview = previewCombat(7, sides, terrain, fort, false);
          const actual = resolveCombat(sides, terrain, fort);

          expect(preview.winner).toBe(actual.winner);
          expect(preview.sides.map((s) => [s.seat, s.power, s.losses])).toEqual(
            actual.sides.map((s) => [s.seat, s.power, s.losses]),
          );
        }
      }
    }
  });

  it('marca la incertidumbre cuando hay información oculta', () => {
    const sides = [side(0, { line: 10 }), side(1, { line: 10 })];
    expect(previewCombat(1, sides, 'forest', 0, true).uncertain).toBe(true);
    expect(previewCombat(1, sides, 'plain', 0, false).uncertain).toBe(false);
  });
});

describe('previewAttack — previsualización desde la vista del jugador', () => {
  const view = (overrides: Partial<PlayerView>): PlayerView => ({
    seat: 0,
    turn: 3,
    phase: 'war',
    map: {
      regions: [
        { id: 0, kind: 'plain', sector: 0, ring: 0, slot: 0, x: 0, y: 0 },
        { id: 1, kind: 'plain', sector: 0, ring: 0, slot: 1, x: 10, y: 0 },
        { id: 2, kind: 'plain', sector: 0, ring: 0, slot: 2, x: 20, y: 0 },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }],
      coreId: 0,
      bastions: [0, 2],
      extent: 100,
    },
    visible: [0, 1, 2],
    control: [0, null, 1],
    fortification: [0, 0, 0],
    bridges: [false, false, false],
    forces: [],
    self: {
      seat: 0, name: 'A', factionId: 'koldvik', doctrineId: 'anvil',
      anomalies: [], resources: { supply: 10, industry: 10, intel: 5, ash: 1 },
    },
    opponents: [],
    events: [],
    checksum: 'x',
    ...overrides,
  });

  const adjacency = [[1], [0, 2], [1]];

  const own = {
    id: 'mine', seat: 0 as Seat, regionId: 0, own: true,
    line: 30, fire: 0, sky: 0, approxTotal: 30, posture: 'hold' as Posture, unsupplied: 0,
  };

  it('devuelve null si en el destino no hay nadie visible', () => {
    const result = previewAttack(view({ forces: [own] }), 'mine', 1, adjacency, 'plain');
    expect(result).toBeNull();
  });

  it('devuelve null si la fuerza atacante no existe o no es propia', () => {
    const enemy = {
      id: 'e', seat: 1 as Seat, regionId: 1, own: false,
      line: 10, fire: 0, sky: 0, approxTotal: 10, posture: 'hold' as Posture, unsupplied: null,
    };
    expect(previewAttack(view({ forces: [own, enemy] }), 'noexiste', 1, adjacency, 'plain')).toBeNull();
    expect(previewAttack(view({ forces: [enemy] }), 'e', 1, adjacency, 'plain')).toBeNull();
  });

  it('calcula el combate contra el enemigo visible', () => {
    const enemy = {
      id: 'e', seat: 1 as Seat, regionId: 1, own: false,
      line: 10, fire: 0, sky: 0, approxTotal: 10, posture: 'hold' as Posture, unsupplied: null,
    };
    const result = previewAttack(view({ forces: [own, enemy] }), 'mine', 1, adjacency, 'plain');

    expect(result).not.toBeNull();
    expect(result!.winner).toBe(0);
    expect(result!.uncertain).toBe(false);
    expect(result!.sides.map((s) => s.seat)).toEqual([0, 1]);
  });

  it('marca incertidumbre y sobrestima al defensor si está oculto', () => {
    // Fuerza en bosque: se conoce el total aproximado pero no el desglose. Se supone
    // todo Línea, que es la lectura conservadora para quien ataca.
    const hidden = {
      id: 'h', seat: 1 as Seat, regionId: 1, own: false,
      line: null, fire: null, sky: null, approxTotal: 40, posture: null, unsupplied: null,
    };
    const result = previewAttack(view({ forces: [own, hidden] }), 'mine', 1, adjacency, 'forest');

    expect(result!.uncertain).toBe(true);
    expect(result!.winner).toBe(1); // 40 supuestos superan a los 30 del atacante
  });

  it('reconoce al defensor por el control de la región', () => {
    const enemy = {
      id: 'e', seat: 1 as Seat, regionId: 2, own: false,
      line: 25, fire: 0, sky: 0, approxTotal: 25, posture: 'hold' as Posture, unsupplied: null,
    };
    const forward = { ...own, regionId: 1 };
    const attacking = previewAttack(view({ forces: [forward, enemy] }), 'mine', 2, adjacency, 'plain');

    // El asiento 1 controla la región 2, así que defiende y recibe el bono de postura.
    const defender = attacking!.sides.find((s) => s.seat === 1)!;
    expect(defender.power).toBeGreaterThan(25);
  });

  it('cuenta el Fuego propio adyacente como apoyo potencial', () => {
    const enemy = {
      id: 'e', seat: 1 as Seat, regionId: 1, own: false,
      line: 40, fire: 0, sky: 0, approxTotal: 40, posture: 'hold' as Posture, unsupplied: null,
    };
    const artillery = {
      id: 'art', seat: 0 as Seat, regionId: 2, own: true,
      line: 0, fire: 40, sky: 0, approxTotal: 40, posture: 'hold' as Posture, unsupplied: 0,
    };

    const alone = previewAttack(view({ forces: [own, enemy] }), 'mine', 1, adjacency, 'plain');
    const supported = previewAttack(
      view({ forces: [own, enemy, artillery] }), 'mine', 1, adjacency, 'plain');

    const before = alone!.sides.find((s) => s.seat === 0)!.power;
    const after = supported!.sides.find((s) => s.seat === 0)!.power;
    expect(after).toBeGreaterThan(before);
  });
});
