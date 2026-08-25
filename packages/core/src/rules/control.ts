/**
 * Control territorial y visibilidad.
 *
 * Decisión de diseño: **el control territorial es público; la composición militar no.**
 * Quién tiene qué región se sabe siempre (es lo que se negocia); cuántas tropas hay en
 * ella, no. Sin territorio público no habría nada concreto sobre lo que pactar, y la
 * diplomacia —que es el producto del juego— se quedaría sin objeto.
 */

import type {
  Adjacency, Force, GameState, PlayerView, RegionId, Seat, VisibleBuilding, VisibleForce,
  VisibleStock, Zone,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { EventLog } from './events';
import { total } from './movement';
import { actOfTurn, passableAdjacency } from './zones';
import { buildingLevel } from './buildings';

/**
 * Recalcula quién controla cada región.
 *
 * Reglas (GDD §6.2):
 *  - Solo **Línea** captura. Cielo y Fuego no toman terreno.
 *  - Perder todas las fuerzas de una región **no** la devuelve a neutral: sigue siendo
 *    tuya hasta que otro la ocupe. Evita el yoyó territorial y mantiene legible el
 *    frente en una pantalla pequeña.
 *  - Un Bastión no se puede capturar (ADR-013): solo sitiar.
 *  - Dos asientos con Línea en la misma región ⇒ disputada; el control no cambia.
 *    (En v0.2 esto se resolverá con combate.)
 */
export function recomputeControl(
  state: GameState,
  forces: readonly Force[],
  log: EventLog,
): (Seat | null)[] {
  const control = state.control.slice();
  const holders = new Map<RegionId, Set<Seat>>();

  for (const force of forces) {
    if (force.line <= 0) continue;
    const set = holders.get(force.regionId) ?? new Set<Seat>();
    set.add(force.seat);
    holders.set(force.regionId, set);
  }

  for (const regionId of [...holders.keys()].sort((a, b) => a - b)) {
    const seats = [...(holders.get(regionId) as Set<Seat>)].sort((a, b) => a - b);

    if (seats.length > 1) {
      log.emit({
        type: 'REGION_CONTESTED',
        seat: null,
        scope: { kind: 'public' },
        data: { regionId, seats: seats.join(',') },
      });
      continue;
    }

    const seat = seats[0] as Seat;
    const bastionOwner = state.map.bastions.indexOf(regionId);
    if (bastionOwner >= 0 && bastionOwner !== seat) continue; // los Bastiones no se capturan

    if (control[regionId] !== seat) {
      const previous = control[regionId] ?? null;
      control[regionId] = seat;
      log.emit({
        type: 'REGION_CAPTURED',
        seat,
        scope: { kind: 'public' },
        data: { regionId, from: previous },
      });
    }
  }

  // Invariante: un Bastión siempre pertenece a su dueño, pase lo que pase.
  state.map.bastions.forEach((regionId, seat) => {
    control[regionId] = seat as Seat;
  });

  return control;
}

/**
 * Regiones que observa cada asiento: las que controla, aquellas donde tiene fuerzas, y
 * las adyacentes a ambas — **sin cruzar un Cerco cerrado**.
 *
 * Eso último es un regalo del refactor de zonas y conviene no perderlo: mientras la
 * Puerta esté sellada no se ve nada del otro lado, así que la vista del acto I es más
 * pequeña que la del mapa antiguo pese a que el mapa sea el triple. El pico de datos se
 * desplaza al final de la partida, que es cuando quedan menos turnos que servir.
 *
 * La Atalaya alarga el alcance: es lo único que lo hace, y por eso vale la pena.
 */
export function computeObservers(
  state: GameState,
  forces: readonly Force[],
  control: readonly (Seat | null)[],
  adjacency: Adjacency,
): Map<Seat, Set<RegionId>> {
  const observers = new Map<Seat, Set<RegionId>>();
  for (const seatState of state.seats) observers.set(seatState.seat, new Set<RegionId>());

  const passable = passableAdjacency(state.map, adjacency, state.gatesOpen);

  const seed = (seat: Seat, regionId: RegionId, extra: number): void => {
    const set = observers.get(seat);
    if (!set) return;
    // Anillos concéntricos por la adyacencia transitable. `extra` los que añade la
    // Atalaya sobre el primero, que todo el mundo tiene gratis.
    let frontier: RegionId[] = [regionId];
    set.add(regionId);
    for (let ring = 0; ring <= extra; ring++) {
      const next: RegionId[] = [];
      for (const current of frontier) {
        for (const neighbour of passable[current] as readonly RegionId[]) {
          if (set.has(neighbour)) continue;
          set.add(neighbour);
          next.push(neighbour);
        }
      }
      frontier = next;
    }
  };

  const sightAt = (regionId: RegionId): number => {
    const level = buildingLevel(state.buildings, regionId, 'watch');
    return BALANCE.buildings.watchSight[level] ?? 0;
  };

  control.forEach((seat, regionId) => {
    if (seat !== null) seed(seat, regionId, sightAt(regionId));
  });
  for (const force of forces) seed(force.seat, force.regionId, 0);

  return observers;
}

/**
 * Proyecta el estado a lo que ve un asiento.
 *
 * Este es el punto donde la niebla de guerra se vuelve real: lo que no se añade aquí
 * **no sale del servidor**. El cliente no filtra nada, porque nunca recibe lo demás.
 */
export function projectView(
  state: GameState,
  seat: Seat,
  forces: readonly Force[],
  control: readonly (Seat | null)[],
  observed: ReadonlySet<RegionId>,
  events: PlayerView['events'],
  checksum: string,
): PlayerView {
  const self = state.seats.find((s) => s.seat === seat);
  if (!self) throw new Error(`asiento inexistente: ${seat}`);

  const visible: VisibleForce[] = [];
  for (const force of forces) {
    if (force.seat === seat) {
      visible.push({
        id: force.id,
        seat: force.seat,
        regionId: force.regionId,
        own: true,
        line: force.line,
        fire: force.fire,
        sky: force.sky,
        approxTotal: total(force),
        posture: force.posture,
        unsupplied: force.unsupplied,
      });
      continue;
    }
    if (!observed.has(force.regionId)) continue;

    // El bosque oculta el desglose: se ve que hay algo y aproximadamente cuánto.
    const concealed = state.map.regions[force.regionId]?.kind === 'forest';
    visible.push({
      id: force.id,
      seat: force.seat,
      regionId: force.regionId,
      own: false,
      line: concealed ? null : force.line,
      fire: concealed ? null : force.fire,
      sky: concealed ? null : force.sky,
      approxTotal: concealed ? Math.round(total(force) / 10) * 10 : total(force),
      posture: concealed ? null : force.posture,
      // El estado de suministro ajeno es información de inteligencia: llega con Sombra
      // en v0.7, no gratis por mirar el mapa.
      unsupplied: null,
    });
  }

  return {
    seat,
    turn: state.meta.turn,
    phase: state.meta.phase,
    act: actOfTurn(state.meta.turn) as Zone,
    map: state.map,
    visible: [...observed].sort((a, b) => a - b),
    control: control.slice(),
    fortification: state.fortification.slice(),
    bridges: state.bridges.slice(),
    forces: visible.sort((a, b) => a.regionId - b.regionId || cmp(a.id, b.id)),
    // Puertas y Colosos son PÚBLICOS, y no por descuido: la aritmética de la Puerta es
    // la negociación de este juego, y una negociación sobre cifras que no se ven es
    // una adivinanza. Quién pagó una Puerta lo ven los cinco.
    gatesOpen: state.gatesOpen.slice(),
    colossi: state.colossi.map((c) => ({ ...c })),
    buildings: visibleBuildings(state, seat, control, observed),
    stock: visibleStock(state, observed),
    self,
    opponents: state.seats
      .filter((s) => s.seat !== seat)
      .map((s) => ({
        seat: s.seat,
        name: s.name,
        factionId: s.factionId,
        doctrineId: s.doctrineId,
        // Concordia: público y sin ningún efecto mecánico. Ver docs/FACTIONS.md §4.
        concordant: s.factionId === self.factionId,
      }))
      .sort((a, b) => a.seat - b.seat),
    events: events.filter((e) => e.visibleTo.includes(seat)),
    checksum,
  };
}

/**
 * Edificios que llegan a un asiento: los suyos y los que están en regiones que observa.
 * Un edificio en un territorio que no ves no existe para ti — y eso es lo que hace que
 * asomarse a la Marca sirva para algo.
 */
function visibleBuildings(
  state: GameState,
  seat: Seat,
  control: readonly (Seat | null)[],
  observed: ReadonlySet<RegionId>,
): VisibleBuilding[] {
  const out: VisibleBuilding[] = [];
  for (const building of state.buildings) {
    const own = control[building.regionId] === seat;
    if (!own && !observed.has(building.regionId)) continue;
    out.push({
      regionId: building.regionId,
      kind: building.kind,
      level: building.level,
      building: building.building,
      target: building.target,
      own,
    });
  }
  return out.sort(
    (a, b) => a.regionId - b.regionId || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0),
  );
}

/**
 * Almacenes de las regiones observadas, y solo de ésas.
 *
 * Se ve lo que hay porque se ve la Extractora trabajando. Es lo que convierte el Botín
 * en una decisión con información en vez de una apuesta: sabes cuánto hay antes de ir.
 * Las regiones vacías no viajan — con 271 regiones, mandar 271 ceros por asiento y
 * turno es la clase de despilfarro que rompe el presupuesto de datos.
 */
function visibleStock(state: GameState, observed: ReadonlySet<RegionId>): VisibleStock[] {
  const out: VisibleStock[] = [];
  state.stock.forEach((entry, regionId) => {
    if (entry.ore <= 0 && entry.ember <= 0) return;
    if (!observed.has(regionId)) return;
    out.push({ regionId, ore: entry.ore, ember: entry.ember });
  });
  return out.sort((a, b) => a.regionId - b.regionId);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
