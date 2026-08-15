/**
 * `reduce()` — la función que ES el juego.
 *
 * Propiedades garantizadas por test:
 *  - **Pura**: misma entrada ⇒ misma salida, en Node, en Chromium y en el simulador.
 *  - **Inmutable**: el estado de entrada no se modifica.
 *  - **Total**: nunca lanza por una orden inválida; la descarta y emite `ORDER_REJECTED`.
 *
 * v0.1 implementa las etapas 1, 5, 7, 12, 13 y 14 del orden de resolución documentado
 * (GDD §15). Las demás —diplomacia, anomalías, Sombra, combate, economía, producción y
 * Núcleo— se insertan en su posición exacta en versiones posteriores, sin tocar estas.
 */

import type {
  GameEvent, GameState, OrdersBySeat, PlayerView, ResolveContext, ResolveResult, Seat,
} from '../types/index';
import { buildAdjacency } from '../mapgen/skeleton';
import { checksum } from '../util/canonical';
import { EventLog } from './events';
import { applyMovement, validateOrders } from './movement';
import { computeObservers, projectView, recomputeControl } from './control';

export const ENGINE_VERSION = '0.1.0';

export function reduce(
  state: GameState,
  orders: OrdersBySeat,
  ctx: ResolveContext,
): ResolveResult {
  const log = new EventLog();
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);

  // 1 · Validación contra el estado autoritativo.
  const { intents, postures } = validateOrders(state, orders, adjacency, log);

  // 5 · Movimiento simultáneo.
  const { forces } = applyMovement(state, intents, postures, log);

  // 7 · Control territorial.
  const control = recomputeControl(state, forces, log);

  // 14 · Cierre de turno.
  const nextTurn = state.meta.turn + 1;
  const next: GameState = {
    meta: {
      ...state.meta,
      turn: nextTurn,
      phase: state.meta.phase === 'parley' ? 'war' : state.meta.phase,
      engineVersion: ctx.engineVersion,
    },
    map: state.map,
    seats: state.seats.map((s) => ({ ...s, resources: { ...s.resources } })),
    forces,
    control,
    rngCursor: state.rngCursor,
  };

  log.emit({
    type: 'TURN_CLOSED',
    seat: null,
    scope: { kind: 'public' },
    data: { turn: state.meta.turn, next: nextTurn, at: ctx.now },
  });

  // 12 · Visibilidad. Se calcula sobre el estado FINAL, nunca sobre el inicial.
  const observers = computeObservers(next, forces, control, adjacency);
  const seats = next.seats.map((s) => s.seat).sort((a, b) => a - b);

  // 13 · Eventos, ya filtrados por asiento.
  const events: GameEvent[] = log.resolve(state.meta.turn, seats, observers);

  const stateChecksum = checksum(next);
  const views = {} as Record<Seat, PlayerView>;
  for (const seat of seats) {
    views[seat] = projectView(
      next,
      seat,
      forces,
      control,
      observers.get(seat) ?? new Set(),
      events,
      stateChecksum,
    );
  }

  return { state: next, events, views, checksum: stateChecksum };
}
