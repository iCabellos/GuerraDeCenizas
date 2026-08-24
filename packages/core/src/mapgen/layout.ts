/**
 * De grafo a territorio: el mapa dibujado como provincias.
 *
 * **Cada provincia es un hexágono regular del mismo tamaño.** No es un adorno: es lo que
 * hace que el tablero se lea como un tablero —piezas iguales, del mismo valor, puestas
 * sobre una mesa— en vez de como una estructura de datos dibujada.
 *
 * Antes esto devolvía el **dual baricéntrico** del grafo, que tesela sin huecos y garantiza
 * que dos celdas se tocan si y solo si son adyacentes. Se cambió porque esa garantía tenía
 * un precio escondido: en el dual, **una celda tiene tantos lados como vecinos su región**,
 * y el grafo del juego tiene grado medio 3,9. O sea: ni una sola provincia era un
 * hexágono. Salían cuadriláteros y pentágonos de lados desiguales
 * ([ADR-046](../../../docs/DECISIONS.md#adr-046)).
 *
 * Hexágonos iguales no teselan un disco con simetría C_5 —eso es imposible, y por eso el
 * mapa no es un panal—, así que entre provincias queda holgura. Lo que sí se conserva, y
 * es lo que impide que el dibujo mienta, lo fija un test:
 *
 * > **el par de provincias NO adyacentes más cercano está más lejos que el par adyacente
 * > más lejano.** Lo que parece vecino, lo es.
 *
 * De eso se encargan los recuentos de `SECTOR_SPEC` y los radios de `RING_RADII`, que
 * están calculados juntos para que la distancia entre vecinos sea casi uniforme.
 *
 * Puro y determinista, como todo `packages/core`: mismas regiones, mismas celdas.
 */

import type { GameMap } from '../types/index';
import { CELL_RADIUS, CORE_SHARE } from './skeleton';

export interface Point {
  x: number;
  y: number;
}

/** Un hexágono regular tiene seis lados. Aquí no hay nada configurable. */
const SIDES = 6;

/**
 * Las celdas del mapa, indexadas por `regionId`.
 *
 * Cada celda es un hexágono regular cerrado en sentido antihorario, en las mismas
 * coordenadas que `region.x/y`. Todas miden lo mismo salvo el Núcleo, que lleva su cuota
 * `CORE_SHARE` porque es el objetivo de la campaña y se le tiene que notar.
 *
 * La orientación sigue al anillo: un vértice apunta hacia afuera, así que los lados planos
 * miran a los vecinos de su propio anillo, que son los que están mejor alineados. Con la
 * orientación fija —todos los hexágonos mirando al norte— las provincias de un mismo
 * anillo se cruzaban en escalera y el anillo dejaba de leerse como una banda.
 */
export function regionCells(map: GameMap): Point[][] {
  return map.regions.map((region) => {
    const core = region.id === map.coreId;
    const radius = core ? CELL_RADIUS * Math.sqrt(CORE_SHARE) : CELL_RADIUS;
    // El Núcleo está en el origen y no tiene ángulo propio: se deja a cero para que su
    // hexágono sea el mismo en todas las partidas.
    const base = core ? 0 : Math.atan2(region.y, region.x);

    const cell: Point[] = [];
    for (let i = 0; i < SIDES; i += 1) {
      const angle = base + (i * 2 * Math.PI) / SIDES;
      cell.push(round2({
        x: region.x + Math.cos(angle) * radius,
        y: region.y + Math.sin(angle) * radius,
      }));
    }
    return cell;
  });
}

function round2(point: Point): Point {
  return { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
}
