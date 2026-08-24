/**
 * Economía: renta, suministro y producción. Ver GDD §5 y §8.
 *
 * Los dos frenos estructurales al snowball viven aquí, y son deliberadamente opuestos:
 *
 *   · **Expandirse rinde cada vez menos** (renta con rendimiento decreciente).
 *   · **Expandirse cuesta cada vez más** (suministro proporcional a la distancia).
 *
 * Ninguno prohíbe crecer; los dos hacen que crecer tenga un punto óptimo. Encontrarlo
 * es una de las decisiones interesantes que el juego pide al jugador.
 */

import type {
  Adjacency, ArmId, Force, GameState, PlayerView, ProductionOrder, RegionId, Resources, Seat,
  TerrainKind,
} from '../types/index';
import { BALANCE, TERRAIN_YIELD } from '../balance/constants';
import { bfsDistances } from '../mapgen/skeleton';
import { fairShare } from '../mapgen/spec';
import { round4 } from '../util/canonical';
import { EventLog } from './events';
import { totalOf } from './combat';
import { bestLevel } from './buildings';
import { policyEffect } from './research';

export interface EconomyResult {
  seats: GameState['seats'];
  forces: Force[];
}

/**
 * Renta bruta de un asiento antes del factor de escala.
 * El Núcleo y los yacimientos aportan Ceniza; el resto, los tres recursos ordinarios.
 */
export function grossIncome(state: GameState, seat: Seat): Resources {
  const income: Resources = { supply: 0, industry: 0, intel: 0, ash: 0, ore: 0, ember: 0 };
  state.control.forEach((owner, regionId) => {
    if (owner !== seat) return;
    const kind = state.map.regions[regionId]?.kind;
    if (!kind) return;
    const y = TERRAIN_YIELD[kind];
    income.supply += y.supply;
    income.industry += y.industry;
    income.intel += y.intel;
    income.ash += y.ash;
  });
  return income;
}

/**
 * Factor de rendimiento decreciente.
 *
 * La «parte justa» es el tamaño de tu **Solar**: exactamente lo que te toca por
 * construcción del mapa. Expandirse **más allá de tu propia casa** es lo que empieza
 * a rendir menos — que es justo la frontera donde el juego quiere que te lo pienses.
 *
 * Antes del refactor era el sector entero, y entonces las dos cosas coincidían. Ahora
 * no: usar el sector regalaría toda la Marca sin penalización, y la Marca es
 * precisamente lo que debe costar.
 */
export function diminishingFactor(state: GameState, seat: Seat): number {
  const owned = state.control.filter((owner) => owner === seat).length;
  const fair = fairShare(state.meta.playerCount);
  const excess = Math.max(0, owned - fair);
  return round4(1 / (1 + BALANCE.economy.diminishingK * excess));
}

/** Distancia en saltos de cada región al Bastión propio más cercano. */
function distancesToOwnBastion(
  state: GameState,
  seat: Seat,
  adjacency: Adjacency,
): number[] {
  const bastion = state.map.bastions[seat];
  if (bastion === undefined) return state.map.regions.map(() => Number.POSITIVE_INFINITY);
  return bfsDistances(adjacency, bastion);
}

/**
 * Coste de suministro de una fuerza según su tamaño y su distancia al Bastión.
 *
 * `marchDoctrine` abarata **solo la parte que depende de la distancia**, no la base:
 * la Política se llama Doctrina de Marcha porque hace barato ir lejos, no barato tener
 * ejército. Si abaratara el total sería una rebaja de mantenimiento disfrazada.
 */
export function supplyUpkeep(force: Force, hops: number, marchFactor = 1): number {
  const base = Math.ceil(totalOf(force) / 10);
  const distance = Number.isFinite(hops) ? hops : 12;
  return round4(base * (1 + BALANCE.economy.supplyDistanceK * distance * marchFactor));
}

/**
 * Aplica renta, mantenimiento y penalización por falta de suministro.
 *
 * Cuando no llega el Suministro para todas las fuerzas, se paga **empezando por las más
 * cercanas al Bastión**: las expediciones lejanas son las primeras en quedarse sin
 * abastecer. Es determinista, es intuitivo, y castiga exactamente lo que debe castigar.
 */
export function applyEconomy(
  state: GameState,
  forces: readonly Force[],
  adjacency: Adjacency,
  log: EventLog,
): EconomyResult {
  const { caps } = BALANCE.economy;
  const seats = state.seats.map((s) => ({ ...s, resources: { ...s.resources } }));
  const updated: Force[] = forces.map((f) => ({ ...f }));

  for (const seatState of seats) {
    const seat = seatState.seat;
    const gross = grossIncome(state, seat);
    const factor = diminishingFactor(state, seat);

    // El Mineral y la Brasa NO entran por renta: solo se extraen, se roban o caen de un
    // Coloso. Es lo que mantiene la capa de RTS atada al mapa en vez de al reloj.
    // La Fundición convierte Mineral en capacidad industrial: suma renta plana, sin
    // pasar por el rendimiento decreciente. Es lo que hace que valga la pena subirla
    // aunque no vayas a investigar.
    const foundry = BALANCE.buildings.foundryIndustry[bestLevel(state, seat, 'foundry')] ?? 0;
    const watch = BALANCE.buildings.watchIntel[bestLevel(state, seat, 'watch')] ?? 0;

    seatState.resources = {
      ...seatState.resources,
      supply: Math.min(caps.supply, round4(seatState.resources.supply + gross.supply * factor)),
      industry: Math.min(
        caps.industry,
        round4(seatState.resources.industry + gross.industry * factor + foundry),
      ),
      intel: Math.min(caps.intel, round4(seatState.resources.intel + gross.intel * factor + watch)),
      ash: round4(seatState.resources.ash + gross.ash * factor),
    };

    log.emit({
      type: 'INCOME',
      seat,
      scope: { kind: 'seat', seat },
      data: {
        supply: round4(gross.supply * factor),
        industry: round4(gross.industry * factor),
        intel: round4(gross.intel * factor),
        ash: round4(gross.ash * factor),
        regions: state.control.filter((o) => o === seat).length,
        scale: factor,
      },
    });

    // Mantenimiento: se abastece de lo más cercano a lo más lejano.
    const hops = distancesToOwnBastion(state, seat, adjacency);
    const mine = updated
      .filter((f) => f.seat === seat)
      .sort((a, b) => {
        const da = hops[a.regionId] ?? Infinity;
        const db = hops[b.regionId] ?? Infinity;
        return da - db || (a.id < b.id ? -1 : 1);
      });

    let available = seatState.resources.supply;
    for (const force of mine) {
      const cost = supplyUpkeep(
        force,
        hops[force.regionId] ?? Infinity,
        policyEffect(seatState, 'marchDoctrine'),
      );
      if (available >= cost) {
        available = round4(available - cost);
        force.unsupplied = 0;
      } else {
        force.unsupplied += 1;
        log.emit({
          type: 'SUPPLY_FAILED',
          seat,
          scope: { kind: 'seat', seat },
          data: { forceId: force.id, regionId: force.regionId, turns: force.unsupplied, cost },
        });
      }
    }
    seatState.resources.supply = available;
  }

  return { seats, forces: updated };
}

// ────────────────────────────────── Producción ────────────────────────────────

export interface ProductionResult {
  seats: GameState['seats'];
  forces: Force[];
  fortification: number[];
  bridges: boolean[];
}

/** Una región produce si es Bastión propio o Urbana propia. */
export function canProduceAt(state: GameState, seat: Seat, regionId: RegionId): boolean {
  if (state.control[regionId] !== seat) return false;
  return producesHere(state.map.regions[regionId]?.kind);
}

/**
 * Lo mismo, desde la vista de un jugador.
 *
 * Existe para que la interfaz **no reimplemente la regla**. Si el cliente decidiera por su
 * cuenta dónde se puede producir, el servidor y el simulador tendrían que mantener la
 * misma condición en tres sitios, y el día que cambie solo se acordarán dos.
 */
export function canProduceInView(view: PlayerView, regionId: RegionId): boolean {
  if (view.control[regionId] !== view.seat) return false;
  return producesHere(view.map.regions[regionId]?.kind);
}

/** Dónde hay con qué construir: el Bastión y las regiones urbanas. */
function producesHere(kind: TerrainKind | undefined): boolean {
  return kind === 'bastion' || kind === 'urban';
}

/**
 * Gasta Industria y coloca lo producido.
 *
 * Sin colas y sin temporizadores (ADR-010 y GDD §8.1): una decisión, un resultado, en el
 * mismo turno. Las fuerzas nuevas se fusionan con las que ya estén en la región, lo que
 * impide burlar el límite de 6 fuerzas acumulando unidades de tamaño 1.
 */
export function applyProduction(
  state: GameState,
  seats: GameState['seats'],
  forces: readonly Force[],
  ordersBySeat: ReadonlyMap<Seat, readonly ProductionOrder[]>,
  log: EventLog,
): ProductionResult {
  const nextSeats = seats.map((s) => ({ ...s, resources: { ...s.resources } }));
  const nextForces: Force[] = forces.map((f) => ({ ...f }));
  const fortification = state.fortification.slice();
  const bridges = state.bridges.slice();
  let created = 0;

  for (const seatState of nextSeats) {
    const orders = ordersBySeat.get(seatState.seat) ?? [];
    for (const order of orders) {
      const spec = BALANCE.production[order.item];
      const qty = Math.max(1, Math.floor(order.qty));
      const discount =
        (1 - (BALANCE.buildings.arsenalDiscount[bestLevel(state, seatState.seat, 'arsenal')] ?? 0)) *
        policyEffect(seatState, 'recasting');
      const cost = round4(spec.industry * qty * discount);

      if (seatState.resources.industry < cost) continue; // ya avisado en la validación
      if (!canProduceAt(state, seatState.seat, order.regionId)) continue;

      if (order.item === 'fort') {
        const current = fortification[order.regionId] ?? 0;
        if (current >= BALANCE.combat.maxFortLevel) continue;
        const levels = Math.min(qty, BALANCE.combat.maxFortLevel - current);
        seatState.resources.industry = round4(
          seatState.resources.industry - spec.industry * levels * discount,
        );
        fortification[order.regionId] = current + levels;
        log.emit({
          type: 'REGION_FORTIFIED',
          seat: seatState.seat,
          scope: { kind: 'public' },
          data: { regionId: order.regionId, level: fortification[order.regionId] as number },
        });
        continue;
      }

      if (order.item === 'bridge') {
        if (bridges[order.regionId]) continue;
        seatState.resources.industry = round4(seatState.resources.industry - spec.industry * discount);
        bridges[order.regionId] = true;
        log.emit({
          type: 'BRIDGE_BUILT',
          seat: seatState.seat,
          scope: { kind: 'public' },
          data: { regionId: order.regionId },
        });
        continue;
      }

      // ── Aquí, y solo aquí, entra el Grado ────────────────────────────────────
      //
      // Lo producido nace con el multiplicador de su grado incorporado y ya no vuelve
      // a cambiar. Subir de grado NO mejora lo que ya está en el mapa, y ésa es toda
      // la decisión: ¿subo y empiezo a reemplazar, o me gasto lo mismo en más tropa de
      // grado 1 y ataco este turno?
      const tier = seatState.tiers[order.item as ArmId] ?? 1;
      const strength = round4(
        ('strength' in spec ? spec.strength : 0) * qty * (BALANCE.tiers.multiplier[tier] as number),
      );
      seatState.resources.industry = round4(seatState.resources.industry - cost);

      const existing = nextForces.find(
        (f) => f.seat === seatState.seat && f.regionId === order.regionId,
      );
      if (existing) {
        existing[order.item] += strength;
      } else {
        nextForces.push({
          id: `p${seatState.seat}t${state.meta.turn}n${created++}`,
          seat: seatState.seat,
          regionId: order.regionId,
          line: order.item === 'line' ? strength : 0,
          fire: order.item === 'fire' ? strength : 0,
          sky: order.item === 'sky' ? strength : 0,
          posture: 'hold',
          unsupplied: 0,
        });
      }

      log.emit({
        type: 'PRODUCED',
        seat: seatState.seat,
        scope: { kind: 'regions', regions: [order.regionId] },
        data: { regionId: order.regionId, item: order.item, strength },
      });
    }
  }

  return {
    seats: nextSeats,
    forces: nextForces.sort((a, b) => a.seat - b.seat || (a.id < b.id ? -1 : 1)),
    fortification,
    bridges,
  };
}
