/**
 * Resolución de un turno. Es **la única pieza del sistema que hace avanzar una partida**.
 *
 * Tres caminos la disparan y convergen aquí ([TECHNICAL_DESIGN §8.1](../../../../docs/TECHNICAL_DESIGN.md#81-los-tres-disparadores)):
 * el último jugador que envía órdenes, `pg_cron` cuando vence el plazo, y cualquier
 * petición de cliente que detecte un plazo vencido. Los tres pueden ocurrir a la vez, así
 * que esto tiene que ser idempotente por construcción, no por suerte.
 *
 * La exclusión no la da el arrendamiento: la da `state_version` en `commit_resolution`.
 * Diez peticiones simultáneas pueden llegar a computar el mismo turno; solo una escribe.
 *
 * No importa `server-only` a propósito: los tests lo ejecutan contra un Postgres local
 * inyectando su propio `rpc`. Lo que no puede tocar es la red ni el cliente de Supabase
 * directamente, y por eso recibe el transporte en vez de construirlo.
 */

import {
  AUTOCOMMAND_AFTER, ENGINE_VERSION, autocommandOrders, botOrders, botProfile,
  buildAdjacency, claimStandings, parseStanding, projectViews, reduce, standingOrders,
  type GameState, type Orders, type OrdersBySeat, type Seat,
} from '@gdc/core';
import { ordersSchema } from '../schemas';
import { deadlineFor, isFinalTurn, type Cadence } from '../cadence';
import { withoutMap } from './views';

/** Transporte hacia las funciones de Postgres. Supabase en producción, `psql` en tests. */
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

export interface ResolveOutcome {
  resolved: boolean;
  /** Turno que empieza si se resolvió. */
  turn?: number;
  /** Por qué no se resolvió: `not_ready`, `in_progress`, `stale`, `not_active`… */
  skipped?: string;
}

interface BeginPayload {
  ok: boolean;
  code?: string;
  turn: number;
  state_version: number;
  cadence: Cadence;
  deadline_at: string | null;
  state: GameState;
  prev_control: (Seat | null)[] | null;
  orders: { seat: number; payload: unknown; source: string }[];
  seats: { seat: number; is_bot: boolean; missed_turns: number; standing_orders: unknown }[];
}

export async function resolveTurn(
  rpc: Rpc,
  gameId: string,
  now: Date,
): Promise<ResolveOutcome> {
  const begun = (await rpc('begin_resolution', {
    p_game: gameId,
    p_now: now.toISOString(),
  })) as BeginPayload;

  if (!begun?.ok) return { resolved: false, skipped: begun?.code ?? 'unknown' };

  const state = begun.state;
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
  /**
   * Las vistas del turno, proyectadas una sola vez.
   *
   * Un bot decide desde su `PlayerView`, igual que un humano: no ve a través de la
   * niebla. Un rival que leyera el estado entero no sería un rival sino un tramposo, y
   * las pruebas de juego que se hicieran contra él no valdrían para nada.
   */
  const views = projectViews(state);
  const submitted: number[] = [];
  const ordersBySeat: OrdersBySeat = {};
  const applied: { seat: number; payload: Orders; applied: Orders; source: string }[] = [];

  for (const seatRow of begun.seats) {
    const seat = seatRow.seat as Seat;
    const sent = begun.orders.find((row) => row.seat === seat);
    const orders = ordersFor(begun, state, adjacency, views, seatRow, sent);

    if (orders.source === 'player') submitted.push(seat);
    ordersBySeat[seat] = orders.orders;
    applied.push({
      seat,
      payload: orders.orders,
      applied: orders.orders,
      source: orders.source,
    });
  }

  // `now` del motor es el plazo, no el reloj: reejecutar la resolución tiene que dar
  // exactamente el mismo resultado, y `Date.now()` lo haría irreproducible.
  const engineNow = begun.deadline_at ? Date.parse(begun.deadline_at) : now.getTime();
  const result = reduce(state, ordersBySeat, { engineVersion: ENGINE_VERSION, now: engineNow });

  const nextTurn = result.state.meta.turn;
  const finished = isFinalTurn(nextTurn);

  const committed = (await rpc('commit_resolution', {
    p_game: gameId,
    p_turn: begun.turn,
    p_state_version: begun.state_version,
    p_state: result.state,
    p_checksum: result.checksum,
    p_views: Object.entries(result.views).map(([seat, view]) => ({
      seat: Number(seat),
      view: withoutMap(view),
      events: view.events,
    })),
    p_applied: applied,
    p_submitted: submitted,
    p_deadline: finished ? null : deadlineFor(begun.cadence, nextTurn, now).toISOString(),
    p_phase: finished ? 'resolved' : result.state.meta.phase,
    p_status: finished ? 'finished' : 'active',
  })) as { ok: boolean; code?: string; turn?: number };

  /**
   * El resultado de la campaña.
   *
   * Se escribe **después** de confirmar la resolución, nunca antes: una tabla de
   * resultados de una partida que no llegó a cerrarse es peor que ninguna.
   *
   * La clasificación la calcula el motor ([GDD §13.5](../../../../docs/GAME_DESIGN.md#135-si-nadie-consagra-reclamación-menor)),
   * no el servidor ni SQL — son reglas, y si las compusiera la base de datos el simulador
   * no podría reproducir el final de una partida. Mientras la Consagración no exista,
   * toda campaña acaba en Reclamación Menor.
   */
  if (finished && committed?.ok) {
    await rpc('record_results', { p_game: gameId, p_rows: claimStandings(result.state) });
  }

  if (!committed?.ok) return { resolved: false, skipped: committed?.code ?? 'unknown' };
  return { resolved: true, turn: committed.turn };
}

/**
 * Qué órdenes se ejecutan para un asiento.
 *
 * El escalado es el documentado en [MULTIPLAYER §5.2](../../../../docs/MULTIPLAYER.md#52-escalado):
 * enviadas > Órdenes Permanentes > Mando Automático a los tres turnos sin aparecer. Un
 * asiento nunca se queda sin órdenes, porque un asiento sin órdenes bloquearía la
 * partida de los otros cuatro.
 */
function ordersFor(
  begun: BeginPayload,
  state: GameState,
  adjacency: ReturnType<typeof buildAdjacency>,
  views: ReturnType<typeof projectViews>,
  seatRow: BeginPayload['seats'][number],
  sent: BeginPayload['orders'][number] | undefined,
): { orders: Orders; source: string } {
  const seat = seatRow.seat as Seat;

  if (sent) {
    // Se revalida aquí aunque la API ya lo hiciera: entre el envío y la resolución hay
    // una fila de `jsonb` que, en principio, podría haber tocado cualquiera.
    const parsed = ordersSchema.safeParse(sent.payload);
    if (parsed.success && parsed.data.turn === begun.turn) {
      return { orders: parsed.data as Orders, source: 'player' };
    }
  }

  /**
   * Un bot **no** es un humano ausente, y por eso no comparten código.
   *
   * El Mando Automático existe para que la ausencia de alguien no dañe a un tercero, así
   * que no ataca por iniciativa propia. Un asiento de bot nunca tuvo humano detrás: juega
   * para ganar, con el perfil que le tocó por la semilla de la partida.
   */
  const view = views[seat];
  if (seatRow.is_bot && view) {
    return {
      orders: botOrders(view, adjacency, botProfile(state.meta.seed, seat), state.meta.seed),
      source: 'bot',
    };
  }

  if (seatRow.is_bot || seatRow.missed_turns >= AUTOCOMMAND_AFTER) {
    return {
      orders: autocommandOrders(state, seat, adjacency, begun.prev_control ?? undefined),
      source: 'autocommand',
    };
  }

  return {
    orders: standingOrders(state, seat, parseStanding(seatRow.standing_orders)),
    source: 'standing',
  };
}
