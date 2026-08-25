/**
 * Combate determinista. Ver GDD §7.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SIN DADOS. La misma entrada da siempre el mismo resultado.               │
 * │                                                                          │
 * │ Es la decisión que sostiene la diplomacia del juego: si el combate       │
 * │ tuviera varianza, «si mantienes la posición tu guarnición sobrevive»     │
 * │ llevaría un asterisco, y una promesa con asterisco no vale nada.         │
 * │ La incertidumbre viene de la información oculta, no del azar.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * `previewCombat()` y la resolución del turno llaman a la MISMA función, así que la
 * previsualización que ve el jugador no puede diferir del resultado. Hay un test que
 * lo comprueba.
 */

import type {
  Adjacency, Arms, PlayerView, Posture, RegionId, Seat, TerrainKind,
} from '../types/index';
import { BALANCE, TERRAIN_COMBAT } from '../balance/constants';
import { round4 } from '../util/canonical';

/** La rueda: Fuego vence a Línea, Línea vence a Cielo, Cielo vence a Fuego. */
const BEATS = { line: 'sky', fire: 'line', sky: 'fire' } as const;
const BEATEN_BY = { line: 'fire', fire: 'sky', sky: 'line' } as const;
const ARMS = ['line', 'fire', 'sky'] as const;

export interface CombatSide {
  seat: Seat;
  arms: Arms;
  posture: Posture;
  /** Controlaba la región al empezar el turno. */
  defender: boolean;
  /** Fuego prestado desde regiones adyacentes. Suma potencia pero no recibe bajas. */
  fireSupport: number;
  /** Turnos sin suministro. Cada uno resta un 15 %. */
  unsupplied: number;
}

/**
 * **El Grado no aparece aquí, y es deliberado.**
 *
 * El multiplicador se aplica al **producir** (`economy.applyProduction`), no al pelear:
 * una Línea fabricada en grado 2 entra al mapa valiendo 12,5 en vez de 10, y ahí se
 * queda. Si el grado se aplicara en el combate, subirlo mejoraría también a las tropas
 * ya desplegadas —sería retroactivo— y subir de grado dejaría de ser una decisión para
 * pasar a ser una compra obvia en cuanto se pueda pagar.
 *
 * Como efecto secundario, la rueda de armas conserva su signo para todo par de grados
 * **por construcción**: el grado nunca toca la composición porque nunca llega hasta
 * aquí. No hay nada que comprobar porque no hay nada que romper.
 */

export interface SideOutcome {
  seat: Seat;
  power: number;
  /** Fracción de fuerza perdida, 0–1. */
  losses: number;
  survivors: Arms;
  destroyed: boolean;
  /** Se retiró en vez de morir (postura Pantalla). */
  retreated: boolean;
}

export interface CombatOutcome {
  /** `null` = empate exacto: todos destruidos y región disputada. */
  winner: Seat | null;
  sides: SideOutcome[];
}

export function totalOf(arms: Arms): number {
  return arms.line + arms.fire + arms.sky;
}

/**
 * Potencia efectiva de un bando.
 *
 * La bonificación de cada arma **escala con cuánto de lo que tiene enfrente
 * contrarresta**, en vez de aplicarse en escalones. Así la composición importa de forma
 * continua: llevar Fuego contra un enemigo mitad Línea rinde la mitad que contra un
 * enemigo todo Línea, sin umbrales arbitrarios.
 */
export function combatPower(
  side: CombatSide,
  enemy: Arms,
  terrain: TerrainKind,
  fortLevel: number,
): number {
  const { counterK } = BALANCE.combat;
  const enemyTotal = totalOf(enemy);
  const terrainMods = TERRAIN_COMBAT[terrain];

  // El apoyo de Fuego suma potencia pero no es una tropa presente: no recibe bajas.
  const effective: Arms = {
    line: side.arms.line,
    fire: side.arms.fire + side.fireSupport * BALANCE.combat.fireSupport,
    sky: side.arms.sky,
  };

  let power = 0;
  for (const arm of ARMS) {
    if (effective[arm] <= 0) continue;
    const counters = enemyTotal > 0 ? enemy[BEATS[arm]] / enemyTotal : 0;
    const countered = enemyTotal > 0 ? enemy[BEATEN_BY[arm]] / enemyTotal : 0;
    power += effective[arm] * (1 + counterK * counters - counterK * countered) * terrainMods[arm];
  }

  power *= postureModifier(side.posture, side.defender);

  if (side.defender) {
    power *= terrainMods.defender;
    power *= 1 + BALANCE.combat.fortPerLevel * Math.min(fortLevel, BALANCE.combat.maxFortLevel);
  }

  power *= (1 - BALANCE.economy.unsuppliedDecay) ** side.unsupplied;

  return round4(Math.max(0, power));
}

function postureModifier(posture: Posture, defender: boolean): number {
  const { assaultAtk, assaultDef, holdDef, screenMod } = BALANCE.combat;
  switch (posture) {
    case 'assault':
      return defender ? assaultDef : assaultAtk;
    case 'hold':
      return defender ? holdDef : 1;
    case 'screen':
      return screenMod;
    // Botín penaliza en los dos papeles, y es la misma razón las dos veces: vienes a
    // llevarte algo, no a sostener terreno. Atacando pegas menos; sorprendido a mitad
    // del saqueo, aguantas menos.
    case 'plunder':
      return BALANCE.extraction.plunderPenalty;
  }
}

/**
 * Resuelve un combate entre 2 o más bandos.
 *
 * Regla general, que con dos bandos se reduce exactamente al intercambio de Lanchester
 * del GDD: cada bando calcula su potencia **contra la suma de todos los demás**; gana
 * quien tenga más; los demás son destruidos; el vencedor pierde la fracción
 * `segunda_potencia / su_potencia`. Un empate exacto en la cima destruye a todos y deja
 * la región disputada — nunca se desempata al azar.
 */
export function resolveCombat(
  sides: readonly CombatSide[],
  terrain: TerrainKind,
  fortLevel: number,
): CombatOutcome {
  const ordered = [...sides].sort((a, b) => a.seat - b.seat);

  const powers = ordered.map((side) => {
    const enemy: Arms = { line: 0, fire: 0, sky: 0 };
    for (const other of ordered) {
      if (other.seat === side.seat) continue;
      enemy.line += other.arms.line;
      enemy.fire += other.arms.fire;
      enemy.sky += other.arms.sky;
    }
    return combatPower(side, enemy, terrain, fortLevel);
  });

  const best = Math.max(...powers);
  const leaders = powers.filter((p) => p === best).length;
  const runnerUp = Math.max(0, ...powers.filter((_, i) => powers[i] !== best));

  const outcomes: SideOutcome[] = ordered.map((side, index) => {
    const power = powers[index] as number;
    const isWinner = leaders === 1 && power === best;
    const losses = isWinner ? (power > 0 ? round4(runnerUp / power) : 1) : 1;

    // Pantalla: si va a perder, se retira dejando la mitad en vez de morir entera.
    const retreats = !isWinner && side.posture === 'screen';
    const applied = retreats ? BALANCE.combat.screenRetreatLoss : losses;

    return {
      seat: side.seat,
      power,
      losses: round4(applied),
      survivors: scaleArms(side.arms, 1 - applied),
      destroyed: !isWinner && !retreats,
      retreated: retreats,
    };
  });

  return {
    winner: leaders === 1 ? (ordered[powers.indexOf(best)] as CombatSide).seat : null,
    sides: outcomes,
  };
}

/** Bajas proporcionales entre armas: perder no cambia la composición de la fuerza. */
function scaleArms(arms: Arms, factor: number): Arms {
  const f = Math.max(0, Math.min(1, factor));
  return {
    line: round4(arms.line * f),
    fire: round4(arms.fire * f),
    sky: round4(arms.sky * f),
  };
}

// ─────────────────────────── Previsualización para la UI ──────────────────────

export interface CombatPreview {
  region: RegionId;
  /** Potencia de cada bando, en orden de asiento. */
  sides: { seat: Seat; power: number; losses: number; survivors: Arms }[];
  winner: Seat | null;
  /** `true` si alguna fuerza enemiga está oculta y el cálculo puede fallar. */
  uncertain: boolean;
}

/**
 * Calcula el resultado que se enseña al jugador **antes** de confirmar.
 *
 * Usa exactamente `resolveCombat`, así que no puede diferir del resultado real: lo
 * único que puede fallar es la información de partida, y por eso se devuelve
 * `uncertain` para que la interfaz lo diga en voz alta en vez de fingir precisión.
 */
export function previewCombat(
  region: RegionId,
  sides: readonly CombatSide[],
  terrain: TerrainKind,
  fortLevel: number,
  uncertain: boolean,
): CombatPreview {
  const outcome = resolveCombat(sides, terrain, fortLevel);
  return {
    region,
    winner: outcome.winner,
    uncertain,
    sides: outcome.sides.map((s) => ({
      seat: s.seat,
      power: s.power,
      losses: s.losses,
      survivors: s.survivors,
    })),
  };
}

/**
 * Construye la previsualización de un ataque **a partir de lo que ve el jugador**.
 *
 * Vive en el motor y no en la interfaz a propósito: derivar bandos de combate desde una
 * `PlayerView` es lógica de reglas. Si viviera en el cliente, el servidor y el simulador
 * tendrían que reimplementarla, y ahí es donde nacen las divergencias.
 *
 * Devuelve `null` cuando en el destino no hay nadie visible: no hay combate que
 * anticipar, y pedir confirmación sería un tap de peaje.
 */
export function previewAttack(
  view: PlayerView,
  attackerForceId: string,
  target: RegionId,
  adjacency: Adjacency,
  terrain: TerrainKind,
): CombatPreview | null {
  const attacker = view.forces.find((f) => f.own && f.id === attackerForceId);
  if (!attacker) return null;

  const enemies = view.forces.filter((f) => !f.own && f.regionId === target);
  if (enemies.length === 0) return null;

  const bySeat = new Map<Seat, { arms: Arms; hidden: boolean }>();
  for (const enemy of enemies) {
    const entry = bySeat.get(enemy.seat) ?? {
      arms: { line: 0, fire: 0, sky: 0 },
      hidden: false,
    };
    if (enemy.line === null) {
      // Fuerza oculta (bosque): se supone todo Línea, que es la lectura más
      // conservadora para quien ataca. Mejor sobrestimar al defensor que engañar.
      entry.arms.line += enemy.approxTotal ?? 0;
      entry.hidden = true;
    } else {
      entry.arms.line += enemy.line;
      entry.arms.fire += enemy.fire ?? 0;
      entry.arms.sky += enemy.sky ?? 0;
    }
    bySeat.set(enemy.seat, entry);
  }

  // Fuego propio ya desplegado en regiones adyacentes al objetivo. Es una estimación
  // optimista: solo cuenta de verdad si se ordena el apoyo, y eso se hace aparte.
  const support = view.forces
    .filter(
      (f) =>
        f.own &&
        f.id !== attackerForceId &&
        (adjacency[f.regionId] as readonly RegionId[] | undefined)?.includes(target),
    )
    .reduce((sum, f) => sum + (f.fire ?? 0), 0);

  const sides: CombatSide[] = [
    {
      seat: view.seat,
      arms: { line: attacker.line ?? 0, fire: attacker.fire ?? 0, sky: attacker.sky ?? 0 },
      posture: 'assault',
      defender: false,
      fireSupport: support,
      unsupplied: attacker.unsupplied ?? 0,
    },
    ...[...bySeat.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([seat, entry]): CombatSide => ({
        seat,
        arms: entry.arms,
        posture: 'hold',
        defender: view.control[target] === seat,
        fireSupport: 0,
        unsupplied: 0,
      })),
  ];

  return previewCombat(
    target,
    sides,
    terrain,
    view.fortification[target] ?? 0,
    [...bySeat.values()].some((e) => e.hidden),
  );
}
