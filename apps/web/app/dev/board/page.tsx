import { notFound } from 'next/navigation';
import { buildAdjacency, createGame, projectViews, type MoveOrder } from '@gdc/core';
import { GameBoard } from '@/components/GameBoard';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * Vista previa de la pantalla de campaña, sin base de datos.
 *
 * `/g/:id` necesita sesión, partida y Supabase, así que sin credenciales no hay forma de
 * mirarla — y una pantalla que no se puede mirar no se puede revisar. Esto monta una
 * partida de tres con el motor de verdad (`createGame` + `projectViews`), así que el mapa,
 * las fuerzas y la niebla son los que produce el juego, no un decorado.
 *
 * `?orders=0` la monta con el borrador vacío, que es el otro estado que hay que revisar.
 *
 * Solo en desarrollo.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orders?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { orders } = await searchParams;

  const { state } = createGame({
    gameId: '00000000-0000-4000-8000-0000000000b0',
    seed: 424242,
    players: 3,
    seats: [
      { name: 'Kael', factionId: 'vantera' },
      { name: 'Bren', factionId: 'koldvik' },
      { name: 'Ysolde', factionId: 'saranth' },
    ],
  });
  const view = projectViews(state)[0];
  if (!view) notFound();

  // Un borrador con órdenes de verdad: fuerzas propias movidas a un vecino real.
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
  const moves: MoveOrder[] = [];
  if (orders !== '0') {
    for (const force of state.forces.filter((f) => f.seat === 0).slice(0, 3)) {
      const to = adjacency[force.regionId]?.[0];
      if (to !== undefined) moves.push({ forceId: force.id, to, posture: 'assault' });
    }
  }

  return (
    <GameBoard
      messages={DICTIONARIES.es}
      gameId="00000000-0000-4000-8000-0000000000b0"
      view={view}
      draft={{ moves }}
      submitted={false}
      deadlineAt={new Date(Date.now() + 21 * 3600 * 1000).toISOString()}
    />
  );
}
