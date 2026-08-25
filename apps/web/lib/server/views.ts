import type { GameMap, PlayerView } from '@gdc/core';

/**
 * El mapa no se guarda en cada vista ([ADR-044](../../../docs/DECISIONS.md#adr-044)).
 *
 * `player_views` tiene una fila por (partida, turno, asiento), y el mapa es **inmutable
 * durante toda la partida**: guardarlo en cada una eran 120 copias del mismo objeto en
 * una campaña de cinco a 24 turnos. Medido con el mapa de zonas: 36,3 KB de mapa sobre
 * una vista de 43,2 KB — el 84 % de cada fila era terreno que ya estaba escrito.
 *
 * El mapa se guarda una vez en `game_maps` y se vuelve a pegar aquí al leer. Ni el motor
 * ni la interfaz se enteran: `PlayerView` sigue teniendo su `map`, que es justo lo que
 * evita tocar cada componente que lo usa.
 */

/** Lo que se persiste: la vista sin su mapa. */
export type StoredView = Omit<PlayerView, 'map'>;

export function withoutMap(view: PlayerView): StoredView {
  const { map: _map, ...rest } = view;
  return rest;
}

/**
 * Lo que se sirve: la vista otra vez completa.
 *
 * Si el mapa faltara —una partida anterior a esta migración, una fila a medias— es mejor
 * fallar aquí que servir media vista: un tablero sin mapa no es una pantalla degradada,
 * es una pantalla rota, y hacerlo explícito ahorra depurar un `undefined` tres capas más
 * arriba.
 */
export function withMap(view: StoredView, map: GameMap | null | undefined): PlayerView {
  if (!map) throw new Error('la partida no tiene mapa guardado');
  return { ...view, map };
}
