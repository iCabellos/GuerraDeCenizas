// Motor 2.5D de Guerra de Cenizas — geometría 100 % procedural y propia.
// Un solo custom element, <gdc-world>, con tres mundos: la Ciudad, el Campo y la
// Escaramuza. Cámara isométrica, hexágonos extruidos con bisel, sombras suaves.
//
// Es CAPA DE PRESENTACIÓN y nada más: no decide, no persiste y no lee estado sin
// filtrar. La superficie interactiva y anunciable sigue siendo DOM — los rótulos se
// posicionan con `_markers()` proyectando el mundo sobre elementos `[data-tile]`
// reales (ADR-034). El `Math.random()` de la ceniza es decorativo y vive aquí,
// nunca en `packages/core`.
import * as THREE from 'three';
import {
  GAP, HEIGHT, PAL, S, TOP, axialToWorld, boardTiles, hexPrism, hexShape, key, mat, seatColor,
  type Arm, type Kind, type Tile,
} from './board';

export type { Arm, Kind } from './board';

type Squad = {
  side: 'atk' | 'def'; arm: Arm; seat: number; count: number; max: number;
  group: THREE.Group; pieces: THREE.Group[]; dmg: number;
  home: THREE.Vector3; goal: THREE.Vector3;
};

type Skirmish = {
  t: number; phase: 'advance' | 'clash' | 'done'; log: string[]; emit: number;
  atk: Squad[]; def: Squad[];
};

/** Lo que el elemento emite en cada paso de la escaramuza. */
export type SkirmishSide = {
  total: number; max: number;
  squads: { arm: Arm; label: string; count: number; max: number }[];
};
export type SkirmishDetail = {
  t: number; phase: Skirmish['phase']; log: string[];
  atk: SkirmishSide; def: SkirmishSide; speed: number;
};

const LABEL: Record<Arm | 'shade', string> = { line: 'Línea', fire: 'Fuego', sky: 'Cielo', shade: 'Sombra' };

// ── Piezas ──────────────────────────────────────────────────────────────────
function tree(h: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, h * 0.4, 8), mat(0x5b4c38));
  trunk.position.y = h * 0.2;
  const canopy = new THREE.Mesh(new THREE.IcosahedronGeometry(h * 0.34, 1), mat(0x47714a, { flat: true }));
  canopy.position.y = h * 0.62;
  canopy.scale.set(1, 1.25, 1);
  g.add(trunk, canopy);
  g.traverse((m: THREE.Object3D) => { m.castShadow = true; });
  return g;
}

function building(w: number, h: number, d: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  body.position.y = h / 2;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, Math.min(h * 0.07, 0.05), d * 1.1), mat(0xc4b8a4));
  cap.position.y = h + 0.02;
  g.add(body, cap);
  g.traverse((m: THREE.Object3D) => { m.castShadow = true; m.receiveShadow = true; });
  return g;
}

function tower(r: number, h: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.15, h, 16), mat(color));
  body.position.y = h / 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.35, h * 0.35, 16), mat(0x8f5a3e));
  roof.position.y = h + h * 0.22;
  g.add(body, roof);
  g.traverse((m: THREE.Object3D) => { m.castShadow = true; });
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
  g.traverse((m: THREE.Object3D) => { m.castShadow = true; });
  return g;
}

// Fuerzas: silueta distinta por arma, nunca solo color.
function unitPiece(arm: Arm, colorHex: number): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.29, 0.08, 20),
    mat(colorHex, { emissive: colorHex, emissiveIntensity: 0.35, roughness: 0.5 }));
  base.position.y = 0.03;
  g.add(base);
  const body = mat(0xd0cbc2, { roughness: 0.6 });
  if (arm === 'line') {
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.3, 0.09), body);
    shield.position.y = 0.21; g.add(shield);
    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), body);
    helm.position.y = 0.4; g.add(helm);
  } else if (arm === 'fire') {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.36, 14), body);
    barrel.position.set(0, 0.22, 0); barrel.rotation.z = 0.5; g.add(barrel);
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.18), body);
    block.position.y = 0.1; g.add(block);
  } else {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 4), body);
    wing.position.y = 0.38; wing.rotation.x = Math.PI / 2; wing.rotation.z = Math.PI / 4; g.add(wing);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), mat(0x2b2e34));
    mast.position.y = 0.16; g.add(mast);
  }
  g.traverse((m: THREE.Object3D) => { m.castShadow = true; });
  g.scale.setScalar(1.65);
  return g;
}

// ── Terreno del campo de batalla ────────────────────────────────────────────
// ── El elemento ─────────────────────────────────────────────────────────────
export class GdcWorld extends HTMLElement {
  private _built = false;
  private _renderer!: THREE.WebGLRenderer;
  private _scene!: THREE.Scene;
  private _camera!: THREE.PerspectiveCamera;
  private _world = 'map';
  private _root!: THREE.Group;
  private _tilePos: Map<string, THREE.Vector3> = new Map();
  private _azimuth = -0.45;
  private _radius = 0;
  private _zoom = 1;
  private _target = new THREE.Vector3();
  private _ro?: ResizeObserver;
  private _paused = false;
  private _raf = 0;
  private _clock?: THREE.Clock;
  private _lastT?: number;
  private _speed = 1;
  private _skirmish?: Skirmish;
  private _shard?: THREE.Mesh;
  private _coreRing?: THREE.Mesh;
  private _ash?: THREE.Points;
  private _bastionPos?: THREE.Vector3;

  connectedCallback(): void {
    if (this._built) { this._resume(); return; }
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

    this._lights();
    this._world = this.getAttribute('scene') || 'map';
    if (this._world === 'city') this._buildCity();
    else if (this._world === 'skirmish') this._buildSkirmish();
    else this._buildBoard();
    if (this.hasAttribute('ash')) this._buildAshfall();

    this._azimuth = Number(this.getAttribute('azimuth') ?? -0.45);
    this._radius = Number(this.getAttribute('radius') ?? (this._world === 'city' ? 5.4 : this._world === 'skirmish' ? 3.5 : 6.5));
    this._zoom = Number(this.getAttribute('zoom') ?? 1);
    this._target = new THREE.Vector3(0, 0, 0);
    this._applyFocus();

    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    this._resize();
    this._drag();
    this._resume();
  }

  disconnectedCallback(): void {
    this._paused = true;
    cancelAnimationFrame(this._raf);
    if (this._ro) this._ro.disconnect();
    this._scene.traverse((o: THREE.Object3D) => {
      const m = o as Partial<THREE.Mesh>;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    });
    this._renderer.dispose();
    this._renderer.forceContextLoss();
    this._built = false;
  }

  private _resume(): void { this._paused = false; this._speed = this._speed ?? 1; this._clock = this._clock || new THREE.Clock(); this._loop(); }

  private _lights(): void {
    const s = this._scene;
    s.add(new THREE.HemisphereLight(0xa8bed4, 0x2a2318, 0.95));
    const keyLight = new THREE.DirectionalLight(0xffeed6, 2.6);
    keyLight.position.set(-8, 13, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -14; keyLight.shadow.camera.right = 14;
    keyLight.shadow.camera.top = 14; keyLight.shadow.camera.bottom = -14;
    keyLight.shadow.camera.far = 46; keyLight.shadow.bias = -0.0012;
    s.add(keyLight);
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

  private _props(g: THREE.Group, t: Tile, h: number, owner: number | null): void {
    if (t.kind === 'forest') {
      const spots: [number, number, number][] = [[-0.34, -0.2, 0.95], [0.3, -0.32, 0.8], [0.05, 0.3, 1.05], [-0.42, 0.34, 0.7]];
      for (const [dx, dz, s] of spots) {
        const tr = tree(0.85 * s); tr.position.set(dx, h, dz); g.add(tr);
      }
    } else if (t.kind === 'urban') {
      const cols = [0x9a9488, 0x8b8579, 0xa8a294];
      const blocks: [number, number, number, number, number][] = [
        [-0.36, -0.3, 0.44, 0.62, 0.4], [0.3, -0.36, 0.38, 0.92, 0.36],
        [0.08, 0.34, 0.52, 0.5, 0.44], [-0.42, 0.36, 0.34, 0.4, 0.3],
      ];
      blocks.forEach(([x, z, w, bh, d], i) => {
        const b = building(w, bh, d, cols[i % 3] ?? 0x9a9488);
        b.position.set(x, h, z); g.add(b);
      });
    } else if (t.kind === 'high') {
      const rocks: [number, number, number][] = [[-0.2, -0.1, 1], [0.28, 0.22, 0.7], [0.02, 0.36, 0.5]];
      for (const [dx, dz, s] of rocks) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 * s, 0), mat(0x77705f, { flat: true }));
        rock.position.set(dx, h + 0.16 * s, dz); rock.rotation.set(s, s * 2, s * 0.5);
        rock.castShadow = true; rock.receiveShadow = true; g.add(rock);
      }
    } else if (t.kind === 'seam') {
      const c = crystal(1.3); c.position.set(0, h, 0); g.add(c);
      const light = new THREE.PointLight(PAL.ashGlow, 0.9, 2.2); light.position.set(0, h + 0.45, 0); g.add(light);
    } else if (t.kind === 'bastion') {
      const wall = new THREE.Mesh(new THREE.ExtrudeGeometry(
        (() => { const s = hexShape(S * 0.78); s.holes.push(hexShape(S * 0.6)); return s; })(),
        { depth: 0.34, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 1 },
      ), mat(0x9c8670));
      wall.geometry.rotateX(-Math.PI / 2); wall.geometry.translate(0, 0.34, 0);
      wall.position.y = h; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        const tw = tower(0.13, 0.55, 0xa08a72);
        tw.position.set(Math.cos(a) * 0.69, h, Math.sin(a) * 0.69); g.add(tw);
      }
      const keep = building(0.4, 0.5, 0.4, 0xab9a86); keep.position.set(0, h, 0); g.add(keep);
      if (owner !== null) { const b = banner(seatColor(owner)); b.position.set(0.32, h + 0.5, -0.2); g.add(b); }
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
      const marks: [number, number][] = [[-0.3, 0.28], [0.34, -0.2]];
      for (const [dx, dz] of marks) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.3), mat(0x555f4d));
        m.position.set(dx, h + 0.02, dz); m.rotation.y = dx; m.receiveShadow = true; g.add(m);
      }
    }
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
    for (let q = -2; q <= 2; q += 1) {
      for (let r = -1; r <= 1; r += 1) {
        const kind = r === 1 ? 'urban' : r === -1 ? 'plain' : 'plain';
        const h = r === 1 ? 0.46 : 0.34;
        const p = axialToWorld(q, r);
        const tileG = new THREE.Group();
        tileG.position.copy(p);
        const prism = new THREE.Mesh(hexPrism(S * GAP, h), mat(TOP[kind], { roughness: 0.9 }));
        prism.castShadow = true; prism.receiveShadow = true;
        tileG.add(prism);
        if (r === 1) {
          const wall = new THREE.Mesh(new THREE.BoxGeometry(S * 1.6, 0.42, 0.2), mat(0x9c8670));
          wall.position.set(0, h + 0.21, -S * 0.72);
          wall.castShadow = true; wall.receiveShadow = true;
          tileG.add(wall);
          if (q % 2 === 0) { const tw = tower(0.14, 0.62, 0xa08a72); tw.position.set(S * 0.8, h, -S * 0.72); tileG.add(tw); }
        }
        if (r === -1 && q % 2 === 0) { const tr = tree(0.7); tr.position.set(0.3, h, 0.3); tileG.add(tr); }
        root.add(tileG);
      }
    }

    const y = 0.34, yDef = 0.46;
    const squad = (side: Squad['side'], arm: Arm, count: number, x: number, z: number, seat: number): Squad => {
      const g = new THREE.Group();
      const pieces: THREE.Group[] = [];
      for (let i = 0; i < count; i += 1) {
        const u = unitPiece(arm, seatColor(seat));
        u.scale.multiplyScalar(0.5);
        u.position.set(((i % 3) - 1) * 0.34, 0, Math.floor(i / 3) * 0.32 * (side === 'atk' ? -1 : 1));
        u.rotation.y = side === 'atk' ? Math.PI : 0;
        pieces.push(u); g.add(u);
      }
      g.position.set(x, side === 'atk' ? y : yDef, z);
      root.add(g);
      return { side, arm, seat, count, max: count, group: g, pieces, dmg: 0, home: g.position.clone(), goal: g.position.clone() };
    };

    this._skirmish = {
      t: 0, phase: 'advance', log: [], emit: 0,
      atk: [squad('atk', 'line', 6, -1.55, -1.75, 0), squad('atk', 'fire', 3, 0, -2.1, 0), squad('atk', 'sky', 4, 1.55, -1.75, 0)],
      def: [squad('def', 'line', 6, -0.85, 1.18, 1), squad('def', 'fire', 3, 1.15, 1.5, 1)],
    };
    for (const sq of this._skirmish.atk) sq.goal = new THREE.Vector3(sq.home.x * 0.72, y, 0.34);
    for (const sq of this._skirmish.def) sq.goal = sq.home.clone();

    this._tilePos.set('atk', new THREE.Vector3(0, y + 0.55, -1.9));
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
      const defLeft = live(S2.def).reduce((n: number, x: Squad) => n + x.count, 0);
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
    const side = (list: Squad[]): SkirmishSide => ({
      total: list.reduce((n: number, s: Squad) => n + s.count, 0),
      max: list.reduce((n: number, s: Squad) => n + s.max, 0),
      squads: list.map((s) => ({ arm: s.arm, label: LABEL[s.arm], count: s.count, max: s.max })),
    });
    this.dispatchEvent(new CustomEvent<SkirmishDetail>('gdc-skirmish', {
      bubbles: true, composed: true,
      detail: { t: S2.t, phase: S2.phase, log: [...S2.log], atk: side(S2.atk), def: side(S2.def), speed: this._speed },
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

    const levels = (this.getAttribute('districts') || '3,2,2,1,0,0').split(',').map(Number);
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

    // Seis distritos en corona. El nivel se lee en altura y densidad.
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const cx = Math.cos(a) * 2.75, cz = Math.sin(a) * 2.75;
      const level = levels[i] ?? 0;
      const g = new THREE.Group(); g.position.set(cx, 0.5, cz); g.rotation.y = -a;
      const pad = new THREE.Mesh(hexPrism(1.15, 0.1), mat(level ? 0xa79c86 : 0x4d5140));
      pad.receiveShadow = true; g.add(pad);
      if (level === 0) {
        const fields: [number, number][] = [[-0.4, -0.3], [0.4, -0.3], [0, 0.42]];
        for (const [x, z] of fields) {
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.42), mat(0x3d4038));
          f.position.set(x, 0.11, z); g.add(f);
        }
      } else {
        const n = 2 + level * 2;
        for (let b = 0; b < n; b += 1) {
          const ang = (b / n) * Math.PI * 2;
          const rad = 0.28 + (b % 2) * 0.42;
          const hgt = 0.45 + level * 0.34 + (b % 3) * 0.2;
          const bd = building(0.3, hgt, 0.3, b % 2 ? 0x9a9488 : 0x8b8579);
          bd.position.set(Math.cos(ang) * rad, 0.1, Math.sin(ang) * rad);
          bd.rotation.y = ang; g.add(bd);
        }
        if (level >= 3) { const t2 = tower(0.2, 1.5, 0xb0aa9c); t2.position.set(0, 0.08, 0); g.add(t2); }
      }
      root.add(g);
      this._tilePos.set(`d${i}`, new THREE.Vector3(cx, 1.4, cz));
    }

    // Plaza: monumento de la facción + silo de Ceniza.
    const plaza = new THREE.Mesh(hexPrism(1.5, 0.12), mat(0x2f332f));
    plaza.position.y = 0.5; plaza.receiveShadow = true; root.add(plaza);
    const spire = new THREE.Group();
    for (let i = 0; i < 3; i += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.1 - i * 0.3, 0.3), mat(0xb0a08e));
      const a = (i / 3) * Math.PI * 2;
      blade.position.set(Math.cos(a) * 0.3, (2.1 - i * 0.3) / 2, Math.sin(a) * 0.3);
      blade.rotation.y = a; blade.castShadow = true; spire.add(blade);
    }
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0),
      mat(PAL.rust, { emissive: PAL.rust, emissiveIntensity: 0.8, flat: true }));
    orb.position.y = 2.35; orb.scale.y = 1.5; spire.add(orb);
    spire.position.y = 0.62; root.add(spire);
    this._shard = orb;
    const plazaLight = new THREE.PointLight(PAL.rust, 3.4, 7);
    plazaLight.position.set(0, 2.6, 0);
    root.add(plazaLight);
    this._tilePos.set('plaza', new THREE.Vector3(0, 2.9, 0));

    const silo = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.25, 20, 1, true),
      mat(0x8d949c, { roughness: 0.45, metalness: 0.35 }));
    shell.position.y = 0.62; shell.castShadow = true;
    const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 20),
      mat(PAL.ash, { emissive: PAL.ashGlow, emissiveIntensity: 0.45 }));
    fill.position.y = 0.35;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 20), mat(0x6f767e));
    cap.position.y = 1.28;
    silo.add(shell, fill, cap);
    silo.position.set(1.15, 0.62, 1.05); root.add(silo);
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
    else if (f === 'bastion' && this._bastionPos) this._target.copy(this._bastionPos).multiplyScalar(0.72).setY(0.6);
    else if (f === 'plaza') this._target.set(0, 1.2, 0);
    this._place();
  }

  // Encuadra el mundo por su radio, no por una distancia fija: así cuadra en
  // cualquier proporción de pantalla (una vertical de móvil necesita alejarse más).
  private _place(): void {
    const elev = Number(this.getAttribute('elevation') ?? 0.62);
    const aspect = Math.max(0.2, (this.clientWidth || 1) / (this.clientHeight || 1));
    const tan = Math.tan((this._camera.fov * Math.PI) / 360);
    const R = this._radius * this._zoom;
    const d = Math.max(R / (tan * aspect), (R * 0.72) / tan) * 0.66;
    const fog = this._scene.fog;
    if (fog instanceof THREE.Fog) { fog.near = d * 0.6; fog.far = d * 2.1; }
    this._camera.position.set(
      this._target.x + Math.cos(this._azimuth) * d * Math.cos(elev),
      this._target.y + Math.sin(elev) * d,
      this._target.z + Math.sin(this._azimuth) * d * Math.cos(elev),
    );
    this._camera.lookAt(this._target);
  }

  private _drag(): void {
    let last: number | null = null;
    this.addEventListener('pointerdown', (e) => { last = e.clientX; this.setPointerCapture(e.pointerId); });
    this.addEventListener('pointermove', (e) => {
      if (last === null) return;
      this._azimuth += (e.clientX - last) * 0.006;
      last = e.clientX; this._place();
    });
    const end = () => { last = null; };
    this.addEventListener('pointerup', end);
    this.addEventListener('pointercancel', end);
  }

  private _resize(): void {
    const w = this.clientWidth || 1, h = this.clientHeight || 1;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    if (this._radius) this._place();
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
      v.y += Number(el.dataset.lift ?? 0.55);
      v.project(this._camera);
      el.style.position = 'absolute';
      const half = (el.offsetWidth || 0) / 2 + 6;
      const x = Math.min(Math.max(((v.x + 1) / 2) * w, half), Math.max(half, w - half));
      el.style.left = `${x}px`;
      el.style.top = `${Math.max(((-v.y + 1) / 2) * h, (el.offsetHeight || 0) + 6)}px`;
      el.style.transform = 'translate(-50%,-100%)';
      el.style.opacity = v.z < 1 ? '1' : '0';
    }
  }

  private _loop(): void {
    if (this._paused) return;
    this._raf = requestAnimationFrame(() => this._loop());
    if (!this._clock) return;
    const t = this._clock.getElapsedTime();
    const dt = Math.min(0.05, t - (this._lastT ?? t));
    this._lastT = t;
    if (this._skirmish) this._stepSkirmish(dt * this._speed);
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
