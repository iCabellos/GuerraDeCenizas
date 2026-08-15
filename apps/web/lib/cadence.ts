/**
 * Cadencias: cuánto dura un turno en tiempo real.
 *
 * No lleva `server-only`: el lobby necesita enseñar «3 min por turno» antes de que exista
 * ninguna partida, y aquí no hay ni un secreto ni una decisión — solo el calendario.
 *
 * **El motor no sabe nada de esto** ([MULTIPLAYER §2](../../../docs/MULTIPLAYER.md#2-cadencias)).
 * Solo recibe un estado y unas órdenes; el reloj es asunto del servidor. Cambiar de
 * cadencia no toca ni una línea de `@gdc/core`, y por eso estas constantes no viven en
 * `BALANCE`: no afectan al equilibrio, solo a la agenda.
 */

export type Cadence = 'blitz' | 'daily' | 'relaxed';

export const CADENCE_MINUTES: Readonly<Record<Cadence, number>> = {
  blitz: 3,
  daily: 12 * 60,
  relaxed: 24 * 60,
};

export const CADENCES = ['blitz', 'daily', 'relaxed'] as const;

/** Turnos de una campaña. Fijo en las tres cadencias: lo que cambia es el reloj. */
export const CAMPAIGN_TURNS = 12;

/**
 * Plazo del turno que empieza.
 *
 * El Parlamento (T0) dura **el doble**: es el turno en el que se negocia desde cero y sin
 * información previa, y con el plazo normal la única jugada racional sería no pactar.
 */
export function deadlineFor(cadence: Cadence, turn: number, now: Date): Date {
  const minutes = CADENCE_MINUTES[cadence] * (turn === 0 ? 2 : 1);
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * La campaña son 12 turnos de Guerra **más** el Parlamento: T0 negocia, T1–T12 se
 * combate. Cerrar T12 deja el estado en el turno 13, y ahí se acaba.
 */
export function isFinalTurn(turn: number): boolean {
  return turn > CAMPAIGN_TURNS;
}
