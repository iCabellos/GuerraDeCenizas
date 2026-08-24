/**
 * Colosos: los guardianes de las Puertas.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ El Coloso es un PROBLEMA DIPLOMÁTICO DISFRAZADO DE MONSTRUO ([ADR-043]). │
 * │                                                                          │
 * │ Abrir la Puerta beneficia a los cinco. Pagarla la paga uno. Es un        │
 * │ problema de bien público colocado en el punto exacto del mapa donde el   │
 * │ juego quiere que la gente hable, con un precio que el motor calcula y    │
 * │ todos pueden ver. La pregunta que deja en la mesa —«¿quién paga la       │
 * │ puerta?»— ES la pregunta del juego.                                      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Mecánicamente es lo más aburrido posible, y a propósito: no se mueve nunca, pelea
 * con la misma fórmula que todo lo demás, reparte su daño en proporción y empata por
 * número de asiento ascendente. Sin dados, sin tabla aparte, sin IA. Un Coloso
 * previsible es un Coloso sobre el que se puede **prometer** ayuda y comprobar si la
 * diste — que es de lo que va este juego.
 */

import type {
  Colossus, Force, GameState, MaterialStock, RegionId, Seat, SeatState, TerrainKind,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { round4 } from '../util/canonical';
import { EventLog } from './events';
import { combatPower, totalOf, type CombatSide } from './combat';
import { creditMaterials } from './extraction';
import { openGate } from './zones';

/** Índice del Cerco al que pertenece una Puerta: 0 = Solar→Marca, 1 = Marca→Corona. */
export function wardIndexOf(from: number): 0 | 1 {
  return from === 1 ? 0 : 1;
}

/** Colosos iniciales, uno por Puerta. Todos idénticos por Cerco: la equidad se conserva. */
export function initialColossi(gates: GameState['map']['gates']): Colossus[] {
  return gates.map((gate) => {
    const arms = BALANCE.colossus.arms[wardIndexOf(gate.from)] as
      { line: number; fire: number; sky: number };
    return {
      id: gate.colossus,
      gateId: gate.id,
      // ── El Coloso está en el lado de FUERA, y esto es lo más importante del módulo ──
      //
      // Si estuviera en el lado de dentro, viviría al otro lado de un Cerco sellado:
      // nadie podría llegar a él, nadie podría matarlo, la Puerta no se abriría nunca y
      // **la partida sería imposible de ganar**. Lo cazó una campaña completa de 24
      // turnos en la que ningún bot pisó jamás una Puerta.
      //
      // Puesto delante, el Coloso hace lo que dice el diseño: **guarda** la puerta.
      regionId: gate.outer,
      line: arms.line,
      fire: arms.fire,
      sky: arms.sky,
      peak: arms.line + arms.fire + arms.sky,
      alive: true,
    };
  }).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface ColossusResult {
  colossi: Colossus[];
  forces: Force[];
  seats: SeatState[];
  stock: MaterialStock[];
  gatesOpen: boolean[];
}

/**
 * Etapa 6b · Combate contra Colosos.
 *
 * Va **después** del combate entre asientos —para que dos asientos puedan pelearse por
 * el golpe final— y **antes** del control, para que abrir la Puerta no cambie quién
 * manda en qué en el mismo turno en que se abre.
 */
export function applyColossi(
  state: GameState,
  forces: readonly Force[],
  seats: readonly SeatState[],
  stock: readonly MaterialStock[],
  log: EventLog,
): ColossusResult {
  const colossi = state.colossi.map((c) => ({ ...c }));
  const result = new Map(forces.map((f) => [f.id, { ...f }]));
  let nextSeats = seats.map((s) => ({ ...s, resources: { ...s.resources } }));
  let gatesOpen = [...state.gatesOpen];

  // Por id de Coloso ascendente: el orden no puede depender del array del estado.
  for (const colossus of colossi) {
    if (!colossus.alive) continue;

    const present = [...result.values()].filter(
      (f) => f.regionId === colossus.regionId && totalOf(f) > 0,
    );

    if (present.length === 0) {
      // Nadie lo tocó: se rehace. Sin esto se podría limar a picotazos gratis, mandando
      // una fuerza mínima cada turno hasta tumbarlo sin pagar nada.
      regenerate(colossus);
      continue;
    }

    const terrain = (state.map.regions[colossus.regionId]?.kind ?? 'plain') as TerrainKind;
    const fortLevel = state.fortification[colossus.regionId] ?? 0;

    const seatsPresent = [...new Set(present.map((f) => f.seat))].sort((a, b) => a - b);
    const powers = new Map<Seat, number>();
    let attackTotal = 0;
    for (const seat of seatsPresent) {
      const own = present.filter((f) => f.seat === seat);
      const side: CombatSide = {
        seat,
        arms: {
          line: own.reduce((s, f) => s + f.line, 0),
          fire: own.reduce((s, f) => s + f.fire, 0),
          sky: own.reduce((s, f) => s + f.sky, 0),
        },
        posture: (own.reduce((best, f) => (totalOf(f) > totalOf(best) ? f : best)) as Force).posture,
        defender: false,
        fireSupport: 0,
        unsupplied: Math.max(...own.map((f) => f.unsupplied)),
      };
      const power = combatPower(side, armsOf(colossus), terrain, 0);
      powers.set(seat, power);
      attackTotal = round4(attackTotal + power);
    }

    const defence = combatPower(
      {
        seat: 0,
        arms: armsOf(colossus),
        posture: 'hold',
        defender: true,
        fireSupport: 0,
        unsupplied: 0,
      },
      sumArms(present),
      terrain,
      fortLevel,
    );

    const { attritionK, retaliation } = BALANCE.colossus;
    // Cuantos más vengan, antes cae **y** menos sufre cada uno. Las dos cosas a la vez
    // son lo que hace que coordinarse salga a cuenta, que es el único punto del sistema.
    const colossusLoss = defence > 0 ? Math.min(1, (attackTotal * attritionK) / defence) : 1;
    const attackerLoss = attackTotal > 0 ? Math.min(1, (defence * retaliation) / attackTotal) : 1;

    for (const force of present) {
      const entry = result.get(force.id);
      if (!entry) continue;
      entry.line = trim(force.line * (1 - attackerLoss));
      entry.fire = trim(force.fire * (1 - attackerLoss));
      entry.sky = trim(force.sky * (1 - attackerLoss));
    }

    colossus.line = trim(colossus.line * (1 - colossusLoss));
    colossus.fire = trim(colossus.fire * (1 - colossusLoss));
    colossus.sky = trim(colossus.sky * (1 - colossusLoss));

    log.emit({
      type: 'COLOSSUS_FOUGHT',
      seat: null,
      scope: { kind: 'public' },
      data: {
        colossus: colossus.id,
        regionId: colossus.regionId,
        attackers: seatsPresent.join(','),
        attackPower: attackTotal,
        defencePower: defence,
        colossusLeft: totalOf(armsOf(colossus)),
      },
    });

    if (totalOf(armsOf(colossus)) > 0) continue;

    // El golpe final es del bando con más potencia. Empate: asiento menor. Nunca al azar.
    const slayer = seatsPresent.reduce((best, seat) =>
      (powers.get(seat) as number) > (powers.get(best) as number) ? seat : best,
    );
    colossus.alive = false;

    const spoils = BALANCE.colossus.spoils[wardIndexOf(gateFrom(state, colossus.gateId))] as
      { ore: number; ember: number };
    nextSeats = creditMaterials(nextSeats, slayer, spoils) as SeatState[];
    nextSeats = nextSeats.map((s) =>
      s.seat === slayer
        ? { ...s, resources: { ...s.resources, ash: round4(s.resources.ash + BALANCE.colossus.spoilsAsh) } }
        : s,
    );

    log.emit({
      type: 'SPOILS_TAKEN',
      seat: slayer,
      scope: { kind: 'public' },
      data: { colossus: colossus.id, ore: spoils.ore, ember: spoils.ember, ash: BALANCE.colossus.spoilsAsh },
    });
    log.emit({
      type: 'COLOSSUS_SLAIN',
      seat: slayer,
      scope: { kind: 'public' },
      data: { colossus: colossus.id, regionId: colossus.regionId, gateId: colossus.gateId },
    });

    // Y aquí está el diseño entero, en una línea: la Puerta se abre PARA TODOS.
    gatesOpen = openGate(gatesOpen, colossus.gateId);
    log.emit({
      type: 'GATE_OPENED',
      seat: slayer,
      scope: { kind: 'public' },
      data: { gateId: colossus.gateId, paidBy: slayer, forEveryone: true },
    });
  }

  return {
    colossi: colossi.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    forces: [...result.values()]
      .filter((f) => totalOf(f) > 0)
      .sort((a, b) => a.seat - b.seat || (a.id < b.id ? -1 : 1)),
    seats: nextSeats,
    stock: stock.map((s) => ({ ...s })),
    gatesOpen,
  };
}

function regenerate(colossus: Colossus): void {
  const current = totalOf(armsOf(colossus));
  if (current <= 0 || current >= colossus.peak) return;
  const factor = Math.min(colossus.peak / current, 1 + BALANCE.colossus.regen);
  colossus.line = round4(colossus.line * factor);
  colossus.fire = round4(colossus.fire * factor);
  colossus.sky = round4(colossus.sky * factor);
}

function gateFrom(state: GameState, gateId: number): number {
  return state.map.gates.find((g) => g.id === gateId)?.from ?? 1;
}

function armsOf(colossus: Colossus): { line: number; fire: number; sky: number } {
  return { line: colossus.line, fire: colossus.fire, sky: colossus.sky };
}

function sumArms(forces: readonly Force[]): { line: number; fire: number; sky: number } {
  return {
    line: forces.reduce((s, f) => s + f.line, 0),
    fire: forces.reduce((s, f) => s + f.fire, 0),
    sky: forces.reduce((s, f) => s + f.sky, 0),
  };
}

function trim(value: number): number {
  const rounded = round4(value);
  return rounded < 0.05 ? 0 : rounded;
}

/** Regiones donde vive un Coloso vivo. La interfaz las pinta distinto. */
export function guardedRegions(colossi: readonly Colossus[]): RegionId[] {
  return colossi.filter((c) => c.alive).map((c) => c.regionId).sort((a, b) => a - b);
}
