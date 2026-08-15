import { startGame } from '@/lib/server/games';
import { serviceRpc } from '@/lib/server/supabase';
import { fail, internal, ok, requireProfile } from '@/lib/server/api';

/**
 * `POST /api/games/:id/start` — genera el mapa y escribe el turno 0.
 *
 * No acepta cuerpo. Todo lo que hace falta —semilla, asientos, cadencia— está ya en la
 * base de datos: si viniera en la petición, el anfitrión podría elegirlo.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  try {
    const started = await startGame(serviceRpc(), {
      gameId: id,
      hostProfileId: auth.profileId,
      now: new Date(),
    });
    if (!started.ok) return fail(started.code ?? 'internal');
    return ok({ gameId: id });
  } catch (error) {
    return internal(error);
  }
}
