/**
 * Tabla de balance.
 *
 * Esto son **datos, no código**. El simulador de balance barre estos valores para
 * calibrarlos ([TESTING_AND_SIMULATION §6.6]). Si escribes un número que afecte al
 * balance dentro de `rules/`, lo has sacado del alcance del simulador.
 *
 * Todos los valores marcados ⚖️ en la documentación son provisionales hasta v0.8.
 *
 * REGLA DE ORO: ningún desbloqueo permanente —de cuenta, de facción o de distrito—
 * puede modificar nada de este objeto. `factions/` no puede ni importarlo.
 */

export const BALANCE = {
  campaign: {
    /**
     * Turnos de guerra, sin contar el Parlamento (turno 0).
     *
     * ⚖️ 24 dimensiona los tres actos; es **provisional a propósito** y lo primero que
     * el simulador tiene que atacar ([ADR-046]). Doce no bastan para una economía con
     * extracción y edificios de tres niveles: la primera Extractora de nivel 3 no
     * existiría hasta el T9 y la partida terminaría cuatro turnos después.
     */
    turns: 24,
    turns2p: 20,
    coreActivatesAfterTurn: 6,
    /**
     * Último turno de cada acto. El acto no lo abre el calendario: lo abre una Puerta.
     * Esto solo dice cuándo *debería* estar abierta para que la partida quepa, y es lo
     * que el informe del simulador compara contra la realidad.
     */
    actEnds: [8, 18, 24],
  },

  /** Zonas, Cercos y Puertas. Ver RTS_ZONES_REFACTOR §3. */
  zones: {
    /** Puertas por sector en cada Cerco. Una: la decisión tiene que ser una. */
    gatesPerSector: 1,
    /**
     * Coste en Industria de forzar una Puerta ya sin Coloso. Cero: matar al Coloso
     * **es** el precio. Cobrar dos veces escondería la aritmética que interesa.
     */
    gateTollIndustry: 0,
  },

  /**
   * Colosos. ⚖️ Todo provisional.
   *
   * La constante que importa no es el daño: es que el Despojo **no cubra** el coste de
   * matarlo en solitario ([ADR-043]). Si lo cubriera, el sistema degenera en «el que
   * llegue antes», que es un 4X cualquiera.
   */
  colossus: {
    /** Composición por Cerco. Índice 0 = Cerco 1→2, índice 1 = Cerco 2→3. */
    arms: [
      { line: 16, fire: 8, sky: 4 },
      { line: 30, fire: 16, sky: 8 },
    ],
    /** Fracción de su potencia inicial que recupera por turno si nadie lo tocó. */
    regen: 0.12,
    /**
     * Desgaste por turno. Un Coloso no es una batalla, es un asedio: se le va quitando
     * a lo largo de varios turnos y él va quitando a cambio. Con el intercambio de
     * todo-o-nada de `resolveCombat` no habría nada que negociar — llegarías con todo
     * o no llegarías.
     *
     * Las dos cifras son distintas **a propósito**, y ahí está todo el diseño:
     *
     *  · `attritionK` es lo que le quitas. Escala con tu potencia, así que juntarse
     *    acorta el asedio.
     *  · `retaliation` es lo que te quita. Se reparte entre todos los que estén ahí,
     *    así que juntarse **también** abarata cada turno.
     *
     * Simétricas —como estaban al principio— el asedio salía a 45 % de bajas por turno
     * y ningún bot tocaba una Puerta en 24 turnos: no era un problema diplomático, era
     * un muro. ⚖️ Calibradas para que matarlo en solitario deje al matador un 15-25 %
     * por debajo y entre dos salga a favor de los dos ([ADR-043]).
     */
    attritionK: 0.6,
    retaliation: 0.18,
    /** Despojo, en material, por cada Cerco. Deliberadamente por debajo del coste. */
    spoils: [
      { ore: 26, ember: 14 },
      { ore: 44, ember: 30 },
    ],
    /** Ceniza que paga el golpe final. Pequeña: el Coloso no es una vía de victoria. */
    spoilsAsh: 1,
  },

  attunement: {
    turnsRequired: 3,
    baseCost: 5,
    costPerSeamLost: 2,
  },

  economy: {
    /**
     * Rendimiento decreciente de la renta por región. Antídoto principal al snowball.
     *
     * El diseño pedía que **doblar tu territorio diera ~1,55× de renta**: sublineal,
     * pero premiando expandirse. Al implementar la fórmula, el 0,045 documentado daba
     * solo 1,08× — expandirse dejaba de compensar, que es el error contrario. El valor
     * correcto para la intención declarada era 0,015. Ver CHANGELOG v0.2.
     *
     * **Recalibrada en el refactor RTS, y por la misma razón.** La «parte justa» pasó
     * de ser el sector entero (19 regiones con 5 jugadores) a ser el Solar (33), así
     * que con 0,015 la penalización empezaba mucho más tarde y doblar el territorio
     * daba 1,24× en vez de 1,55×. La constante se ajusta para conservar la intención
     * declarada; el número la sigue a ella y no al revés. Lo cazó el mismo test de
     * siempre, que es el que fija la intención en vez del valor.
     */
    diminishingK: 0.0088,
    /** Coste de suministro por salto hasta el Bastión propio más cercano. */
    supplyDistanceK: 0.2,
    /** Pérdida de potencia acumulativa por turno sin suministro. */
    unsuppliedDecay: 0.15,
    /** Topes de acumulación. La Ceniza no tiene tope a propósito. */
    caps: { supply: 60, industry: 60, intel: 40, ore: 120, ember: 80 },
    /** Lo que el Acopio suma al tope por nivel, para el asiento que lo tenga. */
    depotCapPerLevel: 30,
  },

  /** Extracción. Ver RTS_ZONES_REFACTOR §4. */
  extraction: {
    /** Material por turno de una Mena de grado g con Extractora de nivel n. */
    baseByGrade: [0, 2, 4, 7],
    perLevel: [0, 1, 1.6, 2.4],
    /** Tope de lo que una región puede guardar antes de que la Extractora pare. */
    stockCap: 40,
    /** Fracción del almacén que viaja al asiento cada turno, si hay ruta. */
    haulRate: 0.5,
    /** Se pierde esto por salto hasta el Bastión. Lejos rinde menos: es logística. */
    haulLossPerHop: 0.06,
    /** Fracción del almacén que se lleva quien gana en postura Botín. */
    plunderRate: 0.4,
    /** Penalización de potencia por atacar en Botín: vienes a robar, no a vencer. */
    plunderPenalty: 0.75,
    /** Fracción del almacén que se queda quien captura la región. */
    captureKeep: 1.0,
  },

  /** Edificios. Cinco tipos, tres niveles. Ver RTS_ZONES_REFACTOR §5. */
  buildings: {
    /** Turnos de obra por nivel alcanzado. Durante la obra NO produce. */
    turnsByLevel: [0, 1, 2, 3],
    /** Coste por nivel alcanzado, en Mineral y Brasa. */
    cost: {
      extractor: [null, { ore: 12, ember: 0 }, { ore: 24, ember: 8 }, { ore: 40, ember: 24 }],
      foundry:   [null, { ore: 16, ember: 4 }, { ore: 32, ember: 14 }, { ore: 56, ember: 32 }],
      arsenal:   [null, { ore: 14, ember: 6 }, { ore: 28, ember: 18 }, { ore: 48, ember: 36 }],
      depot:     [null, { ore: 10, ember: 2 }, { ore: 20, ember: 10 }, { ore: 34, ember: 20 }],
      watch:     [null, { ore: 8,  ember: 6 }, { ore: 18, ember: 14 }, { ore: 30, ember: 26 }],
    },
    /** Nivel que se pierde al capturar. Atacar una de nivel 3 sigue saliendo a cuenta. */
    captureLevelLoss: 1,
    /** Industria que la Fundición añade por nivel. */
    foundryIndustry: [0, 2, 4, 7],
    /** Descuento de producción por nivel de Arsenal. */
    arsenalDiscount: [0, 0.08, 0.16, 0.25],
    /** Fuerzas extra que permite el Arsenal, sobre `limits.maxForces`. */
    arsenalForces: [0, 0, 1, 2],
    /** Saltos de alcance de suministro que añade el Acopio. */
    depotSupplyRange: [0, 1, 2, 3],
    /** Intel por turno y visión extra de la Atalaya. */
    watchIntel: [0, 1, 2, 3],
    watchSight: [0, 1, 1, 2],
  },

  /** Grados de tropa. El multiplicador entra ANTES de la rueda de armas. */
  tiers: {
    multiplier: [0, 1.0, 1.25, 1.55],
    cost: [null, null, { ore: 40, ember: 20 }, { ore: 90, ember: 60 }],
    /** Nivel de Fundición exigido para cada grado. Una sola dependencia. */
    foundryRequired: [0, 0, 2, 3],
  },

  /** Políticas. Seis nodos, dos ramas, tres niveles. */
  policies: {
    cost: [null, { ore: 10, ember: 16 }, { ore: 20, ember: 34 }, { ore: 34, ember: 56 }],
    /** Efecto acumulado por nivel. Índice = nivel. */
    effect: {
      deepVeins:     [1.0, 1.15, 1.30, 1.45],
      caravans:      [1.0, 0.80, 0.64, 0.50],
      recasting:     [1.0, 0.85, 0.72, 0.60],
      cadence:       [1.0, 1.10, 1.20, 1.30],
      escalade:      [0, 1, 2, 3],
      marchDoctrine: [1.0, 0.85, 0.72, 0.60],
    },
  },

  combat: {
    /** Fuerza de la rueda Fuego > Línea > Cielo > Fuego. */
    counterK: 0.35,
    assaultAtk: 1.15,
    assaultDef: 0.85,
    holdDef: 1.2,
    screenMod: 0.75,
    fireSupport: 0.6,
    /** Bonificación defensiva por nivel de fortificación. */
    fortPerLevel: 0.15,
    maxFortLevel: 2,
    /**
     * Una fuerza en Pantalla que pierde se retira en vez de morir, dejando la mitad.
     * Es lo que permite exponerse a un aliado dudoso sin perderlo todo si traiciona.
     */
    screenRetreatLoss: 0.5,
    bastionDef: 1.4,
  },

  ash: {
    bastionIncome: 1,
    seamIncome: 2,
    coreIncome: 1,
    breachBase: 3,
    breachPerTurn: 2,
    breachMax: 9,
  },

  limits: {
    maxForces: 6,
    /** Obras por asiento y turno. Cuatro: una decisión de imperio, no una hoja Excel. */
    maxWorks: 4,
    maxShades: 3,
    anomaliesCarried: 3,
    anomalyUses: 2,
  },

  lesserClaim: {
    wSeam: 4,
    wAsh: 2,
    wRegion: 1,
    wCore: 3,
  },

  /** Producción. Ver GDD §8.1. */
  production: {
    line:   { industry: 6,  strength: 10, upkeep: 1 },
    fire:   { industry: 8,  strength: 10, upkeep: 1.5 },
    sky:    { industry: 10, strength: 10, upkeep: 2 },
    fort:   { industry: 10 },
    bridge: { industry: 8 },
  },

  start: {
    resources: { supply: 20, industry: 20, intel: 10, ash: 2, ore: 24, ember: 10 },
    bastionForce: { line: 20, fire: 10, sky: 0 },
    forwardForce: { line: 10, fire: 0, sky: 0 },
  },
} as const;

export type Balance = typeof BALANCE;

/** Renta por tipo de región. Ver GDD §6.1. */
export const TERRAIN_YIELD = {
  plain: { supply: 2, industry: 1, intel: 0, ash: 0 },
  urban: { supply: 1, industry: 3, intel: 1, ash: 0 },
  high: { supply: 1, industry: 1, intel: 1, ash: 0 },
  forest: { supply: 2, industry: 1, intel: 0, ash: 0 },
  water: { supply: 1, industry: 0, intel: 2, ash: 0 },
  seam: { supply: 0, industry: 0, intel: 1, ash: BALANCE.ash.seamIncome },
  bastion: { supply: 3, industry: 3, intel: 2, ash: BALANCE.ash.bastionIncome },
  core: { supply: 0, industry: 0, intel: 0, ash: BALANCE.ash.coreIncome },
} as const;

/** Modificadores de combate por terreno. Se aplican en v0.2. */
export const TERRAIN_COMBAT = {
  plain: { line: 1.0, fire: 1.15, sky: 1.0, defender: 1.0 },
  urban: { line: 1.25, fire: 1.0, sky: 0.8, defender: 1.0 },
  high: { line: 1.0, fire: 1.1, sky: 1.0, defender: 1.2 },
  forest: { line: 1.0, fire: 1.0, sky: 0.75, defender: 1.0 },
  water: { line: 1.0, fire: 1.0, sky: 1.0, defender: 1.0 },
  seam: { line: 1.0, fire: 1.0, sky: 1.0, defender: 1.0 },
  bastion: { line: 1.0, fire: 1.0, sky: 1.0, defender: BALANCE.combat.bastionDef },
  core: { line: 1.0, fire: 1.0, sky: 1.0, defender: 1.25 },
} as const;
