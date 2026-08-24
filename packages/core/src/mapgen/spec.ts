/**
 * Especificación de los sectores. Ver docs/MAP_GENERATION.md §2.
 *
 * Un mapa es: 1 Núcleo + n sectores IDÉNTICOS obtenidos por rotación C_n.
 * Aquí solo se declara la forma de UN sector; la simetría la garantiza `skeleton.ts`.
 *
 * Los tamaños de anillo son **monótonos crecientes** hacia el exterior: si un anillo
 * exterior tuviera menos nodos que uno interior, la disposición radial desperdiciaría
 * espacio y quedaría visualmente confusa.
 */

import type { PlayerCount, TerrainKind } from '../types/index';

export interface SectorSpec {
  /** Nodos por anillo dentro de UN sector, del interior al exterior. */
  rings: readonly number[];
  /** Índice del anillo donde está el Bastión (siempre el exterior). */
  bastionRing: number;
  /** Multiconjunto FIJO de terrenos del sector, sin contar el Bastión. */
  terrainBag: Readonly<Record<Exclude<TerrainKind, 'bastion' | 'core'>, number>>;
}

/**
 * Los recuentos de anillo **no son de estilo: son geometría**.
 *
 * Cada provincia se dibuja como un hexágono regular del mismo tamaño
 * ([ADR-046](../../../../docs/DECISIONS.md#adr-046)), y para que hexágonos iguales quepan
 * unos junto a otros hace falta que **todos los vecinos estén a la misma distancia**. En
 * una disposición por anillos eso ata el número de nodos de un anillo a su radio: el paso
 * dentro del anillo es `2πρ/n`, así que `n` crece con `ρ` o el paso se dispara.
 *
 * Estos recuentos, con los radios de `RING_RADII` en `skeleton.ts`, salen de una búsqueda
 * que minimiza la dispersión de la distancia entre vecinos. Fija ×1,16 a dos y tres
 * jugadores y ×1,23 a cinco; con los valores anteriores era ×2,34, ×1,78 y ×2,41, y con
 * esa horquilla no hay hexágono igual que no se solape con alguno de sus vecinos.
 *
 * **Si tocas un recuento, toca su radio y vuelve a medir.** Los dos van juntos.
 */
export const SECTOR_SPEC: Readonly<Record<PlayerCount, SectorSpec>> = {
  2: {
    rings: [3, 6, 9, 11],
    bastionRing: 3,
    terrainBag: { seam: 4, urban: 4, high: 4, water: 2, forest: 4, plain: 10 },
  },
  3: {
    rings: [2, 4, 6, 8],
    bastionRing: 3,
    terrainBag: { seam: 3, urban: 3, high: 3, water: 1, forest: 4, plain: 5 },
  },
  5: {
    rings: [1, 2, 3, 5, 6],
    bastionRing: 4,
    terrainBag: { seam: 3, urban: 3, high: 2, water: 1, forest: 3, plain: 4 },
  },
} as const;

/** Nodos por sector, incluido el Bastión. */
export function sectorSize(players: PlayerCount): number {
  return SECTOR_SPEC[players].rings.reduce((a, b) => a + b, 0);
}

/** Regiones totales del mapa: n sectores + el Núcleo. */
export function mapSize(players: PlayerCount): number {
  return players * sectorSize(players) + 1;
}

/** Posición del Bastión dentro de su anillo. Centrada, para que el sector sea simétrico. */
export function bastionSlot(players: PlayerCount): number {
  const spec = SECTOR_SPEC[players];
  const size = spec.rings[spec.bastionRing] as number;
  return Math.floor((size - 1) / 2);
}

/** Comprobación de coherencia: la bolsa de terrenos debe llenar el sector exactamente. */
export function assertSpecConsistency(players: PlayerCount): void {
  const spec = SECTOR_SPEC[players];
  const decorable = sectorSize(players) - 1; // el Bastión no se decora
  const bagTotal = Object.values(spec.terrainBag).reduce((a, b) => a + b, 0);
  if (bagTotal !== decorable) {
    throw new Error(
      `SECTOR_SPEC[${players}]: la bolsa suma ${bagTotal} y hay ${decorable} nodos decorables`,
    );
  }
  for (let r = 1; r < spec.rings.length; r++) {
    if ((spec.rings[r] as number) < (spec.rings[r - 1] as number)) {
      throw new Error(`SECTOR_SPEC[${players}]: los anillos deben crecer hacia fuera`);
    }
  }
}
