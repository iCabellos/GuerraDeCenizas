import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Legend, Masthead, Muted, Panel, Rule, Screen } from '@/components/ui/Shell';
import { NewGame } from '@/components/NewGame';
import { currentViewer } from '@/lib/server/session';
import { userClient } from '@/lib/server/supabase';
import { DICTIONARIES, translator } from '@/lib/i18n/index';
import * as Art from '@/components/art/generated';

const FACTION_ART: Record<string, keyof typeof Art> = {
  vantera: 'FactionVantera', koldvik: 'FactionKoldvik', saranth: 'FactionSaranth',
  meridia: 'FactionMeridia', oshara: 'FactionOshara', tarn: 'FactionTarn',
};

/**
 * Mis partidas.
 *
 * Se leen con el **cliente de usuario**, no con el de servicio: la política «ver mis
 * partidas» es la que decide qué sale. Si esta página usara `service_role` y filtrara en
 * JavaScript, la seguridad dependería de que ese filtro no tuviera un fallo — y la RLS
 * estaría de adorno.
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

  const Emblem = Art[FACTION_ART[viewer.factionId] ?? 'Mark'] as typeof Art.Mark;

  return (
    <Screen>
      <Masthead subtitle={viewer.displayName} />

      <div className="mt-6 flex items-center gap-3 rounded-sharp border border-line bg-panel px-4 py-3">
        <Emblem size={28} className="text-rust" title={t(`faction.${viewer.factionId}`)} />
        <div>
          <p className="type-label">{t('faction.yours')}</p>
          <p className="type-title text-sm text-ink">{t(`faction.${viewer.factionId}`)}</p>
        </div>
      </div>

      <div className="mt-6">
        <NewGame messages={DICTIONARIES[viewer.locale]} />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Legend>{t('lobby.yourGames')}</Legend>
        <Rule />

        {(games ?? []).length === 0 ? (
          <Muted>{t('lobby.empty')}</Muted>
        ) : (
          <ul className="flex flex-col gap-2">
            {(games ?? []).map((game) => (
              <li key={game.id as string}>
                <Link href={`/games/${game.id}`} className="block">
                  <Panel>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="type-title text-sm text-ink">
                        {game.status === 'lobby'
                          ? t('lobby.inLobby')
                          : t('lobby.turnOf', {
                              turn: game.turn as number,
                              phase: t(`game.${game.phase as 'parley' | 'war' | 'resolved'}`),
                            })}
                      </span>
                      <span className="type-label">
                        {t(`cadence.${game.cadence as 'blitz' | 'daily' | 'relaxed'}`)}
                      </span>
                    </div>
                    <p className="mt-2 flex items-center gap-3 text-xs text-muted">
                      <span className="type-figure">{game.player_count as number}</span>
                      <span>{t('lobby.players')}</span>
                      {game.invite_code ? (
                        <span className="type-figure ml-auto tracking-[0.2em] text-faint">
                          {game.invite_code as string}
                        </span>
                      ) : null}
                    </p>
                  </Panel>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  );
}
