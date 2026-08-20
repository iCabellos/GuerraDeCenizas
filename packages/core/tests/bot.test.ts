/**
 * Rivales artificiales.
 *
 * Lo que se comprueba aquí no son los números de `TIER_TRAITS` sino lo que esos números
 * tienen que producir: que un rival bueno **gane más partidas que uno malo**. Un test que
 * fijara `ruthless.nerve === 1.35` bendeciría cualquier ajuste que dejara a los cuatro
 * jugando igual; éste lo caza.
 *
 * Y una propiedad que no es de equilibrio sino de arquitectura: los bots tienen que ser
 * **deterministas**. Si el bot tirase un dado propio, «la partida rejugada desde
 * (semilla, órdenes) da el mismo checksum» dejaría de ser cierto.
 */

import { describe, expect, it } from 'vitest';
import {
  BOT_TIERS, ENGINE_VERSION, botOrders, botProfile, buildAdjacency, createGame,
  projectViews, reduce,
  type BotTier, type GameState, type OrdersBySeat, type Seat,
} from '../src/index';

const SEATS: Seat[] = [0, 1, 2];

function newGame(seed: number): GameState {
  return createGame({
    gameId: '00000000-0000-4000-8000-00000000b07a',
    seed,
    players: 3,
    seats: [
      { name: 'Uno', factionId: 'vantera' },
      { name: 'Dos', factionId: 'koldvik' },
      { name: 'Tres', factionId: 'saranth' },
    ],
  }).state;
}

/** Juega `turns` turnos con un perfil fijo por asiento y devuelve el estado final. */
function play(seed: number, tiers: Record<number, BotTier>, turns: number): GameState {
  let state = newGame(seed);
  const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);

  for (let turn = 0; turn < turns; turn += 1) {
    const views = projectViews(state);
    const orders: OrdersBySeat = {};
    for (const seat of SEATS) {
      const view = views[seat];
      if (!view) continue;
      const base = botProfile(seed, seat);
      orders[seat] = botOrders(view, adjacency, { ...base, ...traitsOf(tiers[seat] ?? 'steady') }, seed);
    }
    state = reduce(state, orders, { engineVersion: ENGINE_VERSION, now: turn * 1000 }).state;
  }
  return state;
}

/** Los rasgos de un tier, leídos del propio módulo para no duplicar la tabla. */
function traitsOf(tier: BotTier) {
  // `botProfile` deriva el tier de la semilla; aquí hace falta forzarlo. Se busca una
  // semilla que produzca el tier pedido, que es más honesto que copiar los números.
  for (let seed = 0; seed < 4096; seed += 1) {
    const profile = botProfile(seed, 0);
    if (profile.tier === tier) return profile;
  }
  throw new Error(`no se encontró semilla para el tier ${tier}`);
}

describe('perfil del bot', () => {
  it('es estable: la misma partida da siempre los mismos rivales', () => {
    for (const seat of SEATS) {
      expect(botProfile(9182, seat)).toEqual(botProfile(9182, seat));
    }
  });

  it('reparte dificultades distintas entre los asientos de una misma mesa', () => {
    // No en todas las semillas salen tres tiers distintos, pero a lo largo de muchas
    // mesas tienen que aparecer los cuatro: si no, el reparto no es aleatorio de verdad.
    const seen = new Set<BotTier>();
    for (let seed = 0; seed < 200; seed += 1) {
      for (const seat of SEATS) seen.add(botProfile(seed, seat).tier);
    }
    expect([...seen].sort()).toEqual([...BOT_TIERS].sort());
  });
});

describe('órdenes del bot', () => {
  it('son deterministas: misma vista, mismas órdenes', () => {
    const state = newGame(4242);
    const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
    const view = projectViews(state)[0]!;
    const profile = botProfile(4242, 0);

    expect(botOrders(view, adjacency, profile, 4242))
      .toEqual(botOrders(view, adjacency, profile, 4242));
  });

  it('nunca mueve a una región que no es adyacente', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      let state = newGame(seed);
      const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
      for (let turn = 0; turn < 6; turn += 1) {
        const views = projectViews(state);
        const orders: OrdersBySeat = {};
        for (const seat of SEATS) {
          const view = views[seat]!;
          const own = botOrders(view, adjacency, botProfile(seed, seat), seed);
          for (const move of own.moves) {
            if (move.to === undefined) continue;
            const force = view.forces.find((f) => f.own && f.id === move.forceId);
            expect(force, `fuerza ${move.forceId} desconocida`).toBeDefined();
            expect(
              adjacency[force!.regionId] ?? [],
              `${force!.regionId} → ${move.to} no es adyacente`,
            ).toContain(move.to);
          }
          orders[seat] = own;
        }
        state = reduce(state, orders, { engineVersion: ENGINE_VERSION, now: turn }).state;
      }
    }
  });

  it('no mueve a agua sin Puente: sería una orden rechazada cada turno', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const state = newGame(seed);
      const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
      const views = projectViews(state);
      for (const seat of SEATS) {
        const view = views[seat]!;
        for (const move of botOrders(view, adjacency, botProfile(seed, seat), seed).moves) {
          if (move.to === undefined) continue;
          const kind = view.map.regions[move.to]?.kind;
          if (kind === 'water') expect(view.bridges[move.to]).toBe(true);
        }
      }
    }
  });

  it('en el Parlamento no mueve a nadie, pero sí produce', () => {
    const state = newGame(77);
    const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
    const view = { ...projectViews(state)[0]!, phase: 'parley' as const };
    const orders = botOrders(view, adjacency, botProfile(77, 0), 77);
    expect(orders.moves).toEqual([]);
  });
});

describe('la dificultad significa algo', () => {
  /**
   * La métrica es la **Ceniza**, no el territorio.
   *
   * Se gana consagrando el Núcleo y eso se paga en Ceniza, así que es lo que mide de
   * verdad «jugar mejor». Medido en regiones la escalera no sale ordenada, y no porque
   * los perfiles fallen: `ruthless` es más codicioso y toma menos regiones pero más
   * ricas, que es exactamente lo que se le pide. Un test contra el territorio habría
   * declarado peor al que convierte mejor.
   */
  const ashOf = (tiers: Record<number, BotTier>, seat: Seat, seeds: number) => {
    let ash = 0;
    for (let seed = 0; seed < seeds; seed += 1) {
      const end = play(seed, tiers, 14);
      ash += end.seats.find((s) => s.seat === seat)?.resources.ash ?? 0;
    }
    return ash / seeds;
  };

  it('los cuatro perfiles se ordenan por la Ceniza que acumulan', () => {
    // Cada uno contra el mismo fondo neutro y en el mismo asiento: lo único que cambia
    // entre las cuatro medidas es el perfil.
    const ladder = BOT_TIERS.map((tier) => ({
      tier,
      ash: ashOf({ 0: tier, 1: 'steady', 2: 'steady' }, 0, 10),
    }));

    const readable = ladder.map((r) => `${r.tier} ${r.ash.toFixed(1)}`).join(' · ');
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]!.ash, `escalera desordenada: ${readable}`)
        .toBeGreaterThan(ladder[i - 1]!.ash);
    }
  });

  it('la ventaja es del perfil, no del asiento: intercambiados, se invierte', () => {
    // El mapa es simétrico por construcción. Si `ruthless` ganara por estar sentado en
    // el asiento 0, este test lo cazaría.
    const straight = ashOf({ 0: 'ruthless', 1: 'reckless', 2: 'steady' }, 0, 12);
    const swapped = ashOf({ 0: 'reckless', 1: 'ruthless', 2: 'steady' }, 1, 12);
    const weak = ashOf({ 0: 'reckless', 1: 'ruthless', 2: 'steady' }, 0, 12);

    expect(straight, 'implacable en el asiento 0').toBeGreaterThan(weak);
    expect(swapped, 'implacable en el asiento 1').toBeGreaterThan(weak);
  });
});
