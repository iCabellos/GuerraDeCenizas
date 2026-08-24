/**
 * Edificios: cinco tipos, tres niveles.
 *
 * Un sistema de edificios con niveles es la vía más rápida conocida para convertir un
 * juego en una lista de botones que se pulsan en orden. Cuatro reglas lo impiden, y
 * ninguna es negociable sin volver a discutir el diseño entero:
 *
 *  1. **Una obra por región y turno.** No hay colas: una cola es una decisión que tomas
 *     una vez y el juego ejecuta sin ti.
 *  2. **Subir tarda turnos y durante la obra el edificio NO produce.** Mejorar es
 *     renunciar a renta ahora por renta después. Eso sí es una decisión.
 *  3. **Los edificios se capturan, no se destruyen** — con un nivel menos. Así atacar
 *     una Extractora de nivel 3 es mejor que construirse la propia, y el mapa se pelea.
 *  4. **El techo lo pone la Fundición.** Una sola dependencia: hay un orden que
 *     descubrir sin que haya un árbol que memorizar.
 */

import type {
  Building, BuildingKind, GameState, Level, RegionId, Seat, SeatState, TerrainKind,
  WorkOrder,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { EventLog } from './events';

export const ALL_BUILDINGS: readonly BuildingKind[] = [
  'arsenal', 'depot', 'extractor', 'foundry', 'watch',
] as const;

/**
 * Nivel **operativo**: lo que el edificio rinde hoy.
 * Cero mientras haya obra en curso — ésa es la regla 2, y vive aquí para que ninguna
 * etapa se olvide de aplicarla por su cuenta.
 */
export function buildingLevel(
  buildings: readonly Building[],
  regionId: RegionId,
  kind: BuildingKind,
): number {
  const found = buildings.find((b) => b.regionId === regionId && b.kind === kind);
  if (!found) return 0;
  return found.building > 0 ? 0 : found.level;
}

/** El edificio, esté operativo o en obra. */
export function buildingAt(
  buildings: readonly Building[],
  regionId: RegionId,
  kind: BuildingKind,
): Building | undefined {
  return buildings.find((b) => b.regionId === regionId && b.kind === kind);
}

/** Mejor nivel operativo de un tipo entre las regiones de un asiento. */
export function bestLevel(state: GameState, seat: Seat, kind: BuildingKind): number {
  let best = 0;
  for (const b of state.buildings) {
    if (b.kind !== kind || b.building > 0) continue;
    if (state.control[b.regionId] !== seat) continue;
    best = Math.max(best, b.level);
  }
  return best;
}

/** ¿Admite este terreno ese edificio? La Extractora además exige Mena, ver `canBuild`. */
export function terrainAllows(kind: BuildingKind, terrain: TerrainKind | undefined): boolean {
  switch (kind) {
    case 'extractor':
      // Sobre la Mena, y la Mena nunca cae en agua ni sobre un Yacimiento.
      return terrain !== undefined && terrain !== 'water' && terrain !== 'core';
    case 'foundry':
      return terrain === 'bastion' || terrain === 'urban';
    case 'arsenal':
      return terrain === 'bastion';
    case 'depot':
      return terrain !== undefined && terrain !== 'water' && terrain !== 'core';
    case 'watch':
      return terrain === 'high' || terrain === 'urban' || terrain === 'bastion';
  }
}

export type WorkReject =
  | 'not_your_region'
  | 'terrain_forbids'
  | 'needs_vein'
  | 'already_max'
  | 'work_in_progress'
  | 'foundry_ceiling'
  | 'not_enough_material';

export interface WorksResult {
  buildings: Building[];
  seats: SeatState[];
  /** Asientos que han puesto su Fundición a crecer: este turno no pueden investigar. */
  busyFoundries: Set<Seat>;
}

/**
 * Valida y arranca las obras del turno.
 *
 * Se cobra **al empezar**, no al terminar: si se cobrara al final, cancelar una obra a
 * medias sería gratis y la decisión de mejorar dejaría de tener riesgo.
 */
export function applyWorks(
  state: GameState,
  seats: readonly SeatState[],
  orders: ReadonlyMap<Seat, WorkOrder[]>,
  log: EventLog,
): WorksResult {
  const buildings = state.buildings.map((b) => ({ ...b }));
  const next = seats.map((s) => ({
    ...s,
    resources: { ...s.resources },
    tiers: { ...s.tiers },
    policies: { ...s.policies },
  }));
  const busyFoundries = new Set<Seat>();
  const startedHere = new Set<RegionId>();

  for (const seat of [...orders.keys()].sort((a, b) => a - b)) {
    const seatState = next.find((s) => s.seat === seat);
    if (!seatState) continue;

    for (const order of orders.get(seat) ?? []) {
      const { regionId, kind } = order;

      if (state.control[regionId] !== seat) {
        rejectWork(log, seat, regionId, 'not_your_region');
        continue;
      }
      if (startedHere.has(regionId)) {
        rejectWork(log, seat, regionId, 'work_in_progress');
        continue;
      }
      if (!terrainAllows(kind, state.map.regions[regionId]?.kind)) {
        rejectWork(log, seat, regionId, 'terrain_forbids');
        continue;
      }
      if (kind === 'extractor' && !state.map.veins.some((v) => v.regionId === regionId)) {
        rejectWork(log, seat, regionId, 'needs_vein');
        continue;
      }

      const existing = buildings.find((b) => b.regionId === regionId && b.kind === kind);
      if (existing && existing.building > 0) {
        rejectWork(log, seat, regionId, 'work_in_progress');
        continue;
      }
      const target = ((existing?.level ?? 0) + 1) as Level;
      if (target > 3) {
        rejectWork(log, seat, regionId, 'already_max');
        continue;
      }

      // El techo de la Fundición. El nivel 1 de cualquier cosa siempre se puede: si no,
      // no habría forma de construir la primera Fundición.
      if (kind !== 'foundry' && target > 1 && target > Math.max(1, bestLevel(state, seat, 'foundry'))) {
        rejectWork(log, seat, regionId, 'foundry_ceiling');
        continue;
      }

      const cost = BALANCE.buildings.cost[kind][target];
      if (!cost || seatState.resources.ore < cost.ore || seatState.resources.ember < cost.ember) {
        rejectWork(log, seat, regionId, 'not_enough_material');
        continue;
      }
      seatState.resources.ore -= cost.ore;
      seatState.resources.ember -= cost.ember;

      const turns = BALANCE.buildings.turnsByLevel[target] as number;
      if (existing) {
        existing.target = target;
        existing.building = turns;
      } else {
        buildings.push({ regionId, kind, level: 1, target: 1, building: turns });
      }
      startedHere.add(regionId);
      if (kind === 'foundry') busyFoundries.add(seat);

      log.emit({
        type: 'WORK_STARTED',
        seat,
        scope: { kind: 'regions', regions: [regionId] },
        data: { regionId, building: kind, level: target, turns, ore: cost.ore, ember: cost.ember },
      });
    }
  }

  return { buildings: sortBuildings(buildings), seats: next, busyFoundries };
}

/** Avanza las obras y termina las que llegan a cero. */
export function advanceWorks(
  state: GameState,
  buildings: readonly Building[],
  log: EventLog,
): Building[] {
  const next = buildings.map((b) => ({ ...b }));
  for (const building of next) {
    if (building.building <= 0) continue;
    building.building -= 1;
    if (building.building > 0) continue;

    building.level = building.target;
    log.emit({
      type: 'WORK_FINISHED',
      seat: state.control[building.regionId] ?? null,
      scope: { kind: 'regions', regions: [building.regionId] },
      data: { regionId: building.regionId, building: building.kind, level: building.level },
    });
  }
  return sortBuildings(next);
}

/**
 * Traspaso de edificios al capturar una región.
 *
 * Baja un nivel y **cancela la obra en curso**: lo que estabas levantando se queda a
 * medias y el material ya está gastado. Un edificio que caiga por debajo de 1 no existe.
 */
export function captureBuildings(
  buildings: readonly Building[],
  before: readonly (Seat | null)[],
  after: readonly (Seat | null)[],
  log: EventLog,
): Building[] {
  const out: Building[] = [];
  for (const building of buildings) {
    const previous = before[building.regionId] ?? null;
    const current = after[building.regionId] ?? null;
    if (previous === current || current === null) {
      out.push({ ...building });
      continue;
    }

    const level = building.level - BALANCE.buildings.captureLevelLoss;
    if (level < 1) {
      log.emit({
        type: 'BUILDING_CAPTURED',
        seat: current,
        scope: { kind: 'regions', regions: [building.regionId] },
        data: { regionId: building.regionId, building: building.kind, level: 0, razed: true },
      });
      continue;
    }
    out.push({
      regionId: building.regionId,
      kind: building.kind,
      level: level as Level,
      target: level as Level,
      building: 0,
    });
    log.emit({
      type: 'BUILDING_CAPTURED',
      seat: current,
      scope: { kind: 'regions', regions: [building.regionId] },
      data: { regionId: building.regionId, building: building.kind, level, razed: false },
    });
  }
  return sortBuildings(out);
}

/** Orden canónico. Sin esto, dos estados iguales darían checksums distintos. */
export function sortBuildings(buildings: readonly Building[]): Building[] {
  return [...buildings].sort(
    (a, b) => a.regionId - b.regionId || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
  );
}

function rejectWork(log: EventLog, seat: Seat, regionId: RegionId, reason: WorkReject): void {
  log.emit({
    type: 'ORDER_REJECTED',
    seat,
    scope: { kind: 'seat', seat },
    data: { forceId: null, regionId, reason: `work_${reason}` },
  });
}
