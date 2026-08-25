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
  Adjacency, Arms, Force, ForceId, GameState, OrdersBySeat, ProductionOrder,
  RegionId, ResearchOrder, Seat, WorkOrder,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { EventLog } from './events';
import { canProduceAt } from './economy';
import { buildWardIndex, canCross } from './zones';

export type RejectReason =
  | 'unknown_force'
  | 'not_your_force'
  | 'not_adjacent'
  | 'detach_too_large'
  | 'detach_empty'
  | 'duplicate_order'
  | 'too_many_orders'
  | 'wrong_turn'
  | 'no_movement_in_parley'
  | 'water_needs_bridge'
  | 'ward_sealed'
  | 'support_needs_hold'
  | 'support_not_adjacent'
  | 'cannot_produce_here'
  | 'not_enough_industry'
  | 'too_many_works'
  | 'duplicate_work';

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
  /**
   * De dónde salió cada fuerza que se movió este turno.
   *
   * Lo necesita el Botín: una fuerza que saquea **vuelve a su casilla**, y sin saber
   * cuál era habría que inventarla. No forma parte del estado — es información del
   * turno, y muere con él.
   */
  origins: Map<ForceId, RegionId>;
}

export interface ValidatedOrders {
  intents: Intent[];
  postures: Map<ForceId, Force['posture']>;
  /** `forceId` → región adyacente a la que presta su Fuego. */
  fireSupport: Map<ForceId, RegionId>;
  production: Map<Seat, ProductionOrder[]>;
  /** Obras aceptadas para su etapa. Lo que se puede construir lo decide `buildings.ts`. */
  works: Map<Seat, WorkOrder[]>;
  /** Como mucho una por asiento: investigar es una decisión, no una lista. */
  research: Map<Seat, ResearchOrder>;
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
): ValidatedOrders {
  const intents: Intent[] = [];
  const postures = new Map<ForceId, Force['posture']>();
  const fireSupport = new Map<ForceId, RegionId>();
  const production = new Map<Seat, ProductionOrder[]>();
  const works = new Map<Seat, WorkOrder[]>();
  const research = new Map<Seat, ResearchOrder>();
  const forcesById = new Map(state.forces.map((f) => [f.id, f]));
  const wards = buildWardIndex(state.map);

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

      if (move.fireSupport !== undefined) {
        // El apoyo exige quedarse quieto: es fuego indirecto, no una carga.
        if (move.posture !== 'hold' || move.to !== undefined) {
          reject(log, seat, move.forceId, 'support_needs_hold');
        } else if (
          !(adjacency[force.regionId] as readonly RegionId[]).includes(move.fireSupport) ||
          !canCross(wards, state.gatesOpen, force.regionId, move.fireSupport)
        ) {
          // El fuego indirecto tampoco atraviesa un Cerco: si las tropas no pasan,
          // los proyectiles tampoco. Un apoyo que cruzara sería una vía de escape.
          reject(log, seat, move.forceId, 'support_not_adjacent');
        } else {
          fireSupport.set(force.id, move.fireSupport);
        }
      }

      if (move.to === undefined) continue;

      if (state.meta.phase === 'parley') {
        reject(log, seat, move.forceId, 'no_movement_in_parley');
        continue;
      }
      if (!(adjacency[force.regionId] as readonly RegionId[]).includes(move.to)) {
        reject(log, seat, move.forceId, 'not_adjacent');
        continue;
      }
      // Un Cerco no es terreno difícil: está cerrado. Ni se rodea ni cuesta más.
      if (!canCross(wards, state.gatesOpen, force.regionId, move.to)) {
        reject(log, seat, move.forceId, 'ward_sealed');
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
      // El agua divide el mapa: solo Cielo la cruza sin Puente (GDD §6.1).
      if (
        state.map.regions[move.to]?.kind === 'water' &&
        !state.bridges[move.to] &&
        arms.line + arms.fire > 0
      ) {
        reject(log, seat, move.forceId, 'water_needs_bridge');
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

    // Producción. Se valida contra el estado autoritativo, nunca contra lo que
    // afirma el cliente: él solo dice «línea, en la región 12».
    const queued: ProductionOrder[] = [];
    let budget = state.seats.find((x) => x.seat === seat)?.resources.industry ?? 0;
    for (const order of orders.production ?? []) {
      if (!canProduceAt(state, seat, order.regionId)) {
        reject(log, seat, null, 'cannot_produce_here');
        continue;
      }

      // La cantidad se recorta ANTES de cobrar. Validación y aplicación tienen que
      // recortar igual: si discrepan, el jugador paga por algo que no recibe.
      const qty = clampQuantity(state, order.item, order.regionId, Math.max(1, Math.floor(order.qty)));
      if (qty === 0) continue;

      const cost = BALANCE.production[order.item].industry * qty;
      if (cost > budget) {
        reject(log, seat, null, 'not_enough_industry');
        continue;
      }
      budget -= cost;
      queued.push({ regionId: order.regionId, item: order.item, qty });
    }
    if (queued.length > 0) production.set(seat, queued);

    // Obras. Aquí solo se comprueban forma y cupo: si se puede construir eso ahí, y si
    // hay material, lo decide `applyWorks` contra el estado autoritativo. Duplicar la
    // condición en dos sitios es la forma más fiable de que un día discrepen.
    const wanted: WorkOrder[] = [];
    const seenRegions = new Set<RegionId>();
    for (const work of orders.works ?? []) {
      if (wanted.length >= BALANCE.limits.maxWorks) {
        reject(log, seat, null, 'too_many_works');
        continue;
      }
      // Una obra por región y turno: no hay colas, y tampoco por la puerta de atrás.
      if (seenRegions.has(work.regionId)) {
        reject(log, seat, null, 'duplicate_work');
        continue;
      }
      seenRegions.add(work.regionId);
      wanted.push({ regionId: work.regionId, kind: work.kind });
    }
    if (wanted.length > 0) works.set(seat, wanted);

    if (orders.research) research.set(seat, orders.research);
  }

  // Determinismo: el orden de aplicación no puede depender del orden de llegada.
  intents.sort((a, b) => a.force.seat - b.force.seat || cmp(a.force.id, b.force.id));
  return { intents, postures, fireSupport, production, works, research };
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
  const origins = new Map<ForceId, RegionId>();

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
        unsupplied: force.unsupplied,
      };
      forces.push(detached);
      byId.set(detached.id, detached);
      origins.set(detached.id, force.regionId);
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
      origins.set(force.id, from);
      log.emit({
        type: 'FORCE_MOVED',
        seat: force.seat,
        scope: { kind: 'regions', regions: [from, intent.to] },
        data: { forceId: force.id, from, to: intent.to, detached: false },
      });
    }
  }

  return { forces: mergeAndPrune(forces, log, origins), origins };
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
function mergeAndPrune(
  forces: readonly Force[],
  log: EventLog,
  origins: Map<ForceId, RegionId>,
): Force[] {
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
      // Al fusionarse, la peor situación de suministro manda: no se lava reagrupando.
      unsupplied: Math.max(...group.map((f) => f.unsupplied)),
    };
    // Al fusionarse, la fuerza resultante hereda el origen de la que le da el id: si
    // saquea, vuelve ahí. Cualquier otra elección sería igual de arbitraria y menos
    // predecible para quien dio la orden.
    for (const f of group) {
      if (f.id !== head.id && origins.has(f.id)) origins.delete(f.id);
    }
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

/**
 * Recorta la cantidad pedida a lo que la región puede recibir de verdad.
 * Fortificación tiene tope; un Puente o está o no está.
 */
function clampQuantity(
  state: GameState,
  item: ProductionOrder['item'],
  regionId: RegionId,
  requested: number,
): number {
  if (item === 'fort') {
    const current = state.fortification[regionId] ?? 0;
    return Math.max(0, Math.min(requested, BALANCE.combat.maxFortLevel - current));
  }
  if (item === 'bridge') return state.bridges[regionId] ? 0 : 1;
  return requested;
}

export function total(arms: Arms): number {
  return arms.line + arms.fire + arms.sky;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
