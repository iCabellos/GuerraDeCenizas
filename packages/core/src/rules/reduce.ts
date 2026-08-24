/**
 * `reduce()` — la función que ES el juego.
 *
 * Propiedades garantizadas por test:
 *  - **Pura**: misma entrada ⇒ misma salida, en Node, en Chromium y en el simulador.
 *  - **Inmutable**: el estado de entrada no se modifica.
 *  - **Total**: nunca lanza por una orden inválida; la descarta y emite `ORDER_REJECTED`.
 *
 * Las etapas están numeradas según el orden de resolución del GDD §15. Añadir un
 * sistema nuevo es **insertar una etapa en su posición**, no tocar las demás: por eso
 * los huecos de la numeración están anotados en vez de disimulados.
 */

import type {
  GameEvent, GameState, OrdersBySeat, PlayerView, ResolveContext, ResolveResult, Seat,
} from '../types/index';
import { buildAdjacency } from '../mapgen/skeleton';
import { checksum } from '../util/canonical';
import { EventLog } from './events';
import { applyMovement, validateOrders } from './movement';
import { applyBattles } from './battle';
import { applyEconomy, applyProduction } from './economy';
import { computeObservers, projectView, recomputeControl } from './control';
import { applyColossi } from './colossus';
import { applyExtraction, applyHauling, applyPlunder } from './extraction';
import { advanceWorks, applyWorks, captureBuildings } from './buildings';
import { applyResearch } from './research';
import { actOfTurn } from './zones';

/**
 * Sube con zonas, Cercos, Puertas, Colosos, extracción, edificios, grados y Políticas.
 * Es **incompatible hacia atrás**: una partida creada con 0.2.0 no se puede resolver
 * aquí. No hay migración posible ni conviene intentarla — el estado cambia de forma.
 */
export const ENGINE_VERSION = '0.3.0';

export function reduce(
  state: GameState,
  orders: OrdersBySeat,
  ctx: ResolveContext,
): ResolveResult {
  const log = new EventLog();
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);

  // 1 · Validación contra el estado autoritativo.
  const { intents, postures, fireSupport, production, works, research } = validateOrders(
    state, orders, adjacency, log,
  );

  // 2-4 · Diplomacia, anomalías de topología y Sombra → v0.9 y v0.11.

  // 5 · Movimiento simultáneo, ya con el filtro de Cerco puesto en la validación.
  const movement = applyMovement(state, intents, postures, log);
  const moved = movement.forces;

  // 6 · Combate entre asientos, con apoyo de Fuego desde regiones adyacentes.
  const fought = applyBattles(state, moved, fireSupport, adjacency, log).forces;

  // 6b · Colosos. DESPUÉS del combate entre asientos, para que dos asientos puedan
  //      pelearse por el golpe final; el Coloso que muere abre su Puerta para todos.
  const colossi = applyColossi(state, fought, state.seats, state.stock, log);

  // 6c · Botín. El que saquea cobra y se vuelve por donde vino: no captura, así que la
  //      etapa de control ni se entera. Esa es exactamente la gracia.
  const plundered = applyPlunder(
    state, colossi.forces, movement.origins, colossi.stock, colossi.seats, log,
  );

  // 7 · Control territorial.
  const control = recomputeControl(state, plundered.forces, log);

  // 7b · Los edificios cambian de dueño con la región, un nivel por debajo. No se
  //      destruyen: así atacar una Extractora de nivel 3 es mejor que construir la tuya.
  const capturedBuildings = captureBuildings(state.buildings, state.control, control, log);

  // A partir de aquí todo se calcula sobre el control YA actualizado: lo que capturas
  // este turno renta este turno, que es lo que el jugador espera al ver la captura.
  const afterCapture: GameState = {
    ...state,
    control,
    buildings: capturedBuildings,
    stock: plundered.stock,
    colossi: colossi.colossi,
    gatesOpen: colossi.gatesOpen,
    seats: plundered.seats,
  };

  // 8 · Economía: renta → mantenimiento → penalización por falta de suministro.
  const economy = applyEconomy(afterCapture, plundered.forces, adjacency, log);

  // 8b · Extracción: las Menas con Extractora llenan el almacén de su región.
  const extracted = applyExtraction(afterCapture, economy.seats, afterCapture.stock, log);

  // 8c · Logística: del almacén al asiento, perdiendo por salto. Sin ruta transitable
  //      no hay acarreo: el material se acumula, y acumular es lo que lo hace objetivo.
  const hauled = applyHauling(
    afterCapture, economy.seats, extracted.stock, adjacency, log,
  );

  // 9 · Producción. El Grado multiplica AQUÍ lo que nace, y solo lo que nace.
  const produced = applyProduction(
    { ...afterCapture, stock: hauled.stock },
    hauled.seats, economy.forces, production, log,
  );

  // 9b · Obras: se cobran al empezar. Cancelar a medias no devuelve nada, y por eso
  //      mejorar es una decisión con riesgo y no un trámite.
  const started = applyWorks(
    { ...afterCapture, buildings: capturedBuildings }, produced.seats, works, log,
  );
  const buildings = advanceWorks(afterCapture, started.buildings, log);

  // 9c · Investigación. Compite con la obra de Fundición por el mismo turno.
  const researched = applyResearch(
    { ...afterCapture, buildings }, started.seats, research, started.busyFoundries, log,
  );

  // 10-11 · Núcleo y anomalías de información → v0.10 y v0.11.

  // 14 · Cierre de turno.
  const nextTurn = state.meta.turn + 1;
  const next: GameState = {
    meta: {
      ...state.meta,
      turn: nextTurn,
      phase: state.meta.phase === 'parley' ? 'war' : state.meta.phase,
      engineVersion: ctx.engineVersion,
    },
    map: state.map,
    seats: researched.seats,
    forces: produced.forces,
    control,
    fortification: produced.fortification,
    bridges: produced.bridges,
    buildings,
    stock: hauled.stock,
    colossi: colossi.colossi,
    gatesOpen: colossi.gatesOpen,
    rngCursor: state.rngCursor,
  };

  if (actOfTurn(nextTurn) !== actOfTurn(state.meta.turn)) {
    log.emit({
      type: 'ACT_CHANGED',
      seat: null,
      scope: { kind: 'public' },
      data: { act: actOfTurn(nextTurn), turn: nextTurn },
    });
  }

  log.emit({
    type: 'TURN_CLOSED',
    seat: null,
    scope: { kind: 'public' },
    data: { turn: state.meta.turn, next: nextTurn, at: ctx.now },
  });

  // 12 · Visibilidad. Se calcula sobre el estado FINAL, nunca sobre el inicial.
  const observers = computeObservers(next, next.forces, control, adjacency);
  const seats = next.seats.map((s) => s.seat).sort((a, b) => a - b);

  // 13 · Eventos, ya filtrados por asiento.
  const events: GameEvent[] = log.resolve(state.meta.turn, seats, observers);

  const stateChecksum = checksum(next);
  const views = {} as Record<Seat, PlayerView>;
  for (const seat of seats) {
    views[seat] = projectView(
      next,
      seat,
      next.forces,
      control,
      observers.get(seat) ?? new Set(),
      events,
      stateChecksum,
    );
  }

  return { state: next, events, views, checksum: stateChecksum };
}
