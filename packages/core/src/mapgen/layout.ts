/**
 * De grafo a territorio: el mapa dibujado como provincias que se tocan.
 *
 * El esqueleto es un grafo plano —nodos en polares y aristas explícitas— y dibujarlo como
 * tal, nodos sueltos unidos por líneas, hace que un 4X de conquista se lea como un árbol
 * de investigación. Aquí se convierte en una **teselación**: cada región es un polígono y
 * el mapa entero es una superficie continua, sin huecos y sin radios.
 *
 * La construcción es el **dual baricéntrico** del grafo plano: se trazan sus caras, cada
 * cara aporta un vértice, y la celda de una región es el polígono que forman las caras que
 * la rodean. De ahí sale la propiedad que hace honesto el dibujo:
 *
 * > **dos celdas comparten frontera si y solo si sus regiones son adyacentes.**
 *
 * No es un detalle estético. Una teselación cualquiera —Voronoi, por ejemplo— haría que
 * regiones sin arista entre ellas se tocaran en pantalla, y el mapa estaría prometiendo
 * movimientos que el motor rechaza. Por eso esto vive en `mapgen` y no en la interfaz: la
 * geometría y la adyacencia salen de la misma fuente y no pueden desincronizarse.
 *
 * Puro y determinista, como todo `packages/core`: mismas regiones, mismas celdas.
 */

import type { GameMap, RegionId } from '../types/index';
import { CELL_RADIUS, CORE_SHARE, buildAdjacency } from './skeleton';

export interface Point {
  x: number;
  y: number;
}

/**
 * Las celdas del mapa, indexadas por `regionId`.
 *
 * Cada celda es un polígono cerrado en sentido antihorario, en las mismas coordenadas que
 * `region.x/y`. Las celdas del anillo exterior se cierran contra el borde del mundo.
 */
export function regionCells(map: GameMap): Point[][] {
  const count = map.regions.length;
  const pos: Point[] = map.regions.map((region) => ({ x: region.x, y: region.y }));
  const adjacency = buildAdjacency(count, map.edges);

  // Vecinos en orden antihorario alrededor de cada región: es el «embedding» plano, y sin
  // él no se pueden trazar las caras.
  const around: RegionId[][] = adjacency.map((list, v) =>
    [...list].sort((a, b) => bearing(pos[v]!, pos[a]!) - bearing(pos[v]!, pos[b]!)));

  // Posición de un vecino dentro de ese orden. Clave plana: determinista y sin objetos.
  const slot = new Map<number, number>();
  for (let v = 0; v < count; v += 1) {
    const ring = around[v]!;
    for (let i = 0; i < ring.length; i += 1) slot.set(v * count + ring[i]!, i);
  }

  const { faceOf, faces } = traceFaces(count, around, slot);
  const weights = nodeWeights(map, adjacency, pos);
  const centers = faces.map((face) => faceCenter(face, pos, weights));

  // La cara exterior es la única recorrida en sentido horario: su área con signo es
  // negativa porque encierra al resto del mapa, no a un trozo de él.
  const outerFace = faces.reduce(
    (worst, face, index) => (signedArea(face.map((v) => pos[v]!)) < signedArea(faces[worst]!.map((v) => pos[v]!)) ? index : worst),
    0,
  );

  // `extent` es la frontera exterior del último anillo: las provincias de fuera llegan
  // justo hasta ahí y ni un punto más, que es lo que las deja del tamaño de las demás.
  // La unidad de holgura es por el redondeo a dos decimales, que si no puede empujar un
  // vértice fuera del `viewBox` por milésimas.
  const rimRadius = Math.max(1, map.extent - 1);

  return map.regions.map((region) => {
    const v = region.id;
    const ring = around[v]!;
    const cell: Point[] = [];

    for (let i = 0; i < ring.length; i += 1) {
      const u = ring[i]!;
      const face = faceOf.get(v * count + u)!;
      if (face !== outerFace) {
        cell.push(centers[face]!);
        continue;
      }
      // La región da al borde del mundo: la cara exterior no tiene centro, así que la
      // celda se cierra por fuera. Los puntos de borde solo dependen del par de regiones,
      // de modo que la vecina calcula exactamente los mismos y la costura encaja.
      const next = ring[(i + 1) % ring.length]!;
      cell.push(
        onRim(midpoint(pos[v]!, pos[u]!), rimRadius),
        onRim(pos[v]!, rimRadius),
        onRim(midpoint(pos[v]!, pos[next]!), rimRadius),
      );
    }

    return cell.map(round2);
  });
}

/**
 * Recorre las caras del grafo plano.
 *
 * Cada media arista `u→v` pertenece a exactamente una cara —la de su izquierda—, y la
 * siguiente media arista de esa cara es la que sale de `v` justo **antes** de `v→u` en
 * el orden antihorario. Recorrer eso hasta volver al principio da la cara entera.
 */
function traceFaces(
  count: number,
  around: readonly (readonly RegionId[])[],
  slot: ReadonlyMap<number, number>,
): { faceOf: Map<number, number>; faces: RegionId[][] } {
  const faceOf = new Map<number, number>();
  const faces: RegionId[][] = [];

  for (let start = 0; start < count; start += 1) {
    for (const first of around[start]!) {
      if (faceOf.has(start * count + first)) continue;

      const face: RegionId[] = [];
      let from = start;
      let to = first;
      const index = faces.length;

      // El grafo es finito y cada media arista se visita una vez: el bucle termina.
      for (;;) {
        faceOf.set(from * count + to, index);
        face.push(to);
        const ring = around[to]!;
        const back = slot.get(to * count + from)!;
        const next = ring[(back - 1 + ring.length) % ring.length]!;
        from = to;
        to = next;
        if (faceOf.has(from * count + to)) break;
      }

      faces.push(face);
    }
  }

  return { faceOf, faces };
}

/**
 * Cuánto tira cada región de los vértices que la rodean.
 *
 * **Uno para todas menos el Núcleo.** Ponderar por grado parecía elegante y costaba caro:
 * un nodo de grado 5 tiraba más que uno de grado 4 y acababa con una provincia un 50 %
 * más pequeña, sin que eso significara nada en el juego.
 *
 * El Núcleo sí necesita su propio peso: toca el anillo interior **entero**, así que sin él
 * su celda se comería el centro del mapa. El peso sale en forma cerrada de la geometría —
 * con el Núcleo en el origen y sus vecinos a `r0`, el vértice de cada cara queda a
 * `2·r0·cos(π/n) / (w + 2)`, y se despeja la `w` que deja la celda en su cuota.
 */
function nodeWeights(
  map: GameMap,
  adjacency: readonly (readonly RegionId[])[],
  pos: readonly Point[],
): number[] {
  const weights = new Array<number>(map.regions.length).fill(1);
  const ring = adjacency[map.coreId] ?? [];
  if (ring.length === 0) return weights;

  const r0 = ring.reduce((sum, v) => sum + Math.hypot(pos[v]!.x, pos[v]!.y), 0) / ring.length;
  const target = CELL_RADIUS * Math.sqrt(CORE_SHARE);
  weights[map.coreId] = Math.max(1, (2 * r0 * Math.cos(Math.PI / ring.length)) / target - 2);
  return weights;
}

/** El vértice que aporta una cara: la media de sus regiones, con sus pesos. */
function faceCenter(
  face: readonly RegionId[],
  pos: readonly Point[],
  weights: readonly number[],
): Point {
  let x = 0;
  let y = 0;
  let total = 0;
  for (const v of face) {
    const weight = weights[v]!;
    x += pos[v]!.x * weight;
    y += pos[v]!.y * weight;
    total += weight;
  }
  return { x: x / total, y: y / total };
}

/** Ángulo de `to` visto desde `from`, en (−π, π]. */
function bearing(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Proyecta un punto sobre el borde circular del mundo. */
function onRim(point: Point, radius: number): Point {
  const length = Math.hypot(point.x, point.y) || 1;
  return { x: (point.x / length) * radius, y: (point.y / length) * radius };
}

/** Área con signo: positiva en sentido antihorario. */
function signedArea(polygon: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

function round2(point: Point): Point {
  return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
}
