/**
 * Etapa 6 del turno: encontrar los combates y aplicarlos.
 *
 * Separada de `combat.ts` a propósito: allí vive la **fórmula** (pura, sin estado, la
 * misma que usa la previsualización); aquí vive la **integración con el turno** (quién
 * lucha contra quién, dónde va el apoyo de Fuego, dónde se retira quien usa Pantalla).
 * Así la fórmula se puede testear y previsualizar sin arrastrar medio estado de juego.
 */

import type {
  Adjacency, Force, ForceId, GameState, RegionId, Seat, TerrainKind,
} from '../types/index';
import { EventLog } from './events';
import { resolveCombat, totalOf, type CombatSide } from './combat';
import { buildWardIndex, canCross, type WardIndex } from './zones';

export interface BattleResult {
  forces: Force[];
}

/**
 * Resuelve todos los combates del turno.
 *
 * Un combate existe donde acaben fuerzas de dos o más asientos. En v0.2 no hay
 * alianzas, así que «dos asientos en la misma región» siempre significa batalla;
 * cuando lleguen los Sellos (v0.4) esta condición pasará a consultar los tratados.
 */
export function applyBattles(
  state: GameState,
  forces: readonly Force[],
  fireSupport: ReadonlyMap<ForceId, RegionId>,
  adjacency: Adjacency,
  log: EventLog,
): BattleResult {
  const byRegion = new Map<RegionId, Force[]>();
  for (const force of forces) {
    const list = byRegion.get(force.regionId) ?? [];
    list.push(force);
    byRegion.set(force.regionId, list);
  }

  const result = new Map(forces.map((f) => [f.id, { ...f }]));
  const retreating: { force: Force; from: RegionId }[] = [];

  // Regiones donde espera un Coloso vivo. Ahí no se pelea entre asientos.
  const guarded = new Set(state.colossi.filter((c) => c.alive).map((c) => c.regionId));

  // Orden de región ascendente: los combates se resuelven en orden determinista.
  for (const regionId of [...byRegion.keys()].sort((a, b) => a - b)) {
    const present = byRegion.get(regionId) as Force[];
    const seats = [...new Set(present.map((f) => f.seat))].sort((a, b) => a - b);
    if (seats.length < 2) continue;

    // ── Ante el Coloso no hay guerra ─────────────────────────────────────────────
    //
    // Mientras el Coloso vive, dos asientos en su región **no combaten entre sí**.
    // Sin esta regla el sistema entero no funciona: la coordinación contra un Coloso
    // exige estar los dos ahí, y estar los dos ahí significaba aniquilarse antes de
    // llegar a él. Se comprobó: dos asientos con 40 de Línea cada uno perdían los 40
    // enteros peleando entre ellos y el Coloso ni se despeinaba.
    //
    // Y la regla se paga sola en tensión: en cuanto cae, la tregua se acaba y os
    // quedáis los dos de pie en la misma casilla. Cooperar para abrir la puerta y
    // tener que resolver lo vuestro justo después es exactamente la partida que este
    // juego quiere provocar.
    if (guarded.has(regionId)) continue;

    const terrain = (state.map.regions[regionId]?.kind ?? 'plain') as TerrainKind;
    const fortLevel = state.fortification[regionId] ?? 0;
    const defender = state.control[regionId];

    const sides: CombatSide[] = seats.map((seat) => {
      const own = present.filter((f) => f.seat === seat);
      return {
        seat,
        arms: {
          line: own.reduce((s, f) => s + f.line, 0),
          fire: own.reduce((s, f) => s + f.fire, 0),
          sky: own.reduce((s, f) => s + f.sky, 0),
        },
        // La postura de la fuerza mayor representa al bando entero.
        posture: (own.reduce((best, f) => (totalOf(f) > totalOf(best) ? f : best)) as Force).posture,
        defender: defender === seat,
        fireSupport: supportFor(seat, regionId, forces, fireSupport, adjacency),
        unsupplied: Math.max(...own.map((f) => f.unsupplied)),
      };
    });

    const outcome = resolveCombat(sides, terrain, fortLevel);

    log.emit({
      type: 'COMBAT',
      seat: null,
      scope: { kind: 'public' },
      data: {
        regionId,
        terrain,
        fort: fortLevel,
        winner: outcome.winner,
        powers: outcome.sides.map((s) => `${s.seat}:${s.power}`).join(' '),
      },
    });

    for (const side of outcome.sides) {
      const own = present.filter((f) => f.seat === side.seat);
      const total = own.reduce((s, f) => s + totalOf(f), 0);

      for (const force of own) {
        const entry = result.get(force.id);
        if (!entry) continue;

        // Las bajas se reparten proporcionalmente entre las fuerzas del bando.
        const share = total > 0 ? totalOf(force) / total : 0;
        entry.line = trim(force.line * (1 - side.losses));
        entry.fire = trim(force.fire * (1 - side.losses));
        entry.sky = trim(force.sky * (1 - side.losses));

        if (side.retreated && share > 0) retreating.push({ force: entry, from: regionId });
      }

      if (side.destroyed) {
        log.emit({
          type: 'FORCE_DESTROYED',
          seat: side.seat,
          scope: { kind: 'public' },
          data: { regionId, seat: side.seat, power: side.power },
        });
      }
    }
  }

  // Las retiradas se aplican después de resolver todo: una fuerza no puede retirarse
  // a una región cuyo combate aún no se ha resuelto.
  //
  // El índice de Cercos se construye UNA vez: recorrerlo por cada fuerza que se retira
  // era recorrer las ~700 aristas del mapa nuevo tantas veces como retiradas hubiera.
  const wards = buildWardIndex(state.map);
  for (const { force, from } of retreating) {
    const destination = retreatDestination(state, force.seat, from, adjacency, wards);
    if (destination === null) {
      force.line = 0;
      force.fire = 0;
      force.sky = 0;
      log.emit({
        type: 'FORCE_DESTROYED',
        seat: force.seat,
        scope: { kind: 'public' },
        data: { regionId: from, seat: force.seat, reason: 'no_retreat' },
      });
      continue;
    }
    force.regionId = destination;
    log.emit({
      type: 'FORCE_RETREATED',
      seat: force.seat,
      scope: { kind: 'regions', regions: [from, destination] },
      data: { forceId: force.id, from, to: destination },
    });
  }

  return {
    forces: [...result.values()]
      .filter((f) => totalOf(f) > 0)
      .sort((a, b) => a.seat - b.seat || (a.id < b.id ? -1 : 1)),
  };
}

/** Fuego prestado a `seat` en `regionId` desde fuerzas adyacentes suyas en Firme. */
function supportFor(
  seat: Seat,
  regionId: RegionId,
  forces: readonly Force[],
  fireSupport: ReadonlyMap<ForceId, RegionId>,
  adjacency: Adjacency,
): number {
  let total = 0;
  for (const force of forces) {
    if (force.seat !== seat) continue;
    if (fireSupport.get(force.id) !== regionId) continue;
    if (!(adjacency[force.regionId] as readonly RegionId[]).includes(regionId)) continue;
    total += force.fire;
  }
  return total;
}

/**
 * Región amiga adyacente a la que retirarse. Desempata por id: nunca al azar.
 *
 * Un Cerco cerrado **no** es una salida. Retirarse cruzándolo sería la única forma de
 * atravesar una Puerta sellada en todo el juego, y encima la conseguiría quien acaba
 * de perder una batalla.
 */
function retreatDestination(
  state: GameState,
  seat: Seat,
  from: RegionId,
  adjacency: Adjacency,
  wards: WardIndex,
): RegionId | null {
  const candidates = [...(adjacency[from] as readonly RegionId[])]
    .filter((r) => state.control[r] === seat && canCross(wards, state.gatesOpen, from, r))
    .sort((a, b) => a - b);
  return candidates[0] ?? null;
}

function trim(value: number): number {
  const rounded = Math.round(value * 10000) / 10000;
  return rounded < 0.05 ? 0 : rounded;
}
