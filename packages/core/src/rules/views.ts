/**
 * Proyección de vistas sin resolver un turno.
 *
 * `reduce()` ya devuelve las vistas del turno que cierra, pero el turno 0 no se resuelve:
 * la partida empieza con un estado recién creado y hay que dar a cada asiento lo que ve
 * de él. Sin esto, la capa de autoridad tendría que reimplementar `computeVisibility`
 * para el único turno que no pasa por el motor — que es exactamente el turno en el que un
 * error de filtrado revelaría el mapa entero antes de la primera decisión.
 */

import type { GameEvent, GameState, PlayerView, Seat } from '../types/index';
import { buildAdjacency } from '../mapgen/skeleton';
import { stateChecksum } from '../util/canonical';
import { computeObservers, projectView } from './control';

export function projectViews(
  state: GameState,
  events: readonly GameEvent[] = [],
): Record<Seat, PlayerView> {
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
  const observers = computeObservers(state, state.forces, state.control, adjacency);
  const sum = stateChecksum(state);

  const views = {} as Record<Seat, PlayerView>;
  for (const seatState of [...state.seats].sort((a, b) => a.seat - b.seat)) {
    views[seatState.seat] = projectView(
      state,
      seatState.seat,
      state.forces,
      state.control,
      observers.get(seatState.seat) ?? new Set(),
      events.filter((event) => event.visibleTo.includes(seatState.seat)),
      sum,
    );
  }
  return views;
}
