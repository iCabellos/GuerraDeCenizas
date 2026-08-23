/**
 * Rivales artificiales para poder jugar sin esperar a cuatro personas.
 *
 * **No confundir con el Mando Automático** (`standing.ts`). Son cosas distintas y la
 * diferencia es de diseño, no de implementación:
 *
 * | | Mando Automático | Bot |
 * |---|---|---|
 * | Cubre | a un humano **ausente** | un asiento que nunca tuvo humano |
 * | Regla | *la ausencia nunca daña a un tercero* | juega para ganar |
 * | Ataca | solo para recuperar lo suyo | sí, cuando le sale la cuenta |
 *
 * Relajar la regla del Mando Automático convertiría a quien se desconecta en una ficha
 * que mover en las negociaciones. Por eso ese archivo no se toca y éste es nuevo.
 *
 * ── Tres propiedades que gobiernan el archivo entero ───────────────────────────
 *
 * 1. **Decide con la misma información que un humano.** La entrada es una `PlayerView`,
 *    no el `GameState`. El bot no ve a través de la niebla, y evalúa los combates con
 *    `previewAttack`, exactamente la misma función que pinta la previsualización del
 *    jugador. Un bot que viera el estado entero no sería un rival: sería un tramposo, y
 *    las pruebas de juego que hiciera con él no valdrían para nada.
 * 2. **Es determinista.** Ni `Math.random()` ni reloj: el azar sale de la semilla de la
 *    partida. Si el bot tirara un dado propio, «la partida rejugada desde (semilla,
 *    órdenes) da el mismo checksum» dejaría de ser cierto y el simulador quedaría inútil.
 * 3. **Se equivoca como una persona, no como un dado.** Un bot flojo no juega al azar:
 *    elige entre las jugadas que *parecen* buenas y a veces escoge la segunda. Jugar al
 *    azar se detecta en dos turnos y no enseña nada sobre las mecánicas.
 */

import type {
  Adjacency, Arms, MoveOrder, Orders, PlayerView, ProductionOrder, RegionId, Seat,
  TerrainKind,
} from '../types/index';
import { BALANCE, TERRAIN_YIELD } from '../balance/constants';
import { makeRng, type Rng } from '../rng/index';
import { previewAttack, totalOf } from './combat';

/** Los cuatro rivales. El nombre describe cómo juega, no cuánto «nivel» tiene. */
export type BotTier = 'reckless' | 'steady' | 'canny' | 'ruthless';

export const BOT_TIERS: readonly BotTier[] = ['reckless', 'steady', 'canny', 'ruthless'];

export interface BotProfile {
  tier: BotTier;
  /**
   * Con qué frecuencia elige de verdad la mejor jugada que ha encontrado. Por debajo
   * de 1 no juega al azar: baja un escalón en su propia lista.
   */
  precision: number;
  /**
   * Ventaja de potencia que exige antes de atacar. Por debajo de 1 ataca en desventaja
   * —temerario—; por encima solo entra sobre seguro.
   */
  nerve: number;
  /** Cuánto pesa la renta de una región frente a su valor militar. */
  greed: number;
}

/**
 * Los cuatro perfiles.
 *
 * `nerve` es el umbral de potencia relativa a partir del cual entra a un combate, y la
 * escala importa: **1,0 es exactamente empatar**. Por debajo de 1 se ataca perdiendo; por
 * encima se exige margen. La diferencia entre un rival malo y uno bueno no es que el
 * bueno sea prudente sino que el malo entra a combates que pierde — y que el bueno no
 * rechaza los que gana. Un umbral muy alto no produce un rival temible: produce uno
 * pasivo, que es otra forma de jugar mal (lo cazó el test cara a cara).
 */
const TIER_TRAITS: Record<BotTier, Omit<BotProfile, 'tier'>> = {
  // Entra a combates que pierde. Regala ejércitos.
  reckless: { precision: 0.35, nerve: 0.6, greed: 0.2 },
  // Entra cuando va ganando, más o menos. El rival de referencia.
  steady: { precision: 0.65, nerve: 0.95, greed: 0.45 },
  // Entra cuando gana y pide algo de margen.
  canny: { precision: 0.85, nerve: 1.05, greed: 0.6 },
  // Ni rechaza un combate ganado ni entra a uno perdido.
  ruthless: { precision: 0.97, nerve: 1.1, greed: 0.7 },
};

/**
 * Perfil del rival que ocupa un asiento.
 *
 * Se deriva de la semilla de la partida, **no se tira al azar en tiempo de ejecución**:
 * la misma campaña tiene siempre los mismos rivales, y una repetición reproduce sus
 * decisiones. Y se deriva por asiento, así que en una mesa de cinco salen dificultades
 * distintas sin que nadie las reparta a mano.
 */
export function botProfile(seed: number, seat: Seat): BotProfile {
  // Flujo propio por asiento: que el perfil no dependa de cuántas veces se haya
  // consultado antes.
  const rng = makeRng(seed ^ 0x30d1c7, seat + 1);
  const tier = BOT_TIERS[rng.int(BOT_TIERS.length)] as BotTier;
  return { tier, ...TIER_TRAITS[tier] };
}

/**
 * Las órdenes de un bot para este turno.
 *
 * @param view La vista del asiento. Lo que no esté aquí, el bot no lo sabe.
 */
export function botOrders(
  view: PlayerView,
  adjacency: Adjacency,
  profile: BotProfile,
  seed: number,
): Orders {
  // Flujo por (semilla, turno, asiento): dos bots del mismo turno no comparten tiradas.
  const rng = makeRng(seed ^ 0xb07, view.turn * 8 + view.seat + 1);

  const production = planProduction(view, profile);

  // En el Parlamento no se mueve nadie: el motor rechazaría cada orden con un evento.
  if (view.phase !== 'war') return { turn: view.turn, moves: [], production };

  return { turn: view.turn, moves: planMoves(view, adjacency, profile, rng), production };
}

// ───────────────────────────────── Movimiento ─────────────────────────────────

interface Candidate {
  to?: RegionId;
  posture: 'assault' | 'hold' | 'screen';
  score: number;
}

function planMoves(
  view: PlayerView,
  adjacency: Adjacency,
  profile: BotProfile,
  rng: Rng,
): MoveOrder[] {
  // Orden estable: los desempates de un motor determinista nunca son por orden de array.
  const own = view.forces
    .filter((force) => force.own)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const moves: MoveOrder[] = [];
  // Dos fuerzas propias a la misma región se fusionan; el bot prefiere abrir frentes.
  const taken = new Set<RegionId>();

  for (const force of own) {
    const candidates = rank(view, adjacency, profile, force.id, force.regionId, taken);
    const choice = choose(candidates, profile, rng);
    if (choice.to !== undefined) taken.add(choice.to);
    moves.push(
      choice.to === undefined
        ? { forceId: force.id, posture: choice.posture }
        : { forceId: force.id, to: choice.to, posture: choice.posture },
    );
  }

  return moves;
}

/** Todas las jugadas de una fuerza, puntuadas. Siempre incluye quedarse quieta. */
function rank(
  view: PlayerView,
  adjacency: Adjacency,
  profile: BotProfile,
  forceId: string,
  from: RegionId,
  taken: ReadonlySet<RegionId>,
): Candidate[] {
  const out: Candidate[] = [{ posture: 'hold', score: holdValue(view, adjacency, profile, from) }];

  for (const to of [...(adjacency[from] ?? [])].sort((a, b) => a - b)) {
    if (taken.has(to)) continue;
    const region = view.map.regions[to];
    if (!region) continue;

    // El agua exige Puente para Línea y Fuego. Sin él la orden se rechaza y el turno
    // del bot se va en eventos de error.
    if (region.kind === 'water' && !view.bridges[to]) continue;

    const value = regionValue(view, profile, to, region.kind);
    const preview = previewAttack(view, forceId, to, adjacency, region.kind);

    if (!preview) {
      // Nadie enfrente: entrar es gratis. Lo propio ya lo tiene, así que vale menos.
      out.push({ to, posture: 'assault', score: view.control[to] === view.seat ? value * 0.15 : value });
      continue;
    }

    const mine = preview.sides.find((side) => side.seat === view.seat);
    const worst = preview.sides
      .filter((side) => side.seat !== view.seat)
      .reduce((max, side) => Math.max(max, side.power), 0);
    if (!mine || worst <= 0) continue;

    const ratio = mine.power / worst;
    if (ratio < profile.nerve) continue;   // no le sale la cuenta

    // Una fuerza oculta puede ser mayor de lo que parece: el prudente descuenta.
    const trust = preview.uncertain ? 1 - profile.greed * 0.35 : 1;
    out.push({ to, posture: 'assault', score: value * Math.min(ratio, 3) * trust });
  }

  return out.sort((a, b) => b.score - a.score);
}

/**
 * Elige entre las jugadas puntuadas.
 *
 * `precision` NO es «probabilidad de jugar al azar». Un bot flojo que mueve al azar se
 * detecta en dos turnos. Éste baja un escalón en su propia lista: elige la segunda o la
 * tercera mejor, que es el error que comete de verdad una persona que va deprisa.
 */
function choose(candidates: Candidate[], profile: BotProfile, rng: Rng): Candidate {
  const best = candidates[0] ?? { posture: 'hold' as const, score: 0 };
  if (candidates.length === 1 || rng.next() < profile.precision) return best;

  const depth = Math.min(candidates.length - 1, 3);
  return candidates[1 + rng.int(depth)] ?? best;
}

/**
 * Lo que vale quedarse quieto.
 *
 * Casi nada, **salvo que haya algo que defender**: una región propia con un enemigo
 * pegado. Valorar el quedarse por sí mismo convertía al rival cuidadoso en uno que no
 * sale de casa, y perdía por no jugar.
 */
function holdValue(
  view: PlayerView,
  adjacency: Adjacency,
  profile: BotProfile,
  at: RegionId,
): number {
  const region = view.map.regions[at];
  if (!region || view.control[at] !== view.seat) return 0;

  const threatened = (adjacency[at] ?? []).some((neighbour) =>
    view.forces.some((force) => !force.own && force.regionId === neighbour),
  );
  if (!threatened) return 0;

  return regionValue(view, profile, at, region.kind) * 0.9;
}

/**
 * Lo que vale una región para este bot.
 *
 * Dos sumandos y un sesgo: lo que produce (pesado por `greed`) y lo que significa en el
 * mapa. El Núcleo es el objetivo de la partida, así que nadie lo ignora del todo.
 */
function regionValue(
  view: PlayerView,
  profile: BotProfile,
  regionId: RegionId,
  kind: TerrainKind,
): number {
  const y = TERRAIN_YIELD[kind];
  const income = y.supply + y.industry * 1.4 + y.intel * 1.2 + y.ash * 2;

  let strategic = 1;
  if (regionId === view.map.coreId) strategic = 6;
  else if (kind === 'bastion') strategic = 4;
  else if (kind === 'seam') strategic = 3;

  // Quitarle una región a otro vale más que ocupar tierra de nadie: le resta a él.
  const owner = view.control[regionId];
  const contested = owner !== null && owner !== view.seat ? 1.3 : 1;

  // Los dos sumandos cuentan SIEMPRE; `greed` solo inclina la balanza. Anular el
  // estratégico dejaba al rival codicioso ignorando el Núcleo, que es la partida.
  return (income * profile.greed + strategic * (1.4 - profile.greed)) * contested;
}

// ───────────────────────────────── Producción ─────────────────────────────────

/**
 * En qué gasta la Industria.
 *
 * El Mando Automático produce siempre Línea porque es la decisión que menos altera la
 * partida de un ausente. Un bot **sí** decide: los buenos mezclan armas, porque la
 * bonificación de contra escala con lo que hay enfrente, y los flojos amontonan Línea.
 */
function planProduction(view: PlayerView, profile: BotProfile): ProductionOrder[] {
  const bastion = view.map.bastions[view.seat];
  if (bastion === undefined || view.control[bastion] !== view.seat) return [];

  let industry = view.self.resources.industry;
  const orders: ProductionOrder[] = [];

  // Los buenos leen lo que tienen enfrente y compran el arma que lo contrarresta.
  if (profile.precision >= 0.8) {
    const enemy = enemyArms(view);
    const answer = counterTo(enemy);
    const cost = BALANCE.production[answer].industry;
    const qty = Math.floor((industry * 0.4) / cost);
    if (qty > 0) {
      orders.push({ regionId: bastion, item: answer, qty });
      industry -= qty * cost;
    }
  }

  const lineCost = BALANCE.production.line.industry;
  const line = Math.floor(industry / lineCost);
  if (line > 0) orders.push({ regionId: bastion, item: 'line', qty: line });

  return orders;
}

/** Lo que se le ve al resto, sumado. Las fuerzas ocultas cuentan como Línea. */
function enemyArms(view: PlayerView): Arms {
  const arms: Arms = { line: 0, fire: 0, sky: 0 };
  for (const force of view.forces) {
    if (force.own) continue;
    if (force.line === null) arms.line += force.approxTotal ?? 0;
    else {
      arms.line += force.line;
      arms.fire += force.fire ?? 0;
      arms.sky += force.sky ?? 0;
    }
  }
  return arms;
}

/** Fuego rompe Línea, Línea aguanta Cielo, Cielo cae sobre Fuego. */
function counterTo(enemy: Arms): 'line' | 'fire' | 'sky' {
  if (totalOf(enemy) === 0) return 'line';
  if (enemy.line >= enemy.fire && enemy.line >= enemy.sky) return 'fire';
  if (enemy.fire >= enemy.sky) return 'sky';
  return 'line';
}
