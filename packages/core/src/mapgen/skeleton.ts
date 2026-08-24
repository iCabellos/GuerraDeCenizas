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
 * `CELL_RADIUS` es el **circunradio del hexágono** de una provincia: del centro a un
 * vértice. Todas las provincias son el mismo hexágono, así que este número fija a la vez
 * el tamaño de una región y, por acumulación, el del mapa entero.
 */
export const CELL_RADIUS = 58;

/** Separación de dos hexágonos de circunradio `R` que encajan lado con lado. */
const STEP = Math.sqrt(3);

/**
 * Hasta dónde llega la vecindad, en unidades de paso.
 *
 * Es el radio del corte que decide qué provincias son adyacentes. Se elige por encima del
 * par de vecinos más separado y por debajo del par no vecino más próximo, y ese hueco es
 * lo que garantiza que el mapa no pueda mentir. Con 1,2 el margen es de un 5–9 % a dos,
 * tres y cinco jugadores, el grado medio queda en torno a 4,2 y ningún nodo baja de 3 ni
 * pasa de 6: ni callejones ni encrucijadas, que es el invariante de siempre.
 *
 * Subirlo espesa el grafo y cambia el balance; bajarlo desconecta el mapa. Si lo tocas,
 * el test de honestidad y el de grados te lo dirán.
 */
const LINK_RANGE = 1.2;

/** Cuántas provincias vale el Núcleo. Es el objetivo de la campaña: se le nota, no se le come. */
export const CORE_SHARE = 1.35;

const CORE_ID = 0;

export function nodeRadius(): number {
  return CELL_RADIUS;
}

/**
 * Radio de cada anillo, en unidades del **paso** — la distancia entre dos provincias
 * vecinas.
 *
 * Las provincias se dibujan como hexágonos regulares del mismo tamaño
 * ([ADR-046](../../../../docs/DECISIONS.md#adr-046)). Para que quepan, lo que tiene que
 * ser uniforme no es el área de una banda: es la **distancia entre vecinos**. Dos
 * hexágonos iguales de circunradio `R` encajan cuando sus centros están a `√3·R`; si un
 * par está más cerca, se solapan, y si está mucho más lejos, se abre un boquete.
 *
 * Con anillos repartidos por área la horquilla llegaba a ×2,4 y no había tamaño de
 * hexágono que sirviera. Estos radios salen de minimizar esa horquilla junto con los
 * recuentos de `SECTOR_SPEC`, y la dejan en ×1,16 a dos y tres jugadores y ×1,23 a cinco.
 *
 * Van en unidades de paso y no en píxeles a propósito: el paso real lo fija
 * `buildSkeleton` midiendo el mapa ya construido, así que estos números no hay que
 * reescalarlos si cambia `CELL_RADIUS`.
 */
const RING_RADII: Readonly<Record<PlayerCount, readonly number[]>> = {
  2: [1.025, 1.87, 2.755, 3.671],
  3: [0.995, 1.91, 2.865, 3.86],
  5: [0.936, 1.782, 2.677, 3.669, 4.695],
};

export function buildSkeleton(players: PlayerCount): Skeleton {
  const spec = SECTOR_SPEC[players];
  // Los radios se construyen en unidades de paso y se escalan al final, cuando ya se
  // puede medir cuál es el par de vecinos más apretado del mapa.
  const units = RING_RADII[players];
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
        const radius = units[r] as number;
        const id = nodes.length;
        nodes.push({
          id,
          sector: s,
          ring: r,
          slot: k,
          angle,
          radius,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        });
        index[s]![r]![k] = id;
      }
    }
  }

  const at = (s: number, r: number, k: number): RegionId =>
    index[((s % players) + players) % players]![r]![k] as RegionId;

  // ── Adyacencia por distancia ────────────────────────────────────────────────
  //
  // **Dos provincias son vecinas si y solo si sus centros están a menos de `LINK_RANGE`.**
  //
  // Antes las aristas salían de tres reglas —el Núcleo con todo el anillo interior, el
  // ciclo de cada anillo, y la radial al más próximo en ángulo—. Con provincias dibujadas
  // como hexágonos iguales eso deja de valer, y no por estética: la regla del «más próximo
  // en ángulo» conecta a uno de dos nodos que están **a la misma distancia**, así que el
  // mapa acababa enseñando dos provincias igual de juntas, una vecina y la otra no. Eso es
  // exactamente lo que ADR-037 llamó «no hay vecindad implícita», y es lo que hace que un
  // tablero no se pueda leer sin un manual.
  //
  // Con el corte por distancia el dibujo **no puede mentir**: si dos provincias se ven
  // juntas, son vecinas, porque «verse juntas» y «ser vecinas» son la misma condición. Y
  // la simetría C_n se conserva sola — la distancia no cambia al girar el mapa.
  const edges = new EdgeSet();
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const p = nodes[a] as SkeletonNode;
      const q = nodes[b] as SkeletonNode;
      if (Math.hypot(p.x - q.x, p.y - q.y) <= LINK_RANGE) edges.add(p.id, q.id);
    }
  }

  const bastionRing = spec.bastionRing;
  const bastionK = Math.floor(((spec.rings[bastionRing] as number) - 1) / 2);
  const bastions: RegionId[] = [];
  for (let s = 0; s < players; s++) bastions.push(at(s, bastionRing, bastionK));

  // **La escala se mide, no se supone.** Los radios vienen en unidades de paso; aquí se
  // busca el par de vecinos más apretado del mapa ya construido y se estira todo hasta que
  // esos dos hexágonos encajan exactamente lado con lado. Así ningún par se solapa —los
  // demás quedan algo más holgados— y `CELL_RADIUS` se puede cambiar sin retocar nada más.
  const built = edges.toArray();
  let tightest = Infinity;
  for (const edge of built) {
    const a = nodes[edge.a] as SkeletonNode;
    const b = nodes[edge.b] as SkeletonNode;
    tightest = Math.min(tightest, Math.hypot(a.x - b.x, a.y - b.y));
  }
  const scale = (STEP * CELL_RADIUS) / (tightest || 1);
  for (const node of nodes) {
    node.radius = node.radius * scale;
    node.x = round2(node.x * scale);
    node.y = round2(node.y * scale);
  }

  const rotate = (id: RegionId, k: number): RegionId => {
    if (id === CORE_ID) return CORE_ID;
    const node = nodes[id] as SkeletonNode;
    return at(node.sector + k, node.ring, node.slot);
  };

  return {
    players,
    nodes,
    edges: built,
    coreId: CORE_ID,
    bastions,
    // El mundo **es** el mapa: llega hasta donde llega el hexágono más exterior, ni un
    // punto más. Sumar el circunradio es justo lo que hace falta para que la provincia de
    // fuera quepa entera y no se corte contra el borde del `viewBox`.
    extent: Math.ceil((units[units.length - 1] as number) * scale + CELL_RADIUS),
    rotate,
  };
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
