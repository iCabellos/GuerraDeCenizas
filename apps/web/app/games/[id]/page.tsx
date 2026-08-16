import { notFound, redirect } from 'next/navigation';
import type { PlayerView } from '@gdc/core';
import { GameBoard } from '@/components/GameBoard';
import { LobbyRoom } from '@/components/LobbyRoom';
import { Masthead, Screen } from '@/components/ui/Shell';
import { currentViewer } from '@/lib/server/session';
import { userClient } from '@/lib/server/supabase';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * Una partida: sala de espera si está en lobby, tablero si está activa.
 *
 * **Todo lo que se lee aquí pasa por RLS.** La vista sale de `player_views`, que ya viene
 * filtrada por asiento desde el servidor: esta página no filtra nada, y no podría aunque
 * quisiera — lo que este jugador no debe ver nunca llegó hasta aquí.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) redirect('/sign-in');

  const { id } = await params;
  const supabase = await userClient();

  const { data: game } = await supabase
    .from('games')
    .select('id, status, phase, turn, cadence, player_count, invite_code, created_by, deadline_at')
    .eq('id', id)
    .maybeSingle();

  // Sin fila no hay partida **o** no juegas en ella: son indistinguibles a propósito.
  // Distinguirlas permitiría averiguar qué partidas existen.
  if (!game) notFound();

  const { data: seats } = await supabase
    .from('game_players')
    .select('seat, profile_id, faction_id, is_bot, missed_turns')
    .eq('game_id', id)
    .order('seat');

  const messages = DICTIONARIES[viewer.locale];
  const mySeat = (seats ?? []).find((row) => row.profile_id === viewer.profileId)?.seat ?? null;

  if (game.status === 'lobby') {
    return (
      <Screen>
        <Masthead subtitle={DICTIONARIES[viewer.locale]['lobby.inLobby']} />
        <LobbyRoom
          messages={messages}
          gameId={id}
          inviteCode={(game.invite_code as string | null) ?? ''}
          playerCount={game.player_count as number}
          isHost={game.created_by === viewer.profileId}
          seats={(seats ?? []).map((row) => ({
            seat: row.seat as number,
            taken: row.profile_id !== null || (row.is_bot as boolean),
            you: row.profile_id === viewer.profileId,
          }))}
        />
      </Screen>
    );
  }

  const { data: view } = await supabase
    .from('player_views')
    .select('turn, view, events')
    .eq('game_id', id)
    .order('turn', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!view || mySeat === null) notFound();

  // Un borrador guardado a medias del turno actual. Cerrar la pestaña no puede costar el
  // trabajo ya hecho (TECHNICAL_DESIGN §9.2).
  const { data: draft } = await supabase
    .from('orders')
    .select('payload, submitted_at')
    .eq('game_id', id)
    .eq('turn', game.turn as number)
    .maybeSingle();

  return (
    <GameBoard
      messages={messages}
      gameId={id}
      view={view.view as PlayerView}
      draft={(draft?.payload as unknown) ?? null}
      submitted={draft?.submitted_at !== null && draft?.submitted_at !== undefined}
      deadlineAt={(game.deadline_at as string | null) ?? null}
    />
  );
}
