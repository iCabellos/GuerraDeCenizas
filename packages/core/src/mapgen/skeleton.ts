/**
 * Esqueleto del mapa: nodos, disposición y aristas.
 *
 * Todo lo de este archivo es **determinista y sin aleatoriedad**: para un número de
 * jugadores dado, el esqueleto es siempre el mismo. La aleatoriedad entra después,
 * al decorar (`decorate.ts`).
 *
 * La simetría C_n es una propiedad **estructural**, no algo que se comprueba a
 * posteriori: los nodos se generan por sector y las aristas se derivan del ángulo, que
 * es equivariante bajo rotación. Ver docs/MAP_GENERATION.md §4.
 */

import type { Edge, Gate, PlayerCount, RegionId, Zone } from '../types/index';
import { SECTOR_SPEC, wardBoundaries, zoneOfRing } from './spec';

export interface SkeletonNode {
  id: RegionId;
  /** `-1` para el Núcleo. */
  sector: number;
  /** `-1` para el Núcleo; 0 = anillo interior. */
  ring: number;
  slot: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
}

export interface Skeleton {
  players: PlayerCount;
  nodes: SkeletonNode[];
  edges: Edge[];
  coreId: RegionId;
  bastions: RegionId[];
  /** Una por sector y por Cerco, colocadas por rotación: el reparto es exacto. */
  gates: Gate[];
  extent: number;
  /** `rotate(id, k)` = el nodo equivalente k sectores más allá. Biyección. */
  rotate: (id: RegionId, k: number) => RegionId;
}

// Geometría del render. Unidades del `viewBox`, no píxeles.
const NODE_RADIUS = 32;
const NODE_GAP = 24;
const RING_GAP = 88;

const CORE_ID = 0;

export function nodeRadius(): number {
  return NODE_RADIUS;
}

/**
 * Radios de cada anillo.
 *
 * Dos restricciones a la vez: los nodos de un mismo anillo no pueden solaparse (el radio
 * mínimo depende de cuántos hay), y los anillos deben separarse entre sí. Se toma el
 * máximo de ambas y se fuerza que sea monótono creciente.
 */
function ringRadii(players: PlayerCount): number[] {
  const spec = SECTOR_SPEC[players];
  const spacing = 2 * NODE_RADIUS + NODE_GAP;
  const radii: number[] = [];

  for (let r = 0; r < spec.rings.length; r++) {
    const total = (spec.rings[r] as number) * players;
    const needed = (total * spacing) / (2 * Math.PI);
    const previous = r === 0 ? NODE_RADIUS + RING_GAP : (radii[r - 1] as number) + RING_GAP;
    radii.push(Math.max(needed, previous));
  }
  return radii;
}

export function buildSkeleton(players: PlayerCount): Skeleton {
  const spec = SECTOR_SPEC[players];
  const radii = ringRadii(players);
  const sectorSpan = (2 * Math.PI) / players;

  const nodes: SkeletonNode[] = [
    { id: CORE_ID, sector: -1, ring: -1, slot: 0, angle: 0, radius: 0, x: 0, y: 0 },
  ];

  // Índice (sector, anillo, slot) → id. El orden de generación fija los ids.
  const index: number[][][] = [];
  for (let s = 0; s < players; s++) {
    index[s] = [];
    for (let r = 0; r < spec.rings.length; r++) {
      index[s]![r] = [];
      for (let k = 0; k < (spec.rings[r] as number); k++) {
        const count = spec.rings[r] as number;
        // El +0.5 centra el slot dentro de su porción de sector; el −π/2 pone el
        // sector 0 arriba, que es donde el jugador espera encontrarse.
        const angle = s * sectorSpan + ((k + 0.5) / count) * sectorSpan - Math.PI / 2;
        const radius = radii[r] as number;
        const id = nodes.length;
        nodes.push({
          id,
          sector: s,
          ring: r,
          slot: k,
          angle,
          radius,
          x: round2(Math.cos(angle) * radius),
          y: round2(Math.sin(angle) * radius),
        });
        index[s]![r]![k] = id;
      }
    }
  }

  const at = (s: number, r: number, k: number): RegionId =>
    index[((s % players) + players) % players]![r]![k] as RegionId;

  const edges = new EdgeSet();

  // (a) El Núcleo se conecta con todo el anillo interior: es una encrucijada, y debe
  //     ser alcanzable desde cualquier dirección por igual.
  for (let s = 0; s < players; s++) {
    for (let k = 0; k < (spec.rings[0] as number); k++) edges.add(CORE_ID, at(s, 0, k));
  }

  // (b) Cada anillo es un ciclo completo alrededor del mapa. Al cerrarse entre sectores
  //     produce las aristas inter-sector sin necesidad de una regla aparte, y la
  //     simetría se conserva por construcción.
  for (let r = 0; r < spec.rings.length; r++) {
    const count = spec.rings[r] as number;
    const total = count * players;
    for (let i = 0; i < total; i++) {
      const a = at(Math.floor(i / count), r, i % count);
      const j = (i + 1) % total;
      const b = at(Math.floor(j / count), r, j % count);
      edges.add(a, b);
    }
  }

  // (c) Aristas radiales por proximidad angular, en ambos sentidos, para garantizar que
  //     ningún nodo se queda sin conexión hacia dentro ni hacia fuera.
  //
  //     Una radial que cruza de una zona a otra es un **Cerco**: no se cruza. Las
  //     aristas de anillo nunca lo son (un anillo entero está en una sola zona) y las
  //     del Núcleo tampoco (el Núcleo y el anillo 0 están los dos en la Corona). Así
  //     que el Cerco no es una lista aparte: es una propiedad de la arista, y se decide
  //     donde ya se decide si dos nodos son vecinos.
  for (let r = 0; r < spec.rings.length - 1; r++) {
    const inner = ringNodes(nodes, r);
    const outer = ringNodes(nodes, r + 1);
    const ward = zoneOfRing(players, r) !== zoneOfRing(players, r + 1);
    for (const node of inner) edges.add(node.id, nearestByAngle(outer, node.angle).id, ward);
    for (const node of outer) edges.add(node.id, nearestByAngle(inner, node.angle).id, ward);
  }

  const bastionRing = spec.bastionRing;
  const bastionK = Math.floor(((spec.rings[bastionRing] as number) - 1) / 2);
  const bastions: RegionId[] = [];
  for (let s = 0; s < players; s++) bastions.push(at(s, bastionRing, bastionK));

  // Puertas: una por sector y Cerco, en la radial más cercana a la **frontera entre
  // sectores**, no a la vertical del Bastión.
  //
  // Las dos opciones son igual de simétricas bajo rotación, pero solo ésta pone la
  // Puerta donde se tocan dos jugadores. Y ahí es donde tiene que estar: el Coloso
  // existe para plantear «¿quién paga la puerta?» ([ADR-043]), y esa pregunta no se le
  // hace a nadie si cada uno tiene la suya en mitad de su casa.
  const gates: Gate[] = [];
  for (const { outerRing, innerRing } of wardBoundaries(players)) {
    const outerNodes = ringNodes(nodes, outerRing);
    const innerNodes = ringNodes(nodes, innerRing);
    for (let s = 0; s < players; s++) {
      const boundary = (s + 1) * sectorSpan - Math.PI / 2;
      const outer = nearestByAngle(outerNodes, boundary);
      const inner = nearestByAngle(innerNodes, outer.angle);
      gates.push({
        id: gates.length,
        inner: inner.id,
        outer: outer.id,
        from: zoneOfRing(players, outerRing) as Zone,
        to: zoneOfRing(players, innerRing) as Zone,
        colossus: `x${gates.length}`,
      });
    }
  }

  const rotate = (id: RegionId, k: number): RegionId => {
    if (id === CORE_ID) return CORE_ID;
    const node = nodes[id] as SkeletonNode;
    return at(node.sector + k, node.ring, node.slot);
  };

  return {
    players,
    nodes,
    edges: edges.toArray(),
    coreId: CORE_ID,
    bastions,
    gates,
    extent: Math.ceil((radii[radii.length - 1] as number) + NODE_RADIUS + 16),
    rotate,
  };
}

function ringNodes(nodes: readonly SkeletonNode[], ring: number): SkeletonNode[] {
  return nodes.filter((n) => n.ring === ring);
}

/**
 * Nodo más cercano en ángulo. Desempata por id ascendente para que sea determinista
 * incluso cuando dos nodos equidistan — cosa que ocurre a menudo por la simetría.
 */
function nearestByAngle(candidates: readonly SkeletonNode[], angle: number): SkeletonNode {
  let best = candidates[0] as SkeletonNode;
  let bestDelta = angularDistance(best.angle, angle);
  for (const node of candidates) {
    const delta = angularDistance(node.angle, angle);
    if (delta < bestDelta - 1e-9 || (Math.abs(delta - bestDelta) <= 1e-9 && node.id < best.id)) {
      best = node;
      bestDelta = delta;
    }
  }
  return best;
}

function angularDistance(a: number, b: number): number {
  const TAU = 2 * Math.PI;
  const d = Math.abs(((a - b) % TAU + TAU) % TAU);
  return Math.min(d, TAU - d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Conjunto de aristas no dirigidas, normalizadas y ordenadas. */
class EdgeSet {
  private readonly seen = new Set<string>();
  private readonly list: Edge[] = [];

  add(a: RegionId, b: RegionId, ward = false): void {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    // `ward` solo aparece cuando es cierto: un `false` explícito ensuciaría la forma
    // canónica del mapa y cambiaría el checksum sin que cambie nada del juego.
    this.list.push(ward ? { a: lo, b: hi, ward: true } : { a: lo, b: hi });
  }

  toArray(): Edge[] {
    return this.list.slice().sort((x, y) => x.a - y.a || x.b - y.b);
  }
}

/** Listas de adyacencia. Derivadas: nunca se guardan en el estado. */
export function buildAdjacency(regionCount: number, edges: readonly Edge[]): RegionId[][] {
  const adjacency: RegionId[][] = Array.from({ length: regionCount }, () => []);
  for (const edge of edges) {
    adjacency[edge.a]!.push(edge.b);
    adjacency[edge.b]!.push(edge.a);
  }
  for (const list of adjacency) list.sort((a, b) => a - b);
  return adjacency;
}

/** Distancias en saltos desde `from`. `Infinity` si es inalcanzable. */
export function bfsDistances(adjacency: readonly (readonly RegionId[])[], from: RegionId): number[] {
  const dist = new Array<number>(adjacency.length).fill(Number.POSITIVE_INFINITY);
  dist[from] = 0;
  const queue: RegionId[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head] as RegionId;
    for (const next of adjacency[current] as readonly RegionId[]) {
      if (dist[next] === Number.POSITIVE_INFINITY) {
        dist[next] = (dist[current] as number) + 1;
        queue.push(next);
      }
    }
  }
  return dist;
}
