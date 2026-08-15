import { resolveTurn } from '@/lib/server/resolve';
import { serviceRpc } from '@/lib/server/supabase';
import { fail, internal, ok, parseBody, requireProfile } from '@/lib/server/api';
import { submitOrdersSchema } from '@/lib/schemas';

/**
 * `POST /api/games/:id/orders` — guardar borrador o enviar el turno.
 *
 * Es el único endpoint que un jugador usa durante una partida, y por tanto el único sitio
 * donde puede intentar algo. Tres cosas **no** salen de la petición:
 *
 *   · el asiento — se deduce de la sesión;
 *   · el turno   — se compara con `games.turn` y se rechaza si no coincide;
 *   · el efecto  — las órdenes se guardan tal cual y las valida el motor al resolver.
 *
 * Enviar puede disparar la resolución inmediata: es el camino del 85 % de los turnos
 * ([TECHNICAL_DESIGN §8.1](../../../../../docs/TECHNICAL_DESIGN.md#81-los-tres-disparadores)).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, submitOrdersSchema);
  if (!body.ok) return body.response;

  const { id } = await params;
  const rpc = serviceRpc();

  try {
    const saved = (await rpc('submit_orders', {
      p_game: id,
      p_profile: auth.profileId,
      p_turn: body.data.orders.turn,
      p_payload: body.data.orders,
      p_submit: body.data.submit,
    })) as { ok: boolean; code?: string; seat?: number; pending?: number };

    if (!saved.ok) return fail(saved.code ?? 'bad_request');

    // Si ya no falta nadie, se resuelve aquí mismo. `resolveTurn` es idempotente: que
    // dos jugadores envíen a la vez y ambos disparen la resolución es lo normal.
    let resolved: number | undefined;
    if (body.data.submit && saved.pending === 0) {
      const outcome = await resolveTurn(rpc, id, new Date());
      if (outcome.resolved) resolved = outcome.turn;
    }

    return ok({ seat: saved.seat, pending: saved.pending, resolvedTurn: resolved ?? null });
  } catch (error) {
    return internal(error);
  }
}
