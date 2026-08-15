import { resolveTurn } from '@/lib/server/resolve';
import { serviceRpc } from '@/lib/server/supabase';
import { fail, internal, ok } from '@/lib/server/api';
import { CRON_SECRET } from '@/lib/server/env';

/**
 * `POST /api/cron/resolve-due` — resuelve los turnos vencidos.
 *
 * Lo llama `pg_cron` cada minuto a través de `pg_net`. Vercel Hobby solo permite **un
 * cron diario**, lo que es inservible para turnos de tres minutos; por eso el reloj vive
 * en Supabase ([ADR-014](../../../../../docs/DECISIONS.md#adr-014)).
 *
 * Sin el secreto compartido, este endpoint sería una forma pública de forzar la
 * resolución de cualquier partida cuyo plazo haya vencido — y de saber cuáles son.
 */
export async function POST(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET()}`) {
    return fail('unauthorized', 401);
  }

  const rpc = serviceRpc();
  const now = new Date();

  try {
    const due = (await rpc('due_games', {
      p_now: now.toISOString(),
      p_limit: 20,
    })) as { game_id: string; turn: number }[];

    const results = [];
    for (const game of due ?? []) {
      // En serie a propósito: en paralelo competirían por el mismo pool de conexiones
      // del free tier, y la partida número veinte no puede esperar tanto como para que
      // eso importe.
      results.push({ gameId: game.game_id, ...(await resolveTurn(rpc, game.game_id, now)) });
    }

    return ok({ checked: due?.length ?? 0, resolved: results.filter((r) => r.resolved).length });
  } catch (error) {
    return internal(error);
  }
}
