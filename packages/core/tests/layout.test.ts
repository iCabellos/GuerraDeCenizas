/**
 * El mapa dibujado no puede mentir sobre el mapa jugado.
 *
 * Cada provincia es un **hexágono regular del mismo tamaño**: piezas iguales, del mismo
 * valor, sobre una mesa. Hexágonos iguales no teselan un disco con simetría C_5 —es
 * imposible—, así que entre provincias queda holgura, y esa holgura es justo lo que podría
 * hacer que el tablero mintiera: dos provincias que se ven igual de juntas y solo una es
 * vecina. Eso es lo que fija este archivo, y no las coordenadas.
 */

import { describe, expect, it } from 'vitest';
import { generateMap } from '../src/mapgen/generate';
import { CELL_RADIUS, buildAdjacency, buildSkeleton } from '../src/mapgen/skeleton';
import { regionCells, type Point } from '../src/mapgen/layout';
import type { PlayerCount, RegionId } from '../src/types/index';

const COUNTS: PlayerCount[] = [2, 3, 5];
const SEEDS = [1, 424242, 90210];

const key = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** Distancia entre los centros de dos regiones. */
function apart(map: ReturnType<typeof generateMap>['map'], a: RegionId, b: RegionId): number {
  const p = map.regions[a]!;
  const q = map.regions[b]!;
  return Math.hypot(p.x - q.x, p.y - q.y);
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
  it.each(COUNTS)('cada provincia es un hexágono regular (%i jugadores)', (n) => {
    // Lo que se pidió, literalmente: «hexágonos perfectamente equitativos por los lados».
    // Se comprueba la figura, no las coordenadas: seis lados iguales y seis ángulos de
    // 120°. La tolerancia es la del redondeo a dos decimales con que se guardan.
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      for (const [id, cell] of regionCells(map).entries()) {
        expect(cell, `región ${id}`).toHaveLength(6);

        const sides = cell.map((p, i) => {
          const q = cell[(i + 1) % cell.length]!;
          return Math.hypot(q.x - p.x, q.y - p.y);
        });
        const longest = Math.max(...sides);
        const shortest = Math.min(...sides);
        expect((longest - shortest) / longest, `lados de la región ${id}`).toBeLessThan(0.01);

        for (let i = 0; i < cell.length; i += 1) {
          const before = cell[(i + cell.length - 1) % cell.length]!;
          const here = cell[i]!;
          const after = cell[(i + 1) % cell.length]!;
          const u = Math.atan2(before.y - here.y, before.x - here.x);
          const v = Math.atan2(after.y - here.y, after.x - here.x);
          const inner = Math.abs(((u - v + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          expect(inner, `ángulo de la región ${id}`).toBeCloseTo((2 * Math.PI) / 3, 2);
        }
      }
    }
  });

  it.each(COUNTS)('el mapa no puede mentir sobre quién es vecino de quién (%i jugadores)', (n) => {
    // La garantía que sustituye a «se tocan si y solo si son adyacentes», que valía cuando
    // las celdas teselaban. Con holgura entre provincias, lo que tiene que sostenerse es:
    //
    //   el par NO adyacente más cercano está más lejos que el par adyacente más lejano.
    //
    // O sea: **lo que parece vecino, lo es**. Si esto se rompe, el tablero enseña dos
    // provincias igual de juntas de las que solo una es alcanzable, y hay que leerse un
    // manual para jugar — que es exactamente el problema que tenía el mapa de aristas.
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      const edges = new Set(map.edges.map((edge) => `${edge.a}-${edge.b}`));

      let farthestNeighbour = 0;
      let closestStranger = Infinity;
      for (let a = 0; a < map.regions.length; a += 1) {
        for (let b = a + 1; b < map.regions.length; b += 1) {
          const distance = apart(map, a, b);
          if (edges.has(`${a}-${b}`)) farthestNeighbour = Math.max(farthestNeighbour, distance);
          else closestStranger = Math.min(closestStranger, distance);
        }
      }

      expect(closestStranger, `${n} jugadores, semilla ${seed}`).toBeGreaterThan(farthestNeighbour);
    }
  });

  it.each(COUNTS)('dos provincias vecinas nunca se solapan (%i jugadores)', (n) => {
    // Todos los hexágonos son iguales, así que basta con que ningún par de centros esté
    // más cerca que el ancho de un hexágono. Es lo que fija el tamaño de la pieza.
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      const across = CELL_RADIUS * Math.sqrt(3);
      for (let a = 1; a < map.regions.length; a += 1) {
        for (let b = a + 1; b < map.regions.length; b += 1) {
          expect(apart(map, a, b), `regiones ${a} y ${b}`).toBeGreaterThanOrEqual(across - 0.5);
        }
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
  it.each(COUNTS)('ninguna región se queda aislada (%i jugadores)', (n) => {
    const { map } = generateMap(2718, n);
    expect(buildAdjacency(map.regions.length, map.edges).every((list) => list.length > 0)).toBe(true);
  });
});
