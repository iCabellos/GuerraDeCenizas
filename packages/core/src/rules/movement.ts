/**
 * Validación de órdenes y movimiento.
 *
 * Dos garantías del motor se concentran aquí:
 *
 *  1. **Totalidad**: una orden inválida nunca lanza. Se descarta y se emite
 *     `ORDER_REJECTED` con su motivo. Una orden mala de un jugador no puede bloquear
 *     la partida de los otros cuatro.
 *  2. **Simultaneidad**: nadie se mueve «antes» que nadie. Primero se recogen todas las
 *     intenciones, después se resuelven los conflictos, y solo entonces se aplica.
 */

import type {
  Adjacency, Arms, Force, ForceId, GameState, OrdersBySeat, RegionId, Seat,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { EventLog } from './events';

export type RejectReason =
  | 'unknown_force'
  | 'not_your_force'
  | 'not_adjacent'
  | 'detach_too_large'
  | 'detach_empty'
  | 'duplicate_order'
  | 'too_many_orders'
  | 'wrong_turn'
  | 'no_movement_in_parley';

interface Intent {
  force: Force;
  to: RegionId;
  arms: Arms;
  /** `true` si solo se desgaja una parte y el resto se queda. */
  partial: boolean;
  posture: Force['posture'];
}

export interface MovementResult {
  forces: Force[];
}

/**
 * Valida las órdenes contra el estado autoritativo y devuelve las intenciones legales.
 * Todo lo que no se pueda justificar con el estado se rechaza: el cliente solo aporta
 * identificadores, nunca cantidades ni posiciones de las que fiarse.
 */
export function validateOrders(
  state: GameState,
  ordersBySeat: OrdersBySeat,
  adjacency: Adjacency,
  log: EventLog,
): { intents: Intent[]; postures: Map<ForceId, Force['posture']> } {
  const intents: Intent[] = [];
  const postures = new Map<ForceId, Force['posture']>();
  const forcesById = new Map(state.forces.map((f) => [f.id, f]));

  // Orden de asiento ascendente: los desempates del motor jamás son aleatorios.
  const seats = Object.keys(ordersBySeat)
    .map(Number)
    .sort((a, b) => a - b) as Seat[];

  for (const seat of seats) {
    const orders = ordersBySeat[seat];
    if (!orders) continue;

    if (orders.turn !== state.meta.turn) {
      reject(log, seat, null, 'wrong_turn');
      continue;
    }

    const seen = new Set<ForceId>();
    let accepted = 0;

    for (const move of orders.moves) {
      if (accepted >= BALANCE.limits.maxForces) {
        reject(log, seat, move.forceId, 'too_many_orders');
        continue;
      }
      if (seen.has(move.forceId)) {
        reject(log, seat, move.forceId, 'duplicate_order');
        continue;
      }
      seen.add(move.forceId);

      const force = forcesById.get(move.forceId);
      if (!force) {
        reject(log, seat, move.forceId, 'unknown_force');
        continue;
      }
      if (force.seat !== seat) {
        reject(log, seat, move.forceId, 'not_your_force');
        continue;
      }

      postures.set(force.id, move.posture);
      accepted++;

      if (move.to === undefined) continue;

      if (state.meta.phase === 'parley') {
        reject(log, seat, move.forceId, 'no_movement_in_parley');
        continue;
      }
      if (!(adjacency[force.regionId] as readonly RegionId[]).includes(move.to)) {
        reject(log, seat, move.forceId, 'not_adjacent');
        continue;
      }

      const arms = move.detach ?? { line: force.line, fire: force.fire, sky: force.sky };
      if (arms.line < 0 || arms.fire < 0 || arms.sky < 0) {
        reject(log, seat, move.forceId, 'detach_empty');
        continue;
      }
      if (arms.line > force.line || arms.fire > force.fire || arms.sky > force.sky) {
        reject(log, seat, move.forceId, 'detach_too_large');
        continue;
      }
      if (total(arms) === 0) {
        reject(log, seat, move.forceId, 'detach_empty');
        continue;
      }

      intents.push({
        force,
        to: move.to,
        arms,
        partial: total(arms) < total(force),
        posture: move.posture,
      });
    }
  }

  // Determinismo: el orden de aplicación no puede depender del orden de llegada.
  intents.sort((a, b) => a.force.seat - b.force.seat || cmp(a.force.id, b.force.id));
  return { intents, postures };
}

/**
 * Aplica el movimiento simultáneo.
 *
 * Regla de cruce (GDD §8.2): si A va de X a Y y B va de Y a X en el mismo turno, ambos
 * se quedan donde estaban. Intercambiar posiciones sería ilegible en un mapa pequeño y
 * en una pantalla de móvil.
 */
export function applyMovement(
  state: GameState,
  intents: readonly Intent[],
  postures: ReadonlyMap<ForceId, Force['posture']>,
  log: EventLog,
): MovementResult {
  const blocked = detectCrossings(intents);

  let created = 0;
  const forces: Force[] = state.forces.map((f) => ({
    ...f,
    posture: postures.get(f.id) ?? f.posture,
  }));
  const byId = new Map(forces.map((f) => [f.id, f]));

  for (const intent of intents) {
    const force = byId.get(intent.force.id);
    if (!force) continue;

    if (blocked.has(intent.force.id)) {
      log.emit({
        type: 'FORCE_BLOCKED',
        seat: force.seat,
        scope: { kind: 'regions', regions: [force.regionId, intent.to] },
        data: { forceId: force.id, from: force.regionId, to: intent.to, reason: 'crossing' },
      });
      continue;
    }

    if (intent.partial) {
      force.line -= intent.arms.line;
      force.fire -= intent.arms.fire;
      force.sky -= intent.arms.sky;
      const detached: Force = {
        id: `f${force.seat}t${state.meta.turn}n${created++}`,
        seat: force.seat,
        regionId: intent.to,
        line: intent.arms.line,
        fire: intent.arms.fire,
        sky: intent.arms.sky,
        posture: intent.posture,
      };
      forces.push(detached);
      byId.set(detached.id, detached);
      log.emit({
        type: 'FORCE_MOVED',
        seat: force.seat,
        scope: { kind: 'regions', regions: [force.regionId, intent.to] },
        data: { forceId: detached.id, from: force.regionId, to: intent.to, detached: true },
      });
    } else {
      const from = force.regionId;
      force.regionId = intent.to;
      force.posture = intent.posture;
      log.emit({
        type: 'FORCE_MOVED',
        seat: force.seat,
        scope: { kind: 'regions', regions: [from, intent.to] },
        data: { forceId: force.id, from, to: intent.to, detached: false },
      });
    }
  }

  return { forces: mergeAndPrune(forces, log) };
}

/** Pares que intentan intercambiar posición. Ambos quedan bloqueados. */
function detectCrossings(intents: readonly Intent[]): Set<ForceId> {
  const blocked = new Set<ForceId>();
  for (const a of intents) {
    for (const b of intents) {
      if (a.force.id === b.force.id) continue;
      if (a.force.seat === b.force.seat) continue;
      if (a.force.regionId === b.to && b.force.regionId === a.to) {
        blocked.add(a.force.id);
        blocked.add(b.force.id);
      }
    }
  }
  return blocked;
}

/**
 * Fusiona las fuerzas del mismo asiento que acaben en la misma región y descarta las
 * vacías. Sin esto, el límite de 6 fuerzas por jugador (una restricción de UX móvil)
 * se podría burlar acumulando fuerzas de tamaño 1.
 */
function mergeAndPrune(forces: readonly Force[], log: EventLog): Force[] {
  const groups = new Map<string, Force[]>();
  for (const force of forces) {
    if (total(force) <= 0) continue;
    const key = `${force.seat}:${force.regionId}`;
    const group = groups.get(key) ?? [];
    group.push(force);
    groups.set(key, group);
  }

  const merged: Force[] = [];
  for (const key of [...groups.keys()].sort()) {
    const group = (groups.get(key) as Force[]).slice().sort((a, b) => cmp(a.id, b.id));
    const head = group[0] as Force;
    if (group.length === 1) {
      merged.push({ ...head });
      continue;
    }
    // La fuerza mayor impone la postura; empate, la de id menor. Nunca al azar.
    const dominant = group.reduce((best, f) =>
      total(f) > total(best) || (total(f) === total(best) && cmp(f.id, best.id) < 0) ? f : best,
    );
    const result: Force = {
      id: head.id,
      seat: head.seat,
      regionId: head.regionId,
      line: group.reduce((s, f) => s + f.line, 0),
      fire: group.reduce((s, f) => s + f.fire, 0),
      sky: group.reduce((s, f) => s + f.sky, 0),
      posture: dominant.posture,
    };
    merged.push(result);
    log.emit({
      type: 'FORCE_MERGED',
      seat: head.seat,
      scope: { kind: 'regions', regions: [head.regionId] },
      data: { into: head.id, count: group.length, regionId: head.regionId },
    });
  }

  return merged.sort((a, b) => a.seat - b.seat || cmp(a.id, b.id));
}

function reject(log: EventLog, seat: Seat, forceId: ForceId | null, reason: RejectReason): void {
  log.emit({
    type: 'ORDER_REJECTED',
    seat,
    scope: { kind: 'seat', seat },
    data: { forceId, reason },
  });
}

export function total(arms: Arms): number {
  return arms.line + arms.fire + arms.sky;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
