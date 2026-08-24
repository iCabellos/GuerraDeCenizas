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

import type { Edge, PlayerCount, RegionId } from '../types/index';
import { SECTOR_SPEC } from './spec';

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
  extent: number;
  /** `rotate(id, k)` = el nodo equivalente k sectores más allá. Biyección. */
  rotate: (id: RegionId, k: number) => RegionId;
}

/**
 * Geometría del render, en unidades del `viewBox`.
 *
 * `CELL_RADIUS` es el radio de la provincia **tipo**: todas miden lo mismo, así que este
 * número fija a la vez el tamaño de una región y, por acumulación, el del mapa entero.
 */
export const CELL_RADIUS = 58;

/** Cuántas provincias vale el Núcleo. Es el objetivo de la campaña: se le nota, no se le come. */
export const CORE_SHARE = 1.35;

const CORE_ID = 0;

export function nodeRadius(): number {
  return CELL_RADIUS;
}

/**
 * Fronteras de cada anillo, **por área**.
 *
 * La versión anterior separaba los anillos por un hueco constante y colocaba el nodo en
 * el radio del anillo. El resultado, al teselar, eran provincias de hasta **2,8× de
 * diferencia de superficie** entre la mayor y la menor: un tablero que parece roto, y
 * además injusto — capturar una región valía cosas muy distintas según dónde cayera.
 *
 * Aquí cada anillo recibe justo el área que necesita para que **todas sus provincias
 * midan lo mismo**:
 *
 * ```
 * área de una provincia = A = π · CELL_RADIUS²
 * banda del anillo r    = π · (b[r+1]² − b[r]²) = A · n(r)
 *   ⇒  b[r+1]² = b[r]² + CELL_RADIUS² · n(r)
 * ```
 *
 * Y el nodo va en el **radio que parte su banda en dos mitades de igual área**, no en el
 * punto medio: con anillos anchos, el medio geométrico deja más superficie fuera que
 * dentro y la provincia se descuelga hacia afuera.
 *
 * Devuelve los radios de los nodos y las fronteras, que es lo que necesita `extent`.
 */
function ringGeometry(players: PlayerCount): { radii: number[]; bounds: number[] } {
  const spec = SECTOR_SPEC[players];
  // El Núcleo ocupa el disco central: su cuota fija dónde empieza el primer anillo.
  const bounds = [CELL_RADIUS * Math.sqrt(CORE_SHARE)];
  const radii: number[] = [];

  for (let r = 0; r < spec.rings.length; r++) {
    const total = (spec.rings[r] as number) * players;
    const inner = bounds[r] as number;
    const outer = Math.sqrt(inner * inner + CELL_RADIUS * CELL_RADIUS * total);
    bounds.push(outer);
    radii.push(Math.sqrt((inner * inner + outer * outer) / 2));
  }
  return { radii, bounds };
}

export function buildSkeleton(players: PlayerCount): Skeleton {
  const spec = SECTOR_SPEC[players];
  const { radii, bounds } = ringGeometry(players);
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
  for (let r = 0; r < spec.rings.length - 1; r++) {
    const inner = ringNodes(nodes, r);
    const outer = ringNodes(nodes, r + 1);
    for (const node of inner) edges.add(node.id, nearestByAngle(outer, node.angle).id);
    for (const node of outer) edges.add(node.id, nearestByAngle(inner, node.angle).id);
  }

  const bastionRing = spec.bastionRing;
  const bastionK = Math.floor(((spec.rings[bastionRing] as number) - 1) / 2);
  const bastions: RegionId[] = [];
  for (let s = 0; s < players; s++) bastions.push(at(s, bastionRing, bastionK));

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
    // El mundo **es** el mapa: `extent` es la frontera exterior del último anillo, ni un
    // punto más. Con margen, las provincias de fuera se estiraban hasta el borde y salían
    // un 45 % más grandes que las de dentro.
    extent: Math.ceil(bounds[bounds.length - 1] as number),
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

  add(a: RegionId, b: RegionId): void {
    if (a === b) return;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}-${hi}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push({ a: lo, b: hi });
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
