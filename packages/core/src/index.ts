/**
 * @gdc/core — motor de reglas de Guerra de Cenizas.
 *
 * TypeScript puro, cero dependencias de runtime, sin I/O. Lo consumen el servidor
 * (autoridad), el cliente (solo previsualización) y el simulador (balance).
 * Ver packages/core/CLAUDE.md antes de tocar nada.
 */

export * from './types/index';

export { Rng, makeRng } from './rng/index';
export {
  canonicalJson, checksum, deepFreeze, round4,
  /**
   * El checksum de un estado de partida se calcula **siempre** con `stateChecksum`, no
   * con `checksum`: el mapa entra por su propio checksum en vez de volver a serializarse
   * entero cada turno. Dan valores distintos, así que mezclarlos es comparar peras con
   * manzanas — y eso ya cazó un test de reproducibilidad.
   */
  stateChecksum,
} from './util/canonical';

export { BALANCE, TERRAIN_YIELD, TERRAIN_COMBAT, type Balance } from './balance/constants';

export {
  FACTIONS, FACTION_IDS, ALL_DOCTRINES, ALL_ANOMALIES, STARTING_ANOMALIES,
  UNLOCK_BASE_COST, AFFINITY_DISCOUNT, SCHISM,
  isAffine, unlockCost, allUnlockKeys, parseUnlockKey,
  newAccount, hasUnlock, purchaseUnlock, performSchism, concordanceGroups,
  type Faction, type UnlockKey, type Account, type AccountFaction,
  type UnlockOutcome, type SchismOutcome,
} from './factions/index';

export {
  SECTOR_SPEC, VEIN_GRADE, sectorSize, zoneSize, mapSize, fairShare, bastionSlot,
  zoneOfRing, ringsOfZone, wardBoundaries, assertSpecConsistency,
  type SectorSpec,
} from './mapgen/spec';
export {
  buildSkeleton, buildAdjacency, bfsDistances, nodeRadius,
  type Skeleton, type SkeletonNode,
} from './mapgen/skeleton';
export { generateMap, MAPGEN_VERSION, type GeneratedMap } from './mapgen/generate';

export { reduce, ENGINE_VERSION } from './rules/reduce';
export {
  zoneOf, actOfTurn, buildWardIndex, canCross, passableAdjacency, reachableFrom,
  gatesBetween, gateOfColossus, openGate, type WardIndex,
} from './rules/zones';
export {
  ALL_BUILDINGS, buildingLevel, buildingAt, bestLevel, terrainAllows,
} from './rules/buildings';
export {
  ALL_ARMS, ALL_POLICIES, POLICY_BRANCH, POLICY_MATERIAL,
  emptyPolicies, startingTiers, policyEffect, tierMultiplier, bestFoundryLevel,
} from './rules/research';
export {
  emptyStock, veinAt, extractionRate, applyExtraction, applyHauling, applyPlunder,
  takePlunder, creditMaterials,
} from './rules/extraction';
export { applyColossi, initialColossi, guardedRegions, wardIndexOf } from './rules/colossus';
export { projectViews } from './rules/views';
export {
  combatPower, resolveCombat, previewCombat, previewAttack, totalOf,
  type CombatSide, type CombatOutcome, type CombatPreview, type SideOutcome,
} from './rules/combat';
export { applyBattles } from './rules/battle';
export {
  grossIncome, diminishingFactor, supplyUpkeep, canProduceAt, canProduceInView,
} from './rules/economy';
export {
  createGame, type CreateGameOptions, type CreatedGame, type SeatSetup,
} from './rules/setup';
export {
  standingOrders, autocommandOrders, parseStanding,
  DEFAULT_STANDING, AUTOCOMMAND_AFTER, type StandingConfig,
} from './rules/standing';
export { total } from './rules/movement';
export { botOrders, botProfile, BOT_TIERS, type BotProfile, type BotTier } from './rules/bot';
export { claimStandings, type Outcome, type SeatStanding } from './rules/outcome';
