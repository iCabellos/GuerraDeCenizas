// Topología del campo de batalla. Sin DOM, sin WebGL y sin estado: sólo geometría.
//
// Vive aparte del motor por una razón concreta — `engine.ts` hace `extends HTMLElement`,
// así que no se puede ni importar fuera de un navegador. Lo que hay aquí es justo lo que
// merece un test: el reparto en tres sectores idénticos por rotación es la premisa del
// juego entero. Si el mapa no es equitativo, «la diplomacia es aritmética» deja de ser
// cierto y no hay partida.
import * as THREE from 'three';

/** Terrenos del campo. Coinciden con `TerrainKind` de `@gdc/core`. */
export type Kind = 'water' | 'plain' | 'forest' | 'urban' | 'seam' | 'high' | 'bastion' | 'core';
/** Armas con presencia en el tablero. `shade` no se representa: por eso es Sombra. */
export type Arm = 'line' | 'fire' | 'sky';

export type Tile = { q: number; r: number; ring: number; kind: Kind; canon: string; sector: number };

export type MatOpts = {
  roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number;
  transparent?: boolean; opacity?: number; flat?: boolean;
};

/** La paleta es la misma que `globals.css`: un solo sitio decide el color del juego. */
export const PAL = {
  void: 0x0e0f12, panel: 0x191b20, line: 0x2a2d35, ink: 0xe8e6e1,
  ash: 0xd6cfc4, ashGlow: 0xf2ede4, rust: 0xc9683a,
  plain: 0x71844f, urban: 0x7c7a74, high: 0x9d8f74, forest: 0x3e5c3c,
  water: 0x2f6079, seam: 0x6d5c40, bastion: 0x6d8050, core: 0x6f6a63,
  seat: [0x4a7fb5, 0xc9683a, 0x6e9b54, 0x9b5fa8, 0xc4a53c],
};

/** El color de asiento nunca es el único distintivo: la silueta del arma también cambia. */
export const seatColor = (seat: number): number => PAL.seat[seat] ?? PAL.rust;

export const S = 1;                       // radio del hexágono
export const GAP = 0.955;
export const HEIGHT: Record<Kind, number> = { water: 0.14, plain: 0.34, forest: 0.38, urban: 0.44, seam: 0.4, high: 0.78, bastion: 0.62, core: 0.95 };
export const TOP: Record<Kind, number> = { water: PAL.water, plain: PAL.plain, forest: PAL.forest, urban: PAL.urban, seam: PAL.seam, high: PAL.high, bastion: PAL.bastion, core: PAL.core };

export const axialToWorld = (q: number, r: number): THREE.Vector3 => new THREE.Vector3(S * Math.sqrt(3) * (q + r / 2), 0, S * 1.5 * r);
export const rot120 = (q: number, r: number): [number, number] => [-q - r, q];
export const key = (q: number, r: number): string => `${q},${r}`;

export function hexShape(radius: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

export function hexPrism(radius: number, depth: number): THREE.ExtrudeGeometry {
  const g = new THREE.ExtrudeGeometry(hexShape(radius), {
    depth, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 3, curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, depth, 0);
  return g;
}

export const mat = (color: number, o: MatOpts = {}): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({
  color, roughness: o.roughness ?? 0.88, metalness: o.metalness ?? 0.06,
  emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1,
  transparent: o.transparent ?? false, opacity: o.opacity ?? 1, flatShading: o.flat ?? false,
});


export function boardTiles(radius: number): Tile[] {
  const tiles: Tile[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      if (Math.abs(q + r) > radius) continue;
      tiles.push({
        q, r,
        ring: Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)),
        kind: 'plain', canon: '', sector: -1,
      });
    }
  }
  const RING: Record<1 | 2 | 3, Kind[]> = {
    1: ['high', 'plain'],
    2: ['urban', 'forest', 'water', 'plain'],
    3: ['bastion', 'plain', 'forest', 'seam', 'urban', 'high'],
  };
  for (const t of tiles) {
    if (t.ring === 0) { t.kind = 'core'; continue; }
    let a: [number, number] = [t.q, t.r];
    let best = a;
    for (let i = 0; i < 2; i += 1) {
      a = rot120(a[0], a[1]);
      if (a[0] < best[0] || (a[0] === best[0] && a[1] < best[1])) best = a;
    }
    t.canon = key(best[0], best[1]);
  }
  // Sector por ROTACIÓN, no por ángulo.
  //
  // Cortar por `atan2` parece equivalente y no lo es: las casillas que caen justo sobre
  // una línea de corte se van todas al mismo lado y el reparto sale 15 / 12 / 9. Con eso
  // el tablero dibujaría un mapa desigual — justo lo contrario de lo que promete el juego.
  //
  // Cada casilla que no es el Núcleo pertenece a una órbita de tres bajo giros de 120°.
  // Su sector es cuántos giros hay que dar para llegar desde ella a su representante
  // canónico. Así los tres territorios son idénticos **por construcción**, no por suerte.
  for (const t of tiles) {
    if (t.ring === 0) { t.sector = -1; continue; }
    let [q, r] = [t.q, t.r];
    for (let turn = 0; turn < 3; turn += 1) {
      if (key(q, r) === t.canon) { t.sector = turn; break; }
      [q, r] = rot120(q, r);
    }
  }
  // índice de órbita estable por anillo, ordenado por ángulo del representante
  for (const ring of [1, 2, 3] as const) {
    const reps = [...new Set(tiles.filter((t) => t.ring === ring).map((t) => t.canon))]
      .sort((a, b) => {
        const [aq = 0, ar = 0] = a.split(',').map(Number);
        const [bq = 0, br = 0] = b.split(',').map(Number);
        const pa = axialToWorld(aq, ar); const pb = axialToWorld(bq, br);
        return Math.atan2(pa.z, pa.x) - Math.atan2(pb.z, pb.x);
      });
    const palette = RING[ring];
    for (const t of tiles.filter((x) => x.ring === ring)) {
      t.kind = palette[reps.indexOf(t.canon) % palette.length] ?? 'plain';
    }
  }
  return tiles;
}

