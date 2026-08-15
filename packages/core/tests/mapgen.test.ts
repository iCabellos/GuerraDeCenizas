/**
 * Tests del generador de mapas.
 *
 * El más importante del paquete es `rotate() es un automorfismo`: es la afirmación de
 * producto «los mapas son equilibrados» convertida en una aserción ejecutable. Si la
 * rotación preserva la adyacencia y todos los sectores son copias rotadas, la equidad
 * es una propiedad estructural y no hace falta medirla.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerCount, RegionId } from '../src/types/index';
import { buildSkeleton, buildAdjacency, bfsDistances } from '../src/mapgen/skeleton';
import { generateMap } from '../src/mapgen/generate';
import { SECTOR_SPEC, assertSpecConsistency, mapSize, sectorSize } from '../src/mapgen/spec';
import { checksum } from '../src/util/canonical';

const COUNTS: PlayerCount[] = [2, 3, 5];

describe('especificación de sectores', () => {
  it.each(COUNTS)('la bolsa de terrenos llena el sector exactamente (%i jugadores)', (n) => {
    expect(() => assertSpecConsistency(n)).not.toThrow();
  });

  it.each(COUNTS)('el tamaño del mapa es n × sector + 1 (%i jugadores)', (n) => {
    expect(mapSize(n)).toBe(n * sectorSize(n) + 1);
  });
});

describe('esqueleto — los cinco invariantes', () => {
  it.each(COUNTS)('rotate() es un automorfismo del grafo (%i jugadores)', (n) => {
    const skeleton = buildSkeleton(n);
    const edgeKey = (a: RegionId, b: RegionId) => `${Math.min(a, b)}-${Math.max(a, b)}`;
    const edges = new Set(skeleton.edges.map((e) => edgeKey(e.a, e.b)));

    for (let k = 1; k < n; k++) {
      for (const edge of skeleton.edges) {
        const rotated = edgeKey(skeleton.rotate(edge.a, k), skeleton.rotate(edge.b, k));
        expect(edges.has(rotated)).toBe(true);
      }
    }
  });

  it.each(COUNTS)('todos los Bastiones equidistan del Núcleo (%i jugadores)', (n) => {
    const skeleton = buildSkeleton(n);
    const adjacency = buildAdjacency(skeleton.nodes.length, skeleton.edges);
    const fromCore = bfsDistances(adjacency, skeleton.coreId);
    const distances = skeleton.bastions.map((b) => fromCore[b] as number);

    expect(new Set(distances).size).toBe(1);
    expect(distances[0]).toBeGreaterThanOrEqual(3);
  });

  it.each(COUNTS)('el grafo es conexo desde cualquier Bastión (%i jugadores)', (n) => {
    const skeleton = buildSkeleton(n);
    const adjacency = buildAdjacency(skeleton.nodes.length, skeleton.edges);
    for (const bastion of skeleton.bastions) {
      const distances = bfsDistances(adjacency, bastion);
      expect(distances.every((d) => Number.isFinite(d))).toBe(true);
    }
  });

  it.each(COUNTS)(
    'el multiconjunto de distancias entre Bastiones es igual para todos (%i jugadores)',
    (n) => {
      const skeleton = buildSkeleton(n);
      const adjacency = buildAdjacency(skeleton.nodes.length, skeleton.edges);
      const profiles = skeleton.bastions.map((from) => {
        const distances = bfsDistances(adjacency, from);
        return skeleton.bastions
          .filter((other) => other !== from)
          .map((other) => distances[other] as number)
          .sort((a, b) => a - b)
          .join(',');
      });
      // Nadie tiene «peores vecinos» que otro: es lo que hace justo el mapa de 5.
      expect(new Set(profiles).size).toBe(1);
    },
  );

  it.each(COUNTS)('ningún nodo es un callejón ni un hub (%i jugadores)', (n) => {
    const skeleton = buildSkeleton(n);
    const adjacency = buildAdjacency(skeleton.nodes.length, skeleton.edges);
    for (const node of skeleton.nodes) {
      if (node.id === skeleton.coreId) continue;
      const degree = (adjacency[node.id] as readonly RegionId[]).length;
      expect(degree).toBeGreaterThanOrEqual(2);
      expect(degree).toBeLessThanOrEqual(6);
    }
  });
});

describe('generación', () => {
  it.each(COUNTS)('la misma semilla produce el mismo mapa (%i jugadores)', (n) => {
    const a = generateMap(20260815, n);
    const b = generateMap(20260815, n);
    expect(checksum(a.map)).toBe(checksum(b.map));
  });

  it.each(COUNTS)('semillas distintas producen mapas distintos (%i jugadores)', (n) => {
    const checksums = new Set([1, 2, 3, 4, 5].map((s) => checksum(generateMap(s, n).map)));
    expect(checksums.size).toBeGreaterThan(1);
  });

  it.each(COUNTS)('todos los sectores tienen el mismo inventario (%i jugadores)', (n) => {
    for (const seed of [1, 77, 4242]) {
      const { map } = generateMap(seed, n);
      const perSector = new Map<number, Record<string, number>>();

      for (const region of map.regions) {
        if (region.sector < 0) continue;
        const tally = perSector.get(region.sector) ?? {};
        tally[region.kind] = (tally[region.kind] ?? 0) + 1;
        perSector.set(region.sector, tally);
      }

      const signatures = [...perSector.values()].map((tally) =>
        Object.entries(tally).sort().map(([k, v]) => `${k}=${v}`).join(','),
      );
      // Equidad por construcción: mismo contenido en todos los sectores, siempre.
      expect(new Set(signatures).size).toBe(1);
    }
  });

  it.each(COUNTS)('hay exactamente 3 yacimientos por sector (%i jugadores)', (n) => {
    const { map } = generateMap(999, n);
    for (let sector = 0; sector < n; sector++) {
      const seams = map.regions.filter((r) => r.sector === sector && r.kind === 'seam');
      expect(seams).toHaveLength(SECTOR_SPEC[n].terrainBag.seam);
    }
  });

  it.each(COUNTS)('ningún yacimiento es adyacente a un Bastión (%i jugadores)', (n) => {
    for (const seed of [3, 31, 314, 3141]) {
      const { map } = generateMap(seed, n);
      const adjacency = buildAdjacency(map.regions.length, map.edges);
      for (const bastion of map.bastions) {
        for (const neighbour of adjacency[bastion] as readonly RegionId[]) {
          expect(map.regions[neighbour]?.kind).not.toBe('seam');
        }
      }
    }
  });

  it.each(COUNTS)('hay un solo Núcleo y n Bastiones (%i jugadores)', (n) => {
    const { map } = generateMap(7, n);
    expect(map.regions.filter((r) => r.kind === 'core')).toHaveLength(1);
    expect(map.regions.filter((r) => r.kind === 'bastion')).toHaveLength(n);
    expect(map.bastions).toHaveLength(n);
  });

  it('barrido de 300 semillas: siempre conexo y bien formado', () => {
    for (const n of COUNTS) {
      for (let seed = 0; seed < 100; seed++) {
        const { map } = generateMap(seed, n);
        const adjacency = buildAdjacency(map.regions.length, map.edges);
        const distances = bfsDistances(adjacency, map.bastions[0] as RegionId);
        expect(distances.every(Number.isFinite)).toBe(true);
        expect(map.regions).toHaveLength(mapSize(n));
      }
    }
  });

  it('las posiciones no se solapan', () => {
    for (const n of COUNTS) {
      const { map } = generateMap(42, n);
      const radius = 32;
      for (let i = 0; i < map.regions.length; i++) {
        for (let j = i + 1; j < map.regions.length; j++) {
          const a = map.regions[i]!;
          const b = map.regions[j]!;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          expect(distance).toBeGreaterThan(radius * 2 * 0.95);
        }
      }
    }
  });
});
