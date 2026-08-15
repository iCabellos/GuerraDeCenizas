/**
 * Control territorial y visibilidad.
 *
 * Decisión de diseño: **el control territorial es público; la composición militar no.**
 * Quién tiene qué región se sabe siempre (es lo que se negocia); cuántas tropas hay en
 * ella, no. Sin territorio público no habría nada concreto sobre lo que pactar, y la
 * diplomacia —que es el producto del juego— se quedaría sin objeto.
 */

import type {
  Adjacency, Force, GameState, PlayerView, RegionId, Seat, VisibleForce,
} from '../types/index';
import { EventLog } from './events';
import { total } from './movement';

/**
 * Recalcula quién controla cada región.
 *
 * Reglas (GDD §6.2):
 *  - Solo **Línea** captura. Cielo y Fuego no toman terreno.
 *  - Perder todas las fuerzas de una región **no** la devuelve a neutral: sigue siendo
 *    tuya hasta que otro la ocupe. Evita el yoyó territorial y mantiene legible el
 *    frente en una pantalla pequeña.
 *  - Un Bastión no se puede capturar (ADR-013): solo sitiar.
 *  - Dos asientos con Línea en la misma región ⇒ disputada; el control no cambia.
 *    (En v0.2 esto se resolverá con combate.)
 */
export function recomputeControl(
  state: GameState,
  forces: readonly Force[],
  log: EventLog,
): (Seat | null)[] {
  const control = state.control.slice();
  const holders = new Map<RegionId, Set<Seat>>();

  for (const force of forces) {
    if (force.line <= 0) continue;
    const set = holders.get(force.regionId) ?? new Set<Seat>();
    set.add(force.seat);
    holders.set(force.regionId, set);
  }

  for (const regionId of [...holders.keys()].sort((a, b) => a - b)) {
    const seats = [...(holders.get(regionId) as Set<Seat>)].sort((a, b) => a - b);

    if (seats.length > 1) {
      log.emit({
        type: 'REGION_CONTESTED',
        seat: null,
        scope: { kind: 'public' },
        data: { regionId, seats: seats.join(',') },
      });
      continue;
    }

    const seat = seats[0] as Seat;
    const bastionOwner = state.map.bastions.indexOf(regionId);
    if (bastionOwner >= 0 && bastionOwner !== seat) continue; // los Bastiones no se capturan

    if (control[regionId] !== seat) {
      const previous = control[regionId] ?? null;
      control[regionId] = seat;
      log.emit({
        type: 'REGION_CAPTURED',
        seat,
        scope: { kind: 'public' },
        data: { regionId, from: previous },
      });
    }
  }

  // Invariante: un Bastión siempre pertenece a su dueño, pase lo que pase.
  state.map.bastions.forEach((regionId, seat) => {
    control[regionId] = seat as Seat;
  });

  return control;
}

/**
 * Regiones que observa cada asiento: las que controla, aquellas donde tiene fuerzas, y
 * las adyacentes a ambas.
 */
export function computeObservers(
  state: GameState,
  forces: readonly Force[],
  control: readonly (Seat | null)[],
  adjacency: Adjacency,
): Map<Seat, Set<RegionId>> {
  const observers = new Map<Seat, Set<RegionId>>();
  for (const seatState of state.seats) observers.set(seatState.seat, new Set<RegionId>());

  const seed = (seat: Seat, regionId: RegionId): void => {
    const set = observers.get(seat);
    if (!set) return;
    set.add(regionId);
    for (const neighbour of adjacency[regionId] as readonly RegionId[]) set.add(neighbour);
  };

  control.forEach((seat, regionId) => {
    if (seat !== null) seed(seat, regionId);
  });
  for (const force of forces) seed(force.seat, force.regionId);

  return observers;
}

/**
 * Proyecta el estado a lo que ve un asiento.
 *
 * Este es el punto donde la niebla de guerra se vuelve real: lo que no se añade aquí
 * **no sale del servidor**. El cliente no filtra nada, porque nunca recibe lo demás.
 */
export function projectView(
  state: GameState,
  seat: Seat,
  forces: readonly Force[],
  control: readonly (Seat | null)[],
  observed: ReadonlySet<RegionId>,
  events: PlayerView['events'],
  checksum: string,
): PlayerView {
  const self = state.seats.find((s) => s.seat === seat);
  if (!self) throw new Error(`asiento inexistente: ${seat}`);

  const visible: VisibleForce[] = [];
  for (const force of forces) {
    if (force.seat === seat) {
      visible.push({
        id: force.id,
        seat: force.seat,
        regionId: force.regionId,
        own: true,
        line: force.line,
        fire: force.fire,
        sky: force.sky,
        approxTotal: total(force),
        posture: force.posture,
      });
      continue;
    }
    if (!observed.has(force.regionId)) continue;

    // El bosque oculta el desglose: se ve que hay algo y aproximadamente cuánto.
    const concealed = state.map.regions[force.regionId]?.kind === 'forest';
    visible.push({
      id: force.id,
      seat: force.seat,
      regionId: force.regionId,
      own: false,
      line: concealed ? null : force.line,
      fire: concealed ? null : force.fire,
      sky: concealed ? null : force.sky,
      approxTotal: concealed ? Math.round(total(force) / 10) * 10 : total(force),
      posture: concealed ? null : force.posture,
    });
  }

  return {
    seat,
    turn: state.meta.turn,
    phase: state.meta.phase,
    map: state.map,
    visible: [...observed].sort((a, b) => a - b),
    control: control.slice(),
    forces: visible.sort((a, b) => a.regionId - b.regionId || cmp(a.id, b.id)),
    self,
    opponents: state.seats
      .filter((s) => s.seat !== seat)
      .map((s) => ({
        seat: s.seat,
        name: s.name,
        factionId: s.factionId,
        doctrineId: s.doctrineId,
        // Concordia: público y sin ningún efecto mecánico. Ver docs/FACTIONS.md §4.
        concordant: s.factionId === self.factionId,
      }))
      .sort((a, b) => a.seat - b.seat),
    events: events.filter((e) => e.visibleTo.includes(seat)),
    checksum,
  };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
