/**
 * `reduce()` — la función que ES el juego.
 *
 * Propiedades garantizadas por test:
 *  - **Pura**: misma entrada ⇒ misma salida, en Node, en Chromium y en el simulador.
 *  - **Inmutable**: el estado de entrada no se modifica.
 *  - **Total**: nunca lanza por una orden inválida; la descarta y emite `ORDER_REJECTED`.
 *
 * Las etapas están numeradas según el orden de resolución del GDD §15. Añadir un
 * sistema nuevo es **insertar una etapa en su posición**, no tocar las demás: por eso
 * los huecos de la numeración están anotados en vez de disimulados.
 */

import type {
  GameEvent, GameState, OrdersBySeat, PlayerView, ResolveContext, ResolveResult, Seat,
} from '../types/index';
import { buildAdjacency } from '../mapgen/skeleton';
import { checksum } from '../util/canonical';
import { EventLog } from './events';
import { applyMovement, validateOrders } from './movement';
import { applyBattles } from './battle';
import { applyEconomy, applyProduction } from './economy';
import { computeObservers, projectView, recomputeControl } from './control';

export const ENGINE_VERSION = '0.2.0';

export function reduce(
  state: GameState,
  orders: OrdersBySeat,
  ctx: ResolveContext,
): ResolveResult {
  const log = new EventLog();
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);

  // 1 · Validación contra el estado autoritativo.
  const { intents, postures, fireSupport, production } = validateOrders(
    state, orders, adjacency, log,
  );

  // 2-4 · Diplomacia, anomalías de topología y Sombra → v0.4 y v0.7.

  // 5 · Movimiento simultáneo.
  const moved = applyMovement(state, intents, postures, log).forces;

  // 6 · Combate, con apoyo de Fuego desde regiones adyacentes.
  const fought = applyBattles(state, moved, fireSupport, adjacency, log).forces;

  // 7 · Control territorial.
  const control = recomputeControl(state, fought, log);

  // 8 · Economía: renta → mantenimiento → penalización por falta de suministro.
  //     Se calcula sobre el control YA actualizado: lo que capturas este turno renta
  //     este turno, que es lo que el jugador espera al ver la captura.
  const afterCapture: GameState = { ...state, control };
  const economy = applyEconomy(afterCapture, fought, adjacency, log);

  // 9 · Producción.
  const produced = applyProduction(afterCapture, economy.seats, economy.forces, production, log);

  // 10-11 · Núcleo y anomalías de información → v0.5 y v0.7.

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
    seats: produced.seats,
    forces: produced.forces,
    control,
    fortification: produced.fortification,
    bridges: produced.bridges,
    rngCursor: state.rngCursor,
  };

  log.emit({
    type: 'TURN_CLOSED',
    seat: null,
    scope: { kind: 'public' },
    data: { turn: state.meta.turn, next: nextTurn, at: ctx.now },
  });

  // 12 · Visibilidad. Se calcula sobre el estado FINAL, nunca sobre el inicial.
  const observers = computeObservers(next, next.forces, control, adjacency);
  const seats = next.seats.map((s) => s.seat).sort((a, b) => a - b);

  // 13 · Eventos, ya filtrados por asiento.
  const events: GameEvent[] = log.resolve(state.meta.turn, seats, observers);

  const stateChecksum = checksum(next);
  const views = {} as Record<Seat, PlayerView>;
  for (const seat of seats) {
    views[seat] = projectView(
      next,
      seat,
      next.forces,
      control,
      observers.get(seat) ?? new Set(),
      events,
      stateChecksum,
    );
  }

  return { state: next, events, views, checksum: stateChecksum };
}
