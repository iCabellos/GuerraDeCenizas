/**
 * Creación de una partida.
 *
 * Todo lo asimétrico entre jugadores debe entrar aquí y ser trazable. En v0.1 no hay
 * nada asimétrico salvo la facción y la doctrina, que no dan números: los recursos
 * iniciales, las fuerzas y las posiciones son idénticas por rotación.
 */

import type {
  DoctrineId, FactionId, Force, GameState, PlayerCount, RegionId, Seat,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { FACTIONS, STARTING_ANOMALIES, concordanceGroups } from '../factions/index';
import { bfsDistances, buildAdjacency } from '../mapgen/skeleton';
import { generateMap } from '../mapgen/generate';
import { ENGINE_VERSION } from './reduce';

export interface SeatSetup {
  name: string;
  factionId: FactionId;
  /** Si se omite, se usa la doctrina de origen de la facción. */
  doctrineId?: DoctrineId;
}

export interface CreateGameOptions {
  gameId: string;
  seed: number;
  players: PlayerCount;
  seats: readonly SeatSetup[];
}

export interface CreatedGame {
  state: GameState;
  /** Grupos de asientos que comparten facción. Público y sin efecto mecánico. */
  concordance: { factionId: FactionId; seats: number[] }[];
}

export function createGame(options: CreateGameOptions): CreatedGame {
  const { gameId, seed, players, seats } = options;
  if (seats.length !== players) {
    throw new Error(`se esperaban ${players} asientos y llegaron ${seats.length}`);
  }

  const generated = generateMap(seed, players);
  const { map } = generated;
  const adjacency = buildAdjacency(map.regions.length, map.edges);
  const toCoreFromEverywhere = bfsDistances(adjacency, map.coreId);

  const control: (Seat | null)[] = map.regions.map(() => null);
  const forces: Force[] = [];

  seats.forEach((_setup, index) => {
    const seat = index as Seat;
    const bastion = map.bastions[seat] as RegionId;
    control[bastion] = seat;

    forces.push({
      id: `f${seat}t0n0`,
      seat,
      regionId: bastion,
      ...BALANCE.start.bastionForce,
      posture: 'hold',
    });

    // La segunda fuerza se despliega hacia el Núcleo. Es la misma elección para todos
    // por construcción rotacional, así que no introduce ventaja. En v0.2 la elegirá el
    // jugador durante el Parlamento, que es donde debe estar esa decisión.
    const forward = forwardRegion(adjacency, bastion, toCoreFromEverywhere);
    control[forward] = seat;
    forces.push({
      id: `f${seat}t0n1`,
      seat,
      regionId: forward,
      ...BALANCE.start.forwardForce,
      posture: 'hold',
    });
  });

  const state: GameState = {
    meta: {
      gameId,
      engineVersion: ENGINE_VERSION,
      mapgenVersion: generated.mapgenVersion,
      seed,
      turn: 0,
      phase: 'parley',
      playerCount: players,
    },
    map,
    seats: seats.map((setup, index) => ({
      seat: index as Seat,
      name: setup.name,
      factionId: setup.factionId,
      doctrineId: setup.doctrineId ?? FACTIONS[setup.factionId].originDoctrine,
      anomalies: [...STARTING_ANOMALIES],
      resources: { ...BALANCE.start.resources },
    })),
    forces: forces.sort((a, b) => a.seat - b.seat || (a.id < b.id ? -1 : 1)),
    control,
    rngCursor: generated.rngCursor,
  };

  return {
    state,
    concordance: concordanceGroups(
      state.seats.map((s) => ({ seat: s.seat, factionId: s.factionId })),
    ),
  };
}

/** Vecino del Bastión más próximo al Núcleo. Desempata por id: nunca al azar. */
function forwardRegion(
  adjacency: readonly (readonly RegionId[])[],
  bastion: RegionId,
  distanceToCore: readonly number[],
): RegionId {
  const neighbours = [...(adjacency[bastion] as readonly RegionId[])].sort((a, b) => a - b);
  let best = neighbours[0] as RegionId;
  for (const candidate of neighbours) {
    if ((distanceToCore[candidate] as number) < (distanceToCore[best] as number)) best = candidate;
  }
  return best;
}
