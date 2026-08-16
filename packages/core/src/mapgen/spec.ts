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

export const SECTOR_SPEC: Readonly<Record<PlayerCount, SectorSpec>> = {
  2: {
    rings: [4, 5, 6, 7],
    bastionRing: 3,
    terrainBag: { seam: 3, urban: 3, high: 3, water: 2, forest: 3, plain: 7 },
  },
  3: {
    rings: [3, 4, 5, 6],
    bastionRing: 3,
    terrainBag: { seam: 3, urban: 3, high: 2, water: 1, forest: 3, plain: 5 },
  },
  5: {
    rings: [3, 4, 6, 6],
    bastionRing: 3,
    terrainBag: { seam: 3, urban: 3, high: 3, water: 1, forest: 3, plain: 5 },
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
