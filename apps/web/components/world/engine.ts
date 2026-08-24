// Motor 2.5D de Guerra de Cenizas — geometría 100 % procedural y propia.
// Un solo custom element, <gdc-world>: la Ciudad, el Campo, la Escaramuza y las
// vitrinas de assets. Cámara isométrica, hexágonos extruidos con bisel, sombras suaves.
//
// Es CAPA DE PRESENTACIÓN y nada más: no decide, no persiste y no lee estado sin
// filtrar. La superficie interactiva y anunciable sigue siendo DOM — los rótulos se
// posicionan con `_markers()` proyectando el mundo sobre elementos `[data-tile]`
// reales (ADR-034). El `Math.random()` de la ceniza es decorativo y vive aquí,
// nunca en `packages/core`.
//
// La topología del campo vive en `board.ts`, sin DOM, para poder testearla: el reparto
// en tres sectores idénticos por rotación es la premisa del juego y tiene test propio.
import * as THREE from 'three';
import {
  GAP, HEIGHT, PAL, S, TOP, axialToWorld, boardTiles, hexPrism, hexShape, key, mat,
  seatColor, type Arm, type Kind, type Tile,
} from './board';

export type { Arm, Kind } from './board';

/**
 * Una provincia de la campaña, tal y como llega del motor de reglas.
 *
 * `cell` es el polígono real que devuelve `regionCells()` de `@gdc/core`: **el mundo 3D
 * no inventa geometría**, extruye la que define la adyacencia del juego. Por eso dos
 * provincias que se tocan en relieve son exactamente las que se tocan en las reglas.
 */
export interface CampaignRegion {
  id: number;
  kind: Kind;
  /** Centro, en coordenadas del mapa (las mismas que el `viewBox` del plano). */
  x: number;
  y: number;
  cell: readonly { x: number; y: number }[];
  owner: number | null;
  /** ¿Se observa este turno? Si no, la provincia va bajo el velo de niebla. */
  seen: boolean;
  fort: number;
}

/** Marca sobre una provincia: lo que la pantalla quiere resaltar este turno. */
export type CampaignMark = 'selected' | 'reachable' | 'threat' | 'home' | 'dim';

/** Una fuerza sobre el tablero. `arm` es `null` cuando no se conoce su composición. */
export interface CampaignForce {
  regionId: number;
  seat: number;
  arm: Arm | null;
}

export interface CampaignMap {
  regions: readonly CampaignRegion[];
  forces: readonly CampaignForce[];
  /** Radio del mapa en coordenadas de región. Fija la escala del mundo. */
  extent: number;
  seat: number;
}

/** Lo que cambia turno a turno sin reconstruir el mundo. */
export interface CampaignOverlay {
  marks: Readonly<Record<number, CampaignMark>>;
  /** Flechas de órdenes: origen → destino, por identificador de región. */
  arrows: readonly { from: number; to: number; support?: boolean }[];
}

const LABEL: Record<Arm | 'shade', string> = { line: 'Línea', fire: 'Fuego', sky: 'Cielo', shade: 'Sombra' };

type Squad = {
  side: 'atk' | 'def'; arm: Arm; seat: number; count: number; max: number;
  group: THREE.Group; pieces: THREE.Group[]; dmg: number;
  home: THREE.Vector3; goal: THREE.Vector3;
};

type Skirmish = {
  t: number; phase: 'advance' | 'clash' | 'done'; log: string[]; emit: number;
  atk: Squad[]; def: Squad[];
};

/** Lo que el elemento emite en cada paso de la escaramuza. Lo pinta quien escuche. */
export type SkirmishSide = { total: number; line: number; fire: number; sky: number };

export type SkirmishDetail = {
  t: number;
  phase: Skirmish['phase'];
  /** `m:ss` transcurrido, ya formateado. */
  clock: string;
  speed: number;
  log: string[];
  atk: SkirmishSide;
  def: SkirmishSide;
  /** Qué regla domina el momento: la contra en curso o la bonificación de muralla. */
  clash: string;
  resultTitle: string;
  resultSub: string;
  done: boolean;
  won: boolean;
};

// ── Piezas ──────────────────────────────────────────────────────────────────
function tree(h: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h * 0.4, 8), mat(0x5b4c38));
  trunk.position.y = h * 0.2;
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.34, 1), mat(0x47714a, { flat: true }));
  canopy.position.y = h * 0.62;
  canopy.scale.set(1, 1.25, 1);
  g.add(trunk, canopy);
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

function building(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  body.position.y = h / 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, Math.min(h * 0.07, 0.05), d * 1.1), mat(0xc4b8a4));
  cap.position.y = h + 0.02;
  g.add(body, cap);
  g.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
  return g;
}

function tower(r: number, h: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 16), mat(color));
  body.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, h * 0.35, 16), mat(0x8f5a3e));
  roof.position.y = h + h * 0.22;
  g.add(body, roof);
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

function crystal(scale: number, emissive?: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 * scale * (1 - i * 0.22), 0),
      mat(0xe6ded0, { emissive: emissive ?? 0x9fd6e8, emissiveIntensity: 0.5, roughness: 0.3, flat: true }));
    m.position.set((i - 1) * 0.22 * scale, 0.18 * scale * (1 - i * 0.2), (i % 2) * 0.16 * scale);
    m.rotation.y = i;
    m.scale.y = 1.9;
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

function banner(colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.85, 8), mat(0x6a6f77));
  pole.position.y = 0.42;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.02), mat(colorHex, { emissive: colorHex, emissiveIntensity: 0.3 }));
  cloth.position.set(0.12, 0.6, 0);
  g.add(pole, cloth);
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

// Fuerzas: silueta distinta por arma, nunca solo color.
function unitPiece(arm: Arm | 'shade', colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.08, 20),
    mat(colorHex, { emissive: colorHex, emissiveIntensity: 0.35, roughness: 0.5 }));
  base.position.y = 0.04;
  g.add(base);
  const body = mat(colorHex, { roughness: 0.5, emissive: colorHex, emissiveIntensity: 0.3 });
  const gear = mat(0x3f4438, { roughness: 0.8 });
  const steel = mat(0x6f7680, { roughness: 0.45, metalness: 0.6 });

  if (arm === 'line') {
    // Fusilero: portaplacas, casco, fusil en bajo listo.
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.12), gear);
    legs.position.y = 0.14; g.add(legs);
    const carrier = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.14), body);
    carrier.position.y = 0.3; g.add(carrier);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.072, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.7), gear);
    helm.position.y = 0.43; g.add(helm);
    const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.28), steel);
    rifle.position.set(0.06, 0.29, 0.09); rifle.rotation.x = 0.35; g.add(rifle);
  } else if (arm === 'fire') {
    // Pieza de artillería: cuna, tubo elevado, ruedas.
    const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.2), body);
    carriage.position.y = 0.14; g.add(carriage);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.042, 0.44, 16), steel);
    barrel.position.set(0, 0.27, -0.04); barrel.rotation.x = -0.95; g.add(barrel);
    const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 16), steel);
    brake.position.set(0, 0.44, -0.19); brake.rotation.x = -0.95; g.add(brake);
    for (const sx of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 20), mat(0x1e2024, { roughness: 0.9 }));
      wheel.position.set(sx * 0.15, 0.11, 0.02); wheel.rotation.z = Math.PI / 2; g.add(wheel);
    }
  } else if (arm === 'sky') {
    // Dron cuadrirrotor sobre su baliza.
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), steel);
    mast.position.y = 0.16; g.add(mast);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.18), body);
    pod.position.y = 0.32; g.add(pod);
    const cam = new THREE.Mesh(new THREE.SphereGeometry(0.033, 18, 12), mat(0x1e2024, { roughness: 0.3 }));
    cam.position.set(0, 0.28, 0.07); g.add(cam);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
      const armBar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.012, 0.17), steel);
      armBar.position.set(sx * 0.07, 0.34, sz * 0.07); armBar.rotation.y = sx * sz * 0.8; g.add(armBar);
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.006, 20), mat(0x2a2d35, { roughness: 0.6 }));
      rotor.position.set(sx * 0.13, 0.37, sz * 0.13); g.add(rotor);
    }
  } else {
    // Sombra: agente agazapado, sin insignia visible.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.14, 0.13), mat(0x24262b, { roughness: 0.85 }));
    torso.position.y = 0.24; torso.rotation.x = 0.3; g.add(torso);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.11), mat(0x1e2024, { roughness: 0.9 }));
    legs.position.set(0, 0.12, 0.03); g.add(legs);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.028, 0.02), body);
    visor.position.set(0, 0.34, 0.06); g.add(visor);
  }

  g.traverse((m) => { m.castShadow = true; });
  g.scale.setScalar(1.65);
  return g;
}


// ── Assets rápidos de edificio ───────────────────────────────────────────────
// Versión "jugable": poca geometría, silueta inconfundible. Se sustituyen pieza
// a pieza por las mallas high-poly sin tocar quien las coloca.
/** Mezcla dos colores. `k` = 0 deja el primero; `k` = 1 devuelve el segundo. */
function blend(a: number, b: number, k: number): number {
  const mix = (shift: number) => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * k) & 0xff;
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

const flat = (color: number, o: { roughness?: number; metalness?: number; emissive?: number; emissiveIntensity?: number } = {}) => mat(color, { flat: true, roughness: o.roughness ?? 0.86, metalness: o.metalness ?? 0.05, emissive: o.emissive, emissiveIntensity: o.emissiveIntensity });

function shed(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
  body.position.y = h / 2;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.52, d * 0.52, w, 12, 1, false, 0, Math.PI), flat(0x8a8378));
  roof.rotation.z = Math.PI / 2;
  roof.position.y = h;
  g.add(roof);
  return g;
}

function lattice(h: number, r: number, color: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), flat(color, { metalness: 0.4, roughness: 0.5 }));
    leg.position.set(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    leg.rotation.y = a;
    g.add(leg);
  }
  for (let j = 1; j <= 3; j += 1) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.18, 0.022, 6, 4), flat(color, { metalness: 0.4 }));
    band.rotation.x = Math.PI / 2;
    band.rotation.z = Math.PI / 4;
    band.position.y = (h / 4) * j;
    g.add(band);
  }
  return g;
}

/** Lo que `buildingAsset` sabe construir: los distritos de la Ciudad y los terrenos. */
export type BuildingKind =
  | 'granary' | 'foundry' | 'watchtower' | 'silo' | 'wall' | 'monument' | 'empty'
  | Kind;

function buildingAsset(kind: BuildingKind, level: number, tint: number): THREE.Group {
  const g = new THREE.Group();
  const L = Math.max(1, Math.min(3, level || 1));

  if (kind === 'granary') {
    // Graneros: silos de grano + nave de carga. El nivel añade silos.
    const n = 1 + L;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2;
      const rad = n === 2 ? 0.3 : 0.42;
      const hh = 0.62 + (i % 2) * 0.12;
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, hh, 16), flat(0xb9b0a0));
      silo.position.set(Math.cos(a) * rad, hh / 2, Math.sin(a) * rad);
      g.add(silo);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 16), flat(0x8a8378));
      cone.position.set(Math.cos(a) * rad, hh + 0.07, Math.sin(a) * rad);
      g.add(cone);
    }
    const hall = shed(0.62, 0.24, 0.4, 0x8d8b7e);
    hall.position.set(0, 0, -0.62);
    g.add(hall);
  } else if (kind === 'foundry') {
    // Fundición: nave, chimeneas y colada al descubierto.
    const hall = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.42, 0.62), flat(0x76736a));
    hall.position.y = 0.21; g.add(hall);
    const saw = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.2), flat(0x5f5c55));
    saw.position.set(0, 0.48, -0.15); g.add(saw);
    for (let i = 0; i < 1 + L; i += 1) {
      const hh = 0.7 + L * 0.18 + (i % 2) * 0.14;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, hh, 14), flat(0x8b6f5a));
      stack.position.set(-0.28 + i * 0.24, hh / 2, 0.36);
      g.add(stack);
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.014, 6, 14), flat(0x4a4640, { metalness: 0.4 }));
      band.rotation.x = Math.PI / 2;
      band.position.set(-0.28 + i * 0.24, hh - 0.08, 0.36);
      g.add(band);
    }
    const pour = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.16),
      flat(0xc9683a, { emissive: 0xc9683a, emissiveIntensity: 0.9, roughness: 0.5 }));
    pour.position.set(0.22, 0.44, -0.02); g.add(pour);
    const light = new THREE.PointLight(0xc9683a, 0.9, 1.6);
    light.position.set(0.22, 0.6, 0); g.add(light);
  } else if (kind === 'watchtower') {
    // Atalaya: torre de celosía, cabina y antena parabólica.
    const h = 0.95 + L * 0.3;
    g.add(lattice(h, 0.17, 0x7d7f86));
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.44), flat(0x5f6268));
    cab.position.y = h + 0.1; g.add(cab);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.09, 0.46), flat(0x2a3a42, { roughness: 0.2, metalness: 0.3 }));
    glass.position.y = h + 0.14; g.add(glass);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.012, 6, 4), flat(0x7d7f86, { metalness: 0.4 }));
    rail.rotation.x = Math.PI / 2; rail.rotation.z = Math.PI / 4;
    rail.position.y = h + 0.24; g.add(rail);
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), flat(0xcfc7b8));
    dish.position.set(0.2, h + 0.3, 0.1); dish.rotation.set(-0.7, 0.4, 0); g.add(dish);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.4, 8), flat(0x7d7f86, { metalness: 0.5 }));
    mast.position.y = h + 0.42; g.add(mast);
  } else if (kind === 'silo') {
    // Silo de Ceniza: depósito con nivel de llenado visible.
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.31, 0.95, 24, 1, true),
      mat(0x8d949c, { roughness: 0.42, metalness: 0.4 }));
    shell.position.y = 0.48; shell.material.side = THREE.DoubleSide; g.add(shell);
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.3 + L * 0.18, 24),
      mat(0xd6cfc4, { emissive: 0xbfe4f2, emissiveIntensity: 0.45 }));
    fill.position.y = (0.3 + L * 0.18) / 2; g.add(fill);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.07, 24), flat(0x6f767e));
    cap.position.y = 0.98; g.add(cap);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.05), flat(0x5f6268, { metalness: 0.4 }));
      leg.position.set(Math.cos(a) * 0.42, 0.25, Math.sin(a) * 0.42);
      leg.rotation.z = Math.cos(a) * 0.14; leg.rotation.x = -Math.sin(a) * 0.14;
      g.add(leg);
    }
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 10), flat(0x6f767e, { metalness: 0.4 }));
    pipe.position.set(0.3, 0.9, 0); pipe.rotation.z = 1.1; g.add(pipe);
  } else if (kind === 'monument') {
    // Plaza y monumento: pilar de hormigón y fragmento sostenido.
    const plaza = new THREE.Mesh(hexPrism(0.78, 0.06), flat(0x3f4238));
    g.add(plaza);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.1 - i * 0.12, 0.13), flat(0xa8a294));
      blade.position.set(Math.cos(a) * 0.13, (1.1 - i * 0.12) / 2 + 0.06, Math.sin(a) * 0.13);
      blade.rotation.y = a; g.add(blade);
    }
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0),
      mat(tint || 0xc9683a, { emissive: tint || 0xc9683a, emissiveIntensity: 0.75, flat: true }));
    orb.position.y = 1.22; orb.scale.y = 1.45; g.add(orb);
    const light = new THREE.PointLight(tint || 0xc9683a, 1.2, 2.4);
    light.position.y = 1.3; g.add(light);
  } else if (kind === 'wall') {
    // Perímetro defensivo contemporáneo: gaviones HESCO, berma, trinchera con
    // escalón de tiro, alambrada y barreras de hormigón.
    const berm = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.16, 0.3), flat(0x6e6a52));
    berm.position.set(0, 0.08, -0.3); g.add(berm);
    for (let i = 0; i < 5; i += 1) {
      const hesco = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.26, 0.22), flat(0xa89a72));
      hesco.position.set(-0.44 + i * 0.22, 0.29, -0.3); g.add(hesco);
      const wire = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.02, 0.225), flat(0x6f767e, { metalness: 0.5, roughness: 0.5 }));
      wire.position.set(-0.44 + i * 0.22, 0.42, -0.3); g.add(wire);
    }
    // trinchera y su escalón
    const trench = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.14, 0.24), flat(0x2f322b));
    trench.position.set(0, 0.07, -0.02); g.add(trench);
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.07, 0.1), flat(0x555a48));
    step.position.set(0, 0.11, -0.11); g.add(step);
    for (let i = 0; i < 6; i += 1) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.11), flat(0x8a8266));
      bag.position.set(-0.46 + i * 0.185, 0.175, 0.09);
      bag.rotation.y = (i % 2) * 0.12; g.add(bag);
    }
    // alambrada de espino sobre caballetes
    for (let i = 0; i < 3; i += 1) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 5, 12), flat(0x8d949c, { metalness: 0.6, roughness: 0.4 }));
      coil.position.set(-0.34 + i * 0.34, 0.12, 0.34);
      coil.rotation.set(0, Math.PI / 2, 0); g.add(coil);
      const x1 = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.02), flat(0x5f6268, { metalness: 0.4 }));
      x1.position.set(-0.34 + i * 0.34, 0.12, 0.34); x1.rotation.x = 0.6; g.add(x1);
      const x2 = x1.clone(); x2.rotation.x = -0.6; g.add(x2);
    }
    // barreras de hormigón en el paso
    for (const x of [-0.16, 0.16]) {
      const jersey = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 0.2, 4), flat(0xb0aca2));
      jersey.position.set(x, 0.1, 0.5); jersey.rotation.y = Math.PI / 4; g.add(jersey);
    }
    // poste de vigilancia con cámara
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.72, 8), flat(0x6f767e, { metalness: 0.5 }));
    post.position.set(-0.52, 0.36, -0.3); g.add(post);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.11), flat(0x2b2e2a));
    cam.position.set(-0.52, 0.74, -0.26); g.add(cam);
  } else {
    // Solar libre: parcela explanada y vallada, con caseta y acopios. Se lee
    // como una obra parada, no como una losa vacía.
    const graded = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.05, 0.74), flat(0x6b6553));
    graded.position.y = 0.025; g.add(graded);
    // valla de obra: postes y dos travesaños
    const fence: [number, number][] = [];
    for (let i = 0; i <= 6; i += 1) fence.push([-0.5 + i * (1 / 6), 0.38]);
    for (let i = 0; i <= 6; i += 1) fence.push([-0.5 + i * (1 / 6), -0.38]);
    for (const [x, z] of fence) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6), flat(0x8d949c, { metalness: 0.5 }));
      p.position.set(x, 0.17, z); g.add(p);
    }
    for (const z of [0.38, -0.38]) {
      for (const y of [0.14, 0.29]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.012, 0.012), flat(0x8d949c, { metalness: 0.5 }));
        rail.position.set(0, y, z); g.add(rail);
      }
    }
    // caseta de obra
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), flat(0xb5713c));
    cabin.position.set(-0.28, 0.15, 0.06); g.add(cabin);
    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.24), flat(0x8f8a80));
    cabinRoof.position.set(-0.28, 0.26, 0.06); g.add(cabinRoof);
    // acopio de tubos de hormigón
    for (let i = 0; i < 3; i += 1) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 14, 1, true), flat(0xa8a49a));
      pipe.material.side = THREE.DoubleSide;
      pipe.position.set(0.2 + (i % 2) * 0.15, 0.08 + Math.floor(i / 2) * 0.13, -0.12);
      pipe.rotation.z = Math.PI / 2; g.add(pipe);
    }
    // montón de grava y estacas de replanteo
    const gravel = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.19, 9), flat(0x7d786a));
    gravel.position.set(0.3, 0.095, 0.2); g.add(gravel);
    for (let i = 0; i < 4; i += 1) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 5), flat(0x9a8f7c));
      stake.position.set(-0.12 + i * 0.12, 0.1, 0.24); g.add(stake);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.04, 6), flat(0xc9683a, { emissive: 0xc9683a, emissiveIntensity: 0.45 }));
      tip.position.set(-0.12 + i * 0.12, 0.21, 0.24); g.add(tip);
    }
  }

  g.traverse((m: THREE.Object3D) => {
    if ((m as Partial<THREE.Mesh>).isMesh) { m.castShadow = true; m.receiveShadow = true; }
  });
  return g;
}

// ── El elemento ─────────────────────────────────────────────────────────────
const ARMS: readonly (Arm | 'shade')[] = ['line', 'fire', 'sky', 'shade'];
const KINDS: readonly Kind[] = ['water', 'plain', 'forest', 'urban', 'seam', 'high', 'bastion', 'core'];
const BUILDINGS: readonly BuildingKind[] = [
  'granary', 'foundry', 'watchtower', 'silo', 'wall', 'monument', 'empty', ...KINDS,
];

const asArm = (raw: string | null): Arm | 'shade' =>
  ARMS.find((a) => a === raw) ?? 'line';
const asKind = (raw: string | null): Kind =>
  KINDS.find((k) => k === raw) ?? 'plain';
const asBuilding = (raw: string | null): BuildingKind =>
  BUILDINGS.find((b) => b === raw) ?? 'granary';

/**
 * Cuánto cuerpo tienen las provincias por debajo del suelo.
 *
 * Todas arrancan de la misma cota, así que el desnivel entre dos vecinas es un
 * **acantilado de un mismo cuerpo** y no un hueco al vacío. Sin esto el mapa se lee como
 * un montón de losas sueltas.
 */


/**
 * Semieje corto del encuadre de salida, en radios de provincia.
 *
 * Sale de un objetivo concreto: siete provincias de ancho en un móvil de 390, o sea unos
 * 55 px cada una. Con eso se lee el terreno, se toca sin apuntar, y sobre todo se ve el
 * frente entero de tu territorio, que es lo que se mira al abrir un turno.
 */
const OPEN_SPAN = 6.2;

/**
 * Dónde empieza el collar de dominio, en fracción del radio de la provincia.
 *
 * El mockup usa un anillo del 0,6 al borde: sobre un hexágono que se mira de cerca es una
 * corona ancha y queda bien. Sobre noventa y seis provincias esa corona se come el terreno
 * y el mapa vuelve a ser un mosaico de colores de asiento — el fallo que se venía
 * arrastrando. Aquí es un **filo**: se ve de quién es la provincia sin dejar de verse qué
 * es la provincia.
 */
const COLLAR = 0.9;

/** Un contorno encogido hacia el centro de la provincia. */
function scaleShape(rim: readonly { x: number; y: number }[], factor: number): THREE.Shape {
  const shape = new THREE.Shape();
  rim.forEach((p, i) => {
    const x = p.x * factor;
    const y = p.y * factor;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

/**
 * El collar: la corona que va entre el borde de la losa y `inner` de su radio.
 *
 * En el mockup es un `RingGeometry` hexagonal, que aquí no vale porque la provincia no es
 * un hexágono. Es la misma figura construida sobre el contorno real: dos triángulos por
 * arista entre el contorno y su copia encogida.
 */
function bandGeometry(rim: readonly { x: number; y: number }[], inner: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < rim.length; i += 1) {
    const a = rim[i]!;
    const b = rim[(i + 1) % rim.length]!;
    const ai = { x: a.x * inner, y: a.y * inner };
    const bi = { x: b.x * inner, y: b.y * inner };
    // Sentido horario en (x, z). La celda viene antihoraria en (x, y) del mapa, y al
    // pasar la `y` a `z` el giro se invierte: con el orden ingenuo las caras miran al
    // suelo y el collar es invisible desde arriba, que es justo desde donde se mira.
    pos.push(ai.x, 0, ai.y, b.x, 0, b.y, a.x, 0, a.y);
    pos.push(ai.x, 0, ai.y, bi.x, 0, bi.y, b.x, 0, b.y);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Una fuerza de composición desconocida.
 *
 * De las ajenas solo se conoce el tamaño aproximado, así que ponerles la silueta de Línea
 * sería **inventarse el arma**: el jugador leería «infantería» donde el motor no lo sabe.
 * Peana del color del asiento y un bulto sin insignia.
 */
function blankPiece(colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.08, 20),
    mat(colorHex, { emissive: colorHex, emissiveIntensity: 0.35, roughness: 0.5 }));
  base.position.y = 0.04;
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.3, 12),
    mat(0x2a2d35, { roughness: 0.9 }));
  shroud.position.y = 0.23;
  g.add(base, shroud);
  g.traverse((m) => { m.castShadow = true; });
  return g;
}

/** Radio de la circunferencia mayor que cabe en la celda, en coordenadas de mapa. */
function inradius(region: CampaignRegion): number {
  let least = Infinity;
  for (let i = 0; i < region.cell.length; i += 1) {
    const a = region.cell[i]!;
    const b = region.cell[(i + 1) % region.cell.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    // Proyección del centro sobre el segmento, acotada a él: la distancia a la arista, no
    // a la recta que la contiene.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((region.x - a.x) * dx + (region.y - a.y) * dy) / len2));
    least = Math.min(least, Math.hypot(region.x - (a.x + t * dx), region.y - (a.y + t * dy)));
  }
  return Number.isFinite(least) ? least : 1;
}

const LIVE = new Set<GdcWorld>();   // orden = último visto primero al final
const MAX_LIVE = 8;

export class GdcWorld extends HTMLElement {
  private _built = false;
  private _canvas?: HTMLCanvasElement;
  private _renderer!: THREE.WebGLRenderer;
  private _scene!: THREE.Scene;
  private _camera!: THREE.PerspectiveCamera;
  private _world = 'map';
  private _mode = '';
  private _root!: THREE.Group;
  private _tilePos: Map<string, THREE.Vector3> = new Map();
  private _tileTop = 0;
  private _azimuth = -0.45;
  private _radius = 0;
  private _zoom = 1;
  /** ¿Falta calcular el encuadre de salida? Necesita el ancho real del elemento. */
  private _openZoom = false;
  private _target = new THREE.Vector3();
  private _ro?: ResizeObserver;
  private _io?: IntersectionObserver;
  private _visible = false;
  private _paused = false;
  private _raf = 0;
  private _clock?: THREE.Clock;
  private _lastT?: number;
  private _speed = 1;
  private _turntable = 0;
  private _stillUrl?: string;
  private _skirmish?: Skirmish;
  private _shard?: THREE.Object3D;
  private _coreRing?: THREE.Object3D;
  private _ash?: THREE.Points;
  private _ashCore?: THREE.Object3D;
  private _bastionPos?: THREE.Vector3;
  /** Datos de la campaña. Se asignan como propiedad antes de conectar el elemento. */
  campaign?: CampaignMap;
  private _scale = 1;
  private _regionPos: Map<number, THREE.Vector3> = new Map();
  private _regionHalo: Map<number, THREE.Mesh> = new Map();
  private _pickable: THREE.Mesh[] = [];
  private _arrows?: THREE.Group;
  private _overlay: CampaignOverlay = { marks: {}, arrows: [] };
  /** Píxeles recorridos en el gesto en curso. Un arrastre no puede acabar seleccionando. */
  private _dragged = 0;
  /** Distancia de la cámara al objetivo. La calcula `_place()`; la usa el desplazamiento. */
  private _dist = 10;
  /**
   * Los oyentes de gesto se registran sobre el propio elemento, así que **sobreviven al
   * desmontaje del mundo**: `_teardown()` suelta la escena pero no el `HTMLElement`. Sin
   * esta guarda, cada reconstrucción duplicaba el desplazamiento y emitía dos `gdc-pick`
   * por cada tap.
   */
  private _bound = false;
  private _heroGroup?: THREE.Group;
  /** Piezas del visor de assets. El material se guarda aparte: `Mesh.material` puede
   *  ser una lista, y estas piezas siempre llevan uno solo. */
  private _heroParts: {
    mesh: THREE.Mesh; material: THREE.MeshStandardMaterial;
    zone: string; base: number; zoneColor: number;
  }[] = [];

  connectedCallback(): void {
    if (!this._io) {
      this._io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this._enter(); else this._leave();
        }
      }, { rootMargin: '240px 0px' });
    }
    // La imagen congelada vive como fondo del propio elemento: sobrevive a que
    // React reconcilie los hijos.
    if (this._stillUrl) { this._paintStill(); return; }
    // Una vitrina sin congelar se construye ya: no compite por contextos porque
    // libera el suyo en el mismo fotograma.
    if (this.hasAttribute('still')) { this._boot(); return; }
    this._io.observe(this);
    if (this._inView()) this._enter();
  }

  private _inView(): boolean {
    const r = this.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    return r.bottom > -240 && r.top < (innerHeight || 0) + 240;
  }

  private _paintStill(): void {
    this.style.backgroundImage = `url(${this._stillUrl})`;
    this.style.backgroundSize = 'cover';
    this.style.backgroundPosition = 'center';
  }

  disconnectedCallback(): void {
    if (this._io) this._io.unobserve(this);
    this._leave();
    this._teardown();
  }

  private _enter(): void {
    this._visible = true;
    if (!this._built) this._boot(); else this._resume();
    LIVE.delete(this);
    LIVE.add(this);
    if (LIVE.size > MAX_LIVE) {
      for (const w of [...LIVE]) {
        if (LIVE.size <= MAX_LIVE) break;
        if (w === this || w._visible) continue;
        if (w.hasAttribute('still') && !w._stillUrl) continue;
        LIVE.delete(w);
        w._teardown();
      }
    }
  }

  private _leave(): void {
    this._visible = false;
    this._paused = true;
    cancelAnimationFrame(this._raf);
  }

  private _teardown(): void {
    if (!this._built) return;
    this._paused = true;
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    this._scene.traverse((o: THREE.Object3D) => {
      const mesh = o as Partial<THREE.Mesh>;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      }
    });
    this._renderer.dispose();
    this._renderer.forceContextLoss();
    if (this._canvas && this._canvas.parentNode === this) this.removeChild(this._canvas);
    // Soltar las referencias para que el recolector pueda con la escena entera. Tras
    // esto `_built` es false y nada vuelve a tocarlas hasta que `_boot` las rehaga; es
    // la única vez que dejan de estar definidas, y por eso el descarte va aquí y no
    // repartido en asertos por todo el archivo.
    const released = this as unknown as Record<string, unknown>;
    for (const field of ['_canvas', '_scene', '_camera', '_root', '_skirmish',
                         '_heroGroup', '_shard', '_ash', '_ashCore', '_coreRing']) {
      released[field] = undefined;
    }
    this._heroParts = [];
    LIVE.delete(this);
    this._built = false;
    if (this.hasAttribute('still') && !this._stillUrl && this.isConnected && this._io) {
      this._io.unobserve(this);
      this._io.observe(this);
    }
  }

  private _boot(): void {
    this._built = true;
    if (!document.getElementById('gdc-world-style')) {
      const st = document.createElement('style');
      st.id = 'gdc-world-style';
      st.textContent = 'gdc-world{display:block;position:relative;overflow:hidden;touch-action:pan-y}';
      document.head.appendChild(st);
    }

    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    this.prepend(canvas);
    this._canvas = canvas;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    this._renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAL.void);
    scene.fog = new THREE.Fog(PAL.void, 22, 60);
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 120);
    this._camera = camera;

    this._world = this.getAttribute('scene') || 'map';
    if (['hero', 'unit', 'asset', 'tile'].includes(this._world)) this._studio(); else this._lights();
    if (this._world === 'city') this._buildCity();
    else if (this._world === 'unit') this._buildUnit();
    else if (this._world === 'asset') this._buildAsset();
    else if (this._world === 'tile') this._buildTile();
    else if (this._world === 'hero') this._buildHero();
    else if (this._world === 'skirmish') this._buildSkirmish();
    else if (this._world === 'campaign') this._buildCampaign();
    else this._buildBoard();
    if (this.hasAttribute('ash')) this._buildAshfall();

    this._azimuth = Number(this.getAttribute('azimuth') ?? -0.45);
    // El atributo manda; si no hay, se respeta el radio que calculó el
    // constructor de la escena y solo entonces se cae a la tabla por defecto.
    const rAttr = this.getAttribute('radius');
    if (rAttr !== null) this._radius = Number(rAttr);
    else if (!this._radius) {
      this._radius = { city: 5.4, skirmish: 3.5, hero: 1.06, unit: 0.34, asset: 1.0, tile: 1.02 }[this._world] ?? 6.5;
    }
    this._zoom = Number(this.getAttribute('zoom') ?? 1);
    // Sin `zoom` explícito, la campaña se abre a un número fijo de provincias en pantalla.
    // Se resuelve en el primer `_resize()`, que es cuando el elemento ya mide algo.
    this._openZoom = this._world === 'campaign' && !this.hasAttribute('zoom');
    if (!this._target) this._target = new THREE.Vector3(0, 0, 0);
    this._applyFocus();

    if (this._world === 'campaign') this.setOverlay(this._overlay);

    this._resize();
    if (this.hasAttribute('still')) { this._freeze(); return; }
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    this._drag();
    this._resume();
  }

  private _freeze(): void {
    this._turntable = 0;
    this._place();
    this._renderer.render(this._scene, this._camera);
    let url: string | null = null;
    try { url = this._canvas?.toDataURL('image/png') ?? null; } catch { url = null; }
    if (url) {
      this._stillUrl = url;
      this._paintStill();
      this._teardown();
    }
  }

  private _resume(): void { if (!this._built) return; this._paused = false; this._lastT = undefined; this._speed = this._speed ?? 1; this._clock = this._clock || new THREE.Clock(); this._loop(); }

  private _studio(): void {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const g = c.getContext('2d');
    if (!g) return;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#4d5c6b');
    grad.addColorStop(0.42, '#8fa0b0');
    grad.addColorStop(0.52, '#2a2b30');
    grad.addColorStop(1, '#14151a');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
    const warm = g.createRadialGradient(150, 88, 6, 150, 88, 130);
    warm.addColorStop(0, '#fff4e2'); warm.addColorStop(1, 'rgba(255,244,226,0)');
    g.fillStyle = warm; g.fillRect(0, 0, 512, 200);
    const cool = g.createRadialGradient(390, 100, 6, 390, 100, 110);
    cool.addColorStop(0, '#cfe4f5'); cool.addColorStop(1, 'rgba(207,228,245,0)');
    g.fillStyle = cool; g.fillRect(200, 0, 312, 200);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    this._scene.environment = tex;
    this._scene.environmentIntensity = 0.85;

    const s2 = this._scene;
    s2.add(new THREE.HemisphereLight(0xbfd2e4, 0x1c1a17, 0.5));
    const key = new THREE.DirectionalLight(0xfff2e0, 2.4);
    key.position.set(-2.4, 3.4, 2.6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -2; key.shadow.camera.right = 2;
    key.shadow.camera.top = 3; key.shadow.camera.bottom = -1;
    key.shadow.camera.near = 0.2; key.shadow.camera.far = 12;
    key.shadow.bias = -0.0006;
    s2.add(key);
    const fill = new THREE.DirectionalLight(0xd8e6f5, 0.75);
    fill.position.set(3.2, 1.6, 2.2);
    s2.add(fill);
    const rim = new THREE.DirectionalLight(0xffc79a, 1.35);
    rim.position.set(1.2, 2.2, -3.4);
    s2.add(rim);
    s2.add(new THREE.AmbientLight(0x3a4048, 0.55));
  }

  private _lights(): void {
    const s = this._scene;
    s.add(new THREE.HemisphereLight(0xa8bed4, 0x2a2318, 0.95));
    const key = new THREE.DirectionalLight(0xffeed6, 2.6);
    key.position.set(-8, 13, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
    key.shadow.camera.far = 46; key.shadow.bias = -0.0012;
    s.add(key);
    const rim = new THREE.DirectionalLight(0xc9683a, 0.85);
    rim.position.set(9, 5, -8);
    s.add(rim);
    s.add(new THREE.AmbientLight(0x3d4450, 1.0));
  }

  // ── Campo de batalla ──────────────────────────────────────────────────────
  private _buildBoard(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();

    const tiles = boardTiles(3);
    const visibleSeat = Number(this.getAttribute('seat') ?? 0);
    const seats = Number(this.getAttribute('seats') ?? 3);
    // Cada asiento controla su sector exterior; el anillo interior y el Núcleo son disputados.
    const ownerOf = (t: Tile): number | null => (t.ring >= 2 && t.sector < seats ? t.sector : null);
    const fog = this.hasAttribute('fog') && this.getAttribute('fog') !== 'false';

    for (const t of tiles) {
      const k = key(t.q, t.r);
      const p = axialToWorld(t.q, t.r);
      const h = HEIGHT[t.kind];
      const owner = ownerOf(t);
      const seen = !fog || owner === visibleSeat || t.ring <= 1;

      const g = new THREE.Group();
      g.position.copy(p);
      const prism = new THREE.Mesh(hexPrism(S * GAP, h), mat(TOP[t.kind], { roughness: t.kind === 'water' ? 0.25 : 0.92 }));
      prism.receiveShadow = true; prism.castShadow = true;
      prism.userData = { q: t.q, r: t.r, kind: t.kind, owner };
      g.add(prism);

      if (t.kind === 'water') {
        const surf = new THREE.Mesh(new THREE.ExtrudeGeometry(hexShape(S * GAP * 0.96), { depth: 0.01, bevelEnabled: false }),
          mat(0x2d5a6e, { roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.75 }));
        surf.geometry.rotateX(-Math.PI / 2);
        surf.position.y = h + 0.02;
        g.add(surf);
      }

      if (owner !== null) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(S * 0.6, S * GAP * 1.0, 6, 1),
          mat(seatColor(owner), { emissive: seatColor(owner), emissiveIntensity: 1.15, roughness: 0.35 }));
        ring.geometry.rotateZ(Math.PI / 6);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = h + 0.02;
        g.add(ring);
      }

      if (t.kind === 'bastion' && t.sector === 0) this._bastionPos = new THREE.Vector3(p.x, 0.6, p.z);
      if (owner !== null && t.kind !== 'bastion') {
        const b = banner(seatColor(owner));
        b.position.set(0.5, h, 0.46);
        b.scale.setScalar(0.95);
        g.add(b);
      }
      if (seen) this._props(g, t, h, owner);
      else {
        const veil = new THREE.Mesh(new THREE.ExtrudeGeometry(hexShape(S * GAP), { depth: 0.02, bevelEnabled: false }),
          mat(0x0e0f12, { transparent: true, opacity: 0.62, roughness: 1 }));
        veil.geometry.rotateX(-Math.PI / 2);
        veil.position.y = h + 0.03;
        g.add(veil);
      }

      root.add(g);
      this._tilePos.set(k, new THREE.Vector3(p.x, h, p.z));
    }

    // Fuerzas: cada asiento con Línea en su bastión, Fuego en su ciudad y Cielo empujando al centro.
    const arms: Arm[] = ['line', 'fire', 'sky'];
    for (let seat = 0; seat < seats; seat += 1) {
      const mine = tiles.filter((t) => t.sector === seat);
      const spots = [
        mine.find((t) => t.kind === 'bastion'),
        mine.find((t) => t.kind === 'urban' && t.ring === 2),
        mine.find((t) => t.ring === 1),
      ];
      spots.forEach((t, i) => {
        const arm = arms[i];
        if (!t || !arm) return;
        const base = this._tilePos.get(key(t.q, t.r));
        if (!base) return;
        const piece = unitPiece(arm, seatColor(seat));
        piece.position.set(base.x, base.y, base.z + 0.12);
        piece.rotation.y = -Math.atan2(base.z, base.x);
        root.add(piece);
        this._tilePos.set('force-' + seat + '-' + i, new THREE.Vector3(base.x, base.y + 0.6, base.z));
      });
    }
  }


  /**
   * El mapa de la campaña, en relieve.
   *
   * **No inventa un tablero**: extruye las provincias que devuelve `regionCells()` de
   * `@gdc/core`, que son las mismas que definen la adyacencia del juego. Dos provincias
   * que se tocan aquí son exactamente las dos que el motor considera adyacentes; el
   * relieve no puede prometer un movimiento que `reduce()` vaya a rechazar.
   *
   * De `board.ts` salen la paleta, las alturas por terreno y los accesorios, así que la
   * Ciudad y el campo de batalla siguen siendo el mismo mundo.
   */
  private _buildCampaign(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();
    this._regionPos = new Map();
    this._regionHalo = new Map();
    this._pickable = [];

    const data = this.campaign;
    if (!data) { this._radius = 8; return; }

    // Escala: una provincia mediana mide como un hexágono del motor, así que las alturas
    // y los accesorios de `board.ts` conservan su proporción a 2, 3 y 5 jugadores.
    const spans = data.regions.map(inradius).sort((a, b) => a - b);
    const typical = spans[Math.floor(spans.length / 2)] ?? 1;
    this._scale = (S * 0.87) / Math.max(1e-6, typical);
    const k = this._scale;

    // Cota superior de cada provincia. La necesitan las fronteras, que se dibujan después
    // y tienen que apoyarse en la más alta de las dos para no quedar enterradas.
    const tops = new Map<number, number>();

    for (const region of data.regions) {
      // La junta entre losas. En el mockup los hexágonos se extruyen a `S * GAP`, no a `S`:
      // el tablero se lee como **piezas puestas sobre una mesa** y no como una sábana
      // pintada. Aquí la provincia es un polígono irregular, así que la junta se hace
      // encogiendo la celda hacia su propio centro con el mismo `GAP`.
      const rim = region.cell.map((p) => ({
        x: (p.x - region.x) * k * GAP,
        y: (p.y - region.y) * k * GAP,
      }));
      const shape = new THREE.Shape();
      rim.forEach((p, i) => { if (i === 0) shape.moveTo(p.x, p.y); else shape.lineTo(p.x, p.y); });
      shape.closePath();

      // Misma extrusión que `hexPrism()`: bisel de 0,045 y la losa apoyada en el suelo.
      // Con junta, el bisel ya no separa a dos vecinas que deberían tocarse —están
      // separadas a propósito—, y es lo que le da el canto de pieza de tablero.
      const height = HEIGHT[region.kind];
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.045, bevelSegments: 3,
        curveSegments: 1,
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, height, 0);
      // La cota superior se lee de la geometría y no se supone: con bisel, el prisma
      // sobresale de `depth` y todo lo que se coloque «encima» quedaría medio enterrado.
      geometry.computeBoundingBox();
      const top = geometry.boundingBox?.max.y ?? height;

      const group = new THREE.Group();
      group.position.set(region.x * k, 0, region.y * k);

      // **El terreno va a color pleno.** Apagarlo hacia la pizarra para que no compitiera
      // con el dominio dejaba un mapa de barros donde no se distinguía un bosque de un
      // yermo. Lo que distingue al dueño no es teñir la provincia entera: es su collar.
      const prism = new THREE.Mesh(geometry, mat(TOP[region.kind], {
        roughness: region.kind === 'water' ? 0.25 : 0.92,
      }));
      prism.receiveShadow = true;
      prism.castShadow = true;
      prism.userData = { regionId: region.id };
      group.add(prism);
      this._pickable.push(prism);

      if (region.kind === 'water') {
        const surf = new THREE.Mesh(
          new THREE.ExtrudeGeometry(scaleShape(rim, 0.96), { depth: 0.01, bevelEnabled: false }),
          mat(0x2d5a6e, { roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.75 }),
        );
        surf.geometry.rotateX(-Math.PI / 2);
        surf.position.y = top + 0.02;
        group.add(surf);
      }

      // **El collar de dominio.** Es la pieza que faltaba: en el mockup el dueño se marca
      // con un anillo emisivo de su color pegado al borde de la losa, no tiñendo la losa.
      // La diferencia no es de gusto — con la meseta teñida, terreno y dominio compiten y
      // el mapa entero se vuelve un mosaico; con el collar, el terreno cuenta lo que es y
      // el color cuenta de quién es, y el frente se dibuja solo.
      if (region.owner !== null) {
        const tint = seatColor(region.owner);
        const collar = new THREE.Mesh(
          bandGeometry(rim, COLLAR),
          // Emisión contenida. A 1,15 —el valor del mockup, pensado para un anillo ancho
          // sobre un hexágono— el filo se quema a blanco y deja de decir de qué asiento es:
          // el mapa acababa perfilado en blanco, que es exactamente no decir nada.
          mat(tint, { emissive: tint, emissiveIntensity: 0.5, roughness: 0.35 }),
        );
        // Pegado a la meseta cuando se observa, y **por encima del velo** cuando no. El
        // control territorial es público (GDD §6.2): de quién es una provincia se sabe
        // aunque no la estés mirando, y dejarlo bajo la niebla era esconder información
        // que el juego da. Flotarlo siempre se nota a esta inclinación —el filo se
        // despega de la losa—, así que solo se levanta donde hace falta.
        collar.position.y = top + (region.seen ? 0.02 : 0.075);
        group.add(collar);
      } else {
        // Tierra de nadie: un filo tenue para que la losa no se funda con el fondo.
        const edge = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            rim.map((p) => new THREE.Vector3(p.x, top + 0.015, p.y)),
          ),
          new THREE.LineBasicMaterial({ color: PAL.line, transparent: true, opacity: 0.8 }),
        );
        group.add(edge);
      }

      // Halo de estado: seleccionada, alcanzable, amenazada. Se reutiliza turno a turno
      // cambiando su material, sin reconstruir el mundo.
      const halo = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }),
        mat(PAL.ashGlow, { transparent: true, opacity: 0, emissive: PAL.ashGlow, emissiveIntensity: 1.2 }),
      );
      halo.geometry.rotateX(-Math.PI / 2);
      halo.position.y = top + 0.1;
      halo.visible = false;
      group.add(halo);
      this._regionHalo.set(region.id, halo);

      // Cuánto cabe en esta provincia: no todas miden igual, y los accesorios están
      // dimensionados para un hexágono del motor.
      const fit = Math.min(1, (inradius(region) * k) / (S * 0.87));

      // Un `Tile` sintético: `_props` solo mira el terreno, y así la decoración del campo
      // es exactamente la misma que la del tablero de la Ciudad.
      const tile: Tile = {
        q: 0, r: 0, ring: 0, kind: region.kind, canon: '', sector: region.owner ?? -1,
      };
      if (region.seen) {
        const deco = new THREE.Group();
        this._props(deco, tile, 0, region.owner);
        // Una luz por yacimiento son decenas de luces en un mapa de 96: three.js las
        // compila todas en el shader y el mapa se arrastra. En la Ciudad son tres.
        deco.traverse((node) => { if (node instanceof THREE.Light) node.visible = false; });
        deco.scale.setScalar(fit);
        deco.position.y = top;
        group.add(deco);

        // El estandarte del dueño, como en el mockup. El Bastión ya lleva su propia base
        // con mástil, así que ahí sobra.
        if (region.owner !== null && region.kind !== 'bastion') {
          const flag = banner(seatColor(region.owner));
          flag.position.set(0.5 * fit, top, 0.46 * fit);
          flag.scale.setScalar(0.95 * fit);
          group.add(flag);
        }
      } else {
        const veil = new THREE.Mesh(
          new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false }),
          // Niebla, no borrón: a cinco jugadores la mayor parte del mapa está sin observar,
          // y al 0,66 el tablero entero se volvía negro.
          mat(PAL.void, { transparent: true, opacity: 0.46, roughness: 1 }),
        );
        veil.geometry.rotateX(-Math.PI / 2);
        veil.position.y = top + 0.06;
        group.add(veil);
      }

      root.add(group);
      tops.set(region.id, top);
      const anchor = new THREE.Vector3(region.x * k, top, region.y * k);
      this._regionPos.set(region.id, anchor);
      this._tilePos.set(`r${region.id}`, anchor);
      if (region.owner === data.seat && region.kind === 'bastion') this._bastionPos = anchor.clone();
    }

    // Las fuerzas son **piezas sobre el tablero**, con silueta distinta por arma. La cifra
    // sigue viviendo en el DOM (ADR-034): la pieza dice que ahí hay alguien y de quién es,
    // el rótulo dice cuántos. Sin la pieza, el tablero es un mapa político con pegatinas.
    for (const force of data.forces) {
      const seat = this._regionPos.get(force.regionId);
      if (!seat) continue;
      const piece = force.arm === null
        ? blankPiece(seatColor(force.seat))
        : unitPiece(force.arm, seatColor(force.seat));
      piece.position.set(seat.x, seat.y, seat.z + 0.12);
      piece.rotation.y = -Math.atan2(seat.z, seat.x);
      root.add(piece);
    }

    // El mundo termina en algo. Sin esto la tierra flota sobre el vacío y el mapa se lee
    // como un recorte, no como un sitio: el disco cierra la base y asoma un poco por fuera
    // de la costa, que es lo que la dibuja.
    const world = data.extent * k;
    const flats = new THREE.Mesh(
      new THREE.CircleGeometry(world * 1.05, 96),
      mat(blend(PAL.void, PAL.panel, 0.55), { roughness: 1 }),
    );
    flats.geometry.rotateX(-Math.PI / 2);
    flats.position.y = -0.02;
    flats.receiveShadow = true;
    root.add(flats);

    this._arrows = new THREE.Group();
    root.add(this._arrows);

    this._radius = world;
    // Las sombras se encuadran al mapa: con la caja fija de las vitrinas, medio tablero
    // se quedaba fuera y sus provincias no proyectaban nada.
    for (const light of this._scene.children) {
      if (light instanceof THREE.DirectionalLight && light.castShadow) {
        const box = light.shadow.camera;
        box.left = -world * 1.1; box.right = world * 1.1;
        box.top = world * 1.1; box.bottom = -world * 1.1;
        box.far = world * 5;
        box.updateProjectionMatrix();
      }
    }
    this._pick();
  }

  /**
   * Selección por rayo.
   *
   * El motor **emite** y quien escuche pinta, como con la escaramuza: aquí sale un
   * `gdc-pick` con el identificador de provincia y la pantalla decide qué hacer. El foco,
   * el teclado y el lector de pantalla siguen viviendo en el DOM (ADR-034), no aquí.
   */
  private _pick(): void {
    if (this._bound) return;
    const ray = new THREE.Raycaster();
    const point = new THREE.Vector2();
    this.addEventListener('pointerup', (e) => {
      if (this._dragged > 8) return;
      const rect = this.getBoundingClientRect();
      point.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      point.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      ray.setFromCamera(point, this._camera);
      const hit = ray.intersectObjects(this._pickable, false)[0];
      const id = hit?.object.userData['regionId'];
      if (typeof id === 'number') {
        this.dispatchEvent(new CustomEvent('gdc-pick', { detail: { regionId: id }, bubbles: true }));
      }
    });
  }

  /** Resalta lo que toque este turno. No reconstruye nada: cambia materiales. */
  setOverlay(overlay: CampaignOverlay): void {
    this._overlay = overlay;
    if (!this._built) return;

    // A ras de suelo y en perspectiva, un velo tenue no se ve: lo que en el plano bastaba
    // como un anillo fino aquí tiene que teñir la meseta entera.
    const TINT: Record<CampaignMark, { color: number; opacity: number }> = {
      selected: { color: PAL.rust, opacity: 0.7 },
      reachable: { color: PAL.ashGlow, opacity: 0.3 },
      threat: { color: 0xb33a3a, opacity: 0.34 },
      home: { color: PAL.ash, opacity: 0.18 },
      // Apagar no es borrar: al 0,66 la provincia se volvía negra y el mapa desaparecía
      // justo cuando más falta hace saber por dónde vas.
      dim: { color: PAL.void, opacity: 0.42 },
    };

    for (const [id, halo] of this._regionHalo) {
      const mark = overlay.marks[id];
      const tint = mark ? TINT[mark] : undefined;
      halo.visible = tint !== undefined;
      if (!tint) continue;
      const material = halo.material as THREE.MeshStandardMaterial;
      material.color.setHex(tint.color);
      material.emissive.setHex(mark === 'dim' ? 0x000000 : tint.color);
      material.opacity = tint.opacity;
    }

    if (!this._arrows) return;
    for (const child of [...this._arrows.children]) {
      this._arrows.remove(child);
      const mesh = child as Partial<THREE.Mesh>;
      mesh.geometry?.dispose();
    }
    for (const arrow of overlay.arrows) {
      const from = this._regionPos.get(arrow.from);
      const to = this._regionPos.get(arrow.to);
      if (!from || !to) continue;
      this._arrows.add(this._arrow(from, to, arrow.support === true));
    }
  }

  /** Una orden dibujada sobre el terreno: barra hasta el destino y punta encima. */
  private _arrow(from: THREE.Vector3, to: THREE.Vector3, support: boolean): THREE.Group {
    const group = new THREE.Group();
    const lift = 0.34;
    const a = from.clone().setY(from.y + lift);
    const b = to.clone().setY(to.y + lift);
    const span = a.distanceTo(b);
    const colour = support ? PAL.rust : PAL.ashGlow;
    const material = mat(colour, { emissive: colour, emissiveIntensity: 1.1, roughness: 0.3 });

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, Math.max(0.01, span - 0.5), 6), material);
    shaft.position.copy(a.clone().lerp(b, 0.5));
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    group.add(shaft);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.34, 7), material);
    head.position.copy(b.clone().lerp(a, 0.12));
    head.quaternion.copy(shaft.quaternion);
    group.add(head);
    return group;
  }

  /** Lleva la cámara sobre una provincia. `bias` la acerca al centro del mapa. */
  focusRegion(regionId: number, bias = 0): void {
    const p = this._regionPos.get(regionId);
    if (!p || !this._built) return;
    // Ir a tu ciudad es ir a **verla**. Si la cámara está más lejos que el encuadre de
    // trabajo, el botón acerca además de desplazarse: con el mapa entero en pantalla el
    // recorte deja el objetivo en el centro —no hay adónde desplazarse— y el botón parecía
    // averiado justo cuando más falta hace, que es cuando te has perdido.
    if (this._world === 'campaign') this._zoom = Math.min(this._zoom, this._provinceZoom());
    this._target.set(p.x * (1 - bias), p.y + 0.4, p.z * (1 - bias));
    this._settle();
  }

  /** Acerca (`> 1`) o aleja (`< 1`). El recorrido es el mismo que el del plano. */
  zoomBy(factor: number): void {
    this._zoom = Math.min(this._far(), Math.max(0.22, this._zoom / factor));
    // Al alejar ya no hace falta tirar del objetivo hacia el centro a ojo: el recorte lo
    // hace exacto, porque sabe cuánto suelo entra en cuadro a la distancia nueva.
    if (this._built) this._settle();
  }

  /**
   * Lo más lejos que se puede alejar.
   *
   * En la campaña, **el mapa entero y ni un paso más**. El 1,6 de las vitrinas dejaba el
   * tablero ocupando dos tercios del ancho y flotando en negro: alejarse más allá del
   * mundo no enseña nada que no se viera ya, solo hace las provincias más pequeñas.
   */
  private _far(): number {
    return this._world === 'campaign' ? 1 : 1.6;
  }

  /** Coloca la cámara, recorta el objetivo a lo que hay mapa, y vuelve a colocarla. */
  private _settle(): void {
    this._place();
    this._clampTarget();
    this._place();
  }

  private _props(g: THREE.Group, t: Tile, h: number, owner: number | null): void {
    if (t.kind === 'forest') {
      for (const [dx, dz, s] of [[-0.34, -0.2, 0.95], [0.3, -0.32, 0.8], [0.05, 0.3, 1.05], [-0.42, 0.34, 0.7]] as [number, number, number][]) {
        const tr = tree(0.85 * s); tr.position.set(dx, h, dz); g.add(tr);
      }
    } else if (t.kind === 'urban') {
      const cols = [0x9a9488, 0x8b8579, 0xa8a294];
      ([[-0.36, -0.3, 0.44, 0.62, 0.4], [0.3, -0.36, 0.38, 0.92, 0.36],
        [0.08, 0.34, 0.52, 0.5, 0.44], [-0.42, 0.36, 0.34, 0.4, 0.3]] as [number, number, number, number, number][])
        .forEach(([x, z, w, bh, d], i) => {
          const b = building(w, bh, d, cols[i % 3] ?? 0x9a9488);
          b.position.set(x, h, z); g.add(b);
        });
    } else if (t.kind === 'high') {
      for (const [dx, dz, s] of [[-0.2, -0.1, 1], [0.28, 0.22, 0.7], [0.02, 0.36, 0.5]] as [number, number, number][]) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 * s, 0), mat(0x77705f, { flat: true }));
        rock.position.set(dx, h + 0.16 * s, dz); rock.rotation.set(s, s * 2, s * 0.5);
        rock.castShadow = true; rock.receiveShadow = true; g.add(rock);
      }
    } else if (t.kind === 'seam') {
      const c = crystal(1.3); c.position.set(0, h, 0); g.add(c);
      const light = new THREE.PointLight(PAL.ashGlow, 0.9, 2.2); light.position.set(0, h + 0.45, 0); g.add(light);
    } else if (t.kind === 'bastion') {
      // Base de operaciones avanzada: perímetro de gaviones, búnker de mando,
      // helipuerto, cubiertos de vehículos y torre de observación.
      const fob = new THREE.Group();
      fob.position.y = h;
      fob.scale.setScalar(1.18);
      g.add(fob);
      const khaki = mat(0xb0a179, { flat: true });
      const concrete = mat(0xb2aea4, { flat: true });
      const steelM = mat(0x767d87, { roughness: 0.45, metalness: 0.55 });

      // Perímetro: seis tramos de gaviones siguiendo el borde del hexágono.
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const seg = new THREE.Group();
        seg.position.set(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72);
        seg.rotation.y = -a;
        for (let k = -1; k <= 1; k += 1) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.2), khaki);
          box.position.set(0, 0.18, k * 0.21);
          seg.add(box);
        }
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.03, 0.64), steelM);
        cap.position.y = 0.37;
        seg.add(cap);
        fob.add(seg);
      }

      // Búnker de mando sobre berma, con parabólica y antena.
      const berm2 = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.5), mat(0x6e6a52, { flat: true }));
      berm2.position.set(-0.1, 0.05, -0.04); fob.add(berm2);
      const bunker = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.3, 0.36), concrete);
      bunker.position.set(-0.1, 0.25, -0.04); fob.add(bunker);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.44), mat(0x8f8a80, { flat: true }));
      roof.position.set(-0.1, 0.42, -0.04); fob.add(roof);
      const antA = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.58, 6), steelM);
      antA.position.set(-0.3, 0.73, -0.16); fob.add(antA);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), mat(0xd8d2c4, { flat: true }));
      dish.position.set(0.08, 0.55, -0.1); dish.rotation.set(-0.85, 0.5, 0); fob.add(dish);

      // Torre de observación de celosía.
      const towerG = new THREE.Group();
      towerG.position.set(0.46, 0, -0.42);
      for (let i = 0; i < 4; i += 1) {
        const aa = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.72, 0.035), steelM);
        leg.position.set(Math.cos(aa) * 0.1, 0.36, Math.sin(aa) * 0.1);
        towerG.add(leg);
      }
      const cabin2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.17, 0.3), mat(0x6a6e75, { flat: true }));
      cabin2.position.y = 0.8; towerG.add(cabin2);
      const glass2 = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.07, 0.31), mat(0x2f4250, { roughness: 0.2, metalness: 0.3 }));
      glass2.position.y = 0.84; towerG.add(glass2);
      fob.add(towerG);

      // Helipuerto marcado.
      const pad2 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.025, 24), mat(0x3a3d36, { flat: true }));
      pad2.position.set(0.26, 0.012, 0.44); fob.add(pad2);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.016, 6, 30), mat(0xe4ded0, { emissive: 0xe4ded0, emissiveIntensity: 0.3 }));
      ring2.rotation.x = Math.PI / 2; ring2.position.set(0.26, 0.03, 0.44); fob.add(ring2);
      for (const [dx, dz, w2, d2] of [[-0.07, 0, 0.03, 0.24], [0.07, 0, 0.03, 0.24], [0, 0, 0.13, 0.03]] as [number, number, number, number][]) {
        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(w2, 0.014, d2), mat(0xe4ded0, { emissive: 0xe4ded0, emissiveIntensity: 0.3 }));
        bar2.position.set(0.26 + dx, 0.035, 0.44 + dz); fob.add(bar2);
      }

      // Cubiertos de vehículos en U.
      for (const [vx, vz, rot] of [[-0.52, 0.34, 0.5], [-0.66, -0.06, 1.25]] as [number, number, number][]) {
        const rev = new THREE.Group();
        rev.position.set(vx, 0, vz); rev.rotation.y = rot;
        for (const [bx, bz, bw, bd] of [[0, -0.16, 0.34, 0.08], [-0.17, 0, 0.08, 0.32], [0.17, 0, 0.08, 0.32]] as [number, number, number, number][]) {
          const wall2 = new THREE.Mesh(new THREE.BoxGeometry(bw, 0.2, bd), khaki);
          wall2.position.set(bx, 0.1, bz); rev.add(wall2);
        }
        fob.add(rev);
      }

      // Torres de iluminación.
      for (const [lx, lz] of [[0.6, 0.1], [-0.24, 0.6]] as [number, number][]) {
        const mast2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.66, 8), steelM);
        mast2.position.set(lx, 0.33, lz); fob.add(mast2);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.06), mat(0xf2ede4, { emissive: 0xf2ede4, emissiveIntensity: 0.8 }));
        lamp.position.set(lx, 0.67, lz + 0.04); fob.add(lamp);
      }

      if (owner !== null) {
        const flag = banner(seatColor(owner));
        flag.position.set(0.04, 0.44, 0.14);
        flag.scale.setScalar(1);
        fob.add(flag);
      }
    } else if (t.kind === 'core') {
      for (let i = 0; i < 3; i += 1) {
        const step = new THREE.Mesh(hexPrism(S * (0.74 - i * 0.16), 0.2), mat(0x9a938a));
        step.position.y = h + i * 0.22; step.castShadow = true; step.receiveShadow = true; g.add(step);
      }
      const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0),
        mat(0xf4efe6, { emissive: 0xbfe4f2, emissiveIntensity: 0.8, roughness: 0.2, flat: true }));
      shard.position.y = h + 1.25; shard.scale.y = 1.7; shard.castShadow = true;
      g.add(shard); this._shard = shard;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.022, 8, 48),
        mat(PAL.ash, { emissive: PAL.ash, emissiveIntensity: 0.55 }));
      ring.position.y = h + 1.25; ring.rotation.x = Math.PI / 2.3;
      g.add(ring); this._coreRing = ring;
      const light = new THREE.PointLight(PAL.ashGlow, 1.8, 4.5); light.position.set(0, h + 1.4, 0); g.add(light);
    } else if (t.kind === 'plain') {
      for (const [dx, dz] of [[-0.3, 0.28], [0.34, -0.2]] as [number, number][]) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.3), mat(0x555f4d));
        m.position.set(dx, h + 0.02, dz); m.rotation.y = dx; m.receiveShadow = true; g.add(m);
      }
    }
  }

  // ── Vitrina de assets ─────────────────────────────────────────────────────
  // scene="unit"  → la pieza que YA tenemos en juego (placeholder procedural).
  // scene="hero"  → el objetivo high-poly de la tropa en producción.
  private _buildUnit(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();

    const pad = new THREE.Mesh(hexPrism(0.36, 0.08), mat(0x2a2d33, { roughness: 0.95 }));
    pad.receiveShadow = true;
    root.add(pad);
    const si = Number(this.getAttribute('seat'));
    const seatTint = seatColor(Number.isFinite(si) && si >= 0 ? si : 0);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.29, 0.355, 6, 1),
      mat(seatTint, { emissive: seatTint, emissiveIntensity: 0.7 }));
    rim.geometry.rotateZ(Math.PI / 6);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.081;
    root.add(rim);

    const piece = unitPiece(asArm(this.getAttribute('arm')), seatTint);
    piece.position.y = 0.08;
    piece.scale.multiplyScalar(0.62);
    root.add(piece);

    this._heroGroup = root;
    this._radius = Number(this.getAttribute('radius') ?? 0.34);
    this._turntable = 0.28;
  }

  // Fusilero de Línea. Militar contemporáneo creíble (GDD §2.5): lo único que
  // no es de este mundo es el emisor de Ancla al cinto, y se nota justo por eso.
  private _buildAsset(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();

    const si = Number(this.getAttribute('seat'));
    const seatTint = seatColor(Number.isFinite(si) && si >= 0 ? si : 0);
    const pad = new THREE.Mesh(hexPrism(0.98, 0.09), mat(0x2a2d33, { roughness: 0.95 }));
    pad.receiveShadow = true; root.add(pad);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.96, 6, 1),
      mat(seatTint, { emissive: seatTint, emissiveIntensity: 0.55 }));
    rim.geometry.rotateZ(Math.PI / 6);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.091;
    root.add(rim);

    const asset = buildingAsset(
      asBuilding(this.getAttribute('kind')), Number(this.getAttribute('level') ?? 3), seatTint,
    );
    asset.position.y = 0.09;
    root.add(asset);

    this._heroGroup = root;
    this._radius = Number(this.getAttribute('radius') ?? 1.0);
    this._target = new THREE.Vector3(0, 0.52, 0);
    this._turntable = this.hasAttribute('static') ? 0 : 0.24;
  }

  private _buildTile(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();

    const si = Number(this.getAttribute('seat'));
    const owner = this.hasAttribute('owned')
      ? (Number.isFinite(si) && si >= 0 && si < PAL.seat.length ? si : 0) : null;
    const kind = asKind(this.getAttribute('kind'));
    const h = HEIGHT[kind];

    const g = new THREE.Group();
    const prism = new THREE.Mesh(hexPrism(S * GAP, h), mat(TOP[kind], { roughness: kind === 'water' ? 0.25 : 0.92 }));
    prism.castShadow = true; prism.receiveShadow = true;
    g.add(prism);
    if (kind === 'water') {
      const surf = new THREE.Mesh(new THREE.ExtrudeGeometry(hexShape(S * GAP * 0.96), { depth: 0.01, bevelEnabled: false }),
        mat(0x2d5a6e, { roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.75 }));
      surf.geometry.rotateX(-Math.PI / 2);
      surf.position.y = h + 0.02;
      g.add(surf);
    }
    if (owner !== null) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(S * 0.6, S * GAP, 6, 1),
        mat(seatColor(owner), { emissive: seatColor(owner), emissiveIntensity: 1.15, roughness: 0.35 }));
      ring.geometry.rotateZ(Math.PI / 6);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = h + 0.02;
      g.add(ring);
    }
    // Una vitrina no tiene tablero: se arma la casilla mínima que `_props` necesita.
    const solo: Tile = { q: 0, r: 0, ring: 0, kind, canon: '0,0', sector: -1 };
    this._props(g, solo, h, owner);
    root.add(g);

    this._heroGroup = root;
    // Encuadre por altura real del contenido: el Núcleo mide 2,4 m y una llanura 0,4.
    const PROP_TOP = { core: 2.45, urban: 1.35, forest: 1.2, bastion: 1.5, high: 1.3, seam: 0.95, plain: 0.45, water: 0.2 };
    const top = PROP_TOP[kind] ?? h + 0.4;
    this._tileTop = top * 0.5;
    this._radius = Number(this.getAttribute('radius') ?? Math.max(0.98, top * 0.5 + 0.18));
    this._target = new THREE.Vector3(0, this._tileTop, 0);
    this._turntable = this.hasAttribute('static') ? 0 : 0.22;
  }

  private _buildHero(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();
    this._heroParts = [];

    const ZONES = {
      aramid:  { color: 0x3f4438, roughness: 0.72, metalness: 0.04, zone: 0x4a7fb5 },
      cordura: { color: 0x4e5142, roughness: 0.88, metalness: 0.02, zone: 0x6e9b54 },
      rubber:  { color: 0x1e2024, roughness: 0.93, metalness: 0.03, zone: 0x2a2d35 },
      steel:   { color: 0x6f7680, roughness: 0.42, metalness: 0.72, zone: 0x9a968e },
      polymer: { color: 0x2b2e2a, roughness: 0.56, metalness: 0.06, zone: 0x5c5952 },
      glass:   { color: 0x2a3a42, roughness: 0.14, metalness: 0.3,  zone: 0x9b5fa8 },
      iff:     { color: 0x4a7fb5, roughness: 0.8,  metalness: 0.02, zone: 0xc4a53c },
      ash:     { color: 0xd6cfc4, roughness: 0.28, metalness: 0.1,  zone: 0xf2ede4 },
    };
    type Zone = keyof typeof ZONES;
    const si = Number(this.getAttribute('seat'));
    const seatTint = seatColor(Number.isFinite(si) && si >= 0 ? si : 0);
    ZONES.iff.color = seatTint;

    const M = (zone: Zone): THREE.MeshStandardMaterial => {
      const z = ZONES[zone];
      return new THREE.MeshStandardMaterial({
        color: z.color, roughness: z.roughness, metalness: z.metalness,
        emissive: zone === 'ash' ? 0xbfe4f2 : 0x000000,
        emissiveIntensity: zone === 'ash' ? 0.5 : 1,
      });
    };
    const add = (
      geo: THREE.BufferGeometry, zone: Zone, x = 0, y = 0, z = 0,
      rot: readonly number[] | null = null, parent: THREE.Object3D = root,
    ): THREE.Mesh => {
      const material = M(zone);
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      if (rot) m.rotation.set(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      this._heroParts.push({ mesh: m, material, zone, base: ZONES[zone].color, zoneColor: ZONES[zone].zone });
      return m;
    };
    // Placa con bisel: la unidad de construcción de todo el equipo.
    const slab = (w: number, h: number, d: number, r = 0.012): THREE.ExtrudeGeometry => {
      const sh = new THREE.Shape();
      sh.moveTo(-w / 2 + r, -h / 2);
      sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return new THREE.ExtrudeGeometry(sh, {
        depth: d, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006,
        bevelSegments: 3, curveSegments: 8,
      });
    };

    // Peana técnica
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.07, 64), mat(0x1d2025, { roughness: 0.95 }));
    plinth.receiveShadow = true; root.add(plinth);
    const plinthRim = new THREE.Mesh(new THREE.TorusGeometry(0.63, 0.012, 12, 96),
      mat(seatTint, { emissive: seatTint, emissiveIntensity: 0.9 }));
    plinthRim.rotation.x = Math.PI / 2; plinthRim.position.y = 0.045; root.add(plinthRim);

    const body = new THREE.Group();
    body.position.y = 0.07;
    root.add(body);
    this._heroGroup = body;

    // ── Piernas: bota, caña, rodillera, muslo con bolsillo ──
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.135, 0.075, 0.3), 'rubber', sx * 0.125, 0.038, 0.035, null, body);
      add(new THREE.BoxGeometry(0.145, 0.05, 0.2), 'polymer', sx * 0.125, 0.088, 0.005, null, body);
      add(new THREE.CapsuleGeometry(0.062, 0.16, 10, 28), 'cordura', sx * 0.125, 0.24, 0, null, body);
      const knee = add(new THREE.SphereGeometry(0.072, 32, 20, 0, Math.PI * 2, 0, Math.PI / 1.9), 'polymer', sx * 0.125, 0.4, 0.03, [0.25, 0, 0], body);
      knee.scale.set(1, 0.8, 0.9);
      add(new THREE.CapsuleGeometry(0.083, 0.2, 10, 28), 'cordura', sx * 0.125, 0.6, 0, null, body);
      add(slab(0.11, 0.16, 0.035), 'cordura', sx * 0.15, 0.62, 0.06, [0, sx * 0.2, 0], body);
    }

    // ── Cinturón, cadera, funda ──
    add(slab(0.28, 0.16, 0.19, 0.05), 'cordura', 0, 0.8, -0.095, null, body);
    add(new THREE.CylinderGeometry(0.175, 0.17, 0.09, 44), 'cordura', 0, 0.9, 0, null, body).scale.set(1, 1, 0.82);
    add(new THREE.TorusGeometry(0.175, 0.02, 14, 56), 'cordura', 0, 0.9, 0, [Math.PI / 2, 0, 0], body).scale.set(1, 0.82, 1);
    add(new THREE.BoxGeometry(0.07, 0.05, 0.03), 'steel', 0, 0.9, 0.145, null, body);
    add(slab(0.1, 0.19, 0.05), 'polymer', -0.19, 0.82, 0.02, [0, -0.3, 0.05], body);

    // ── Torso: portaplacas con placa frontal, cummerbund y cargadores ──
    add(new THREE.CylinderGeometry(0.163, 0.172, 0.36, 44), 'cordura', 0, 1.14, 0, null, body).scale.set(1, 1, 0.74);
    add(slab(0.27, 0.34, 0.055, 0.03), 'aramid', 0, 1.16, 0.1, null, body);
    add(slab(0.27, 0.3, 0.05, 0.03), 'aramid', 0, 1.16, -0.14, null, body);
    add(new THREE.CylinderGeometry(0.168, 0.168, 0.1, 44), 'cordura', 0, 1.0, 0, null, body).scale.set(1, 1, 0.76);
    for (let i = 0; i < 3; i += 1) {
      add(slab(0.062, 0.11, 0.045), 'cordura', -0.075 + i * 0.075, 1.03, 0.155, null, body);
    }
    add(slab(0.1, 0.075, 0.05), 'cordura', 0.115, 1.19, 0.15, [0, 0.2, 0], body);
    add(slab(0.085, 0.07, 0.04), 'cordura', -0.115, 1.22, 0.15, [0, -0.2, 0], body);
    // Tirantes
    for (const sx of [-1, 1]) {
      add(new THREE.BoxGeometry(0.055, 0.2, 0.03), 'cordura', sx * 0.085, 1.36, 0.09, [0.12, 0, 0], body);
      add(new THREE.BoxGeometry(0.055, 0.2, 0.03), 'cordura', sx * 0.085, 1.36, -0.11, [-0.1, 0, 0], body);
    }

    // ── Panel IFF de facción: hombro y espalda. Es la marca visible del bando ──
    add(slab(0.155, 0.125, 0.014), 'iff', 0.208, 1.315, 0.045, [0, 0.62, 0], body);
    add(slab(0.155, 0.125, 0.014), 'iff', -0.208, 1.315, 0.045, [0, -0.62, 0], body);
    add(slab(0.235, 0.185, 0.014), 'iff', 0, 1.17, -0.318, null, body);
    add(new THREE.BoxGeometry(0.19, 0.035, 0.014), 'iff', 0, 1.3, 0.132, null, body);
    add(new THREE.BoxGeometry(0.135, 0.032, 0.014), 'iff', 0, 1.643, 0.1, [0.12, 0, 0], body);

    // ── Mochila y radio con antena ──
    add(slab(0.26, 0.3, 0.13, 0.03), 'cordura', 0, 1.13, -0.24, null, body);
    add(slab(0.11, 0.14, 0.06), 'polymer', 0.09, 1.24, -0.32, null, body);
    add(new THREE.CylinderGeometry(0.007, 0.005, 0.42, 10), 'steel', 0.09, 1.5, -0.32, [0.16, 0, 0.06], body);
    add(new THREE.SphereGeometry(0.014, 16, 12), 'polymer', 0.115, 1.71, -0.35, null, body);

    // ── Hombros y brazos: fusil en bajo listo, cruzado sobre el pecho ──
    for (const sx of [-1, 1]) {
      add(new THREE.SphereGeometry(0.082, 36, 24), 'cordura', sx * 0.182, 1.305, 0, null, body);
      const upper = add(new THREE.CapsuleGeometry(0.058, 0.16, 10, 26), 'cordura', sx * 0.2, 1.19, 0.02, [0, 0, sx * 0.18], body);
      upper.rotation.x = 0.2;
      add(slab(0.1, 0.09, 0.03), 'polymer', sx * 0.225, 1.24, 0.05, [0, sx * 0.3, 0], body);
    }

    // ── Cuello, capucha y casco con soporte de visión nocturna ──
    add(new THREE.CylinderGeometry(0.062, 0.075, 0.13, 28), 'polymer', 0, 1.41, 0.01, null, body);
    add(new THREE.SphereGeometry(0.098, 40, 28), 'polymer', 0, 1.555, 0.008, null, body).scale.set(1, 1.06, 1.02);
    const helmPts = [];
    for (let i = 0; i <= 22; i += 1) {
      const t = i / 22;
      helmPts.push(new THREE.Vector2(0.117 * Math.cos(t * Math.PI * 0.5) + 0.004, 1.525 + t * 0.115));
    }
    add(new THREE.LatheGeometry(helmPts, 56), 'aramid', 0, 0, 0.005, null, body);
    add(new THREE.TorusGeometry(0.118, 0.011, 12, 56), 'aramid', 0, 1.53, 0.005, [Math.PI / 2, 0, 0], body);
    // orejeras de comunicaciones
    for (const sx of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.046, 0.05, 0.035, 24), 'polymer', sx * 0.113, 1.555, 0.005, [0, 0, Math.PI / 2], body);
    }
    add(new THREE.BoxGeometry(0.018, 0.016, 0.09), 'polymer', -0.1, 1.525, 0.07, [0, 0.5, 0], body);
    // soporte NVG + contrapeso
    add(slab(0.075, 0.055, 0.022), 'polymer', 0, 1.6, 0.113, [0.2, 0, 0], body);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.05), 'polymer', 0, 1.61, 0.14, [0.3, 0, 0], body);
    add(slab(0.12, 0.07, 0.05), 'cordura', 0, 1.575, -0.1, [0.1, 0, 0], body);
    // gafas balísticas
    add(new THREE.CylinderGeometry(0.098, 0.098, 0.055, 40, 1, true, Math.PI * 0.15, Math.PI * 0.7), 'glass', 0, 1.555, 0.006, null, body);
    const visor = body.children[body.children.length - 1] as THREE.Mesh | undefined;
    if (visor && !Array.isArray(visor.material)) visor.material.side = THREE.DoubleSide;

    // ── Fusil: cajón, guardamano, cañón, cargador, óptica, culata ──
    const rifle = new THREE.Group();
    rifle.position.set(0.05, 1.11, 0.18);
    rifle.rotation.set(0.86, 0.16, -0.34);
    body.add(rifle);
    add(slab(0.075, 0.09, 0.045), 'polymer', 0, 0, 0, null, rifle);
    add(new THREE.BoxGeometry(0.05, 0.055, 0.3), 'polymer', 0, 0.008, 0.2, null, rifle);
    add(new THREE.CylinderGeometry(0.038, 0.038, 0.26, 22, 1, true), 'steel', 0, 0.01, 0.42, [Math.PI / 2, 0, 0], rifle);
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 18), 'steel', 0, 0.01, 0.62, [Math.PI / 2, 0, 0], rifle);
    add(new THREE.CylinderGeometry(0.024, 0.022, 0.09, 20), 'steel', 0, 0.01, 0.75, [Math.PI / 2, 0, 0], rifle);
    add(slab(0.045, 0.15, 0.035), 'polymer', 0, -0.1, 0.03, [0.28, 0, 0], rifle);
    add(slab(0.04, 0.11, 0.03), 'polymer', 0, -0.09, -0.05, [-0.35, 0, 0], rifle);
    add(new THREE.BoxGeometry(0.045, 0.055, 0.17), 'polymer', 0, 0.005, -0.16, null, rifle);
    add(new THREE.BoxGeometry(0.05, 0.075, 0.055), 'polymer', 0, -0.01, -0.26, null, rifle);
    add(new THREE.BoxGeometry(0.042, 0.045, 0.11), 'steel', 0, 0.075, 0.06, null, rifle);
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.075, 20), 'glass', 0, 0.088, 0.06, [Math.PI / 2, 0, 0], rifle);
    add(new THREE.BoxGeometry(0.03, 0.02, 0.09), 'polymer', 0.045, 0.02, 0.24, [0, 0, 0.3], rifle);
    // correa
    add(new THREE.TorusGeometry(0.2, 0.008, 8, 40, Math.PI * 1.1), 'cordura', 0.02, 0.05, 0.05, [0.3, 0.4, 0.6], rifle);
    // manos y antebrazos, solidarios al arma para que siempre la agarren
    add(new THREE.SphereGeometry(0.046, 26, 18), 'rubber', 0, -0.075, -0.03, null, rifle).scale.set(1, 1.15, 1.2);
    add(new THREE.CapsuleGeometry(0.05, 0.15, 10, 26), 'cordura', -0.01, -0.11, -0.16, [1.15, 0.1, 0], rifle);
    add(new THREE.SphereGeometry(0.046, 26, 18), 'rubber', 0, -0.045, 0.235, null, rifle).scale.set(1, 1.15, 1.2);
    add(new THREE.CapsuleGeometry(0.05, 0.16, 10, 26), 'cordura', -0.035, -0.075, 0.35, [1.35, 0.28, 0], rifle);

    // ── La excepción: emisor de Ancla al cinto (la Ceniza, contenida) ──
    const anchor = new THREE.Group();
    anchor.position.set(0.17, 0.86, 0.1);
    body.add(anchor);
    add(new THREE.CylinderGeometry(0.042, 0.042, 0.13, 26), 'steel', 0, 0, 0, [0.12, 0, 0.15], anchor);
    add(new THREE.TorusGeometry(0.044, 0.007, 10, 30), 'polymer', 0, 0.03, 0, [Math.PI / 2, 0, 0], anchor);
    const core = add(new THREE.OctahedronGeometry(0.03, 0), 'ash', 0, -0.02, 0.03, [0.4, 0.6, 0], anchor);
    core.scale.set(1, 1.5, 1);
    this._ashCore = core;

    this._radius = Number(this.getAttribute('radius') ?? 1.06);
    this._target = new THREE.Vector3(0, 0.95, 0);
    this._turntable = this.hasAttribute('static') ? 0 : 0.3;
    this.setHeroMode(this.getAttribute('mode') || 'solid');
  }

  setHeroMode(mode: string): void {
    if (!this._heroParts) return;
    this._mode = mode;
    for (const p of this._heroParts) {
      p.material.wireframe = mode === 'wire';
      p.material.color.setHex(mode === 'zones' ? p.zoneColor : p.base);
      p.material.metalness = mode === 'solid' ? p.material.metalness : 0.05;
      p.material.emissive.setHex(mode === 'wire' ? 0x1a1c20 : (p.zone === 'ash' ? 0xbfe4f2 : 0x000000));
    }
    this._renderer.render(this._scene, this._camera);
  }

  setTurntable(on: boolean): void { this._turntable = on ? 0.3 : 0; }

  // Cambia la facción sin reconstruir: la tela y el filo de la peana son la marca.
  setSeat(i: number): void {
    const c = seatColor(i % PAL.seat.length);
    for (const p of this._heroParts) {
      if (p.zone !== 'iff') continue;
      p.base = c;
      if (this._mode !== 'zones') p.material.color.setHex(c);
    }
    // El filo de la peana es un toro: es la otra marca de facción de la vitrina.
    for (const child of this._root?.children ?? []) {
      const mesh = child as Partial<THREE.Mesh>;
      if (mesh.geometry?.type !== 'TorusGeometry' || child.position.y >= 0.06) continue;
      const material = mesh.material;
      if (!material || Array.isArray(material)) continue;
      const standard = material as THREE.MeshStandardMaterial;
      standard.color.setHex(c);
      standard.emissive.setHex(c);
    }
    this._renderer.render(this._scene, this._camera);
  }

  // ── Escaramuza en tiempo real ─────────────────────────────────────────────
  // Dos bloques de tropas se resuelven solos: avanzan, chocan y pierden piezas
  // una a una. Sin dados: el desenlace ya está en las cifras, pero se VE.
  private _buildSkirmish(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();
    this._speed = 1;

    // Arena: tres filas de losas, muro y torres en el lado del defensor.
    for (let q = -1; q <= 1; q += 1) {
      for (let r = -1; r <= 2; r += 1) {
        const kind = r >= 1 ? 'urban' : 'plain';
        const h = r === 1 ? 0.46 : r === 2 ? 0.5 : 0.34;
        const p = axialToWorld(q, r);
        const tileG = new THREE.Group();
        tileG.position.copy(p);
        const prism = new THREE.Mesh(hexPrism(S * GAP, h), mat(TOP[kind], { roughness: 0.9 }));
        prism.castShadow = true; prism.receiveShadow = true;
        tileG.add(prism);
        if (r === 2) {
          for (const [bx, bz, bw, bh] of [[-0.34, 0.1, 0.36, 0.72], [0.3, -0.05, 0.32, 0.98], [0.02, 0.5, 0.42, 0.6]] as [number, number, number, number][]) {
            const b = building(bw, bh, bw, 0x9a9488);
            b.position.set(bx, h, bz);
            tileG.add(b);
          }
        }
        if (r === 1) {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(S * 1.6, 0.42, 0.2), mat(0x9c8670));
          wall.position.set(0, h + 0.21, -S * 0.72);
          wall.castShadow = true; wall.receiveShadow = true;
          tileG.add(wall);
          if (q !== 0) { const tw = tower(0.15, 0.66, 0xa08a72); tw.position.set(S * 0.78 * q, h, -S * 0.72); tileG.add(tw); }
        }

        root.add(tileG);
      }
    }

    const y = 0.34, yDef = 0.46;
    const squad = (side: Squad['side'], arm: Arm, count: number, x: number, z: number, seat: number): Squad => {
      const g = new THREE.Group();
      const pieces: THREE.Group[] = [];
      for (let i = 0; i < count; i += 1) {
        const u = unitPiece(arm, seatColor(seat));
        u.scale.multiplyScalar(1);
        u.position.set(((i % 2) - 0.5) * 0.4, 0, Math.floor(i / 2) * 0.34 * (side === 'atk' ? -1 : 1));
        u.rotation.y = side === 'atk' ? Math.PI : 0;
        pieces.push(u); g.add(u);
      }
      const pad = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.6, 6, 1),
        mat(seatColor(seat), { emissive: seatColor(seat), emissiveIntensity: 1.2, roughness: 0.35 }));
      pad.geometry.rotateZ(Math.PI / 6);
      pad.rotation.x = -Math.PI / 2;
      pad.position.y = 0.02;
      g.add(pad);
      const flag = banner(seatColor(seat));
      flag.position.set(0.44, side === 'atk' ? 0 : 0.34, side === 'atk' ? -0.2 : 0.2);
      flag.scale.setScalar(side === 'atk' ? 0.85 : 1.15);
      g.add(flag);
      g.position.set(x, side === 'atk' ? y : yDef, z);
      root.add(g);
      return { side, arm, seat, count, max: count, group: g, pieces, dmg: 0, home: g.position.clone(), goal: g.position.clone() };
    };

    this._skirmish = {
      t: 0, phase: 'advance', log: [], emit: 0,
      atk: [squad('atk', 'line', 6, -0.78, -1.62, 0), squad('atk', 'fire', 3, 0.04, -2.05, 0), squad('atk', 'sky', 4, 0.82, -1.62, 0)],
      def: [squad('def', 'line', 6, -0.5, 1.1, 1), squad('def', 'fire', 3, 0.6, 1.44, 1)],
    };
    for (const sq of this._skirmish.atk) sq.goal = new THREE.Vector3(sq.home.x * 0.78, y, 0.3);
    for (const sq of this._skirmish.def) sq.goal = sq.home.clone();

    const fill = new THREE.DirectionalLight(0xfff0dc, 0.9);
    fill.position.set(2.5, 4, 6);
    root.add(fill);

    this._tilePos.set('atk', new THREE.Vector3(0, y + 0.55, -1.75));
    this._tilePos.set('def', new THREE.Vector3(0, yDef + 0.75, 1.5));
    this._tilePos.set('clash', new THREE.Vector3(0, y + 0.8, 0.4));
  }

  private _stepSkirmish(dt: number): void {
    const S2 = this._skirmish;
    if (!S2) return;
    if (S2.phase === 'done') { S2.emit += dt; if (S2.emit > 0.4) { S2.emit = 0; this._emitSkirmish(); } return; }
    S2.t += dt;

    const live = (list: Squad[]): Squad[] => list.filter((s) => s.count > 0);
    const atk = live(S2.atk), def = live(S2.def);

    if (S2.phase === 'advance') {
      let arrived = 0;
      for (const sq of atk) {
        const d = sq.goal.clone().sub(sq.group.position);
        if (d.length() < 0.06) { arrived += 1; continue; }
        sq.group.position.add(d.normalize().multiplyScalar(dt * 1.15));
      }
      if (arrived === atk.length) { S2.phase = 'clash'; this._pushLog('Los bloques chocan en la muralla'); }
    } else if (S2.phase === 'clash') {
      // Contras: Fuego rompe Línea, Línea aguanta Cielo, Cielo cae sobre Fuego.
      const beats: Record<Arm, Arm> = { fire: 'line', line: 'sky', sky: 'fire' };
      const hit = (from: Squad[], to: Squad[], wall: boolean): void => {
        for (const a of from) {
          const target = to.find((x) => beats[a.arm] === x.arm) ?? to[0];
          if (!target) return;
          const rate = a.side === 'atk' ? 0.042 : 0.018;
          const mod = (beats[a.arm] === target.arm ? 1.55 : 1) * (wall ? 0.66 : 1);
          target.dmg += a.count * rate * mod * dt;
          while (target.dmg >= 1 && target.count > 0) {
            target.dmg -= 1; target.count -= 1;
            const p = target.pieces.pop();
            if (p) { p.userData.falling = 0.001; }
            if (target.count === 0) this._pushLog(`${target.side === 'atk' ? 'Tu' : 'Su'} ${LABEL[target.arm]} se rompe`);
          }
        }
      };
      hit(atk, def, true);
      hit(def, atk, false);
      // temblor del choque
      for (const sq of [...atk, ...def]) sq.group.position.x = sq.home.x + Math.sin(S2.t * 9 + sq.home.x) * 0.012;
      const defLeft = live(S2.def).reduce((n, x) => n + x.count, 0);
      if (defLeft > 0 && defLeft <= 1) {
        for (const sq of live(S2.def)) {
          sq.count = 0;
          while (sq.pieces.length) { const p = sq.pieces.pop(); if (p) p.userData.falling = 0.001; }
        }
        this._pushLog('Su guarnición se quiebra y cede el muro');
      }
      if (!live(S2.def).length || !live(S2.atk).length) {
        S2.phase = 'done';
        this._pushLog(live(S2.atk).length ? 'Capturas la Ciudadela' : 'El asalto se rompe');
      }
    }

    // piezas caídas: se hunden y desaparecen
    for (const sq of [...S2.atk, ...S2.def]) {
      for (const child of sq.group.children) {
        if (child.userData.falling === undefined) continue;
        child.userData.falling += dt;
        const f = child.userData.falling;
        child.rotation.z = Math.min(f * 3, Math.PI / 2);
        child.position.y = -f * 0.25;
        if (f > 1.1) { sq.group.remove(child); }
      }
    }

    // La cámara sostiene el combate: sigue el centro de las tropas vivas.
    const alive = [...live(S2.atk), ...live(S2.def)];
    if (alive.length) {
      let z = 0;
      for (const sq of alive) z += sq.group.position.z;
      z = (z / alive.length) * 0.85 + 0.34;
      const a = 1 - Math.exp(-2 * dt);
      this._target.set(0, 0.42, this._target.z + (z - this._target.z) * a);
      this._place();
    }

    S2.emit += dt;
    if (S2.emit > 0.14) { S2.emit = 0; this._emitSkirmish(); }
  }

  private _pushLog(text: string): void {
    if (!this._skirmish) return;
    this._skirmish.log.unshift(text);
    this._skirmish.log = this._skirmish.log.slice(0, 3);
    this._emitSkirmish();
  }

  private _emitSkirmish(): void {
    const S2 = this._skirmish;
    if (!S2) return;
    const sum = (list: Squad[]): number => list.reduce((n, x) => n + x.count, 0);
    const one = (list: Squad[], arm: Arm): number => list.find((x) => x.arm === arm)?.count ?? 0;
    const clock = `${Math.floor(S2.t / 60)}:${String(Math.floor(S2.t % 60)).padStart(2, '0')}`;
    const atkTotal = sum(S2.atk), defTotal = sum(S2.def);
    const done = S2.phase === 'done';
    const won = done && atkTotal > 0;
    const v = {
      clock,
      phase: { advance: 'Avanzan · tiempo real', clash: 'Choque en curso', done: 'Escaramuza resuelta' }[S2.phase],
      atkTotal, defTotal,
      aLine: one(S2.atk, 'line'), aFire: one(S2.atk, 'fire'), aSky: one(S2.atk, 'sky'),
      dLine: one(S2.def, 'line'), dFire: one(S2.def, 'fire'),
      clash: done ? (won ? 'El muro cede' : 'Rechazados')
        : S2.phase === 'clash' ? 'Fuego rompe Línea · ×1,55' : 'Muralla · defensa ×1,5',
      resultTitle: won ? 'Capturas la Ciudadela' : 'El asalto se rompe',
      resultSub: `Bajas: ${13 - atkTotal} tuyas · ${9 - defTotal} suyas · en ${clock}`,
    };
    /**
     * El motor NO pinta la escaramuza.
     *
     * El mockup escribía directo en `document.querySelectorAll('[data-sk]')`, lo cual
     * vale para una maqueta de una sola página y no aquí: el DOM es de React, y un
     * elemento que escribe en todo el documento se sale de su propio recuadro. Se emite
     * el estado y lo pinta quien lo escuche, que es lo mismo que hace `_markers()` con
     * los rótulos (ADR-034).
     */
    this.dispatchEvent(new CustomEvent<SkirmishDetail>('gdc-skirmish', {
      bubbles: true,
      composed: true,
      detail: {
        t: S2.t, phase: S2.phase, clock, speed: this._speed,
        log: [...S2.log],
        atk: { total: atkTotal, line: v.aLine, fire: v.aFire, sky: v.aSky },
        def: { total: defTotal, line: v.dLine, fire: v.dFire, sky: 0 },
        clash: v.clash, resultTitle: v.resultTitle, resultSub: v.resultSub, done, won,
      },
    }));
  }

  setSpeed(x: number): void { this._speed = x; if (this._skirmish) this._emitSkirmish(); }

  replaySkirmish(): void {
    if (!this._skirmish) return;
    this._scene.remove(this._root);
    this._buildSkirmish();
    this._emitSkirmish();
  }

  // ── La ciudad ─────────────────────────────────────────────────────────────
  private _buildCity(): void {
    const root = new THREE.Group();
    this._scene.add(root);
    this._root = root;
    this._tilePos = new Map();

    const slots = (this.getAttribute('districts') || '3,2,2,1,0,0').split(',');
    const csi = Number(this.getAttribute('seat'));
    // El asiento tiñe la ciudad entera; sin atributo válido, el primero.
    const cityTint = seatColor(Number.isFinite(csi) && csi >= 0 ? csi : 0);
    const plate = new THREE.Mesh(hexPrism(4.6, 0.5), mat(0x5d6b48));
    plate.receiveShadow = true; root.add(plate);
    const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(
      (() => { const s = hexShape(4.62); s.holes.push(hexShape(4.3)); return s; })(),
      { depth: 0.42, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 1 },
    ), mat(0x8e7a66));
    rim.geometry.rotateX(-Math.PI / 2); rim.geometry.translate(0, 0.42, 0);
    rim.position.y = 0.5; rim.castShadow = true; rim.receiveShadow = true; root.add(rim);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const tw = tower(0.24, 1.15, 0x9b8770);
      tw.position.set(Math.cos(a) * 4.45, 0.5, Math.sin(a) * 4.45); root.add(tw);
    }

    // Seis distritos en corona. Cada uno es un edificio con identidad propia:
    // el atributo acepta "granary:3" o el nivel suelto ("3") por compatibilidad.
    const DISTRICTS: readonly BuildingKind[] =
      ['granary', 'foundry', 'watchtower', 'silo', 'wall', 'empty'];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const cx = Math.cos(a) * 2.75, cz = Math.sin(a) * 2.75;
      const raw = String(slots[i] ?? '0').trim();
      const kind = asBuilding(raw.includes(':') ? (raw.split(':')[0] ?? null) : (DISTRICTS[i] ?? null));
      const level = Number(raw.includes(':') ? raw.split(':')[1] : raw) || 0;
      const g = new THREE.Group(); g.position.set(cx, 0.5, cz); g.rotation.y = -a;
      const pad = new THREE.Mesh(hexPrism(1.15, 0.1), mat(level ? 0xa79c86 : 0x4d5140));
      pad.receiveShadow = true; g.add(pad);
      const asset = buildingAsset(level ? kind : 'empty', level, cityTint);
      asset.position.y = 0.1;
      asset.scale.setScalar(1.15);
      g.add(asset);
      root.add(g);
      this._tilePos.set(`d${i}`, new THREE.Vector3(cx, 1.5, cz));
      this._tilePos.set(`d${i}-${kind}`, new THREE.Vector3(cx, 1.5, cz));
    }

    // Plaza: monumento de la ciudad + silo de Ceniza, de la misma biblioteca.
    const plaza = new THREE.Mesh(hexPrism(1.5, 0.12), mat(0x2f332f));
    plaza.position.y = 0.5; plaza.receiveShadow = true; root.add(plaza);

    const monument = buildingAsset('monument', 3, cityTint);
    monument.position.y = 0.62;
    monument.scale.setScalar(1.75);
    root.add(monument);
    this._shard = monument.children.find(
      (c) => (c as Partial<THREE.Mesh>).geometry?.type === 'OctahedronGeometry',
    );
    this._tilePos.set('plaza', new THREE.Vector3(0, 2.9, 0));

    const silo = buildingAsset('silo', 2, cityTint);
    silo.position.set(1.15, 0.62, 1.05);
    silo.scale.setScalar(1.3);
    root.add(silo);
    this._tilePos.set('silo', new THREE.Vector3(1.15, 2.1, 1.05));

    // Ciudades que llegan al campo (emparejamiento).
    const arrivals = Number(this.getAttribute('arrivals') ?? 0);
    const total = Number(this.getAttribute('arrival-total') ?? 0);
    for (let i = 0; i < total; i += 1) {
      const a = (i / total) * Math.PI * 2 - Math.PI / 2 + Math.PI * 0.66;
      const here = i < arrivals;
      const g = new THREE.Group();
      g.position.set(Math.cos(a) * 4.9, here ? 0 : 1.4, Math.sin(a) * 4.9);
      const p = new THREE.Mesh(hexPrism(1.55, 0.4), mat(here ? 0x3b4038 : 0x23262a, { transparent: !here, opacity: here ? 1 : 0.35 }));
      p.receiveShadow = true; g.add(p);
      if (here) {
        for (let b = 0; b < 5; b += 1) {
          const ang = (b / 5) * Math.PI * 2;
          const bd = building(0.3, 0.4 + (b % 3) * 0.22, 0.3, 0x8b8579);
          bd.position.set(Math.cos(ang) * 0.85, 0.4, Math.sin(ang) * 0.85); g.add(bd);
        }
        const mark = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0),
          mat(seatColor(i + 1), { emissive: seatColor(i + 1), emissiveIntensity: 0.8, flat: true }));
        mark.position.y = 1.1; mark.scale.y = 1.5; g.add(mark);
      }
      this._scene.add(g);
      this._tilePos.set(`arrival${i}`, new THREE.Vector3(g.position.x, 1.5, g.position.z));
    }
  }

  private _buildAshfall(): void {
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i += 1) {
      pos[i * 3] = (Math.random() - 0.5) * 34;
      pos[i * 3 + 1] = Math.random() * 18;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 34;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this._ash = new THREE.Points(geo, new THREE.PointsMaterial({
      color: PAL.ash, size: 0.075, transparent: true, opacity: 0.4, depthWrite: false,
    }));
    this._scene.add(this._ash);
  }

  private _applyFocus(): void {
    const f = this.getAttribute('focus');
    if (f === 'core') this._target.set(0, 1.4, 0);
    else if (f === 'bastion' && this._bastionPos) {
      const pull = this._world === 'campaign' ? 0.46 : 0.72;
      this._target.copy(this._bastionPos).multiplyScalar(pull).setY(0.6);
    }
    else if (f === 'plaza') this._target.set(0, 1.2, 0);
    else if (f === 'clash') this._target.set(0, 0.42, 0.02);
    else if (this._world === 'hero') this._target.set(0, 0.98, 0);
    else if (this._world === 'unit') this._target.set(0, 0.26, 0);
    else if (this._world === 'asset') this._target.set(0, 0.52, 0);
    else if (this._world === 'tile') this._target.set(0, this._tileTop ?? 0.34, 0);
    // El encuadre inicial se acota igual que el desplazamiento: si el Bastión cae en el
    // anillo exterior, mirarlo de frente deja un tercio de pantalla en negro por fuera de
    // la costa. Hace falta un `_place()` previo porque el recorte depende de la distancia.
    this._settle();
  }

  // Encuadra el mundo por su radio, no por una distancia fija: así cuadra en
  // cualquier proporción de pantalla (una vertical de móvil necesita alejarse más).
  private _place(): void {
    const elev = Number(this.getAttribute('elevation') ?? 0.62);
    const aspect = Math.max(0.2, (this.clientWidth || 1) / (this.clientHeight || 1));
    const tan = Math.tan((this._camera.fov * Math.PI) / 360);
    const R = this._radius * this._zoom;
    let d;
    if (['hero', 'unit', 'asset', 'tile'].includes(this._world)) {
      const halfV = Math.atan(tan);
      const halfH = Math.atan(tan * aspect);
      d = R / Math.sin(Math.min(halfV, halfH));
    } else if (this._world === 'campaign') {
      // Encuadre honesto. El mapa es un disco horizontal de radio R: en pantalla mide R de
      // ancho y R·sen(elev) de alto, que es lo que la inclinación escorza. Ajustar por los
      // dos ejes es lo que hace que quepa entero en un vertical de móvil y en un monitor.
      //
      // Y **sin `fudge`**. El 0,66 de la Ciudad acerca la cámara para que la maqueta llene
      // el cuadro; en un mapa de 96 provincias eso amontona el lado lejano contra el
      // horizonte —las de delante enormes, las de atrás una pila de esquirlas— y el
      // territorio deja de leerse. Una carta de situación se mira entera.
      //
      // El `+ R·cos(elev)` es la perspectiva: el borde cercano del mapa está esa distancia
      // MÁS CERCA que el centro, así que se proyecta más grande y se sale por abajo. Sin
      // ese término el ajuste cuadra en papel y recorta el mapa en pantalla.
      d = Math.max((R * Math.sin(elev)) / tan, R / (tan * aspect)) + R * Math.cos(elev);
    } else {
      const fudge = this._world === 'skirmish' ? 1 : 0.66;
      d = Math.max(R / (tan * aspect), (R * 0.72) / tan) * fudge;
    }
    this._dist = d;
    const fog = this._scene.fog;
    if (fog instanceof THREE.Fog) { fog.near = d * 0.6; fog.far = d * 2.1; }
    this._camera.position.set(
      this._target.x + Math.cos(this._azimuth) * d * Math.cos(elev),
      this._target.y + Math.sin(elev) * d,
      this._target.z + Math.sin(this._azimuth) * d * Math.cos(elev),
    );
    this._camera.lookAt(this._target);
  }

  /**
   * Gestos.
   *
   * En las vitrinas y en la Ciudad el arrastre **gira** la cámara, que es lo que se quiere
   * de un objeto que se mira. En la campaña **desplaza el mapa**, que es lo que se quiere
   * de un territorio por el que se navega, y el pellizco acerca y aleja. Un mapa que gira
   * cuando intentas moverte por él es un mapa en el que te pierdes.
   */
  private _drag(): void {
    if (this._bound) return;
    this._bound = true;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    let pinchZoom = 1;

    this.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) this._dragged = 0;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
        pinchZoom = this._zoom;
      }
      this.setPointerCapture(e.pointerId);
    });

    this.addEventListener('pointermove', (e) => {
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      const next = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, next);
      this._dragged += Math.hypot(next.x - previous.x, next.y - previous.y);

      if (pointers.size === 2 && this._world === 'campaign') {
        const [a, b] = [...pointers.values()];
        const spread = Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
        if (pinch > 0) {
          this._zoom = Math.min(this._far(), Math.max(0.22, (pinchZoom * pinch) / spread));
          this._settle();
        }
        return;
      }

      if (this._world !== 'campaign') {
        this._azimuth += (next.x - previous.x) * 0.006;
        this._place();
        return;
      }

      this._pan(next.x - previous.x, next.y - previous.y);
    });

    const end = (e: PointerEvent) => { pointers.delete(e.pointerId); pinch = 0; };
    this.addEventListener('pointerup', end);
    this.addEventListener('pointercancel', end);
  }

  /**
   * Desplaza el objetivo por el suelo, en los ejes de la cámara.
   *
   * Acotado al mapa: sin límite, un arrastre largo deja el terreno fuera de pantalla y no
   * hay forma de volver — la libertad de movimiento acaba en un lienzo vacío.
   */
  private _pan(dx: number, dy: number): void {
    const height = this.clientHeight || 1;
    const perPixel = (2 * this._dist * Math.tan((this._camera.fov * Math.PI) / 360)) / height;
    const right = new THREE.Vector3(Math.sin(this._azimuth), 0, -Math.cos(this._azimuth));
    const forward = new THREE.Vector3(-Math.cos(this._azimuth), 0, -Math.sin(this._azimuth));
    this._target.addScaledVector(right, -dx * perPixel);
    this._target.addScaledVector(forward, -dy * perPixel);
    this._settle();
  }

  /**
   * El mapa no se puede sacar de cuadro.
   *
   * Lo que se puede desplazar es exactamente lo que no cabe. El límite anterior era el
   * radio entero por 1,1: se podía arrastrar hasta dejar el tablero fuera de pantalla y
   * quedarse mirando el vacío, que en un mapa de 96 provincias es la forma más rápida de
   * perderse y de que el juego parezca roto.
   */
  private _clampTarget(): void {
    if (this._world !== 'campaign') {
      const wide = this._radius * 1.1;
      this._target.x = Math.min(wide, Math.max(-wide, this._target.x));
      this._target.z = Math.min(wide, Math.max(-wide, this._target.z));
      return;
    }
    const elev = Number(this.getAttribute('elevation') ?? 0.62);
    const aspect = Math.max(0.2, (this.clientWidth || 1) / (this.clientHeight || 1));
    const tan = Math.tan((this._camera.fov * Math.PI) / 360);
    // Media anchura de suelo que entra en cuadro. La profundidad entra más —la cámara está
    // inclinada— pero acotar por la estrecha es lo que garantiza que siempre haya mapa.
    const half = this._dist * tan * Math.min(aspect, 1 / Math.sin(elev));
    const limit = Math.max(0, this._radius - half);
    const away = Math.hypot(this._target.x, this._target.z);
    if (away > limit) {
      this._target.x *= limit / away;
      this._target.z *= limit / away;
    }
  }

  private _resize(): void {
    const w = this.clientWidth || 1, h = this.clientHeight || 1;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    // El encuadre de salida no se puede calcular al conectar: el elemento todavía no tiene
    // ancho, y de él dependen la distancia y el recorte. Aquí ya lo tiene.
    if (this._openZoom && this.clientWidth > 0) {
      this._openZoom = false;
      this._zoom = this._provinceZoom();
      this._applyFocus();
      return;
    }
    if (this._radius) this._place();
  }

  /**
   * A cuánto se abre el mapa de campaña, **medido en provincias**.
   *
   * Una fracción fija del mapa no vale: a tres jugadores hay 45 provincias y a cinco 96,
   * así que el mismo 46 % daba provincias del doble de tamaño en una partida que en otra
   * —a tres se entraba con diez en pantalla, casi en la cara—. Lo que tiene que ser
   * constante es cuánto mide una provincia en pantalla, porque de eso dependen que se
   * lea, que se pueda tocar y que se entienda dónde estás.
   *
   * Nunca más lejos que el mapa entero: en una partida de dos, `OPEN_SPAN` provincias son
   * más mundo del que hay.
   */
  private _provinceZoom(): number {
    const elev = Number(this.getAttribute('elevation') ?? 0.62);
    const aspect = Math.max(0.2, (this.clientWidth || 1) / (this.clientHeight || 1));
    const tan = Math.tan((this._camera.fov * Math.PI) / 360);
    const full = Math.max(Math.sin(elev) / tan, 1 / (tan * aspect)) + Math.cos(elev);
    const open = (OPEN_SPAN * S) / (tan * Math.min(aspect, 1 / Math.sin(elev)));
    return Math.min(1, open / Math.max(1e-6, full * this._radius));
  }

  private _markers(): void {
    const nodes = (this.parentElement ?? this).querySelectorAll<HTMLElement>('[data-tile]');
    if (!nodes.length) return;
    const w = this.clientWidth, h = this.clientHeight;
    for (const el of nodes) {
      const name = el.dataset['tile'];
      const p = name ? this._tilePos.get(name) : undefined;
      if (!p) { el.style.opacity = '0'; continue; }
      const v = p.clone();
      v.y += Number(el.dataset['lift'] ?? 0.55);
      v.project(this._camera);
      // Un rótulo cuya provincia no está en cuadro se ocultaba pegándose al borde, y en un
      // mapa de 96 se amontonaban todos ahí: cifras de fuerzas que no se ven en sitios
      // donde no están.
      if (el.dataset['edge'] === 'hide' && (Math.abs(v.x) > 1 || Math.abs(v.y) > 1)) {
        el.style.opacity = '0';
        continue;
      }
      el.style.position = 'absolute';
      const half = (el.offsetWidth || 0) / 2 + 6;
      const x = Math.min(Math.max(((v.x + 1) / 2) * w, half), Math.max(half, w - half));
      el.style.left = `${x}px`;
      const minTop = Number(el.dataset.topMin ?? 0) + (el.offsetHeight || 0) + 6;
      el.style.top = `${Math.max(((-v.y + 1) / 2) * h, minTop)}px`;
      el.style.transform = 'translate(-50%,-100%)';
      el.style.opacity = v.z < 1 ? '1' : '0';
    }
  }

  private _loop(): void {
    if (this._paused || !this._built || !this._scene) return;
    this._raf = requestAnimationFrame(() => this._loop());
    if (!this._clock) return;
    const t = this._clock.getElapsedTime();
    const dt = Math.min(0.05, t - (this._lastT ?? t));
    this._lastT = t;
    if (this._skirmish) this._stepSkirmish(dt * this._speed);
    if (this._heroGroup && this._turntable) this._heroGroup.rotation.y += dt * this._turntable;
    if (this._shard) { this._shard.rotation.y = t * 0.4; this._shard.position.y += Math.sin(t * 1.2) * 0.0015; }
    if (this._coreRing) this._coreRing.rotation.z = t * 0.25;
    if (this._ash) {
      const p = this._ash.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (p) {
        for (let i = 0; i < p.count; i += 1) {
          let y = p.getY(i) - 0.012 - (i % 3) * 0.003;
          if (y < -1) y = 18;
          p.setY(i, y);
          p.setX(i, p.getX(i) + Math.sin(t * 0.3 + i) * 0.002);
        }
        p.needsUpdate = true;
      }
    }
    this._renderer.render(this._scene, this._camera);
    this._markers();
  }
}

/** Registra el elemento. Idempotente: el módulo puede cargarse más de una vez. */
export function defineWorld(): void {
  if (typeof customElements !== 'undefined' && !customElements.get('gdc-world')) {
    customElements.define('gdc-world', GdcWorld);
  }
}

defineWorld();
