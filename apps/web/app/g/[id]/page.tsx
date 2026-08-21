import { notFound, redirect } from 'next/navigation';
import type { PlayerView } from '@gdc/core';
import { GameBoard } from '@/components/GameBoard';
import { CampaignResult, type StandingRow } from '@/components/CampaignResult';
import { currentViewer } from '@/lib/server/session';
import { userClient } from '@/lib/server/supabase';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * La campaña. Es la misma vista única, con la cámara sobre el campo de batalla en vez de
 * sobre tu ciudad.
 *
 * **Todo lo que se lee aquí pasa por RLS.** La vista sale de `player_views`, ya filtrada
 * por asiento en el servidor: esta página no filtra nada, y no podría aunque quisiera —
 * lo que este jugador no debe ver nunca llegó hasta aquí.
 *
 * No hay sala de espera. Una partida emparejada empieza sola. Y una **terminada** ya no
 * se juega pero sí se mira: doce turnos de aritmética tienen que acabar en cifras, no en
 * una redirección silenciosa a la portada.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await currentViewer();
  if (!viewer) redirect('/sign-in');

  const { id } = await params;
  const supabase = await userClient();

  const { data: game } = await supabase
    .from('games')
    .select('id, status, turn, deadline_at')
    .eq('id', id)
    .maybeSingle();

  // Sin fila no hay partida **o** no juegas en ella: son indistinguibles a propósito.
  // Distinguirlas permitiría averiguar qué partidas existen.
  if (!game) notFound();
  // Ni activa ni terminada: no hay nada que jugar ni que contar.
  if (game.status !== 'active' && game.status !== 'finished') redirect('/');

  const { data: view } = await supabase
    .from('player_views')
    .select('turn, view, events')
    .eq('game_id', id)
    .order('turn', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!view) notFound();

  if (game.status === 'finished') {
    // RLS ya limita esto a las partidas que jugaste; la página no filtra nada.
    const { data: rows } = await supabase
      .from('match_results')
      .select('seat, outcome, seams, ash, regions, ash_awarded')
      .eq('game_id', id);

    return (
      <CampaignResult
        rows={(rows ?? []) as StandingRow[]}
        view={view.view as PlayerView}
        messages={DICTIONARIES[viewer.locale]}
      />
    );
  }

  // Un borrador a medias del turno actual. Cerrar la pestaña no puede costar el trabajo
  // ya hecho (TECHNICAL_DESIGN §9.2).
  const { data: draft } = await supabase
    .from('orders')
    .select('payload, submitted_at')
    .eq('game_id', id)
    .eq('turn', game.turn as number)
    .maybeSingle();

  return (
    <GameBoard
      messages={DICTIONARIES[viewer.locale]}
      gameId={id}
      view={view.view as PlayerView}
      draft={(draft?.payload as unknown) ?? null}
      submitted={draft?.submitted_at !== null && draft?.submitted_at !== undefined}
      deadlineAt={(game.deadline_at as string | null) ?? null}
    />
  );
}
