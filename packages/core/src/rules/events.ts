/**
 * Emisión de eventos con visibilidad diferida.
 *
 * Un evento no puede saber quién lo verá en el momento de emitirse: la visibilidad
 * depende del estado **final** del turno (quién controla qué y dónde acabaron las
 * fuerzas). Por eso cada etapa emite un evento con un *ámbito*, y la etapa
 * `computeVisibility` lo traduce a la lista concreta de asientos.
 *
 * Esto es lo que permite que `PlayerView.events` llegue al cliente **ya filtrado**:
 * el navegador nunca recibe un evento que no le corresponde y luego lo esconde.
 */

import type { EventType, GameEvent, RegionId, Seat } from '../types/index';

export type EventScope =
  /** Lo ven todos. Territorio, capturas, cierre de turno. */
  | { kind: 'public' }
  /** Solo un asiento. Rechazos de órdenes, información privada. */
  | { kind: 'seat'; seat: Seat }
  /** Quien observe alguna de esas regiones, más el dueño del evento. */
  | { kind: 'regions'; regions: RegionId[] };

export interface PendingEvent {
  type: EventType;
  seat: Seat | null;
  scope: EventScope;
  data: Readonly<Record<string, string | number | boolean | null>>;
}

export class EventLog {
  private readonly pending: PendingEvent[] = [];

  emit(event: PendingEvent): void {
    this.pending.push(event);
  }

  /** Resuelve los ámbitos a asientos concretos. `observers[seat]` = regiones que ve. */
  resolve(turn: number, seats: readonly Seat[], observers: ReadonlyMap<Seat, Set<RegionId>>): GameEvent[] {
    return this.pending.map((event, index) => ({
      seq: index,
      turn,
      type: event.type,
      seat: event.seat,
      visibleTo: audience(event, seats, observers),
      data: event.data,
    }));
  }
}

function audience(
  event: PendingEvent,
  seats: readonly Seat[],
  observers: ReadonlyMap<Seat, Set<RegionId>>,
): Seat[] {
  switch (event.scope.kind) {
    case 'public':
      return [...seats];
    case 'seat':
      return [event.scope.seat];
    case 'regions': {
      const scope = event.scope;
      const audienceSet = new Set<Seat>();
      if (event.seat !== null) audienceSet.add(event.seat);
      for (const seat of seats) {
        const seen = observers.get(seat);
        if (seen && scope.regions.some((region) => seen.has(region))) audienceSet.add(seat);
      }
      return [...audienceSet].sort((a, b) => a - b);
    }
  }
}
