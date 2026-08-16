/**
 * Ciclo de vida de una partida: crear, unirse, empezar.
 *
 * Todo pasa por funciones de Postgres porque cada operación toca varias tablas y tiene
 * que ser atómica: una partida creada sin asientos, o un asiento reclamado por dos
 * jugadores a la vez, son estados de los que no se sale.
 *
 * Igual que `resolve.ts`, recibe el transporte inyectado en vez de construirlo: así los
 * tests ejecutan exactamente este código contra un Postgres real.
 */

import {
  ENGINE_VERSION, MAPGEN_VERSION, createGame as buildGame, projectViews,
  type FactionId, type PlayerCount, type Seat,
} from '@gdc/core';
import type { Rpc } from './resolve';
import { deadlineFor, type Cadence } from '../cadence';

export interface CreatedGameRow {
  ok: boolean;
  code?: string;
  game_id: string;
  invite_code: string | null;
  seat: number;
}

/**
 * La semilla del mapa la pone el servidor y **nunca** el cliente.
 *
 * Con la semilla se puede regenerar el mapa entero, incluidos los yacimientos que la
 * niebla todavía oculta. Es la única aleatoriedad de la partida que no puede salir de
 * `makeRng`: aquí sí queremos que sea impredecible, y por eso se usa el generador
 * criptográfico de la plataforma.
 */
function freshSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] as number;
}

export async function createGame(
  rpc: Rpc,
  profileId: string,
  input: { playerCount: PlayerCount; cadence: Cadence; visibility: 'public' | 'private' },
): Promise<CreatedGameRow> {
  return (await rpc('create_game', {
    p_profile: profileId,
    p_player_count: input.playerCount,
    p_cadence: input.cadence,
    p_private: input.visibility === 'private',
    p_seed: freshSeed(),
    p_engine: ENGINE_VERSION,
    p_mapgen: MAPGEN_VERSION,
  })) as CreatedGameRow;
}

export async function joinGame(
  rpc: Rpc,
  profileId: string,
  code: string,
): Promise<{ ok: boolean; code?: string; game_id?: string; seat?: number; rejoined?: boolean }> {
  return (await rpc('join_game', {
    p_code: code.trim().toUpperCase(),
    p_profile: profileId,
  })) as { ok: boolean; code?: string; game_id?: string; seat?: number; rejoined?: boolean };
}

export interface LobbyState {
  ok: boolean;
  game_id: string;
  status: 'lobby' | 'active' | 'finished' | 'abandoned';
  cadence: Cadence;
  player_count: PlayerCount;
  map_seed: number;
  turn: number;
  created_by: string | null;
  invite_code: string | null;
  seats: {
    seat: Seat; profile_id: string | null; name: string;
    faction_id: FactionId; is_bot: boolean;
  }[];
}

export async function lobbyState(rpc: Rpc, gameId: string): Promise<LobbyState | null> {
  return (await rpc('lobby_state', { p_game: gameId })) as LobbyState | null;
}

/**
 * Genera el mapa y escribe el turno 0.
 *
 * **Los asientos y la semilla salen de la base de datos, no de la petición.** Si la lista
 * de asientos viniera del cliente, el anfitrión podría empezar una partida de tres con un
 * solo jugador dentro, o ponerle a los demás la facción que le conviniera. Y si eligiera
 * la semilla, probaría mil hasta encontrar una que le deje tres yacimientos pegados al
 * Bastión.
 */
export async function startGame(
  rpc: Rpc,
  input: { gameId: string; hostProfileId: string; now: Date },
): Promise<{ ok: boolean; code?: string }> {
  const lobby = await lobbyState(rpc, input.gameId);
  if (!lobby?.ok) return { ok: false, code: 'game_not_found' };
  if (lobby.status !== 'lobby') return { ok: false, code: 'already_started' };
  if (lobby.created_by !== input.hostProfileId) return { ok: false, code: 'not_the_host' };

  const seated = lobby.seats.filter((seat) => seat.profile_id !== null || seat.is_bot);
  if (seated.length !== lobby.player_count) {
    // Se comprueba antes de generar el mapa: `createGame()` lanzaría, y una excepción
    // aquí sería un 500 donde el jugador merece «todavía falta gente».
    return { ok: false, code: 'seats_empty' };
  }

  const built = buildGame({
    gameId: input.gameId,
    seed: lobby.map_seed,
    players: lobby.player_count,
    seats: [...seated].sort((a, b) => a.seat - b.seat)
      .map((seat) => ({ name: seat.name, factionId: seat.faction_id })),
  });

  // El turno 0 no se resuelve: es el Parlamento. Sus vistas se proyectan del estado
  // recién creado, con el mismo código de niebla que usa `reduce()` — duplicarlo aquí
  // sería reimplementar el filtrado justo para el turno en el que un fallo revelaría el
  // mapa entero antes de la primera decisión.
  const views = projectViews(built.state);

  return (await rpc('start_game', {
    p_game: input.gameId,
    p_profile: input.hostProfileId,
    p_state: built.state,
    p_checksum: views[0]!.checksum,
    p_views: Object.entries(views).map(([seat, view]) => ({
      seat: Number(seat),
      view,
      events: [],
    })),
    p_deadline: deadlineFor(lobby.cadence, 0, input.now).toISOString(),
  })) as { ok: boolean; code?: string };
}
