/**
 * Zonas, Cercos y Puertas.
 *
 * Tres ideas, y la primera sostiene a las otras dos:
 *
 *  1. **La zona es una función del anillo** ([ADR-041]). La rotación C_n conserva el
 *     anillo, luego conserva la zona, luego los n Solares son idénticos por la misma
 *     razón por la que hoy lo son los sectores. La equidad exacta no cuesta nada.
 *  2. **El Cerco es una propiedad de la arista**, no una tabla aparte. Se consulta
 *     donde ya se decide si dos regiones son vecinas, y así no hay dos fuentes de
 *     verdad para la misma pregunta.
 *  3. **La Puerta se abre una vez y para siempre.** Reversible convertiría el mapa en
 *     un sistema de compuertas cuya jugada dominante es encerrar al vecino, que es la
 *     eliminación de facto que este juego no tiene.
 */

import type {
  Adjacency, Edge, GameMap, GameState, Gate, GateId, RegionId, Zone,
} from '../types/index';
import { BALANCE } from '../balance/constants';

/** Zona de una región. Total: toda región tiene zona, el Núcleo incluido. */
export function zoneOf(map: GameMap, regionId: RegionId): Zone {
  return (map.regions[regionId]?.zone ?? 3) as Zone;
}

/** Acto en curso. Deriva del turno; lo que abre el acto de verdad es una Puerta. */
export function actOfTurn(turn: number): Zone {
  const [first, second] = BALANCE.campaign.actEnds;
  if (turn <= (first as number)) return 1;
  if (turn <= (second as number)) return 2;
  return 3;
}

/** Clave canónica de una arista no dirigida. */
function key(a: RegionId, b: RegionId): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/**
 * Índice de Cercos y Puertas. Derivado del mapa: **nunca** se guarda en el estado.
 * Igual que `buildAdjacency`, se construye una vez por resolución.
 */
export interface WardIndex {
  /** Aristas que son Cerco. */
  wards: ReadonlySet<string>;
  /** Arista → Puerta que la atraviesa, si la hay. */
  gateByEdge: ReadonlyMap<string, Gate>;
}

export function buildWardIndex(map: GameMap): WardIndex {
  const wards = new Set<string>();
  for (const edge of map.edges) {
    if (edge.ward) wards.add(key(edge.a, edge.b));
  }
  const gateByEdge = new Map<string, Gate>();
  for (const gate of map.gates) gateByEdge.set(key(gate.inner, gate.outer), gate);
  return { wards, gateByEdge };
}

/**
 * ¿Se puede cruzar de `from` a `to`?
 *
 * Presupone que son adyacentes: esto solo responde por el Cerco. Una arista normal
 * siempre se cruza; un Cerco solo si es una Puerta **y** está abierta.
 */
export function canCross(
  index: WardIndex,
  gatesOpen: readonly boolean[],
  from: RegionId,
  to: RegionId,
): boolean {
  const k = key(from, to);
  if (!index.wards.has(k)) return true;
  const gate = index.gateByEdge.get(k);
  if (!gate) return false;
  return gatesOpen[gate.id] === true;
}

/**
 * Adyacencia **transitable**: la del mapa menos los Cercos cerrados.
 *
 * La usan el movimiento, el suministro y la logística, y tiene que ser la misma para
 * los tres. Si el suministro atravesara un Cerco que las tropas no pueden cruzar, un
 * asiento podría abastecer un frente al que no puede llegar.
 */
export function passableAdjacency(
  map: GameMap,
  adjacency: Adjacency,
  gatesOpen: readonly boolean[],
): Adjacency {
  const index = buildWardIndex(map);
  return adjacency.map((neighbours, from) =>
    neighbours.filter((to) => canCross(index, gatesOpen, from, to)),
  );
}

/** Todas las Puertas de un Cerco concreto, ordenadas por id. */
export function gatesBetween(map: GameMap, from: Zone, to: Zone): Gate[] {
  return map.gates.filter((g) => g.from === from && g.to === to);
}

/** La Puerta que guarda un Coloso. */
export function gateOfColossus(map: GameMap, colossusId: string): Gate | undefined {
  return map.gates.find((g) => g.colossus === colossusId);
}

/**
 * Regiones que un asiento puede alcanzar hoy, respetando los Cercos.
 * Es lo que la interfaz necesita para no ofrecer un destino imposible.
 */
export function reachableFrom(
  map: GameMap,
  adjacency: Adjacency,
  gatesOpen: readonly boolean[],
  from: RegionId,
): Set<RegionId> {
  const index = buildWardIndex(map);
  const seen = new Set<RegionId>([from]);
  const queue: RegionId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head] as RegionId;
    for (const next of adjacency[current] as readonly RegionId[]) {
      if (seen.has(next)) continue;
      if (!canCross(index, gatesOpen, current, next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/**
 * Abre una Puerta. Devuelve un `gatesOpen` nuevo — el estado no se modifica.
 * Idempotente: abrir una Puerta ya abierta no es un error, es un no-op.
 */
export function openGate(gatesOpen: readonly boolean[], gateId: GateId): boolean[] {
  const next = [...gatesOpen];
  next[gateId] = true;
  return next;
}

/** ¿Sigue el Núcleo detrás de al menos un Cerco cerrado para este asiento? */
export function coreSealedFor(state: GameState, from: RegionId): boolean {
  const adjacency = buildAdjacencyFromEdges(state.map.regions.length, state.map.edges);
  return !reachableFrom(state.map, adjacency, state.gatesOpen, from).has(state.map.coreId);
}

/** Adyacencia local, para no obligar a quien llama a construirla solo por esto. */
function buildAdjacencyFromEdges(regionCount: number, edges: readonly Edge[]): RegionId[][] {
  const adjacency: RegionId[][] = Array.from({ length: regionCount }, () => []);
  for (const edge of edges) {
    adjacency[edge.a]!.push(edge.b);
    adjacency[edge.b]!.push(edge.a);
  }
  for (const list of adjacency) list.sort((a, b) => a - b);
  return adjacency;
}
