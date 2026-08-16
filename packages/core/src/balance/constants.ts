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
    /** Turnos de guerra, sin contar el Parlamento (turno 0). */
    turns: 12,
    turns2p: 10,
    coreActivatesAfterTurn: 3,
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
     * correcto para la intención declarada es 0,015. Ver CHANGELOG v0.2.
     */
    diminishingK: 0.015,
    /** Coste de suministro por salto hasta el Bastión propio más cercano. */
    supplyDistanceK: 0.2,
    /** Pérdida de potencia acumulativa por turno sin suministro. */
    unsuppliedDecay: 0.15,
    /** Topes de acumulación. La Ceniza no tiene tope a propósito. */
    caps: { supply: 60, industry: 60, intel: 40 },
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
    resources: { supply: 20, industry: 20, intel: 10, ash: 2 },
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
