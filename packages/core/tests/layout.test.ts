/**
 * El mapa dibujado no puede mentir sobre el mapa jugado.
 *
 * La teselación existe para que el tablero se lea como territorio y no como un árbol de
 * investigación, pero eso solo vale si **tocarse significa poder moverse**. Una teselación
 * cualquiera —un Voronoi sobre los mismos centros, por ejemplo— haría que regiones sin
 * arista entre ellas compartieran frontera en pantalla, y el mapa estaría ofreciendo
 * movimientos que `reduce()` rechaza. Eso es lo que se fija aquí, y no las coordenadas.
 */

import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/mapgen/generate';
import { buildAdjacency, buildSkeleton } from '../src/mapgen/skeleton';
import { regionCells, type Point } from '../src/mapgen/layout';
import type { PlayerCount, RegionId } from '../src/types/index';

const COUNTS: PlayerCount[] = [2, 3, 5];
const SEEDS = [1, 424242, 90210];

const key = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** Qué par de celdas comparte cada segmento de frontera. */
function borders(cells: readonly Point[][]): Set<string> {
  const owners = new Map<string, RegionId[]>();
  cells.forEach((cell, id) => {
    for (let i = 0; i < cell.length; i += 1) {
      const a = cell[i]!;
      const b = cell[(i + 1) % cell.length]!;
      if (key(a) === key(b)) continue;
      const segment = [key(a), key(b)].sort().join('|');
      const list = owners.get(segment) ?? [];
      list.push(id);
      owners.set(segment, list);
    }
  });

  const shared = new Set<string>();
  for (const ids of owners.values()) {
    if (ids.length !== 2) continue;
    const [a, b] = [ids[0]!, ids[1]!].sort((x, y) => x - y);
    shared.add(`${a}-${b}`);
  }
  return shared;
}

function area(polygon: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    total += a.x * b.y - b.x * a.y;
  }
  return total / 2;
}

/** ¿Está el punto dentro del polígono? Cruce de rayos, suficiente para un test. */
function contains(polygon: readonly Point[], point: Point): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const straddles = a.y > point.y !== b.y > point.y;
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

describe('teselación del mapa', () => {
  it.each(COUNTS)('dos celdas comparten frontera si y solo si son adyacentes (%i jugadores)', (n) => {
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      const shared = borders(regionCells(map));
      const edges = new Set(map.edges.map((edge) => `${edge.a}-${edge.b}`));

      // Las dos direcciones del «si y solo si», por separado: si solo se comprobara una,
      // una teselación que uniera medio mapa seguiría pasando.
      for (const edge of edges) {
        expect(shared.has(edge), `arista ${edge} sin frontera dibujada`).toBe(true);
      }
      for (const border of shared) {
        expect(edges.has(border), `frontera ${border} sin arista en el motor`).toBe(true);
      }
    }
  });

  it.each(COUNTS)('cada celda es un polígono con área y contiene a su región (%i jugadores)', (n) => {
    const { map } = generateMap(7, n);
    const cells = regionCells(map);

    expect(cells).toHaveLength(map.regions.length);
    cells.forEach((cell, id) => {
      expect(cell.length, `región ${id}`).toBeGreaterThanOrEqual(3);
      // Antihoraria y con superficie: una celda degenerada no se puede ni tocar ni ver.
      expect(area(cell), `región ${id}`).toBeGreaterThan(0);
      expect(contains(cell, map.regions[id]!), `región ${id} fuera de su celda`).toBe(true);
    });
  });

  it.each(COUNTS)('las celdas no se solapan (%i jugadores)', (n) => {
    const { map } = generateMap(31, n);
    const cells = regionCells(map);
    for (let id = 0; id < cells.length; id += 1) {
      for (let other = 0; other < cells.length; other += 1) {
        if (id === other) continue;
        expect(
          contains(cells[id]!, map.regions[other]!),
          `la celda ${id} se come el centro de ${other}`,
        ).toBe(false);
      }
    }
  });

  it.each(COUNTS)('la teselación conserva la simetría C_n (%i jugadores)', (n) => {
    // Si el dibujo rompiera la simetría, un jugador vería su sector más grande que el de
    // los demás y la premisa del reparto justo dejaría de ser verificable a ojo.
    const skeleton = buildSkeleton(n);
    const { map } = generateMap(2026, n);
    const cells = regionCells(map);
    const turn = (2 * Math.PI) / n;

    for (let id = 1; id < cells.length; id += 1) {
      const rotated = cells[skeleton.rotate(id, 1)]!;
      const expected = cells[id]!.map((p) => ({
        x: p.x * Math.cos(turn) - p.y * Math.sin(turn),
        y: p.x * Math.sin(turn) + p.y * Math.cos(turn),
      }));
      expect(rotated).toHaveLength(expected.length);
      // Mismo polígono, quizá empezando por otro vértice: se compara el área y el
      // conjunto de vértices, no el orden. La comparación es **relativa** porque los
      // vértices se guardan con dos decimales: en áreas de miles, esa redondez basta para
      // que una igualdad absoluta falle sin que la simetría se haya roto.
      const rotatedArea = Math.abs(area(rotated));
      const expectedArea = Math.abs(area(expected));
      expect(Math.abs(rotatedArea - expectedArea) / expectedArea).toBeLessThan(0.001);
      for (const point of expected) {
        const found = rotated.some((q) => Math.hypot(q.x - point.x, q.y - point.y) < 0.5);
        expect(found, `vértice ${key(point)} sin pareja en la celda rotada`).toBe(true);
      }
    }
  });

  it('el mismo mapa da siempre las mismas celdas', () => {
    for (const n of COUNTS) {
      const { map } = generateMap(1234, n);
      expect(regionCells(map)).toEqual(regionCells(map));
    }
  });

  it('ninguna celda se sale del mundo', () => {
    // El `viewBox` del mapa es `extent`: una celda que lo desborde se corta en pantalla.
    for (const n of COUNTS) {
      const { map } = generateMap(55, n);
      for (const cell of regionCells(map)) {
        for (const point of cell) {
          expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(map.extent);
        }
      }
    }
  });

  it.each(COUNTS)('todas las provincias miden aproximadamente lo mismo (%i jugadores)', (n) => {
    // La intención, no la constante: **capturar una región vale lo mismo caiga donde
    // caiga**. Con anillos separados por un hueco fijo la dispersión llegaba a ×2,8 y el
    // tablero parecía roto además de ser injusto; las bandas de área igual la bajan a ×1,8.
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      const cells = regionCells(map);
      const sizes = cells
        .filter((_, id) => id !== map.coreId)
        .map((cell) => Math.abs(area(cell)))
        .sort((a, b) => a - b);

      expect(sizes[sizes.length - 1]! / sizes[0]!).toBeLessThan(2);
    }
  });

  it('el Núcleo no se come el centro del mapa', () => {
    // Toca el anillo interior entero, así que su celda sale de más caras que ninguna. Sin
    // ponderar por grado se llevaba un cuarto de la superficie: el objetivo de la partida
    // no puede ser además la mayor provincia por accidente geométrico.
    for (const n of COUNTS) {
      const { map } = generateMap(88, n);
      const cells = regionCells(map);
      const core = Math.abs(area(cells[map.coreId]!));
      const others = cells
        .filter((_, id) => id !== map.coreId)
        .map((cell) => Math.abs(area(cell)));
      const median = others.sort((a, b) => a - b)[Math.floor(others.length / 2)]!;
      // Se le nota que es el objetivo, y no se come el centro: entre una provincia y media
      // y dos. Su cuota la fija `CORE_SHARE`, no el azar de la geometría.
      expect(core / median).toBeGreaterThan(1);
      expect(core / median).toBeLessThan(2);
    }
  });
});

describe('adyacencia y celdas salen de la misma fuente', () => {
  it.each(COUNTS)('el número de fronteras es el número de aristas (%i jugadores)', (n) => {
    const { map } = generateMap(2718, n);
    expect(borders(regionCells(map)).size).toBe(map.edges.length);
    expect(buildAdjacency(map.regions.length, map.edges).every((list) => list.length > 0)).toBe(true);
  });
});
