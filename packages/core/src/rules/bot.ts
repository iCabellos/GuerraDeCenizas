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
  Adjacency, Arms, BuildingKind, Colossus, MoveOrder, Orders, PlayerView, PolicyId,
  ProductionOrder, RegionId, ResearchOrder, Seat, TerrainKind, WorkOrder,
} from '../types/index';
import { BALANCE, TERRAIN_YIELD } from '../balance/constants';
import { makeRng, type Rng } from '../rng/index';
import { previewAttack, totalOf } from './combat';
import { buildWardIndex, canCross, type WardIndex } from './zones';
import { terrainAllows } from './buildings';

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
  const works = planWorks(view, profile);
  const research = planResearch(view, profile);

  // En el Parlamento no se mueve nadie: el motor rechazaría cada orden con un evento.
  if (view.phase !== 'war') {
    return { turn: view.turn, moves: [], production, works, ...(research ? { research } : {}) };
  }

  return {
    turn: view.turn,
    moves: planMoves(view, adjacency, profile, rng),
    production,
    works,
    ...(research ? { research } : {}),
  };
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
  const wards = buildWardIndex(view.map);

  for (const force of own) {
    const candidates = rank(view, adjacency, profile, force.id, force.regionId, taken, wards);
    const choice = choose(candidates, profile, rng);
    // Contra un Coloso **sí** se juntan. Es la única situación del juego en la que
    // concentrar bate a repartir, porque el desgaste es simétrico: cuantos más vengan,
    // menos sufre cada uno y antes cae. Prohibirlo aquí dejaría las Puertas cerradas
    // para siempre, que es exactamente lo que pasaba.
    if (choice.to !== undefined && !liveColossus(view, choice.to)) taken.add(choice.to);
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
  wards: WardIndex,
): Candidate[] {
  const out: Candidate[] = [{ posture: 'hold', score: holdValue(view, adjacency, profile, from) }];
  const force = view.forces.find((f) => f.id === forceId);
  const ownPower = force ? (force.line ?? 0) + (force.fire ?? 0) + (force.sky ?? 0) : 0;

  for (const to of [...(adjacency[from] ?? [])].sort((a, b) => a - b)) {
    if (taken.has(to)) continue;
    const region = view.map.regions[to];
    if (!region) continue;

    // Un Cerco cerrado no es un destino caro: es un destino imposible. Ofrecerlo llena
    // el turno de rechazos y deja al bot empujando contra una puerta cerrada para
    // siempre — literalmente: se le comprobó parándose en 7 regiones en el T6.
    if (!canCross(wards, view.gatesOpen, from, to)) continue;

    // El agua exige Puente para Línea y Fuego. Sin él la orden se rechaza y el turno
    // del bot se va en eventos de error.
    if (region.kind === 'water' && !view.bridges[to]) continue;

    // Los Colosos son públicos y previsibles: eso es lo que permite decidir si sale a
    // cuenta. Un bot que se lanza con lo que tenga muere en la Puerta y deja de jugar.
    const guard = liveColossus(view, to);
    if (guard) {
      const need = totalOf(guard) * profile.nerve;
      if (ownPower < need) continue;
      out.push({ to, posture: 'assault', score: 5 * (ownPower / Math.max(1, totalOf(guard))) });
      continue;
    }

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

  // Una Mena vale por lo que da si la explotas, y más cuanto más rica: es el motivo
  // por el que la Marca merece la pena y la razón de que nadie se quede en casa.
  const vein = view.map.veins.find((v) => v.regionId === regionId);
  if (vein) strategic += vein.grade * 1.2;

  // Y si ya hay una Extractora encima, mejor: se captura, no se destruye.
  const extractor = view.buildings.find(
    (b) => b.regionId === regionId && b.kind === 'extractor',
  );
  if (extractor) strategic += extractor.level;

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

// ──────────────────────────── Obras e investigación ───────────────────────────

/** El Coloso vivo que guarda una región, si lo hay. Es información pública. */
function liveColossus(view: PlayerView, regionId: RegionId): Colossus | undefined {
  return view.colossi.find((c) => c.alive && c.regionId === regionId);
}

/**
 * En qué construye.
 *
 * Un orden fijo y corto, no un planificador: **Extractora primero** —sin material no
 * hay nada más—, después Fundición (que es el techo de todo lo demás), después Acopio
 * y Atalaya. Los bots no necesitan optimizar; necesitan no quedarse parados.
 */
function planWorks(view: PlayerView, profile: BotProfile): WorkOrder[] {
  const out: WorkOrder[] = [];
  const budget = { ore: view.self.resources.ore, ember: view.self.resources.ember };
  const used = new Set<RegionId>();

  const level = (regionId: RegionId, kind: BuildingKind): number =>
    view.buildings.find((b) => b.regionId === regionId && b.kind === kind && b.own)?.level ?? 0;
  const busy = (regionId: RegionId): boolean =>
    used.has(regionId) ||
    view.buildings.some((b) => b.regionId === regionId && b.own && b.building > 0);

  const afford = (kind: BuildingKind, target: number): boolean => {
    const cost = BALANCE.buildings.cost[kind][target];
    if (!cost) return false;
    if (budget.ore < cost.ore || budget.ember < cost.ember) return false;
    budget.ore -= cost.ore;
    budget.ember -= cost.ember;
    return true;
  };

  const mine = view.control
    .map((owner, regionId) => (owner === view.seat ? regionId : -1))
    .filter((regionId) => regionId >= 0);

  const foundryLevel = Math.max(0, ...mine.map((r) => level(r, 'foundry')));
  const ceiling = Math.max(1, foundryLevel);

  // 1 · Extractoras sobre las Menas propias, empezando por las más ricas.
  const veins = view.map.veins
    .filter((v) => view.control[v.regionId] === view.seat)
    .sort((a, b) => b.grade - a.grade || a.regionId - b.regionId);
  for (const vein of veins) {
    if (out.length >= BALANCE.limits.maxWorks) break;
    if (busy(vein.regionId)) continue;
    const target = level(vein.regionId, 'extractor') + 1;
    if (target > 3 || target > ceiling) continue;
    if (!afford('extractor', target)) continue;
    out.push({ regionId: vein.regionId, kind: 'extractor' });
    used.add(vein.regionId);
  }

  // 2 · El resto, en el Bastión. Sube la Fundición solo si de verdad la va a usar: es
  //     el techo de todo, pero también es lo más caro y bloquea la investigación.
  const bastion = view.map.bastions[view.seat];
  if (bastion !== undefined && view.control[bastion] === view.seat && !busy(bastion)) {
    const order: BuildingKind[] = profile.greed >= 0.5
      ? ['foundry', 'depot', 'arsenal', 'watch']
      : ['arsenal', 'foundry', 'depot', 'watch'];
    for (const kind of order) {
      if (out.length >= BALANCE.limits.maxWorks) break;
      if (!terrainAllows(kind, view.map.regions[bastion]?.kind)) continue;
      const target = level(bastion, kind) + 1;
      if (target > 3) continue;
      if (kind !== 'foundry' && target > 1 && target > ceiling) continue;
      if (!afford(kind, target)) continue;
      out.push({ regionId: bastion, kind });
      used.add(bastion);
      break; // una obra por región y turno
    }
  }

  return out;
}

/**
 * Qué investiga.
 *
 * Los codiciosos van a la rama económica y los agresivos a la militar, y los dos suben
 * grado en cuanto la Fundición se lo permite. No hay plan a largo plazo: hay una
 * preferencia, que es lo que distingue a un rival de un generador de ruido.
 */
function planResearch(view: PlayerView, profile: BotProfile): ResearchOrder | undefined {
  const bastion = view.map.bastions[view.seat];
  const foundry = Math.max(
    0,
    ...view.buildings.filter((b) => b.own && b.kind === 'foundry' && b.building === 0)
      .map((b) => b.level),
  );
  if (foundry === 0 || bastion === undefined) return undefined;

  const { ore, ember } = view.self.resources;

  // El grado es caro y no es retroactivo: solo compensa si hay con qué reemplazar.
  const arms = ['line', 'fire', 'sky'] as const;
  for (const arm of arms) {
    const current = view.self.tiers[arm];
    if (current >= 3) continue;
    const target = current + 1;
    if (foundry < (BALANCE.tiers.foundryRequired[target] as number)) continue;
    const cost = BALANCE.tiers.cost[target];
    if (!cost || ore < cost.ore || ember < cost.ember) continue;
    if (profile.greed < 0.5) return { kind: 'tier', arm };
    break;
  }

  const wanted: PolicyId[] = profile.greed >= 0.5
    ? ['deepVeins', 'caravans', 'recasting', 'cadence', 'marchDoctrine', 'escalade']
    : ['cadence', 'escalade', 'marchDoctrine', 'deepVeins', 'caravans', 'recasting'];
  for (const policy of wanted) {
    const rank = view.self.policies[policy] ?? 0;
    if (rank >= 3) continue;
    const cost = BALANCE.policies.cost[rank + 1];
    if (!cost || ore < cost.ore || ember < cost.ember) continue;
    return { kind: 'policy', policy };
  }

  return undefined;
}
