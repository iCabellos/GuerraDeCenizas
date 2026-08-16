/**
 * Tests del motor.
 *
 * Los tres bloques importantes:
 *  - **pureza y determinismo**: sin esto el juego se desincroniza en producción;
 *  - **totalidad**: una orden inválida no puede bloquear la partida de los demás;
 *  - **fuga de información**: `PlayerView` no puede contener nada que ese asiento no
 *    deba ver. Es el test que sostiene la niebla de guerra entera.
 */

import { describe, expect, it } from 'vitest';
import type {
  Force, GameState, OrdersBySeat, PlayerCount, RegionId, Seat,
} from '../src/types/index';
import { createGame } from '../src/rules/setup';
import { ENGINE_VERSION, reduce } from '../src/rules/reduce';
import { buildAdjacency } from '../src/mapgen/skeleton';
import { checksum, deepFreeze } from '../src/util/canonical';

const CTX = { engineVersion: ENGINE_VERSION, now: 1_700_000_000_000 };

function game(players: PlayerCount = 5, seed = 4242) {
  const names = ['Ash', 'Bors', 'Cira', 'Dov', 'Enna'];
  const factions = ['koldvik', 'vantera', 'saranth', 'meridia', 'oshara'] as const;
  return createGame({
    gameId: 'test',
    seed,
    players,
    seats: Array.from({ length: players }, (_, i) => ({
      name: names[i] as string,
      factionId: factions[i]!,
    })),
  });
}

/** Salta el Parlamento: en el turno 0 no se puede mover. */
function toWar(state: GameState): GameState {
  return reduce(state, {}, CTX).state;
}

function forcesOf(state: GameState, seat: Seat): Force[] {
  return state.forces.filter((f) => f.seat === seat);
}

describe('createGame', () => {
  it.each([2, 3, 5] as PlayerCount[])('crea una partida coherente (%i jugadores)', (n) => {
    const { state } = game(n);
    expect(state.seats).toHaveLength(n);
    expect(state.meta.phase).toBe('parley');
    expect(state.meta.turn).toBe(0);
    expect(state.forces).toHaveLength(n * 2);
    expect(state.control.filter((c) => c !== null)).toHaveLength(n * 2);
  });

  it('todos los asientos empiezan con los mismos recursos y fuerzas', () => {
    const { state } = game(5);
    const signatures = state.seats.map((s) => JSON.stringify(s.resources));
    expect(new Set(signatures).size).toBe(1);

    const totals = state.seats.map((s) =>
      forcesOf(state, s.seat).reduce((sum, f) => sum + f.line + f.fire + f.sky, 0),
    );
    expect(new Set(totals).size).toBe(1);
  });

  it('cada asiento controla su Bastión', () => {
    const { state } = game(5);
    state.map.bastions.forEach((regionId, seat) => {
      expect(state.control[regionId]).toBe(seat);
    });
  });

  it('la doctrina por defecto es la de origen de la facción', () => {
    const { state } = game(5);
    expect(state.seats[0]?.doctrineId).toBe('anvil'); // koldvik
    expect(state.seats[1]?.doctrineId).toBe('ledger'); // vantera
  });

  it('declara la concordia cuando dos asientos comparten facción', () => {
    const { concordance } = createGame({
      gameId: 'c', seed: 1, players: 3,
      seats: [
        { name: 'A', factionId: 'tarn' },
        { name: 'B', factionId: 'vantera' },
        { name: 'C', factionId: 'tarn' },
      ],
    });
    expect(concordance).toEqual([{ factionId: 'tarn', seats: [0, 2] }]);
  });

  it('rechaza un número de asientos incoherente', () => {
    expect(() =>
      createGame({ gameId: 'x', seed: 1, players: 5, seats: [{ name: 'A', factionId: 'tarn' }] }),
    ).toThrow();
  });
});

describe('pureza y determinismo', () => {
  it('no muta el estado de entrada', () => {
    const { state } = game(5);
    const frozen = deepFreeze(structuredClone(state));
    expect(() => reduce(frozen, {}, CTX)).not.toThrow();
    expect(checksum(frozen)).toBe(checksum(state));
  });

  it('mismas entradas ⇒ mismo checksum', () => {
    const { state } = game(5);
    const war = toWar(state);
    const orders: OrdersBySeat = {
      0: { turn: war.meta.turn, moves: [{ forceId: 'f0t0n1', posture: 'assault' }] },
    };
    expect(reduce(war, orders, CTX).checksum).toBe(reduce(war, orders, CTX).checksum);
  });

  it('una partida completa de 12 turnos es reproducible', () => {
    const run = (): string[] => {
      let state = game(5, 777).state;
      const checksums: string[] = [];
      for (let turn = 0; turn < 12; turn++) {
        const result = reduce(state, {}, CTX);
        state = result.state;
        checksums.push(result.checksum);
      }
      return checksums;
    };
    expect(run()).toEqual(run());
  });

  it('el cursor del PRNG se conserva entre turnos', () => {
    const { state } = game(5);
    expect(reduce(state, {}, CTX).state.rngCursor).toBe(state.rngCursor);
  });
});

describe('fases', () => {
  it('el turno 0 es Parlamento y pasa a guerra al cerrarse', () => {
    const { state } = game(5);
    const next = reduce(state, {}, CTX).state;
    expect(next.meta.phase).toBe('war');
    expect(next.meta.turn).toBe(1);
  });

  it('no se puede mover durante el Parlamento', () => {
    const { state } = game(5);
    const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
    const force = forcesOf(state, 0)[1] as Force;
    const target = (adjacency[force.regionId] as RegionId[])[0] as RegionId;

    const result = reduce(
      state,
      { 0: { turn: 0, moves: [{ forceId: force.id, to: target, posture: 'assault' }] } },
      CTX,
    );

    expect(result.state.forces.find((f) => f.id === force.id)?.regionId).toBe(force.regionId);
    expect(result.events.some((e) => e.type === 'ORDER_REJECTED')).toBe(true);
  });
});

describe('movimiento', () => {
  it('mueve una fuerza a una región adyacente', () => {
    const war = toWar(game(5).state);
    const adjacency = buildAdjacency(war.map.regions.length, war.map.edges);
    const force = forcesOf(war, 0)[1] as Force;
    const target = (adjacency[force.regionId] as RegionId[]).find(
      (r) => r !== force.regionId,
    ) as RegionId;

    const result = reduce(
      war,
      { 0: { turn: war.meta.turn, moves: [{ forceId: force.id, to: target, posture: 'assault' }] } },
      CTX,
    );

    const moved = result.state.forces.find((f) => f.seat === 0 && f.regionId === target);
    expect(moved).toBeDefined();
    expect(result.events.some((e) => e.type === 'FORCE_MOVED')).toBe(true);
  });

  it('captura una región neutral al llegar con Línea', () => {
    const war = toWar(game(5).state);
    const adjacency = buildAdjacency(war.map.regions.length, war.map.edges);
    const force = forcesOf(war, 0)[1] as Force;
    const target = (adjacency[force.regionId] as RegionId[]).find(
      (r) => war.control[r] === null && war.map.regions[r]?.kind !== 'core',
    ) as RegionId;

    const result = reduce(
      war,
      { 0: { turn: war.meta.turn, moves: [{ forceId: force.id, to: target, posture: 'assault' }] } },
      CTX,
    );

    expect(result.state.control[target]).toBe(0);
    expect(result.events.some((e) => e.type === 'REGION_CAPTURED')).toBe(true);
  });

  it('divide una fuerza y deja el resto atrás', () => {
    const war = toWar(game(5).state);
    const adjacency = buildAdjacency(war.map.regions.length, war.map.edges);
    const force = forcesOf(war, 0).find((f) => f.line >= 20) as Force;
    const target = (adjacency[force.regionId] as RegionId[])[0] as RegionId;

    const result = reduce(
      war,
      {
        0: {
          turn: war.meta.turn,
          moves: [
            { forceId: force.id, to: target, detach: { line: 5, fire: 0, sky: 0 }, posture: 'assault' },
          ],
        },
      },
      CTX,
    );

    const origin = result.state.forces.find((f) => f.seat === 0 && f.regionId === force.regionId);
    const detached = result.state.forces.find((f) => f.seat === 0 && f.regionId === target);
    expect(origin?.line).toBe(force.line - 5);
    expect(detached?.line).toBeGreaterThanOrEqual(5);
  });

  it('fusiona las fuerzas propias que coinciden en una región', () => {
    const war = toWar(game(5).state);
    const adjacency = buildAdjacency(war.map.regions.length, war.map.edges);
    const [a, b] = forcesOf(war, 0) as [Force, Force];

    // Ambas al vecino común, si lo hay.
    const shared = (adjacency[a.regionId] as RegionId[]).find((r) =>
      (adjacency[b.regionId] as RegionId[]).includes(r),
    );
    if (shared === undefined) return;

    const result = reduce(
      war,
      {
        0: {
          turn: war.meta.turn,
          moves: [
            { forceId: a.id, to: shared, posture: 'assault' },
            { forceId: b.id, to: shared, posture: 'assault' },
          ],
        },
      },
      CTX,
    );

    const here = result.state.forces.filter((f) => f.seat === 0 && f.regionId === shared);
    expect(here).toHaveLength(1);
    expect(here[0]?.line).toBe(a.line + b.line);
  });

  it('el cruce mutuo bloquea a ambos', () => {
    // Se construye a mano: dos fuerzas enemigas en regiones adyacentes intercambiando.
    const base = toWar(game(2, 11).state);
    const adjacency = buildAdjacency(base.map.regions.length, base.map.edges);
    const a = forcesOf(base, 0)[0] as Force;
    // El vecino no puede ser agua: Línea y Fuego no la cruzan sin Puente, y el
    // movimiento se rechazaría antes de poder comprobar el cruce.
    const neighbour = (adjacency[a.regionId] as RegionId[]).find(
      (r) => base.map.regions[r]?.kind !== 'water',
    ) as RegionId;

    const state: GameState = {
      ...base,
      forces: [
        { ...a, id: 'A', regionId: a.regionId },
        { id: 'B', seat: 1, regionId: neighbour, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const result = reduce(
      state,
      {
        0: { turn: state.meta.turn, moves: [{ forceId: 'A', to: neighbour, posture: 'assault' }] },
        1: { turn: state.meta.turn, moves: [{ forceId: 'B', to: a.regionId, posture: 'assault' }] },
      },
      CTX,
    );

    expect(result.state.forces.find((f) => f.id === 'A')?.regionId).toBe(a.regionId);
    expect(result.state.forces.find((f) => f.id === 'B')?.regionId).toBe(neighbour);
    expect(result.events.filter((e) => e.type === 'FORCE_BLOCKED')).toHaveLength(2);
  });
});

describe('totalidad — las órdenes inválidas no rompen nada', () => {
  const cases: { name: string; orders: (state: GameState) => OrdersBySeat }[] = [
    {
      name: 'fuerza inexistente',
      orders: (s) => ({ 0: { turn: s.meta.turn, moves: [{ forceId: 'nope', posture: 'hold' }] } }),
    },
    {
      name: 'fuerza ajena',
      orders: (s) => ({ 1: { turn: s.meta.turn, moves: [{ forceId: 'f0t0n0', posture: 'hold' }] } }),
    },
    {
      name: 'destino no adyacente',
      orders: (s) => ({
        0: { turn: s.meta.turn, moves: [{ forceId: 'f0t0n0', to: 999, posture: 'assault' }] },
      }),
    },
    {
      name: 'turno equivocado',
      orders: (s) => ({ 0: { turn: s.meta.turn + 7, moves: [{ forceId: 'f0t0n0', posture: 'hold' }] } }),
    },
    {
      name: 'destacamento mayor que la fuerza',
      orders: (s) => ({
        0: {
          turn: s.meta.turn,
          moves: [{
            forceId: 'f0t0n0', to: 1,
            detach: { line: 9999, fire: 0, sky: 0 }, posture: 'assault',
          }],
        },
      }),
    },
    {
      name: 'destacamento vacío',
      orders: (s) => ({
        0: {
          turn: s.meta.turn,
          moves: [{
            forceId: 'f0t0n0', to: 1,
            detach: { line: 0, fire: 0, sky: 0 }, posture: 'assault',
          }],
        },
      }),
    },
    {
      name: 'orden duplicada para la misma fuerza',
      orders: (s) => ({
        0: {
          turn: s.meta.turn,
          moves: [
            { forceId: 'f0t0n0', posture: 'hold' },
            { forceId: 'f0t0n0', posture: 'assault' },
          ],
        },
      }),
    },
  ];

  it.each(cases)('$name: no lanza, rechaza y el turno avanza', ({ orders }) => {
    const war = toWar(game(5).state);
    let result!: ReturnType<typeof reduce>;
    expect(() => { result = reduce(war, orders(war), CTX); }).not.toThrow();
    expect(result.state.meta.turn).toBe(war.meta.turn + 1);
    expect(result.events.some((e) => e.type === 'ORDER_REJECTED')).toBe(true);
  });

  it('una orden mala de un jugador no afecta a los demás', () => {
    const war = toWar(game(5).state);
    const adjacency = buildAdjacency(war.map.regions.length, war.map.edges);
    const force = forcesOf(war, 1)[1] as Force;
    const target = (adjacency[force.regionId] as RegionId[])[0] as RegionId;

    const result = reduce(
      war,
      {
        0: { turn: war.meta.turn, moves: [{ forceId: 'basura', posture: 'hold' }] },
        1: { turn: war.meta.turn, moves: [{ forceId: force.id, to: target, posture: 'assault' }] },
      },
      CTX,
    );

    expect(result.state.forces.some((f) => f.seat === 1 && f.regionId === target)).toBe(true);
  });
});

describe('control territorial', () => {
  it('un Bastión no se puede capturar', () => {
    const base = toWar(game(2, 5).state);
    const enemyBastion = base.map.bastions[1] as RegionId;

    const state: GameState = {
      ...base,
      forces: [
        { id: 'X', seat: 0, regionId: enemyBastion, line: 100, fire: 0, sky: 0, posture: 'assault', unsupplied: 0 },
      ],
    };

    expect(reduce(state, {}, CTX).state.control[enemyBastion]).toBe(1);
  });

  it('solo Línea captura: Cielo y Fuego no', () => {
    const base = toWar(game(2, 6).state);
    const neutral = base.control.findIndex(
      (c, i) => c === null && base.map.regions[i]?.kind !== 'core',
    );

    const state: GameState = {
      ...base,
      forces: [{ id: 'S', seat: 0, regionId: neutral, line: 0, fire: 10, sky: 10, posture: 'hold', unsupplied: 0 }],
    };

    expect(reduce(state, {}, CTX).state.control[neutral]).toBeNull();
  });

  it('un empate exacto destruye a ambos y no cambia el control', () => {
    // Desde v0.2 dos asientos en la misma región combaten. Con potencias idénticas y
    // ningún defensor, nadie gana: los dos se destruyen y la región sigue como estaba.
    // Nunca se desempata al azar.
    const base = toWar(game(2, 8).state);
    const neutral = base.control.findIndex(
      (c, i) => c === null && base.map.regions[i]?.kind !== 'core',
    );

    const state: GameState = {
      ...base,
      forces: [
        { id: 'A', seat: 0, regionId: neutral, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
        { id: 'B', seat: 1, regionId: neutral, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const result = reduce(state, {}, CTX);
    const combat = result.events.find((e) => e.type === 'COMBAT');

    expect(combat?.data['winner']).toBeNull();
    expect(result.state.forces).toHaveLength(0);
    expect(result.state.control[neutral]).toBeNull();
  });

  it('perder las fuerzas no devuelve la región a neutral', () => {
    const base = toWar(game(2, 9).state);
    const owned = base.control.findIndex((c, i) => c === 0 && !base.map.bastions.includes(i));
    if (owned < 0) return;

    const state: GameState = { ...base, forces: [] };
    expect(reduce(state, {}, CTX).state.control[owned]).toBe(0);
  });
});

describe('niebla de guerra — no hay fugas en PlayerView', () => {
  it('nunca aparece una fuerza enemiga fuera de lo observado', () => {
    const war = toWar(game(5).state);
    const { views } = reduce(war, {}, CTX);

    for (const seat of [0, 1, 2, 3, 4] as Seat[]) {
      const view = views[seat];
      const observed = new Set(view.visible);
      for (const force of view.forces) {
        if (force.own) continue;
        expect(observed.has(force.regionId)).toBe(true);
      }
    }
  });

  it('las fuerzas ajenas no exponen su desglose en bosque', () => {
    const base = toWar(game(2, 12).state);
    const forest = base.map.regions.findIndex((r) => r.kind === 'forest');
    const adjacency = buildAdjacency(base.map.regions.length, base.map.edges);
    const watcher = (adjacency[forest] as RegionId[])[0] as RegionId;

    const state: GameState = {
      ...base,
      forces: [
        { id: 'W', seat: 0, regionId: watcher, line: 10, fire: 0, sky: 0, posture: 'hold', unsupplied: 0 },
        { id: 'H', seat: 1, regionId: forest, line: 33, fire: 7, sky: 0, posture: 'hold', unsupplied: 0 },
      ],
    };

    const hidden = reduce(state, {}, CTX).views[0].forces.find((f) => f.id === 'H');
    expect(hidden).toBeDefined();
    expect(hidden?.line).toBeNull();
    expect(hidden?.fire).toBeNull();
    expect(hidden?.posture).toBeNull();
    expect(hidden?.approxTotal).toBe(40); // 33+7 redondeado a la decena
  });

  it('nunca aparecen los recursos de otro asiento', () => {
    // Cada asiento recibe una cifra única e irrepetible: si la de otro apareciera en mi
    // vista, sería inequívocamente una fuga. Con los recursos iniciales (idénticos para
    // todos) esta comprobación no distinguiría nada.
    //
    // Solo se usa Ceniza: Suministro, Industria e Intel tienen tope, así que tras la
    // economía convergen al mismo número en todos los asientos y dejarían de ser
    // discriminantes. La Ceniza no tiene tope a propósito.
    const base = toWar(game(5).state);
    const war: GameState = {
      ...base,
      seats: base.seats.map((s) => ({
        ...s,
        resources: { ...s.resources, ash: 500_000 + s.seat * 1000 },
      })),
    };

    const { views, state } = reduce(war, {}, CTX);

    for (const seat of [0, 1, 2, 3, 4] as Seat[]) {
      const serialized = JSON.stringify(views[seat]);

      for (const other of state.seats) {
        if (other.seat === seat) continue;
        // Se compara contra el valor POSTERIOR a la economía: es el que existe en el
        // estado en el momento de proyectar la vista.
        expect(serialized).not.toContain(String(other.resources.ash));
      }

      expect(views[seat].self.seat).toBe(seat);
      expect(views[seat].self.resources.ash).toBeGreaterThanOrEqual(500_000 + seat * 1000);
      expect(views[seat].opponents.every((o) => o.seat !== seat)).toBe(true);

      // Un rival nunca expone su bolsa de anomalías ni sus recursos, ni siquiera vacíos.
      for (const opponent of views[seat].opponents) {
        expect(opponent).not.toHaveProperty('resources');
        expect(opponent).not.toHaveProperty('anomalies');
      }

      // Tampoco su estado de suministro: eso es inteligencia, y se paga con Sombra.
      for (const force of views[seat].forces) {
        if (!force.own) expect(force.unsupplied).toBeNull();
      }
    }
  });

  it('cada asiento solo recibe los eventos que le corresponden', () => {
    const war = toWar(game(5).state);
    const result = reduce(
      war,
      { 0: { turn: war.meta.turn, moves: [{ forceId: 'inexistente', posture: 'hold' }] } },
      CTX,
    );

    const rejectedFor = (seat: Seat) =>
      result.views[seat].events.filter((e) => e.type === 'ORDER_REJECTED');

    expect(rejectedFor(0)).toHaveLength(1);
    for (const seat of [1, 2, 3, 4] as Seat[]) expect(rejectedFor(seat)).toHaveLength(0);
  });

  it('la concordia es visible y no cambia ningún número', () => {
    const shared = createGame({
      gameId: 'a', seed: 31, players: 3,
      seats: [
        { name: 'A', factionId: 'tarn' },
        { name: 'B', factionId: 'vantera' },
        { name: 'C', factionId: 'tarn' },
      ],
    }).state;
    const distinct = createGame({
      gameId: 'a', seed: 31, players: 3,
      seats: [
        { name: 'A', factionId: 'tarn' },
        { name: 'B', factionId: 'vantera' },
        { name: 'C', factionId: 'oshara' },
      ],
    }).state;

    const withConcord = reduce(shared, {}, CTX);
    const without = reduce(distinct, {}, CTX);

    expect(withConcord.views[0].opponents.find((o) => o.seat === 2)?.concordant).toBe(true);
    expect(without.views[0].opponents.find((o) => o.seat === 2)?.concordant).toBe(false);

    // Mismo mapa, mismas fuerzas, mismo control: la Concordia no toca nada mecánico.
    const mechanical = (s: GameState) =>
      checksum({ map: s.map, forces: s.forces, control: s.control });
    expect(mechanical(withConcord.state)).toBe(mechanical(without.state));
  });
});
