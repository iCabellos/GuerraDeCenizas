import { notFound, redirect } from 'next/navigation';
import type { PlayerView } from '@gdc/core';
import { GameBoard } from '@/components/GameBoard';
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
 * No hay sala de espera. Una partida emparejada empieza sola, así que o está activa o no
 * es asunto de esta ruta.
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
  if (game.status !== 'active') redirect('/');

  const { data: view } = await supabase
    .from('player_views')
    .select('turn, view, events')
    .eq('game_id', id)
    .order('turn', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!view) notFound();

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
