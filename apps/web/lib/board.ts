import {
  ALL_BUILDINGS, BALANCE, TERRAIN_YIELD, canProduceInView, terrainAllows,
  type Adjacency, type FactionId, type PlayerView, type RegionId, type Seat, type TerrainKind,
  type VisibleForce, type Yield,
} from '@gdc/core';

/**
 * Lo que la pantalla de campaña necesita saber de una `PlayerView`, derivado aparte.
 *
 * Aquí no hay React ni DOM **a propósito**: son las cuentas que decidían antes tres
 * componentes distintos —quién manda en qué, dónde está el enemigo, qué se puede hacer en
 * esta región— y ninguna de las tres se podía probar sin montar una pantalla. Ahora son
 * funciones puras sobre la vista y tienen su test.
 *
 * **Nada de esto decide nada.** Todo sale de la vista que ya filtró el servidor y sirve
 * únicamente para pintar: la legalidad de una orden la vuelve a comprobar `reduce()`
 * contra el estado autoritativo, como manda `apps/web/CLAUDE.md`.
 */

/** Tus fuerzas, en orden estable: el mismo mapa da siempre la misma lista de órdenes. */
export function ownForces(view: PlayerView): VisibleForce[] {
  return view.forces
    .filter((force) => force.own)
    .sort((a, b) => a.regionId - b.regionId || (a.id < b.id ? -1 : 1));
}

/** Suma de armas de una fuerza. Las ajenas sin desglose usan su tamaño aproximado. */
export function sizeOf(force: VisibleForce): number {
  if (force.own || force.line !== null) {
    return (force.line ?? 0) + (force.fire ?? 0) + (force.sky ?? 0);
  }
  return force.approxTotal ?? 0;
}

/** El arma que da carácter a una fuerza: la mayor. En 360 px no caben tres cifras. */
export function dominantArm(force: VisibleForce): 'line' | 'fire' | 'sky' {
  const arms = [
    { arm: 'line' as const, count: force.line ?? 0 },
    { arm: 'fire' as const, count: force.fire ?? 0 },
    { arm: 'sky' as const, count: force.sky ?? 0 },
  ].sort((a, b) => b.count - a.count);
  return arms[0]?.arm ?? 'line';
}

/** Todo lo que se sabe de una región, resuelto de una vez. */
export interface RegionBrief {
  id: RegionId;
  kind: TerrainKind;
  owner: Seat | null;
  /** ¿Se observa este turno? Si no, lo que se pinta es memoria, no información. */
  observed: boolean;
  fortification: number;
  bridge: boolean;
  /** Renta bruta del terreno, antes del rendimiento decreciente. */
  yields: Yield;
  mine: VisibleForce[];
  enemies: VisibleForce[];
  /** ¿Es un Bastión, y de quién? */
  bastionOf: Seat | null;
  core: boolean;
  /** Se puede producir aquí. Lo decide `@gdc/core`, no esta pantalla. */
  canProduce: boolean;
}

export function briefOf(view: PlayerView, regionId: RegionId): RegionBrief | null {
  const region = view.map.regions[regionId];
  if (!region) return null;

  const here = view.forces.filter((force) => force.regionId === regionId);
  const bastionSeat = view.map.bastions.indexOf(regionId);

  return {
    id: regionId,
    kind: region.kind,
    owner: view.control[regionId] ?? null,
    observed: view.visible.includes(regionId),
    fortification: view.fortification[regionId] ?? 0,
    bridge: view.bridges[regionId] ?? false,
    yields: TERRAIN_YIELD[region.kind],
    mine: here.filter((force) => force.own),
    enemies: here.filter((force) => !force.own),
    bastionOf: bastionSeat === -1 ? null : (bastionSeat as Seat),
    core: regionId === view.map.coreId,
    canProduce: canProduceInView(view, regionId),
  };
}

/**
 * El reparto, asiento por asiento.
 *
 * Es la pantalla de diplomacia que el juego **sí** puede enseñar hoy: el control
 * territorial es público (GDD §6.2), así que quién tiene cuántas regiones y cuántos
 * yacimientos se sabe con certeza, sin niebla y sin estimaciones. La Ceniza ajena no está
 * porque no se ve, y fingir una cifra sería peor que no darla.
 */
export interface LedgerRow {
  seat: Seat;
  name: string;
  factionId: FactionId;
  own: boolean;
  /** Comparte facción contigo. Informativo: no tiene efecto mecánico. */
  concordant: boolean;
  regions: number;
  seams: number;
  /** ¿Controla el Núcleo? */
  core: boolean;
  /** Regiones suyas que tocan una tuya. Es la frontera, y por eso la conversación. */
  contact: number;
  /** Su Bastión, para poder llevar la cámara. */
  bastion: RegionId | undefined;
}

export function ledger(view: PlayerView, adjacency: Adjacency): LedgerRow[] {
  const seats = [
    { seat: view.seat, name: view.self.name, factionId: view.self.factionId, concordant: false },
    ...view.opponents.map((o) => ({
      seat: o.seat, name: o.name, factionId: o.factionId, concordant: o.concordant,
    })),
  ];

  const rows = seats.map((entry) => {
    let regions = 0;
    let seams = 0;
    let contact = 0;
    for (let regionId = 0; regionId < view.control.length; regionId += 1) {
      if (view.control[regionId] !== entry.seat) continue;
      regions += 1;
      if (view.map.regions[regionId]?.kind === 'seam') seams += 1;
      // Para el asiento propio, la frontera es con cualquier rival; para un rival, contigo.
      const touches = (adjacency[regionId] ?? []).some((other) =>
        entry.seat === view.seat
          ? view.control[other] !== null && view.control[other] !== view.seat
          : view.control[other] === view.seat);
      if (touches) contact += 1;
    }

    return {
      seat: entry.seat,
      name: entry.name,
      factionId: entry.factionId,
      own: entry.seat === view.seat,
      concordant: entry.concordant,
      regions,
      seams,
      core: view.control[view.map.coreId] === entry.seat,
      contact,
      bastion: view.map.bastions[entry.seat],
    };
  });

  // Por territorio y sin azar: quien va delante se lee arriba, y el orden no baila entre
  // turnos con los mismos números.
  return rows.sort((a, b) => b.regions - a.regions || b.seams - a.seams || a.seat - b.seat);
}

/**
 * Regiones tuyas con una fuerza enemiga al lado.
 *
 * Es lo que convierte el mapa en una partida: sin esto, «dónde está el enemigo» exigía
 * repasar 96 hexágonos a mano.
 */
export function threatened(view: PlayerView, adjacency: Adjacency): Set<RegionId> {
  const enemyAt = new Set(
    view.forces.filter((force) => !force.own).map((force) => force.regionId),
  );
  const found = new Set<RegionId>();
  for (let regionId = 0; regionId < view.control.length; regionId += 1) {
    if (view.control[regionId] !== view.seat) continue;
    if ((adjacency[regionId] ?? []).some((other) => enemyAt.has(other))) found.add(regionId);
  }
  return found;
}

// ─────────────────────────── Zonas: recorrer, no abarcar ──────────────────────

/**
 * El mapa pasó de 96 regiones a 271 y no cabe entero en 360 px con hexágonos tocables:
 * a escala 1 medirían ~12 px, la cuarta parte del objetivo táctil. La respuesta no es
 * dibujar más pequeño, es **dejar de dibujarlo entero** ([ADR-042]).
 *
 * Un *distrito* es lo que se pinta de una vez. La regla es aburrida a propósito:
 *
 *   · **Solar** — tu sector, más todo lo que lo toca. La zona 1 entera son los cinco
 *     Solares (165 regiones): la de los demás no es tu partida, y su frontera sí.
 *   · **Marca** y **Corona** — la zona entera. Caben: 90 y 16.
 *
 * El tope es `MAX_DISTRICT` y no es decorativo: es el presupuesto de render de siempre,
 * que **no se relaja porque el mapa haya triplicado**. Es justo al revés.
 */
export const MAX_DISTRICT = 96;

export type ZoneId = 1 | 2 | 3;

export function zoneOfRegion(view: PlayerView, regionId: RegionId): ZoneId {
  return (view.map.regions[regionId]?.zone ?? 3) as ZoneId;
}

/** El sector de tu Bastión. Es «tu casa» a efectos de encuadre. */
export function homeSector(view: PlayerView): number {
  const bastion = view.map.bastions[view.seat];
  return bastion === undefined ? 0 : (view.map.regions[bastion]?.sector ?? 0);
}

export function districtRegions(
  view: PlayerView,
  zone: ZoneId,
  adjacency: Adjacency,
): Set<RegionId> {
  const out = new Set<RegionId>();

  if (zone !== 1) {
    for (const region of view.map.regions) {
      if (region.zone === zone) out.add(region.id);
    }
    return out;
  }

  const sector = homeSector(view);
  for (const region of view.map.regions) {
    if (region.zone === 1 && region.sector === sector) out.add(region.id);
  }
  // Y el borde: sin él no se ve al vecino que viene, ni la Puerta que hay que pagar.
  for (const id of [...out]) {
    for (const neighbour of adjacency[id] ?? []) out.add(neighbour);
  }
  return out;
}

export interface ZoneSummary {
  zone: ZoneId;
  /** Regiones de la zona en todo el mapa. */
  total: number;
  /** Cuántas son tuyas. */
  mine: number;
  /** Menas de la zona, y cuántas explotas. */
  veins: number;
  worked: number;
  /** Puertas que dan a esta zona, y cuántas están abiertas. */
  gates: number;
  gatesOpen: number;
  /** ¿Se puede entrar hoy? La Corona con los Cercos cerrados no es una opción. */
  reachable: boolean;
}

/**
 * El nivel 1 del mapa: tres anillos con cifras. **No es un menú** — es el mapa alejado,
 * y por eso enseña estado y no acciones.
 */
export function zoneSummaries(view: PlayerView, reachable: ReadonlySet<RegionId>): ZoneSummary[] {
  return ([1, 2, 3] as ZoneId[]).map((zone) => {
    const regions = view.map.regions.filter((r) => r.zone === zone);
    const veins = view.map.veins.filter((v) => zoneOfRegion(view, v.regionId) === zone);
    const gates = view.map.gates.filter((g) => g.to === zone);

    return {
      zone,
      total: regions.length,
      mine: regions.filter((r) => view.control[r.id] === view.seat).length,
      veins: veins.length,
      worked: veins.filter((v) =>
        view.buildings.some((b) => b.regionId === v.regionId && b.kind === 'extractor' && b.own),
      ).length,
      gates: gates.length,
      gatesOpen: gates.filter((g) => view.gatesOpen[g.id]).length,
      reachable: zone === 1 || regions.some((r) => reachable.has(r.id)),
    };
  });
}

/** La Puerta que se cruza entre dos regiones, si la arista es un Cerco. */
export function gateBetween(view: PlayerView, a: RegionId, b: RegionId) {
  return view.map.gates.find(
    (gate) => (gate.inner === a && gate.outer === b) || (gate.inner === b && gate.outer === a),
  );
}

/** El Coloso vivo de una región. Público: su potencia exacta llega a las cinco vistas. */
export function colossusAt(view: PlayerView, regionId: RegionId) {
  return view.colossi.find((c) => c.alive && c.regionId === regionId);
}

export function veinAtRegion(view: PlayerView, regionId: RegionId) {
  return view.map.veins.find((v) => v.regionId === regionId);
}

export function stockAtRegion(view: PlayerView, regionId: RegionId) {
  return view.stock.find((s) => s.regionId === regionId) ?? null;
}

export interface BuildOption {
  kind: 'extractor' | 'foundry' | 'arsenal' | 'depot' | 'watch';
  /** Nivel al que se llegaría. `null` si ya está al máximo. */
  target: 1 | 2 | 3 | null;
  cost: { ore: number; ember: number } | null;
  affordable: boolean;
  /** Ya hay una obra en marcha aquí: una por región y turno. */
  busy: boolean;
  /** El techo de la Fundición no da para tanto. */
  blocked: boolean;
}

/**
 * Qué se puede levantar en una región, con su precio.
 *
 * **No decide nada**: `reduce()` lo vuelve a comprobar contra el estado autoritativo.
 * Está aquí para que la ficha no ofrezca un botón que el servidor va a rechazar, que es
 * la peor forma de enseñar una regla.
 */
export function buildOptions(view: PlayerView, regionId: RegionId): BuildOption[] {
  const region = view.map.regions[regionId];
  if (!region || view.control[regionId] !== view.seat) return [];

  const busyHere = view.buildings.some((b) => b.regionId === regionId && b.own && b.building > 0);
  const foundry = Math.max(
    0,
    ...view.buildings.filter((b) => b.own && b.kind === 'foundry' && b.building === 0)
      .map((b) => b.level),
  );
  const ceiling = Math.max(1, foundry);
  const hasVein = view.map.veins.some((v) => v.regionId === regionId);

  return ALL_BUILDINGS
    .filter((kind) => terrainAllows(kind, region.kind))
    .filter((kind) => kind !== 'extractor' || hasVein)
    .map((kind) => {
      const current = view.buildings.find((b) => b.regionId === regionId && b.kind === kind && b.own);
      const next = (current?.level ?? 0) + 1;
      const target = next > 3 ? null : (next as 1 | 2 | 3);
      const cost = target ? BALANCE.buildings.cost[kind][target] ?? null : null;
      return {
        kind,
        target,
        cost,
        affordable: Boolean(
          cost && view.self.resources.ore >= cost.ore && view.self.resources.ember >= cost.ember,
        ),
        busy: busyHere,
        blocked: Boolean(target && kind !== 'foundry' && target > 1 && target > ceiling),
      };
    });
}
