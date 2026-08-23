/**
 * El final de la campaña.
 *
 * Mientras la Consagración no exista, **toda** partida termina en Reclamación Menor
 * ([GDD §13.5](../../../../docs/GAME_DESIGN.md#135-si-nadie-consagra-reclamación-menor)):
 * al cerrar el T12 gana quien más puntúe.
 *
 * ```
 * puntuación = 4 × yacimientos + 2 × ceniza + 1 × regiones + 3 × (controla el Núcleo)
 * ```
 *
 * Los pesos favorecen a propósito lo **contestado** sobre el territorio acumulado, para
 * que no gane quien se expande lejos y se esconde.
 *
 * **Los empates no se rompen al azar.** Más Ceniza, luego el Núcleo, y si persiste se
 * declara empate: los dos figuran como vencedores. Un desempate aleatorio convertiría
 * doce turnos de aritmética en una moneda al aire.
 */

import type { GameState, Seat } from '../types/index';

/** Vocabulario de `match_results.outcome`. Sin Consagración solo salen estos tres. */
export type Outcome = 'attuned' | 'coalition' | 'lesser' | 'survivor' | 'reduced' | 'abandoned';

/** Parte de la Ceniza acumulada que se lleva la Ciudad ([GDD §13.6](../../../../docs/GAME_DESIGN.md#136-recompensas)). */
const AWARD: Partial<Record<Outcome, number>> = {
  lesser: 0.55,
  survivor: 0.35,
  reduced: 0.2,
};

export interface SeatStanding {
  seat: Seat;
  score: number;
  outcome: Outcome;
  /** Ceniza que se lleva la Ciudad. Entera: media Ceniza no existe. */
  ashAwarded: number;
  seams: number;
  /** Ceniza en reserva, **redondeada**: es una cifra de informe, no de cálculo. */
  ash: number;
  regions: number;
  /** ¿Terminó controlando el Núcleo? */
  core: boolean;
  /** ¿Conserva su Bastión? Es lo que separa a un superviviente de uno reducido. */
  bastion: boolean;
}

/** La clasificación final, de mejor a peor. Determinista y sin azar. */
export function claimStandings(state: GameState): SeatStanding[] {
  const rows = state.seats
    .map((seatState) => {
      const seat = seatState.seat;
      let seams = 0;
      let regions = 0;
      for (let regionId = 0; regionId < state.control.length; regionId += 1) {
        if (state.control[regionId] !== seat) continue;
        regions += 1;
        if (state.map.regions[regionId]?.kind === 'seam') seams += 1;
      }
      const core = state.control[state.map.coreId] === seat;
      const bastionId = state.map.bastions[seat];
      const bastion = bastionId !== undefined && state.control[bastionId] === seat;
      const ash = seatState.resources.ash;

      return {
        seat, seams, regions, core, bastion,
        // La reserva se lleva decimales; la puntuación y el premio los usan enteros de
        // verdad y solo el informe redondea. Redondear antes movería la clasificación.
        exact: ash,
        ash: Math.round(ash),
        score: 4 * seams + 2 * ash + regions + (core ? 3 : 0),
        outcome: 'survivor' as Outcome,
        ashAwarded: 0,
      };
    })
    // Orden estable y sin azar: puntuación, luego Ceniza, luego el Núcleo, luego asiento.
    .sort((a, b) =>
      b.score - a.score || b.exact - a.exact || Number(b.core) - Number(a.core) || a.seat - b.seat);

  // Empate declarado: quien iguale a la cabeza en los tres criterios también vence.
  const top = rows[0];
  for (const row of rows) {
    const tied = top !== undefined
      && row.score === top.score && row.exact === top.exact && row.core === top.core;
    row.outcome = tied ? 'lesser' : row.bastion ? 'survivor' : 'reduced';
    row.ashAwarded = Math.floor(row.exact * (AWARD[row.outcome] ?? 0));
  }

  // `exact` es de uso interno: fuera solo sale la cifra de informe.
  return rows.map(({ exact: _exact, ...row }) => row);
}
