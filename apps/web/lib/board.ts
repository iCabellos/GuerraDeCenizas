import {
  TERRAIN_YIELD, canProduceInView,
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
