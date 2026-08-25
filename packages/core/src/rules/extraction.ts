/**
 * Extracción: Menas, Extractoras, almacenes y logística.
 *
 * Tres decisiones de diseño que van juntas y que solo tienen sentido a la vez:
 *
 *  1. **El material se almacena en la región, no en el asiento.** Por eso se puede
 *     robar, por eso capturar una provincia vale la pena, y por eso un imperio con
 *     todo su Mineral en una Extractora de la Marca es un imperio con un problema.
 *  2. **Extraer no basta: hay que traerlo a casa.** El acarreo pierde una fracción por
 *     salto, así que una Mena lejana rinde menos que una cercana aunque sea más rica.
 *     Eso reconecta la capa de RTS con la logística en vez de crear una economía
 *     paralela que la esquive.
 *  3. **Una Mena sin Extractora no da nada.** Ahí está la diferencia con el Yacimiento
 *     (`seam`), que sí renta por controlarlo. Son dos cosas distintas y el glosario
 *     existe para que sigan siéndolo.
 *
 * El almacén **no se transfiere al capturar**: vive en la región, así que cambiar de
 * dueño la región cambia de dueño el almacén sin que nadie tenga que moverlo. Es la
 * misma razón por la que el Botín funciona.
 */

import type {
  Adjacency, Force, GameMap, GameState, MaterialStock, RegionId, Seat, SeatState, Vein,
} from '../types/index';
import { BALANCE } from '../balance/constants';
import { bfsDistances } from '../mapgen/skeleton';
import { round4 } from '../util/canonical';
import { EventLog } from './events';
import { buildingLevel, bestLevel } from './buildings';
import { policyEffect } from './research';
import { passableAdjacency } from './zones';

export function emptyStock(map: GameMap): MaterialStock[] {
  return map.regions.map(() => ({ ore: 0, ember: 0 }));
}

export function veinAt(map: GameMap, regionId: RegionId): Vein | undefined {
  return map.veins.find((v) => v.regionId === regionId);
}

/** Material por turno de una Mena con su Extractora. Cero si no hay Extractora. */
export function extractionRate(
  state: GameState,
  seats: readonly SeatState[],
  vein: Vein,
): number {
  const level = buildingLevel(state.buildings, vein.regionId, 'extractor');
  if (level === 0) return 0;
  const owner = state.control[vein.regionId];
  if (owner === null || owner === undefined) return 0;

  const seat = seats.find((s) => s.seat === owner);
  const policy = seat ? policyEffect(seat, 'deepVeins') : 1;
  const base = BALANCE.extraction.baseByGrade[vein.grade] as number;
  const perLevel = BALANCE.extraction.perLevel[level] as number;
  return round4(base * perLevel * policy);
}

export interface ExtractionResult {
  stock: MaterialStock[];
}

/**
 * Etapa 8b · Extracción.
 *
 * Se ejecuta **después** del control, para que lo que capturas este turno extraiga este
 * turno: es lo que el jugador espera al ver la captura, y coincide con cómo ya se
 * comporta la renta.
 */
export function applyExtraction(
  state: GameState,
  seats: readonly SeatState[],
  stock: readonly MaterialStock[],
  log: EventLog,
): ExtractionResult {
  const next = stock.map((s) => ({ ...s }));
  const cap = BALANCE.extraction.stockCap;

  // Por `regionId` ascendente: el orden de extracción no puede depender del orden del
  // array de Menas, que podría cambiar sin que cambie el juego.
  for (const vein of [...state.map.veins].sort((a, b) => a.regionId - b.regionId)) {
    const rate = extractionRate(state, seats, vein);
    if (rate <= 0) continue;

    const here = next[vein.regionId] as MaterialStock;
    const before = here[vein.material];
    if (before >= cap) continue; // el almacén lleno para la Extractora: no se tira nada

    const added = round4(Math.min(rate, cap - before));
    here[vein.material] = round4(before + added);

    log.emit({
      type: 'EXTRACTED',
      seat: state.control[vein.regionId] ?? null,
      scope: { kind: 'regions', regions: [vein.regionId] },
      data: {
        regionId: vein.regionId,
        material: vein.material,
        amount: added,
        grade: vein.grade,
        stock: here[vein.material],
      },
    });
  }

  return { stock: next };
}

export interface HaulResult {
  stock: MaterialStock[];
  seats: SeatState[];
}

/**
 * Etapa 8c · Logística: del almacén de la región al asiento.
 *
 * Se pierde una fracción **por salto** hasta el Bastión propio, por la ruta transitable
 * de verdad — la que respeta los Cercos ([ADR-041]). Una Extractora al otro lado de una
 * Puerta cerrada no acarrea nada: acumula, y acumular es exactamente lo que la convierte
 * en un objetivo.
 */
export function applyHauling(
  state: GameState,
  seats: readonly SeatState[],
  stock: readonly MaterialStock[],
  adjacency: Adjacency,
  log: EventLog,
): HaulResult {
  const nextStock = stock.map((s) => ({ ...s }));
  const nextSeats = seats.map((s) => ({
    ...s,
    resources: { ...s.resources },
    tiers: { ...s.tiers },
    policies: { ...s.policies },
  }));

  const passable = passableAdjacency(state.map, adjacency, state.gatesOpen);
  const { haulRate, haulLossPerHop } = BALANCE.extraction;

  for (const seatState of nextSeats) {
    const seat = seatState.seat;
    const bastion = state.map.bastions[seat];
    if (bastion === undefined) continue;

    const hops = bfsDistances(passable, bastion);
    const caravans = policyEffect(seatState, 'caravans');
    const capBonus = BALANCE.economy.depotCapPerLevel * bestLevel(state, seat, 'depot');

    let ore = 0;
    let ember = 0;
    for (let regionId = 0; regionId < nextStock.length; regionId++) {
      if (state.control[regionId] !== seat) continue;
      const here = nextStock[regionId] as MaterialStock;
      if (here.ore <= 0 && here.ember <= 0) continue;

      const distance = hops[regionId] ?? Number.POSITIVE_INFINITY;
      // Sin ruta transitable no hay acarreo. El material se queda ahí, a la vista.
      if (!Number.isFinite(distance)) continue;

      const keep = Math.max(0, 1 - haulLossPerHop * distance * caravans);
      const movedOre = round4(here.ore * haulRate);
      const movedEmber = round4(here.ember * haulRate);
      here.ore = round4(here.ore - movedOre);
      here.ember = round4(here.ember - movedEmber);
      ore = round4(ore + movedOre * keep);
      ember = round4(ember + movedEmber * keep);
    }

    if (ore <= 0 && ember <= 0) continue;

    const caps = BALANCE.economy.caps;
    seatState.resources.ore = round4(Math.min(caps.ore + capBonus, seatState.resources.ore + ore));
    seatState.resources.ember = round4(
      Math.min(caps.ember + capBonus, seatState.resources.ember + ember),
    );

    log.emit({
      type: 'HAULED',
      seat,
      scope: { kind: 'seat', seat },
      data: { ore, ember },
    });
  }

  return { stock: nextStock, seats: nextSeats };
}

/**
 * Lo que se lleva quien gana en postura Botín. Devuelve lo robado y deja la región con
 * el resto: no captura, no se queda, y por eso es una decisión y no un efecto lateral.
 */
export function takePlunder(
  stock: readonly MaterialStock[],
  regionId: RegionId,
): { stock: MaterialStock[]; taken: MaterialStock } {
  const next = stock.map((s) => ({ ...s }));
  const here = next[regionId] as MaterialStock;
  const rate = BALANCE.extraction.plunderRate;
  const taken: MaterialStock = {
    ore: round4(here.ore * rate),
    ember: round4(here.ember * rate),
  };
  here.ore = round4(here.ore - taken.ore);
  here.ember = round4(here.ember - taken.ember);
  return { stock: next, taken };
}

/** Suma un botín a los recursos de un asiento, respetando sus topes. */
export function creditMaterials(
  seats: readonly SeatState[],
  seat: Seat,
  amount: MaterialStock,
  capBonus = 0,
): SeatState[] {
  const caps = BALANCE.economy.caps;
  return seats.map((s) =>
    s.seat === seat
      ? {
          ...s,
          resources: {
            ...s.resources,
            ore: round4(Math.min(caps.ore + capBonus, s.resources.ore + amount.ore)),
            ember: round4(Math.min(caps.ember + capBonus, s.resources.ember + amount.ember)),
          },
        }
      : s,
  );
}

// ───────────────────────────────────── Botín ──────────────────────────────────

export interface PlunderResult {
  forces: Force[];
  stock: MaterialStock[];
  seats: SeatState[];
}

/**
 * Etapa 6c · Botín.
 *
 * Una fuerza en postura Botín que sigue viva en una región **ajena** y sin enemigos
 * encima ha ganado su asalto: se lleva parte del almacén y **vuelve por donde vino**.
 * No captura, así que la etapa de control ni se entera — y ésa es la gracia.
 *
 * Tres razones por las que esto es mejor que un robo automático al capturar:
 *
 *  1. Es una decisión **declarada de antemano**, y por tanto se puede prometer y se
 *     puede mentir sobre ella. Que es de lo que va el juego.
 *  2. Le da una jugada a quien va perdiendo. Un asiento sin territorio que conquistar
 *     todavía puede hacer daño, y por tanto sigue teniendo algo que ofrecer en una
 *     negociación. Sin esto, el turno 15 del último clasificado es no hacer nada.
 *  3. Convierte el almacén de una región en una **posición defendible**.
 */
export function applyPlunder(
  state: GameState,
  forces: readonly Force[],
  origins: ReadonlyMap<string, RegionId>,
  stock: readonly MaterialStock[],
  seats: readonly SeatState[],
  log: EventLog,
): PlunderResult {
  let nextStock = stock.map((s) => ({ ...s }));
  let nextSeats = seats.map((s) => ({ ...s, resources: { ...s.resources } }));
  const nextForces = forces.map((f) => ({ ...f }));

  const occupantsBySeat = new Map<RegionId, Set<Seat>>();
  for (const force of nextForces) {
    const set = occupantsBySeat.get(force.regionId) ?? new Set<Seat>();
    set.add(force.seat);
    occupantsBySeat.set(force.regionId, set);
  }

  // Asiento y después id: los desempates del motor no dependen del orden del array.
  const raiders = nextForces
    .filter((f) => f.posture === 'plunder')
    .sort((a, b) => a.seat - b.seat || (a.id < b.id ? -1 : 1));

  for (const raider of raiders) {
    const regionId = raider.regionId;
    const owner = state.control[regionId];
    if (owner === null || owner === undefined || owner === raider.seat) continue;

    // Si queda alguien más peleando ahí, el saqueo no ha terminado: no se cobra.
    const others = occupantsBySeat.get(regionId);
    if (others && [...others].some((s) => s !== raider.seat)) continue;

    const here = nextStock[regionId] as MaterialStock;
    if (here.ore <= 0 && here.ember <= 0) {
      returnHome(raider, origins, log);
      continue;
    }

    const result = takePlunder(nextStock, regionId);
    nextStock = result.stock;
    nextSeats = creditMaterials(nextSeats, raider.seat, result.taken) as SeatState[];

    log.emit({
      type: 'PLUNDERED',
      seat: raider.seat,
      scope: { kind: 'regions', regions: [regionId] },
      data: {
        regionId,
        from: owner,
        ore: result.taken.ore,
        ember: result.taken.ember,
        forceId: raider.id,
      },
    });

    returnHome(raider, origins, log);
  }

  return {
    forces: nextForces.sort((a, b) => a.seat - b.seat || (a.id < b.id ? -1 : 1)),
    stock: nextStock,
    seats: nextSeats,
  };
}

/** El saqueador se retira a su casilla de origen. Si no se movió, se queda. */
function returnHome(
  force: Force,
  origins: ReadonlyMap<string, RegionId>,
  log: EventLog,
): void {
  const home = origins.get(force.id);
  if (home === undefined || home === force.regionId) return;
  const from = force.regionId;
  force.regionId = home;
  log.emit({
    type: 'FORCE_RETREATED',
    seat: force.seat,
    scope: { kind: 'regions', regions: [from, home] },
    data: { forceId: force.id, from, to: home, reason: 'plunder' },
  });
}
