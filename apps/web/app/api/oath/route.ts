import { serviceRpc } from '@/lib/server/supabase';
import { fail, internal, ok, parseBody, requireProfile } from '@/lib/server/api';
import { swearOathSchema } from '@/lib/schemas';

/**
 * `POST /api/oath` — jurar por primera vez.
 *
 * La identidad la resuelve la sesión y la escritura la hace el rol de servicio: el
 * reparto de siempre. Si el `profileId` viniera en el cuerpo, «jura por mí» dejaría de
 * ser un ataque para pasar a ser una llamada bien formada.
 *
 * El primer juramento es gratis y **solo se puede hacer una vez**: quien ya juró y quiere
 * cambiar paga un Cisma, que tiene su propio precio y no pasa por aquí. La condición vive
 * en la función de base de datos, no en esta ruta, para que no dependa de que la API sea
 * el único camino.
 */
export async function POST(request: Request) {
  const auth = await requireProfile();
  if (!auth.ok) return auth.response;

  const body = await parseBody(request, swearOathSchema);
  if (!body.ok) return body.response;

  try {
    const payload = (await serviceRpc()('swear_oath', {
      p_profile: auth.profileId,
      p_faction: body.data.factionId,
    })) as { ok: boolean; code?: string } | null;

    if (!payload?.ok) return fail(payload?.code ?? 'internal', 409);
    return ok({ factionId: body.data.factionId });
  } catch (error) {
    return internal(error);
  }
}
