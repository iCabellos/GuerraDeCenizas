import { notFound } from 'next/navigation';
import {
  ENGINE_VERSION, botOrders, botProfile, buildAdjacency, createGame, projectViews, reduce,
  type MoveOrder, type OrdersBySeat, type PlayerCount, type Seat,
} from '@gdc/core';
import { GameBoard } from '@/components/GameBoard';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * Vista previa de la pantalla de campaña, sin base de datos.
 *
 * `/g/:id` necesita sesión, partida y Supabase, así que sin credenciales no hay forma de
 * mirarla — y una pantalla que no se puede mirar no se puede revisar. Esto monta una
 * partida de tres con el motor de verdad (`createGame` + `reduce` + `projectViews`), así
 * que el mapa, las fuerzas, la niebla y el frente son los que produce el juego.
 *
 * **Se juegan tres turnos antes de pintar** y los rivales los juegan bots. Sin eso la
 * pantalla salía en el Parlamento del T0, que es la única fase en la que no se puede
 * mover: se revisaba un tablero donde ninguna orden era posible y el 90 % de la interfaz
 * no llegaba a aparecer.
 *
 * `?turns=n` cambia cuántos se juegan; `?orders=0` la monta con el borrador vacío, que es
 * el otro estado que hay que revisar.
 *
 * Solo en desarrollo.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ orders?: string; turns?: string; players?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { orders, turns, players: size } = await searchParams;
  const seed = 424242;

  // `?players=5` monta el mapa de 96 provincias, que es el que de verdad pone a prueba
  // la pantalla: a tres caben todas holgadas y no se ve ninguno de sus problemas.
  const players: PlayerCount = size === '5' ? 5 : size === '2' ? 2 : 3;
  const table = [
    { name: 'Kael', factionId: 'vantera' as const },
    { name: 'Bren', factionId: 'koldvik' as const },
    { name: 'Ysolde', factionId: 'saranth' as const },
    { name: 'Ordo', factionId: 'meridia' as const },
    { name: 'Sela', factionId: 'oshara' as const },
  ].slice(0, players);

  const created = createGame({
    gameId: '00000000-0000-4000-8000-0000000000b0',
    seed,
    players,
    seats: table,
  });

  let state = created.state;
  const played = Math.min(8, Math.max(0, Number(turns ?? '3') || 0));
  for (let round = 0; round < played; round += 1) {
    const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
    const views = projectViews(state);
    const bySeat: OrdersBySeat = {};
    // Los tres asientos los juega el bot: lo que se revisa aquí es la pantalla, no la
    // estrategia. Que el asiento 0 también juegue solo evita un frente artificialmente
    // quieto justo donde mira la cámara.
    for (const seat of table.map((_, index) => index as Seat)) {
      const view = views[seat];
      if (view) bySeat[seat] = botOrders(view, adjacency, botProfile(seed, seat), seed);
    }
    state = reduce(state, bySeat, { engineVersion: ENGINE_VERSION, now: 0 }).state;
  }

  const view = projectViews(state)[0];
  if (!view) notFound();

  // Un borrador con órdenes de verdad: fuerzas propias movidas a un vecino real.
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
  const moves: MoveOrder[] = [];
  if (orders !== '0') {
    for (const force of state.forces.filter((f) => f.seat === 0).slice(0, 2)) {
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
