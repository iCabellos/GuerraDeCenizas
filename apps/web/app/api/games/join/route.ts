import { joinGame } from '@/lib/server/games';
import { serviceRpc } from '@/lib/server/supabase';
import { fail, internal, ok, parseBody, requireProfile } from '@/lib/server/api';
import { joinGameSchema } from '@/lib/schemas';

/**
 * `POST /api/games/join` — unirse por código.
 *
 * La ruta no lleva el identificador de partida a propósito: quien se une solo conoce el
 * código, y traducir código → partida es trabajo del servidor. Con `/api/games/:id/join`
 * habría que exponer antes una búsqueda por código, y eso permitiría sondear qué partidas
 * existen.
 */
export async function POST(request: Request) {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, joinGameSchema);
  if (!body.ok) return body.response;

  try {
    const joined = await joinGame(serviceRpc(), auth.profileId, body.data.code);
    if (!joined.ok) return fail(joined.code ?? 'game_not_found', 404);
    return ok({ gameId: joined.game_id, seat: joined.seat, rejoined: joined.rejoined });
  } catch (error) {
    return internal(error);
  }
}
