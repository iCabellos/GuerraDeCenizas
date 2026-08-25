/**
 * Investigación: Grados de tropa y Políticas.
 *
 * Las dos cosas son **progresión de campaña**: suben durante la partida y se pierden al
 * terminarla ([ADR-045]). Lo que una cuenta guarda entre campañas es **qué** puede
 * llevar, no en qué nivel lo dejó. Este módulo no puede importar `factions/` ni saber
 * nada de la cuenta, y esa restricción es justo la que hace que la mesa siga siendo
 * justa: el techo no depende de quién juega.
 *
 * Dos reglas que sostienen el diseño y que conviene no tocar sin leer por qué:
 *
 *  1. **Subir de grado no actualiza lo ya desplegado.** Si lo hiciera, subir sería una
 *     mejora global sin contrapartida y la única pregunta sería «¿cuándo puedo
 *     pagarla?». Sin retroactividad aparece la buena: ¿subo y empiezo a reemplazar, o
 *     me gasto lo mismo en más tropa de grado 1 y ataco este turno?
 *  2. **Investigar consume el turno de la Fundición.** Investigar y construir compiten
 *     por el mismo edificio, así que no se puede hacer todo.
 */

import type {
  ArmId, GameState, PolicyId, PolicyRank, Resources, ResearchOrder, Seat, SeatState, Tier,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { round4 } from '../util/canonical';
import { EventLog } from './events';
import { buildingLevel } from './buildings';

export const ALL_ARMS: readonly ArmId[] = ['line', 'fire', 'sky'] as const;

/**
 * Seis nodos en dos ramas. Seis, no cuarenta: un árbol de cuarenta nodos es una tarea
 * de memorización, no una decisión. Seis caben en una pantalla y obligan a elegir.
 */
export const ALL_POLICIES: readonly PolicyId[] = [
  'cadence', 'caravans', 'deepVeins', 'escalade', 'marchDoctrine', 'recasting',
] as const;

export const POLICY_BRANCH: Readonly<Record<PolicyId, 'economy' | 'military'>> = {
  deepVeins: 'economy',
  caravans: 'economy',
  recasting: 'economy',
  cadence: 'military',
  escalade: 'military',
  marchDoctrine: 'military',
};

/** El material que pide cada rama. Elegir rama es elegir a qué parte del mapa vas. */
export const POLICY_MATERIAL: Readonly<Record<PolicyId, 'ore' | 'ember'>> = {
  deepVeins: 'ember',
  caravans: 'ember',
  recasting: 'ember',
  cadence: 'ember',
  escalade: 'ore',
  marchDoctrine: 'ore',
};

export function emptyPolicies(): Record<PolicyId, PolicyRank> {
  const out = {} as Record<PolicyId, PolicyRank>;
  for (const id of ALL_POLICIES) out[id] = 0;
  return out;
}

export function startingTiers(): Record<ArmId, Tier> {
  return { line: 1, fire: 1, sky: 1 };
}

/** Efecto acumulado de una Política al nivel que tenga el asiento. */
export function policyEffect(seat: SeatState, policy: PolicyId): number {
  const rank = seat.policies[policy] ?? 0;
  return BALANCE.policies.effect[policy][rank] as number;
}

/** Multiplicador del grado de un arma. Se aplica ANTES de la rueda, nunca después. */
export function tierMultiplier(tier: Tier): number {
  return BALANCE.tiers.multiplier[tier] as number;
}

export type ResearchReject =
  | 'no_foundry'
  | 'foundry_too_low'
  | 'already_max'
  | 'not_enough_material'
  | 'foundry_busy';

export interface ResearchResult {
  seats: SeatState[];
}

/**
 * Aplica como mucho **una** investigación por asiento y turno.
 *
 * El coste sale de los recursos del asiento, no del almacén de una región: investigar
 * es una decisión de imperio, no de provincia.
 */
export function applyResearch(
  state: GameState,
  seats: readonly SeatState[],
  orders: ReadonlyMap<Seat, ResearchOrder>,
  busyFoundries: ReadonlySet<Seat>,
  log: EventLog,
): ResearchResult {
  const next = seats.map((s) => ({
    ...s,
    resources: { ...s.resources },
    tiers: { ...s.tiers },
    policies: { ...s.policies },
  }));

  // Asiento ascendente: los desempates del motor jamás dependen del orden de llegada.
  for (const seat of [...orders.keys()].sort((a, b) => a - b)) {
    const order = orders.get(seat);
    const seatState = next.find((s) => s.seat === seat);
    if (!order || !seatState) continue;

    const foundry = bestFoundryLevel(state, seat);
    if (foundry === 0) {
      rejectResearch(log, seat, 'no_foundry');
      continue;
    }
    if (busyFoundries.has(seat)) {
      // La Fundición ya está levantando algo este turno. Una cosa o la otra.
      rejectResearch(log, seat, 'foundry_busy');
      continue;
    }

    if (order.kind === 'tier') {
      const current = seatState.tiers[order.arm];
      if (current >= 3) {
        rejectResearch(log, seat, 'already_max');
        continue;
      }
      const target = (current + 1) as Tier;
      if (foundry < (BALANCE.tiers.foundryRequired[target] as number)) {
        rejectResearch(log, seat, 'foundry_too_low');
        continue;
      }
      const cost = BALANCE.tiers.cost[target];
      if (!cost || !canPay(seatState.resources, cost)) {
        rejectResearch(log, seat, 'not_enough_material');
        continue;
      }
      pay(seatState.resources, cost);
      seatState.tiers[order.arm] = target;
      log.emit({
        type: 'TIER_RAISED',
        seat,
        scope: { kind: 'public' },
        data: { arm: order.arm, tier: target, ore: cost.ore, ember: cost.ember },
      });
      continue;
    }

    const current = seatState.policies[order.policy] ?? 0;
    if (current >= 3) {
      rejectResearch(log, seat, 'already_max');
      continue;
    }
    const target = (current + 1) as PolicyRank;
    const cost = BALANCE.policies.cost[target];
    if (!cost || !canPay(seatState.resources, cost)) {
      rejectResearch(log, seat, 'not_enough_material');
      continue;
    }
    pay(seatState.resources, cost);
    seatState.policies[order.policy] = target;
    // Pública: una Política cambia cómo pelea o cómo produce alguien, y este juego se
    // negocia con aritmética. Esconderla convertiría la negociación en adivinanza.
    log.emit({
      type: 'POLICY_ADOPTED',
      seat,
      scope: { kind: 'public' },
      data: { policy: order.policy, rank: target, ore: cost.ore, ember: cost.ember },
    });
  }

  return { seats: next };
}

/** Nivel de la mejor Fundición operativa del asiento. 0 = no tiene ninguna. */
export function bestFoundryLevel(state: GameState, seat: Seat): number {
  let best = 0;
  for (const building of state.buildings) {
    if (building.kind !== 'foundry') continue;
    if (state.control[building.regionId] !== seat) continue;
    if (building.building > 0) continue; // en obra no cuenta
    best = Math.max(best, building.level);
  }
  return best;
}

/** Igual que la anterior pero para una región concreta. La usa la interfaz. */
export function foundryAt(state: GameState, regionId: number): number {
  return buildingLevel(state.buildings, regionId, 'foundry');
}

export function canPay(resources: Resources, cost: { ore: number; ember: number }): boolean {
  return resources.ore >= cost.ore && resources.ember >= cost.ember;
}

export function pay(resources: Resources, cost: { ore: number; ember: number }): void {
  resources.ore = round4(resources.ore - cost.ore);
  resources.ember = round4(resources.ember - cost.ember);
}

function rejectResearch(log: EventLog, seat: Seat, reason: ResearchReject): void {
  log.emit({
    type: 'ORDER_REJECTED',
    seat,
    scope: { kind: 'seat', seat },
    data: { forceId: null, reason: `research_${reason}` },
  });
}
