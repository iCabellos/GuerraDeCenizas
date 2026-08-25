/**
 * Especificación de los sectores. Ver docs/MAP_GENERATION.md §2 y
 * docs/RTS_ZONES_REFACTOR.md §2.
 *
 * Un mapa es: 1 Núcleo + n sectores IDÉNTICOS obtenidos por rotación C_n.
 * Aquí solo se declara la forma de UN sector; la simetría la garantiza `skeleton.ts`.
 *
 * Desde el refactor RTS el sector tiene **7 anillos repartidos en tres zonas**
 * ([ADR-041](../../../docs/DECISIONS.md)). La zona es una función del anillo, y esa es
 * toda la razón por la que la equidad exacta no cuesta nada: la rotación C_n mapea
 * `(sector, anillo, slot) → (sector+k, anillo, slot)`, conserva el anillo y por tanto
 * conserva la zona.
 *
 * Los tamaños de anillo son **monótonos crecientes** hacia el exterior: si un anillo
 * exterior tuviera menos nodos que uno interior, la disposición radial desperdiciaría
 * espacio y quedaría visualmente confusa.
 */

import type { MaterialId, PlayerCount, TerrainKind, Zone } from '../types/index';

type Decorable = Exclude<TerrainKind, 'bastion' | 'core'>;

export interface SectorSpec {
  /** Nodos por anillo dentro de UN sector, del interior al exterior. */
  rings: readonly number[];
  /** Índice del anillo donde está el Bastión (siempre el exterior). */
  bastionRing: number;
  /** Zona de cada anillo. Misma longitud que `rings`, de dentro a fuera. */
  zoneByRing: readonly Zone[];
  /** Multiconjunto FIJO de terrenos **por zona**, sin contar el Bastión. */
  terrainBag: Readonly<Record<Zone, Readonly<Record<Decorable, number>>>>;
  /** Menas por zona y material. El grado lo fija la zona. */
  veinBag: Readonly<Record<Zone, Readonly<Record<MaterialId, number>>>>;
}

/**
 * Reparto de Menas, y por qué es simétrico.
 *
 * Bajo rotación C_n **no puede haber asimetría de materiales entre jugadores**: todo
 * sector es idéntico por construcción, y eso es precisamente la garantía que no se
 * toca. El eje de comercio no sale de darle más Mineral a uno que a otro, sino de que
 * todos tengan **lo mismo y les falte lo mismo**:
 *
 *   · Tu Solar es rico en Mineral y pobre en Brasa.
 *   · La Brasa vive en la Marca y en la Corona, o sea fuera de casa.
 *   · La Brasa es lo que piden las Políticas y los grados de Fuego y Cielo.
 *
 * Resultado: la escasez es compartida y empuja a todo el mundo hacia la Marca, que es
 * donde el juego quiere que se encuentren. La asimetría real aparece después, y es
 * emergente: quién acabó controlando qué hexágono de la Marca.
 */
const VEINS = {
  1: { ore: 4, ember: 2 },
  2: { ore: 2, ember: 4 },
  3: { ore: 1, ember: 1 },
} as const;

/** Grado de las Menas según la zona. La Corona es el triple de rica por hexágono. */
export const VEIN_GRADE: Readonly<Record<Zone, 1 | 2 | 3>> = { 1: 1, 2: 2, 3: 3 };

export const SECTOR_SPEC: Readonly<Record<PlayerCount, SectorSpec>> = {
  2: {
    rings: [4, 5, 6, 8, 9, 10, 12],
    bastionRing: 6,
    zoneByRing: [3, 2, 2, 2, 1, 1, 1],
    terrainBag: {
      3: { seam: 2, urban: 0, high: 2, water: 0, forest: 0, plain: 0 },
      2: { seam: 3, urban: 3, high: 3, water: 1, forest: 4, plain: 5 },
      1: { seam: 2, urban: 4, high: 3, water: 2, forest: 6, plain: 13 },
    },
    veinBag: VEINS,
  },
  3: {
    rings: [3, 5, 6, 8, 9, 10, 13],
    bastionRing: 6,
    zoneByRing: [3, 2, 2, 2, 1, 1, 1],
    terrainBag: {
      3: { seam: 2, urban: 0, high: 1, water: 0, forest: 0, plain: 0 },
      2: { seam: 3, urban: 3, high: 3, water: 1, forest: 4, plain: 5 },
      1: { seam: 2, urban: 4, high: 4, water: 2, forest: 6, plain: 13 },
    },
    veinBag: VEINS,
  },
  5: {
    rings: [3, 4, 6, 8, 9, 11, 13],
    bastionRing: 6,
    zoneByRing: [3, 2, 2, 2, 1, 1, 1],
    terrainBag: {
      3: { seam: 2, urban: 0, high: 1, water: 0, forest: 0, plain: 0 },
      2: { seam: 3, urban: 3, high: 3, water: 1, forest: 4, plain: 4 },
      1: { seam: 2, urban: 4, high: 4, water: 2, forest: 6, plain: 14 },
    },
    veinBag: VEINS,
  },
} as const;

/** Zona de un anillo. `ring < 0` es el Núcleo, que está en la Corona. */
export function zoneOfRing(players: PlayerCount, ring: number): Zone {
  if (ring < 0) return 3;
  return SECTOR_SPEC[players].zoneByRing[ring] as Zone;
}

/** Anillos que pertenecen a una zona, de dentro a fuera. */
export function ringsOfZone(players: PlayerCount, zone: Zone): number[] {
  const spec = SECTOR_SPEC[players];
  const out: number[] = [];
  spec.zoneByRing.forEach((z, ring) => {
    if (z === zone) out.push(ring);
  });
  return out;
}

/** Nodos por sector, incluido el Bastión. */
export function sectorSize(players: PlayerCount): number {
  return SECTOR_SPEC[players].rings.reduce((a, b) => a + b, 0);
}

/** Nodos de UN sector dentro de una zona, incluido el Bastión si cae ahí. */
export function zoneSize(players: PlayerCount, zone: Zone): number {
  const spec = SECTOR_SPEC[players];
  return ringsOfZone(players, zone).reduce((a, r) => a + (spec.rings[r] as number), 0);
}

/** Regiones totales del mapa: n sectores + el Núcleo. */
export function mapSize(players: PlayerCount): number {
  return players * sectorSize(players) + 1;
}

/**
 * La «parte justa» de un asiento a efectos de rendimiento decreciente.
 *
 * Es el **Solar**, no el sector entero: tu casa es lo que te toca por construcción, y
 * expandirte más allá de ella es justo la frontera donde el juego quiere que te lo
 * pienses. Con el mapa antiguo las dos cosas coincidían; ahora no, y usar el sector
 * entero regalaría toda la Marca sin penalización.
 */
export function fairShare(players: PlayerCount): number {
  return zoneSize(players, 1);
}

/** Posición del Bastión dentro de su anillo. Centrada, para que el sector sea simétrico. */
export function bastionSlot(players: PlayerCount): number {
  const spec = SECTOR_SPEC[players];
  const size = spec.rings[spec.bastionRing] as number;
  return Math.floor((size - 1) / 2);
}

/**
 * Pares de anillos que un Cerco separa, de fuera hacia dentro.
 * Con `zoneByRing = [3,2,2,2,1,1,1]` salen dos: 3↔4 (Solar→Marca) y 0↔1 (Marca→Corona).
 */
export function wardBoundaries(players: PlayerCount): { outerRing: number; innerRing: number }[] {
  const spec = SECTOR_SPEC[players];
  const out: { outerRing: number; innerRing: number }[] = [];
  for (let r = 0; r < spec.zoneByRing.length - 1; r++) {
    if (spec.zoneByRing[r] !== spec.zoneByRing[r + 1]) {
      out.push({ outerRing: r + 1, innerRing: r });
    }
  }
  return out.sort((a, b) => b.outerRing - a.outerRing);
}

/** Comprobación de coherencia: cada bolsa debe llenar su zona exactamente. */
export function assertSpecConsistency(players: PlayerCount): void {
  const spec = SECTOR_SPEC[players];

  if (spec.zoneByRing.length !== spec.rings.length) {
    throw new Error(`SECTOR_SPEC[${players}]: zoneByRing y rings deben medir lo mismo`);
  }
  for (let r = 1; r < spec.rings.length; r++) {
    if ((spec.rings[r] as number) < (spec.rings[r - 1] as number)) {
      throw new Error(`SECTOR_SPEC[${players}]: los anillos deben crecer hacia fuera`);
    }
  }
  // Las zonas son BANDAS contiguas de dentro a fuera: 3…3 2…2 1…1. Si se entrelazaran,
  // `zoneOfRing` seguiría funcionando pero el mapa dejaría de tener fronteras.
  const seen: Zone[] = [];
  for (const zone of spec.zoneByRing) {
    if (seen[seen.length - 1] !== zone) {
      if (seen.includes(zone)) {
        throw new Error(`SECTOR_SPEC[${players}]: la zona ${zone} aparece en dos bandas`);
      }
      seen.push(zone);
    }
  }
  if (seen.join(',') !== '3,2,1') {
    throw new Error(`SECTOR_SPEC[${players}]: las bandas deben ir 3,2,1 de dentro a fuera`);
  }

  const bastionZone = zoneOfRing(players, spec.bastionRing);
  if (bastionZone !== 1) {
    throw new Error(`SECTOR_SPEC[${players}]: el Bastión tiene que estar en el Solar`);
  }

  for (const zone of [1, 2, 3] as Zone[]) {
    const decorable = zoneSize(players, zone) - (zone === bastionZone ? 1 : 0);
    const bag = Object.values(spec.terrainBag[zone]).reduce((a, b) => a + b, 0);
    if (bag !== decorable) {
      throw new Error(
        `SECTOR_SPEC[${players}]: la bolsa de la zona ${zone} suma ${bag} y hay ${decorable} nodos`,
      );
    }
    const veins = Object.values(spec.veinBag[zone]).reduce((a, b) => a + b, 0);
    if (veins > decorable) {
      throw new Error(
        `SECTOR_SPEC[${players}]: la zona ${zone} pide ${veins} Menas y solo tiene ${decorable} nodos`,
      );
    }
  }
}
