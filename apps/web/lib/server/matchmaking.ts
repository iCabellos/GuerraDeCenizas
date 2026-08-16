/**
 * Emparejamiento: de «quiero jugar» a un mapa, sin formularios ni salas de espera.
 *
 * El jugador pulsa una vez. Si hay gente esperando, la partida se crea y **empieza sola**;
 * si no, se queda en cola viendo llegar a las demás ciudades, y pasados unos minutos los
 * asientos que falten los ocupa el Mando Automático ([ADR-026](../../../../docs/DECISIONS.md#adr-026)).
 *
 * Nunca hay un estado «te has quedado sin partida»: esa es la mitigación del riesgo de
 * producto número uno de un juego para 2, 3 o 5 personas
 * ([DISCOVERY P1](../../../../docs/DISCOVERY.md#23-riesgos-de-producto)).
 */

import type { PlayerCount } from '@gdc/core';
import type { Cadence } from '../cadence';
import { createGame, startGame } from './games';
import type { Rpc } from './resolve';

export interface QueueStatus {
  ok: boolean;
  queued: boolean;
  player_count?: PlayerCount;
  cadence?: Cadence;
  waiting?: number;
  waited_seconds?: number;
}

export interface MatchOutcome {
  /** Partida creada y empezada: el cliente ya puede entrar. */
  gameId?: string;
  /** Sigue en cola. Cuántos hay y cuántos hacen falta, para pintar la espera. */
  waiting?: number;
  needed?: number;
}

/**
 * Entrar en la cola e intentar formar partida **en la misma petición**.
 *
 * Intentarlo aquí y no solo desde el cron es lo que hace que el emparejamiento sea
 * instantáneo cuando ya hay alguien esperando. El cron es la red de seguridad para el
 * relleno con bots, que por definición ocurre cuando no hay nadie más pulsando el botón.
 */
export async function search(
  rpc: Rpc,
  profileId: string,
  input: { playerCount: PlayerCount; cadence: Cadence },
): Promise<MatchOutcome> {
  const queued = (await rpc('enqueue', {
    p_profile: profileId,
    p_size: input.playerCount,
    p_cadence: input.cadence,
  })) as { ok: boolean; waiting: number; needed: number };

  const formed = await formMatch(rpc, input.playerCount, input.cadence);
  if (formed) return { gameId: formed };

  return { waiting: queued.waiting, needed: queued.needed };
}

export async function cancel(rpc: Rpc, profileId: string): Promise<void> {
  await rpc('dequeue', { p_profile: profileId });
}

export async function status(rpc: Rpc, profileId: string): Promise<QueueStatus> {
  return (await rpc('queue_status', { p_profile: profileId })) as QueueStatus;
}

/**
 * Forma una partida si el grupo está listo, y la deja **empezada**.
 *
 * `claim_match` es destructivo: los jugadores que devuelve ya no están en la cola, así
 * que a partir de ahí hay que llegar hasta el final. Si algo fallara entre medias se
 * quedarían fuera de la cola y sin partida — por eso cada paso es una llamada atómica y
 * el orden es crear, sentar y empezar, nunca al revés.
 *
 * @returns el identificador de la partida, o `null` si todavía no toca.
 */
export async function formMatch(
  rpc: Rpc,
  playerCount: PlayerCount,
  cadence: Cadence,
): Promise<string | null> {
  const claim = (await rpc('claim_match', {
    p_size: playerCount,
    p_cadence: cadence,
  })) as { ok: boolean; code?: string; profiles?: string[]; bots?: number };

  if (!claim?.ok || !claim.profiles?.length) return null;

  const host = claim.profiles[0] as string;
  const created = await createGame(rpc, host, {
    playerCount,
    cadence,
    // Emparejada: no hay código que compartir porque no hay a quién invitar.
    visibility: 'public',
  });
  if (!created.ok) return null;

  await rpc('seat_match', { p_game: created.game_id, p_profiles: claim.profiles });

  const started = await startGame(rpc, {
    gameId: created.game_id,
    hostProfileId: host,
    now: new Date(),
  });
  if (!started.ok) return null;

  return created.game_id;
}

/** Todas las combinaciones que el cron recorre buscando grupos listos o vencidos. */
export const BUCKETS: readonly { playerCount: PlayerCount; cadence: Cadence }[] = (
  [2, 3, 5] as PlayerCount[]
).flatMap((playerCount) =>
  (['blitz', 'daily', 'relaxed'] as Cadence[]).map((cadence) => ({ playerCount, cadence })),
);
