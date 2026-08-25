/**
 * Generación del mapa: decoración de UN sector y replicación por rotación.
 *
 * La equidad no se busca ni se mide: se obtiene por construcción. Se decora un único
 * sector y se copia a los demás mediante `rotate`, así que todos los sectores tienen
 * exactamente el mismo contenido y la misma forma.
 *
 * Desde el refactor RTS la decoración es **por zona** ([ADR-041]): cada zona tiene su
 * propia bolsa de terrenos y su propia bolsa de Menas. La rotación conserva el anillo,
 * luego conserva la zona, luego la equidad sigue siendo exacta sin comprobar nada.
 *
 * v0.1 implementa los pasos 1–2 de la tubería de docs/MAP_GENERATION.md §3.
 * Los pasos 3–5 (rotación de perfiles económicos, perturbación acotada y evaluación de
 * equidad) llegan en v0.8, cuando exista el simulador que los calibre.
 */

import type {
  GameMap, MaterialId, PlayerCount, Region, RegionId, TerrainKind, Vein, Zone,
} from '../types/index';
import { Rng } from '../rng/index';
import { buildAdjacency, buildSkeleton, type Skeleton, type SkeletonNode } from './skeleton';
import { SECTOR_SPEC, VEIN_GRADE, assertSpecConsistency, bastionSlot, zoneOfRing } from './spec';

/** Sube cuando la misma semilla deja de dar el mismo mapa. Zonas, Cercos y Menas. */
export const MAPGEN_VERSION = '0.2.0';

export interface GeneratedMap {
  map: GameMap;
  seed: number;
  mapgenVersion: string;
  /** Cursor del PRNG tras generar. Se guarda en el estado. */
  rngCursor: number;
}

type DecorableTerrain = Exclude<TerrainKind, 'bastion' | 'core'>;

interface SectorSlot {
  ring: number;
  slot: number;
  zone: Zone;
  nodeId: RegionId;
}

export function generateMap(seed: number, players: PlayerCount): GeneratedMap {
  assertSpecConsistency(players);

  const skeleton = buildSkeleton(players);
  const rng = new Rng(seed);
  const spec = SECTOR_SPEC[players];
  const bastionK = bastionSlot(players);

  // Slots decorables de un sector, en orden fijo (anillo, después posición).
  const slots: SectorSlot[] = [];
  for (let r = 0; r < spec.rings.length; r++) {
    for (let k = 0; k < (spec.rings[r] as number); k++) {
      if (r === spec.bastionRing && k === bastionK) continue;
      slots.push({ ring: r, slot: k, zone: zoneOfRing(players, r), nodeId: nodeIdAt(skeleton, 0, r, k) });
    }
  }

  const terrain = decorateSector(rng, players, slots, skeleton, gateSlotsOf(skeleton));
  const veinsBySlot = seedVeins(rng, players, slots, terrain);

  // Replicar por rotación: el sector 0 decorado se copia a todos los demás.
  const kinds = new Array<TerrainKind>(skeleton.nodes.length).fill('plain');
  kinds[skeleton.coreId] = 'core';
  for (const bastion of skeleton.bastions) kinds[bastion] = 'bastion';

  for (const slot of slots) {
    const kind = terrain.get(slot.nodeId);
    if (!kind) continue;
    for (let s = 0; s < players; s++) kinds[skeleton.rotate(slot.nodeId, s)] = kind;
  }

  const veins: Vein[] = [];

  // ── Toda ciudad se funda sobre una veta ──────────────────────────────────────
  //
  // Cada Bastión lleva su propia Mena de Mineral, y no es color local: sin ella el
  // juego tiene una trampa de arranque de la que no se sale. El material solo se saca
  // con Extractoras, las Extractoras cuestan material, y quien gaste su capital inicial
  // en otra cosa **se queda sin economía para el resto de la partida**. Se comprobó
  // jugando: 24 turnos, cinco bots, cero Extractoras y cero material.
  //
  // El Bastión es además el único sitio donde esto se puede poner sin abrir un agujero,
  // porque un Bastión no se captura nunca ([ADR-013]): el suelo de la economía no se
  // puede perder, solo se puede desperdiciar.
  for (const bastion of skeleton.bastions) {
    veins.push({ regionId: bastion, material: 'ore', grade: 1 });
  }

  for (const slot of slots) {
    const material = veinsBySlot.get(slot.nodeId);
    if (!material) continue;
    for (let s = 0; s < players; s++) {
      veins.push({
        regionId: skeleton.rotate(slot.nodeId, s),
        material,
        grade: VEIN_GRADE[slot.zone],
      });
    }
  }
  veins.sort((a, b) => a.regionId - b.regionId);

  const regions: Region[] = skeleton.nodes.map((node) => ({
    id: node.id,
    kind: kinds[node.id] as TerrainKind,
    sector: node.sector,
    ring: node.ring,
    slot: node.slot,
    zone: zoneOfRing(players, node.ring),
    x: node.x,
    y: node.y,
  }));

  return {
    map: {
      regions,
      edges: skeleton.edges,
      coreId: skeleton.coreId,
      bastions: skeleton.bastions,
      gates: skeleton.gates,
      veins,
      extent: skeleton.extent,
    },
    seed,
    mapgenVersion: MAPGEN_VERSION,
    rngCursor: rng.cursor,
  };
}

/**
 * Decora un sector respetando restricciones locales, **zona a zona**.
 *
 * El multiconjunto de terrenos es **fijo** (`spec.terrainBag[zona]`): lo que varía entre
 * semillas es la disposición, nunca el inventario. Dos mapas distintos son igual de
 * ricos — condición necesaria para que la equidad se mantenga sin tener que medirla.
 */
/**
 * Nodos de una Puerta, trasladados al sector 0.
 *
 * La decoración se hace sobre el sector 0 y se replica por rotación, así que para
 * proteger las 2·n regiones de Puerta basta con proteger sus equivalentes de aquí.
 */
function gateSlotsOf(skeleton: Skeleton): Set<RegionId> {
  const out = new Set<RegionId>();
  for (const gate of skeleton.gates) {
    for (const nodeId of [gate.inner, gate.outer]) {
      const node = skeleton.nodes[nodeId] as SkeletonNode;
      out.add(skeleton.rotate(nodeId, -node.sector));
    }
  }
  return out;
}

function decorateSector(
  rng: Rng,
  players: PlayerCount,
  slots: readonly SectorSlot[],
  skeleton: Skeleton,
  gateSlots: ReadonlySet<RegionId>,
): Map<RegionId, DecorableTerrain> {
  const spec = SECTOR_SPEC[players];
  const adjacency = buildAdjacency(skeleton.nodes.length, skeleton.edges);
  const bastionId = skeleton.bastions[0] as RegionId;
  const bastionNeighbours = new Set(adjacency[bastionId] as readonly RegionId[]);

  const byNode = new Map<RegionId, DecorableTerrain>();

  // Zona a zona, siempre en el mismo orden: el PRNG tiene que consumirse igual en
  // cualquier motor de JavaScript o el mapa dejaría de ser reproducible.
  for (const zone of [3, 2, 1] as Zone[]) {
    const bag: DecorableTerrain[] = [];
    for (const [kind, count] of Object.entries(spec.terrainBag[zone]).sort()) {
      for (let i = 0; i < (count as number); i++) bag.push(kind as DecorableTerrain);
    }
    let pool = rng.shuffle(bag);

    // Las Puertas se deciden **primero**. Son 2·n casillas de todo el mapa y la única
    // restricción que no se puede relajar: una Puerta sobre agua es una Puerta que la
    // Línea no puede cruzar, y por tanto una Puerta que no se abre nunca. Dejarlas para
    // el final las condenaba a comerse lo que sobrara de la bolsa.
    const inZone = slots.filter((s) => s.zone === zone);
    const ordered = [
      ...inZone.filter((s) => gateSlots.has(s.nodeId)),
      ...inZone.filter((s) => !gateSlots.has(s.nodeId)),
    ];

    for (const slot of ordered) {
      let chosen = -1;
      for (let i = 0; i < pool.length; i++) {
        if (isCompatible(pool[i] as DecorableTerrain, slot)) {
          chosen = i;
          break;
        }
      }
      // Si ninguna encaja, se relaja: el inventario debe colocarse entero. Preferimos un
      // mapa levemente subóptimo a uno con menos recursos de los que le tocan. Pero ni
      // relajando se pone agua en una Puerta: eso no es subóptimo, es una partida rota.
      if (chosen < 0) {
        chosen = gateSlots.has(slot.nodeId) ? pool.findIndex((k) => k !== 'water') : 0;
        if (chosen < 0) chosen = 0;
      }

      const kind = pool[chosen] as DecorableTerrain;
      pool = [...pool.slice(0, chosen), ...pool.slice(chosen + 1)];
      byNode.set(slot.nodeId, kind);
    }
  }

  return byNode;

  function isCompatible(kind: DecorableTerrain, slot: SectorSlot): boolean {
    const neighbours = adjacency[slot.nodeId] as readonly RegionId[];

    // Un yacimiento pegado al Bastión sería Ceniza gratis e indefendible por el rival.
    if (kind === 'seam' && bastionNeighbours.has(slot.nodeId)) return false;

    // Dos aguas adyacentes partirían el sector en dos y romperían la conectividad útil.
    if (kind === 'water') {
      for (const n of neighbours) if (byNode.get(n) === 'water') return false;

      // Y una Puerta NUNCA es agua. Sin Puente solo Cielo cruza el agua, y Cielo no
      // captura terreno: un Coloso sobre agua sería un Coloso al que la Línea no puede
      // llegar, y por tanto una Puerta que no se puede abrir de verdad. Lo cazó el
      // test del agua, que empezó a fallar porque una fuerza de Cielo aterrizaba
      // encima de un Coloso.
      if (gateSlots.has(slot.nodeId)) return false;
    }

    return true;
  }
}

/**
 * Siembra las Menas de un sector.
 *
 * Dos prohibiciones, y las dos son de vocabulario antes que de balance:
 *
 *  · **Nunca sobre un Yacimiento.** Un hexágono que diera Ceniza *y* material haría
 *    indistinguibles las dos cosas que el glosario existe para separar.
 *  · **Nunca sobre agua.** Una Extractora en mitad del agua no se puede defender ni
 *    explicar, y el agua ya tiene su papel: partir el mapa.
 */
function seedVeins(
  rng: Rng,
  players: PlayerCount,
  slots: readonly SectorSlot[],
  terrain: ReadonlyMap<RegionId, DecorableTerrain>,
): Map<RegionId, MaterialId> {
  const spec = SECTOR_SPEC[players];
  const out = new Map<RegionId, MaterialId>();

  for (const zone of [3, 2, 1] as Zone[]) {
    const bag: MaterialId[] = [];
    for (const [material, count] of Object.entries(spec.veinBag[zone]).sort()) {
      for (let i = 0; i < (count as number); i++) bag.push(material as MaterialId);
    }

    const candidates = slots.filter((s) => {
      if (s.zone !== zone) return false;
      const kind = terrain.get(s.nodeId);
      return kind !== undefined && kind !== 'seam' && kind !== 'water';
    });

    const order = rng.shuffle(candidates.map((c) => c.nodeId));
    const pool = rng.shuffle(bag);
    for (let i = 0; i < pool.length && i < order.length; i++) {
      out.set(order[i] as RegionId, pool[i] as MaterialId);
    }
  }

  return out;
}

function nodeIdAt(skeleton: Skeleton, sector: number, ring: number, slot: number): RegionId {
  const found = skeleton.nodes.find(
    (n: SkeletonNode) => n.sector === sector && n.ring === ring && n.slot === slot,
  );
  if (!found) throw new Error(`nodo inexistente: sector ${sector}, anillo ${ring}, slot ${slot}`);
  return found.id;
}
