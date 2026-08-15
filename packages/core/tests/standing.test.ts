/**
 * Órdenes Permanentes y Mando Automático.
 *
 * Lo que se prueba aquí no es que el bot juegue bien: es que **la ausencia no daña a un
 * tercero**. Un jugador que se desconecta no ha autorizado que sus fuerzas ataquen a
 * nadie, y si pudieran, un ausente se convertiría en una ficha a mover durante las
 * negociaciones de los demás.
 */

import { describe, expect, it } from 'vitest';
import {
  AUTOCOMMAND_AFTER, DEFAULT_STANDING, autocommandOrders, bfsDistances, buildAdjacency,
  createGame, deepFreeze, parseStanding, reduce, standingOrders,
  type GameState, type Orders, type Seat,
} from '../src/index';

function game(players: 2 | 3 | 5 = 3): GameState {
  return createGame({
    gameId: 'ausencias',
    seed: 90210,
    players,
    seats: Array.from({ length: players }, (_, index) => ({
      name: `J${index}`,
      factionId: (['vantera', 'koldvik', 'saranth', 'meridia', 'oshara'] as const)[index]!,
    })),
  }).state;
}

function adjacencyOf(state: GameState) {
  return buildAdjacency(state.map.regions.length, state.map.edges);
}

describe('parseStanding — un jsonb corrupto no puede tumbar la partida', () => {
  it('lo desconocido cae al valor por defecto', () => {
    expect(parseStanding(null)).toEqual(DEFAULT_STANDING);
    expect(parseStanding('assault')).toEqual(DEFAULT_STANDING);
    expect(parseStanding({ posture: 'assault' })).toEqual(DEFAULT_STANDING);
    expect(parseStanding({ posture: 'screen', production: 'sky' }))
      .toEqual({ posture: 'screen', production: 'none' });
  });

  it('conserva lo que sí es válido', () => {
    expect(parseStanding({ posture: 'screen', production: 'repeat' }))
      .toEqual({ posture: 'screen', production: 'repeat' });
  });

  it('la postura de asalto es inalcanzable, se pida como se pida', () => {
    for (const raw of [
      { posture: 'assault' }, { posture: 'ASSAULT' }, { posture: ['assault'] },
      { posture: { toString: () => 'assault' } },
    ]) {
      expect(parseStanding(raw).posture).not.toBe('assault');
    }
  });
});

describe('Órdenes Permanentes', () => {
  it('mantienen todas las fuerzas donde están', () => {
    const state = game();
    const orders = standingOrders(state, 1, DEFAULT_STANDING);
    const own = state.forces.filter((f) => f.seat === 1);

    expect(orders.moves).toHaveLength(own.length);
    expect(orders.moves.every((move) => move.to === undefined)).toBe(true);
    expect(orders.turn).toBe(state.meta.turn);
  });

  it('ninguna fuerza ausente ataca jamás', () => {
    const state = game(5);
    for (const seat of [0, 1, 2, 3, 4] as Seat[]) {
      for (const config of [
        { posture: 'hold', production: 'line' },
        { posture: 'screen', production: 'repeat' },
      ] as const) {
        const orders = standingOrders(state, seat, config);
        expect(orders.moves.every((move) => move.posture !== 'assault')).toBe(true);
        expect(orders.moves.every((move) => move.fireSupport === undefined)).toBe(true);
      }
    }
  });

  it('«repetir» solo repite la producción, nunca los movimientos', () => {
    const state = game();
    const bastion = state.map.bastions[0]!;
    const previous: Orders = {
      turn: 0,
      moves: [{ forceId: 'f0t0n0', to: 999, posture: 'assault' }],
      production: [{ regionId: bastion, item: 'fire', qty: 1 }],
    };
    const orders = standingOrders(state, 0, { posture: 'hold', production: 'repeat' }, previous);

    expect(orders.production).toEqual([{ regionId: bastion, item: 'fire', qty: 1 }]);
    expect(orders.moves.some((move) => move.to === 999)).toBe(false);
  });

  it('«repetir» descarta la producción en regiones que ya no son suyas', () => {
    const state = game();
    const foreign = state.control.findIndex((owner) => owner !== 0 && owner !== null);
    const previous: Orders = {
      turn: 0, moves: [],
      production: [{ regionId: foreign, item: 'line', qty: 3 }],
    };
    expect(standingOrders(state, 0, { posture: 'hold', production: 'repeat' }, previous).production)
      .toEqual([]);
  });

  it('«producir Línea» gasta lo que hay y nada más', () => {
    const state = game();
    const orders = standingOrders(state, 0, { posture: 'hold', production: 'line' });
    // 20 ⬢ iniciales ÷ 6 por unidad de Línea = 3.
    expect(orders.production).toEqual([
      { regionId: state.map.bastions[0], item: 'line', qty: 3 },
    ]);
  });

  it('no modifican el estado que reciben', () => {
    const state = deepFreeze(game());
    expect(() => standingOrders(state, 0, { posture: 'screen', production: 'line' }))
      .not.toThrow();
  });
});

describe('Mando Automático', () => {
  it('sin memoria del turno anterior no ataca a nadie', () => {
    const state = game();
    const orders = autocommandOrders(state, 0, adjacencyOf(state));
    expect(orders.moves.every((move) => move.posture !== 'assault')).toBe(true);
  });

  it('recupera lo que le quitaron, y solo eso', () => {
    const state = game();
    const mine = state.control.findIndex((owner) => owner === 0);
    const previousControl = [...state.control];
    // El asiento 1 le arrebató una región el turno pasado.
    const stolen: GameState = {
      ...state,
      control: state.control.map((owner, id) => (id === mine ? 1 : owner)),
    };

    const orders = autocommandOrders(stolen, 0, adjacencyOf(state), previousControl);
    const assaults = orders.moves.filter((move) => move.posture === 'assault');

    expect(assaults).toHaveLength(1);
    expect(assaults[0]!.to).toBe(mine);
  });

  it('no ataca una región que nunca fue suya, aunque esté al lado', () => {
    const state = game();
    const previousControl = [...state.control];
    const orders = autocommandOrders(state, 0, adjacencyOf(state), previousControl);
    expect(orders.moves.every((move) => move.posture !== 'assault')).toBe(true);
  });

  it('una fuerza en territorio ajeno vuelve hacia lo propio', () => {
    const state = game();
    const adjacency = adjacencyOf(state);
    const bastion = state.map.bastions[0]!;
    // Se planta una fuerza propia en una región que controla otro.
    const foreign = state.control.findIndex((owner) => owner !== null && owner !== 0);
    const stranded: GameState = {
      ...state,
      forces: [
        ...state.forces,
        { id: 'f0t9n9', seat: 0, regionId: foreign, line: 5, fire: 0, sky: 0,
          posture: 'hold', unsupplied: 2 },
      ],
    };

    const orders = autocommandOrders(stranded, 0, adjacency, undefined);
    const move = orders.moves.find((m) => m.forceId === 'f0t9n9');

    expect(move?.to).toBeDefined();
    expect(move?.posture).toBe('hold');
    expect(adjacency[foreign]!.includes(move!.to!)).toBe(true);

    // Y acerca de verdad: comprobar solo que se mueve dejaría pasar un vagabundeo.
    const toBastion = bfsDistances(adjacency, bastion);
    expect(toBastion[move!.to!]!).toBeLessThan(toBastion[foreign]!);
  });

  it('dos fuerzas no se lanzan a la misma región recuperable', () => {
    const state = game();
    const mine = state.control.findIndex((owner) => owner === 0);
    const adjacency = adjacencyOf(state);
    const previousControl = [...state.control];

    const crowded: GameState = {
      ...state,
      control: state.control.map((owner, id) => (id === mine ? 1 : owner)),
      forces: [
        ...state.forces,
        ...adjacency[mine]!.slice(0, 2).map((regionId, index) => ({
          id: `f0t9n${index}`, seat: 0 as Seat, regionId,
          line: 8, fire: 0, sky: 0, posture: 'hold' as const, unsupplied: 0,
        })),
      ],
    };

    const orders = autocommandOrders(crowded, 0, adjacency, previousControl);
    const targets = orders.moves.filter((m) => m.posture === 'assault').map((m) => m.to);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('sus órdenes las acepta el motor sin un solo rechazo', () => {
    // Es la prueba que importa: unas órdenes de bot que el motor rechace dejarían al
    // asiento paralizado y con el log lleno de ORDER_REJECTED cada turno.
    const state = game(5);
    const adjacency = adjacencyOf(state);
    const orders = Object.fromEntries(
      ([0, 1, 2, 3, 4] as Seat[]).map((seat) => [seat, autocommandOrders(state, seat, adjacency)]),
    );

    const result = reduce(state, orders, { engineVersion: state.meta.engineVersion, now: 0 });
    const rejected = result.events.filter((event) => event.type === 'ORDER_REJECTED');
    expect(rejected).toEqual([]);
  });

  it('doce turnos de bots contra bots terminan sin rechazos ni excepciones', () => {
    let state = game(3);
    const adjacency = adjacencyOf(state);
    let previousControl: (Seat | null)[] | undefined;

    for (let turn = 0; turn < 12; turn += 1) {
      const orders = Object.fromEntries(
        ([0, 1, 2] as Seat[]).map((seat) => [
          seat, autocommandOrders(state, seat, adjacency, previousControl),
        ]),
      );
      const result = reduce(state, orders, { engineVersion: state.meta.engineVersion, now: turn });
      expect(result.events.filter((e) => e.type === 'ORDER_REJECTED')).toEqual([]);
      previousControl = [...state.control];
      state = result.state;
    }

    expect(state.meta.turn).toBe(12);
  });
});

describe('el escalado documentado', () => {
  it('el Mando Automático entra al tercer turno sin enviar', () => {
    // MULTIPLAYER §5.2. La constante vive en el motor porque decide qué órdenes se
    // generan, no cuándo vence un plazo — eso es del servidor.
    expect(AUTOCOMMAND_AFTER).toBe(3);
  });
});
