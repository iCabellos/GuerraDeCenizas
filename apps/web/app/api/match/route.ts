import { cancel, search, status } from '@/lib/server/matchmaking';
import { serviceRpc } from '@/lib/server/supabase';
import { internal, ok, parseBody, requireProfile } from '@/lib/server/api';
import { searchMatchSchema } from '@/lib/schemas';

/** `GET /api/match` — ¿sigo en cola? Lo consulta la pantalla mientras espera. */
export async function GET() {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;
  try {
    return ok({ queue: await status(serviceRpc(), auth.profileId) });
  } catch (error) {
    return internal(error);
  }
}

/**
 * `POST /api/match` — buscar campaña.
 *
 * Puede devolver una partida ya empezada: si había gente esperando, el emparejamiento
 * ocurre en esta misma petición y no hay sala intermedia. Es lo que convierte «jugar» en
 * una sola pulsación.
 */
export async function POST(request: Request) {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, searchMatchSchema);
  if (!body.ok) return body.response;

  try {
    const outcome = await search(serviceRpc(), auth.profileId, body.data);
    return ok({
      gameId: outcome.gameId ?? null,
      waiting: outcome.waiting ?? null,
      needed: outcome.needed ?? null,
    });
  } catch (error) {
    return internal(error);
  }
}

/** `DELETE /api/match` — salir de la cola. */
export async function DELETE() {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;
  try {
    await cancel(serviceRpc(), auth.profileId);
    return ok({ queued: false });
  } catch (error) {
    return internal(error);
  }
}
