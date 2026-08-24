/**
 * Zonas, Cercos y Puertas.
 *
 * El test que importa de este archivo es **«el Núcleo es inalcanzable ignorando las
 * aristas de Cerco»**. Convierte la forma del juego en una propiedad comprobable en vez
 * de una intención escrita en un documento: si algún día alguien añade una arista que
 * se salte una zona, el diseño entero se cae y nadie se entera hasta jugarlo.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerCount, RegionId, Zone } from '../src/types/index';
import { generateMap } from '../src/mapgen/generate';
import { buildAdjacency } from '../src/mapgen/skeleton';
import {
  SECTOR_SPEC, fairShare, mapSize, sectorSize, zoneOfRing, zoneSize,
} from '../src/mapgen/spec';
import { actOfTurn, buildWardIndex, canCross, reachableFrom } from '../src/rules/zones';
import { createGame } from '../src/rules/setup';
import { BALANCE } from '../src/balance/constants';

const COUNTS: PlayerCount[] = [2, 3, 5];
const SEEDS = [1, 42, 777, 20260824];

describe('la zona es una función del anillo', () => {
  it.each(COUNTS)('toda región tiene zona, el Núcleo incluido (%i jugadores)', (n) => {
    const { map } = generateMap(11, n);
    for (const region of map.regions) {
      expect([1, 2, 3]).toContain(region.zone);
      expect(region.zone).toBe(zoneOfRing(n, region.ring));
    }
    expect(map.regions[map.coreId]?.zone).toBe(3);
  });

  it.each(COUNTS)('las bandas van 3, 2, 1 de dentro a fuera (%i jugadores)', (n) => {
    const bands = SECTOR_SPEC[n].zoneByRing;
    expect([...new Set(bands)]).toEqual([3, 2, 1]);
    // Contiguas: una zona no puede reaparecer después de otra.
    expect(bands.join('')).toBe(bands.slice().sort((a, b) => b - a).join(''));
  });

  it.each(COUNTS)('el mapa es mucho mayor que el de v0.2 (%i jugadores)', (n) => {
    // v0.2: 45, 55 y 96 regiones. El refactor pide «mucho más grande», y eso es un
    // número, no una sensación.
    expect(mapSize(n)).toBeGreaterThan(100);
    expect(sectorSize(n)).toBe(zoneSize(n, 1) + zoneSize(n, 2) + zoneSize(n, 3));
  });

  it('la parte justa es el Solar, no el sector entero', () => {
    // Si fuera el sector, toda la Marca vendría sin penalización de renta — y la Marca
    // es justo lo que tiene que costar.
    expect(fairShare(5)).toBe(zoneSize(5, 1));
    expect(fairShare(5)).toBeLessThan(sectorSize(5));
  });
});

describe('los Cercos cierran el mapa de verdad', () => {
  it.each(COUNTS)('toda arista entre zonas distintas es un Cerco (%i jugadores)', (n) => {
    const { map } = generateMap(5, n);
    for (const edge of map.edges) {
      const a = map.regions[edge.a]?.zone as Zone;
      const b = map.regions[edge.b]?.zone as Zone;
      expect(Boolean(edge.ward)).toBe(a !== b);
    }
  });

  it.each(COUNTS)('el Núcleo es INALCANZABLE con los Cercos cerrados (%i jugadores)', (n) => {
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      const adjacency = buildAdjacency(map.regions.length, map.edges);
      const closed = map.gates.map(() => false);

      for (const bastion of map.bastions) {
        const reachable = reachableFrom(map, adjacency, closed, bastion);
        expect(reachable.has(map.coreId)).toBe(false);
        // Y ni siquiera se llega a la Marca: el acto I es el Solar y nada más.
        for (const regionId of reachable) {
          expect(map.regions[regionId]?.zone).toBe(1);
        }
      }
    }
  });

  it('abrir las Puertas de un Cerco abre el paso, y solo ese', () => {
    const { map } = generateMap(99, 5);
    const adjacency = buildAdjacency(map.regions.length, map.edges);
    const bastion = map.bastions[0] as RegionId;

    // Solo los Cercos 1→2.
    const open = map.gates.map((g) => g.from === 1);
    const reachable = reachableFrom(map, adjacency, open, bastion);

    expect([...reachable].some((r) => map.regions[r]?.zone === 2)).toBe(true);
    expect(reachable.has(map.coreId)).toBe(false);
  });

  it('una Puerta abierta no se puede volver a cerrar desde el estado', () => {
    const state = createGame({
      gameId: 'z', seed: 4, players: 5,
      seats: Array.from({ length: 5 }, (_, i) => ({
        name: `P${i}`,
        factionId: (['koldvik', 'vantera', 'saranth', 'meridia', 'oshara'] as const)[i]!,
      })),
    }).state;
    expect(state.gatesOpen.every((open) => !open)).toBe(true);
    expect(state.colossi.every((c) => c.alive)).toBe(true);
  });
});

describe('las Puertas se reparten por rotación, como todo lo demás', () => {
  it.each(COUNTS)('hay una Puerta por sector y Cerco (%i jugadores)', (n) => {
    const { map } = generateMap(31, n);
    const perWard = new Map<string, number>();
    for (const gate of map.gates) {
      const key = `${gate.from}->${gate.to}`;
      perWard.set(key, (perWard.get(key) ?? 0) + 1);
    }
    expect([...perWard.values()]).toEqual([n * BALANCE.zones.gatesPerSector, n * BALANCE.zones.gatesPerSector]);
    expect(map.gates).toHaveLength(2 * n * BALANCE.zones.gatesPerSector);
  });

  it.each(COUNTS)('el Coloso está SIEMPRE del lado de fuera (%i jugadores)', (n) => {
    // Del lado de dentro viviría al otro lado de un Cerco sellado: nadie podría
    // llegar a él, nadie podría matarlo y la partida sería imposible de ganar.
    const { map } = generateMap(17, n);
    const adjacency = buildAdjacency(map.regions.length, map.edges);
    const closed = map.gates.map(() => false);

    for (const gate of map.gates) {
      const guardZone = map.regions[gate.outer]?.zone as Zone;
      expect(guardZone).toBe(gate.from);
      expect(map.regions[gate.inner]?.zone).toBe(gate.to);
    }

    // Y el del primer Cerco tiene que ser alcanzable desde un Bastión sin abrir nada.
    const firstWard = map.gates.filter((g) => g.from === 1);
    for (const bastion of map.bastions) {
      const reachable = reachableFrom(map, adjacency, closed, bastion);
      expect(firstWard.some((g) => reachable.has(g.outer))).toBe(true);
    }
  });

  it.each(COUNTS)('ninguna Puerta cae sobre agua (%i jugadores)', (n) => {
    // Sin Puente solo Cielo cruza el agua, y Cielo no captura: un Coloso sobre agua
    // sería un Coloso al que la Línea no puede llegar.
    for (const seed of SEEDS) {
      const { map } = generateMap(seed, n);
      for (const gate of map.gates) {
        expect(map.regions[gate.outer]?.kind).not.toBe('water');
        expect(map.regions[gate.inner]?.kind).not.toBe('water');
      }
    }
  });
});

describe('canCross responde solo por el Cerco', () => {
  it('una arista normal se cruza siempre; un Cerco solo con su Puerta abierta', () => {
    const { map } = generateMap(8, 5);
    const index = buildWardIndex(map);
    const closed = map.gates.map(() => false);

    const plain = map.edges.find((e) => !e.ward)!;
    expect(canCross(index, closed, plain.a, plain.b)).toBe(true);

    const gate = map.gates[0]!;
    expect(canCross(index, closed, gate.outer, gate.inner)).toBe(false);

    const open = closed.slice();
    open[gate.id] = true;
    expect(canCross(index, open, gate.outer, gate.inner)).toBe(true);

    // Un Cerco que NO es Puerta no se abre ni con todas las Puertas abiertas.
    const wardNoGate = map.edges.find(
      (e) => e.ward && !map.gates.some((g) =>
        (g.inner === e.a && g.outer === e.b) || (g.inner === e.b && g.outer === e.a)),
    );
    if (wardNoGate) {
      expect(canCross(index, map.gates.map(() => true), wardNoGate.a, wardNoGate.b)).toBe(false);
    }
  });
});

describe('los actos', () => {
  it('derivan del turno y cubren la campaña entera', () => {
    expect(actOfTurn(1)).toBe(1);
    expect(actOfTurn(BALANCE.campaign.actEnds[0] as number)).toBe(1);
    expect(actOfTurn((BALANCE.campaign.actEnds[0] as number) + 1)).toBe(2);
    expect(actOfTurn(BALANCE.campaign.actEnds[1] as number)).toBe(2);
    expect(actOfTurn((BALANCE.campaign.actEnds[1] as number) + 1)).toBe(3);
    expect(actOfTurn(BALANCE.campaign.turns)).toBe(3);
  });
});
