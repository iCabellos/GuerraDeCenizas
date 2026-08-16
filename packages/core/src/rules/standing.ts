/**
 * Órdenes Permanentes y Mando Automático.
 *
 * El abandono a mitad de campaña es el riesgo de producto nº 1 del proyecto
 * ([DISCOVERY P2](../../../../docs/DISCOVERY.md)): un 4X asíncrono en el que la partida
 * se bloquea porque alguien se fue a dormir está muerto. La mitigación es escalonada
 * ([MULTIPLAYER §5](../../../../docs/MULTIPLAYER.md#5-ausencias-abandonos-y-mando-automático)):
 * al primer plazo vencido se ejecutan las Órdenes Permanentes; al tercero, el asiento
 * pasa a Mando Automático.
 *
 * **La regla que gobierna este archivo entero: la ausencia nunca daña a un tercero.**
 * Ni las Órdenes Permanentes ni el bot atacan por iniciativa propia, rompen un Sello ni
 * consagran. Si un jugador ausente pudiera perjudicar a otro, el ausente se convertiría
 * en una ficha que mover en las negociaciones, y quien se desconecta no ha elegido eso.
 *
 * Vive en el motor, no en el servidor, porque genera **órdenes**: si el servidor las
 * inventara por su cuenta, el simulador no podría reproducir una partida con ausencias
 * y el criterio de «mismo checksum desde (semilla, órdenes)» se caería.
 */

import type {
  Adjacency, Force, GameState, MoveOrder, Orders, ProductionOrder, RegionId, Seat,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { bfsDistances } from '../mapgen/skeleton';

/** Lo que el jugador configura una vez, antes de irse. */
export interface StandingConfig {
  /** Nunca `assault`: unas Órdenes Permanentes agresivas atacarían a un tercero. */
  posture: 'hold' | 'screen';
  production: 'none' | 'line' | 'repeat';
}

export const DEFAULT_STANDING: StandingConfig = { posture: 'hold', production: 'none' };

/** Turnos sin enviar tras los que el asiento pasa a Mando Automático. */
export const AUTOCOMMAND_AFTER = 3;

/**
 * Lee la configuración guardada en `game_players.standing_orders`, que es `jsonb` y por
 * tanto puede contener cualquier cosa. Un valor corrupto no puede tumbar la resolución
 * de los otros cuatro jugadores: lo desconocido se sustituye por el valor por defecto.
 */
export function parseStanding(raw: unknown): StandingConfig {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_STANDING };
  const value = raw as Record<string, unknown>;
  return {
    posture: value.posture === 'screen' ? 'screen' : 'hold',
    production:
      value.production === 'line' || value.production === 'repeat'
        ? value.production
        : 'none',
  };
}

/**
 * Órdenes de un asiento que dejó vencer el plazo. Todas sus fuerzas se quedan donde
 * están con la postura configurada.
 *
 * `previous` son las órdenes que ese asiento envió por última vez; solo se usan con
 * `production: 'repeat'`, y solo la parte de producción. Repetir también los movimientos
 * mandaría a las fuerzas a un destino pensado para otro turno, que es exactamente la
 * clase de sorpresa que un jugador ausente no ha autorizado.
 */
export function standingOrders(
  state: GameState,
  seat: Seat,
  config: StandingConfig,
  previous?: Orders,
): Orders {
  const moves: MoveOrder[] = forcesOf(state, seat).map((force) => ({
    forceId: force.id,
    posture: config.posture,
  }));

  return { turn: state.meta.turn, moves, production: standingProduction(state, seat, config, previous) };
}

function standingProduction(
  state: GameState,
  seat: Seat,
  config: StandingConfig,
  previous?: Orders,
): ProductionOrder[] {
  if (config.production === 'none') return [];
  if (config.production === 'repeat') {
    // Se recorta a lo que hoy es posible: una región que se perdió el turno pasado ya
    // no produce, y el motor la rechazaría con un evento por cada intento.
    return (previous?.production ?? []).filter((order) => state.control[order.regionId] === seat);
  }
  return buildLineWhereCheapest(state, seat);
}

// ─────────────────────────────── Mando Automático ─────────────────────────────

/**
 * Bot deliberadamente conservador y honesto
 * ([MULTIPLAYER §5.3](../../../../docs/MULTIPLAYER.md#53-mando-automático)).
 *
 * Está diseñado para **no decidir la partida**: ni es un rival temible ni un regalo para
 * el vecino. Lo único que hace por iniciativa propia es recuperar lo que le quitaron.
 *
 * @param previousControl Control del turno anterior. Sin él, el bot no ataca nunca: es
 *   la degradación correcta, porque atacar sin saber qué perdiste sería atacar a un
 *   tercero por sorpresa.
 */
export function autocommandOrders(
  state: GameState,
  seat: Seat,
  adjacency: Adjacency,
  previousControl?: readonly (Seat | null)[],
): Orders {
  const own = forcesOf(state, seat);
  const home = state.control
    .map((owner, regionId) => (owner === seat ? regionId : -1))
    .filter((regionId) => regionId >= 0);

  const lost = recoverable(state, seat, previousControl);
  const claimed = new Set<RegionId>();
  const moves: MoveOrder[] = [];

  for (const force of own) {
    const target = lost.find(
      (regionId) => !claimed.has(regionId) && isAdjacent(adjacency, force.regionId, regionId),
    );
    if (target !== undefined) {
      claimed.add(target);
      moves.push({ forceId: force.id, to: target, posture: 'assault' });
      continue;
    }

    // Consolidar: una fuerza en tierra ajena vuelve hacia lo propio. Quedarse fuera de
    // suministro la desgasta turno a turno sin que nadie tome ninguna decisión.
    if (state.control[force.regionId] !== seat && home.length > 0) {
      const step = stepToward(adjacency, force.regionId, home);
      if (step !== null) {
        moves.push({ forceId: force.id, to: step, posture: 'hold' });
        continue;
      }
    }

    moves.push({ forceId: force.id, posture: 'hold' });
  }

  return { turn: state.meta.turn, moves, production: buildLineWhereCheapest(state, seat) };
}

/** Regiones que este asiento controlaba el turno pasado y ya no. */
function recoverable(
  state: GameState,
  seat: Seat,
  previousControl?: readonly (Seat | null)[],
): RegionId[] {
  if (!previousControl) return [];
  const lost: RegionId[] = [];
  for (let regionId = 0; regionId < state.control.length; regionId += 1) {
    if (previousControl[regionId] === seat && state.control[regionId] !== seat) {
      lost.push(regionId);
    }
  }
  return lost;   // ya viene ordenado por `regionId`: los desempates nunca son al azar
}

// ──────────────────────────────────── Comunes ─────────────────────────────────

function forcesOf(state: GameState, seat: Seat): Force[] {
  return state.forces.filter((force) => force.seat === seat)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function isAdjacent(adjacency: Adjacency, from: RegionId, to: RegionId): boolean {
  return (adjacency[from] ?? []).includes(to);
}

/** Primer paso del camino más corto hacia el destino más cercano del conjunto. */
function stepToward(
  adjacency: Adjacency,
  from: RegionId,
  targets: readonly RegionId[],
): RegionId | null {
  const distances = bfsDistances(adjacency, from);
  let best: RegionId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const distance = distances[target] ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = target;
    }
  }
  if (best === null || bestDistance === Number.POSITIVE_INFINITY || bestDistance === 0) {
    return null;
  }

  const fromBest = bfsDistances(adjacency, best);
  const neighbours = [...(adjacency[from] ?? [])].sort((a, b) => a - b);
  for (const neighbour of neighbours) {
    if ((fromBest[neighbour] ?? Number.POSITIVE_INFINITY) === bestDistance - 1) return neighbour;
  }
  return null;
}

/**
 * Producción de un asiento ausente: Línea, en el Bastión, con lo que sobre.
 *
 * Línea y no Fuego ni Cielo porque es la unidad más barata y la que menos cambia el
 * equilibrio de la partida: producir Cielo por un jugador ausente sería tomar por él una
 * decisión táctica que no ha tomado.
 */
function buildLineWhereCheapest(state: GameState, seat: Seat): ProductionOrder[] {
  const industry = state.seats.find((s) => s.seat === seat)?.resources.industry ?? 0;
  const quantity = Math.floor(industry / BALANCE.production.line.industry);
  if (quantity <= 0) return [];

  const bastion = state.map.bastions[seat];
  if (bastion === undefined || state.control[bastion] !== seat) return [];

  return [{ regionId: bastion, item: 'line', qty: quantity }];
}
