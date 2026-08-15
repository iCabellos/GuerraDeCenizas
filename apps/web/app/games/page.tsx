import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, Muted, Shell, Title } from '@/components/ui/Shell';
import { NewGame } from '@/components/NewGame';
import { currentViewer } from '@/lib/server/session';
import { userClient } from '@/lib/server/supabase';
import { DICTIONARIES, translator } from '@/lib/i18n/index';

/**
 * Mis partidas.
 *
 * Se leen con el **cliente de usuario**, no con el de servicio: la política «ver mis
 * partidas» es la que decide qué sale. Si esta página usara `service_role` y filtrara en
 * JavaScript, la seguridad dependería de que ese filtro no tuviera un fallo — y la RLS
 * estaría ahí de adorno.
 */
export default async function Page() {
  const viewer = await currentViewer();
  if (!viewer) redirect('/sign-in');

  const t = translator(viewer.locale);
  const supabase = await userClient();

  const { data: games } = await supabase
    .from('games')
    .select('id, status, phase, turn, cadence, player_count, invite_code, deadline_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <Shell>
      <header className="flex items-baseline justify-between">
        <Title>{t('lobby.title')}</Title>
        <span className="text-sm text-muted">{viewer.displayName}</span>
      </header>

      <NewGame messages={DICTIONARIES[viewer.locale]} />

      {(games ?? []).length === 0 ? (
        <Muted>{t('lobby.empty')}</Muted>
      ) : (
        <ul className="flex flex-col gap-3">
          {(games ?? []).map((game) => (
            <li key={game.id as string}>
              <Link href={`/games/${game.id}`} className="block">
                <Card>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-base text-ink">
                      {game.status === 'lobby'
                        ? t('lobby.share')
                        : t('game.turn', { turn: game.turn as number })}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-muted">
                      {t(`cadence.${game.cadence as 'blitz' | 'daily' | 'relaxed'}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {t('lobby.players')}: {game.player_count as number}
                    {game.invite_code ? ` · ${game.invite_code as string}` : ''}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
