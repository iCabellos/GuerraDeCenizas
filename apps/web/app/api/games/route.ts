import { createGame } from '@/lib/server/games';
import { serviceRpc } from '@/lib/server/supabase';
import { fail, internal, ok, parseBody, requireProfile } from '@/lib/server/api';
import { createGameSchema } from '@/lib/schemas';

/** `POST /api/games` — crear partida. Genera semilla y código de invitación. */
export async function POST(request: Request) {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, createGameSchema);
  if (!body.ok) return body.response;

  try {
    const created = await createGame(serviceRpc(), auth.profileId, body.data);
    if (!created.ok) return fail(created.code ?? 'internal');
    return ok(
      { gameId: created.game_id, inviteCode: created.invite_code, seat: created.seat },
      201,
    );
  } catch (error) {
    return internal(error);
  }
}
