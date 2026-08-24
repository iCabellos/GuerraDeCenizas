/**
 * Generación del mapa: decoración de UN sector y replicación por rotación.
 *
 * La equidad no se busca ni se mide: se obtiene por construcción. Se decora un único
 * sector y se copia a los demás mediante `rotate`, así que todos los sectores tienen
 * exactamente el mismo contenido y la misma forma.
 *
 * v0.1 implementa los pasos 1–2 de la tubería de docs/MAP_GENERATION.md §3.
 * Los pasos 3–5 (rotación de perfiles económicos, perturbación acotada y evaluación de
 * equidad) llegan en v0.8, cuando exista el simulador que los calibre.
 */

import type { GameMap, PlayerCount, Region, RegionId, TerrainKind } from '../types/index';
import { Rng } from '../rng/index';
import { buildAdjacency, buildSkeleton, type Skeleton } from './skeleton';
import { SECTOR_SPEC, assertSpecConsistency, bastionSlot } from './spec';

export const MAPGEN_VERSION = '0.3.0';

export interface GeneratedMap {
  map: GameMap;
  seed: number;
  mapgenVersion: string;
  /** Cursor del PRNG tras generar. Se guarda en el estado. */
  rngCursor: number;
}

type DecorableTerrain = Exclude<TerrainKind, 'bastion' | 'core'>;

export function generateMap(seed: number, players: PlayerCount): GeneratedMap {
  assertSpecConsistency(players);

  const skeleton = buildSkeleton(players);
  const rng = new Rng(seed);
  const spec = SECTOR_SPEC[players];
  const bastionK = bastionSlot(players);

  // Slots decorables de un sector, en orden fijo (anillo, después posición).
  const slots: { ring: number; slot: number }[] = [];
  for (let r = 0; r < spec.rings.length; r++) {
    for (let k = 0; k < (spec.rings[r] as number); k++) {
      if (r === spec.bastionRing && k === bastionK) continue;
      slots.push({ ring: r, slot: k });
    }
  }

  const assignment = decorateSector(rng, players, slots, skeleton);

  // Replicar por rotación: el sector 0 decorado se copia a todos los demás.
  const kinds = new Array<TerrainKind>(skeleton.nodes.length).fill('plain');
  kinds[skeleton.coreId] = 'core';
  for (const bastion of skeleton.bastions) kinds[bastion] = 'bastion';

  for (const [slotKey, terrain] of assignment) {
    const [ring, slot] = slotKey.split(':').map(Number) as [number, number];
    const sourceId = nodeIdAt(skeleton, 0, ring, slot);
    for (let s = 0; s < players; s++) kinds[skeleton.rotate(sourceId, s)] = terrain;
  }

  const regions: Region[] = skeleton.nodes.map((node) => ({
    id: node.id,
    kind: kinds[node.id] as TerrainKind,
    sector: node.sector,
    ring: node.ring,
    slot: node.slot,
    x: node.x,
    y: node.y,
  }));

  return {
    map: {
      regions,
      edges: skeleton.edges,
      coreId: skeleton.coreId,
      bastions: skeleton.bastions,
      extent: skeleton.extent,
    },
    seed,
    mapgenVersion: MAPGEN_VERSION,
    rngCursor: rng.cursor,
  };
}

/**
 * Decora un sector respetando restricciones locales.
 *
 * El multiconjunto de terrenos es **fijo** (`spec.terrainBag`): lo que varía entre
 * semillas es la disposición, nunca el inventario. Dos mapas distintos son igual de
 * ricos — condición necesaria para que la equidad se mantenga sin tener que medirla.
 */
function decorateSector(
  rng: Rng,
  players: PlayerCount,
  slots: readonly { ring: number; slot: number }[],
  skeleton: Skeleton,
): Map<string, DecorableTerrain> {
  const spec = SECTOR_SPEC[players];
  const adjacency = buildAdjacency(skeleton.nodes.length, skeleton.edges);
  const bastionId = skeleton.bastions[0] as RegionId;
  const bastionNeighbours = new Set(adjacency[bastionId] as readonly RegionId[]);

  const bag: DecorableTerrain[] = [];
  for (const [terrain, count] of Object.entries(spec.terrainBag).sort()) {
    for (let i = 0; i < (count as number); i++) bag.push(terrain as DecorableTerrain);
  }

  const assigned = new Map<string, DecorableTerrain>();
  const byNode = new Map<RegionId, DecorableTerrain>();
  let pool = rng.shuffle(bag);

  for (const { ring, slot } of slots) {
    const nodeId = nodeIdAt(skeleton, 0, ring, slot);

    let chosen = -1;
    for (let i = 0; i < pool.length; i++) {
      if (isCompatible(pool[i] as DecorableTerrain, nodeId, ring, spec.rings.length)) {
        chosen = i;
        break;
      }
    }
    // Si ninguna encaja, se relaja: el inventario debe colocarse entero. Preferimos un
    // mapa levemente subóptimo a uno con menos recursos de los que le tocan.
    if (chosen < 0) chosen = 0;

    const terrain = pool[chosen] as DecorableTerrain;
    pool = [...pool.slice(0, chosen), ...pool.slice(chosen + 1)];
    assigned.set(`${ring}:${slot}`, terrain);
    byNode.set(nodeId, terrain);
  }

  return assigned;

  function isCompatible(
    terrain: DecorableTerrain,
    nodeId: RegionId,
    ring: number,
    ringCount: number,
  ): boolean {
    const neighbours = adjacency[nodeId] as readonly RegionId[];

    // Un yacimiento pegado al Bastión sería Ceniza gratis e indefendible por el rival.
    if (terrain === 'seam') {
      if (bastionNeighbours.has(nodeId)) return false;
      // Los yacimientos viven en los anillos interior y medio: deben ser disputables.
      if (ring >= ringCount - 1) return false;
    }

    // Dos aguas adyacentes partirían el sector en dos y romperían la conectividad útil.
    if (terrain === 'water') {
      for (const n of neighbours) if (byNode.get(n) === 'water') return false;
    }

    return true;
  }
}

function nodeIdAt(skeleton: Skeleton, sector: number, ring: number, slot: number): RegionId {
  const found = skeleton.nodes.find(
    (n) => n.sector === sector && n.ring === ring && n.slot === slot,
  );
  if (!found) throw new Error(`nodo inexistente: sector ${sector}, anillo ${ring}, slot ${slot}`);
  return found.id;
}
