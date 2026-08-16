/**
 * Sistema de facciones — ligado a la cuenta, no a la partida.
 *
 * Especificación completa: docs/FACTIONS.md · Decisión: ADR-021.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ INVARIANTE: la facción cambia EL CAMINO, nunca EL DESTINO.               │
 * │ Dos cuentas al máximo, de facciones distintas, tienen exactamente el     │
 * │ mismo conjunto de opciones disponibles.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Este módulo **no importa `balance/`** y no debe hacerlo nunca. Es la barrera
 * estructural que impide que un desbloqueo toque una constante de balance: si el
 * código no puede verlas, no puede modificarlas. Verificado por test.
 */

import type { AnomalyId, DoctrineId, FactionId } from '../types/index';

// ──────────────────────────────── Catálogo ────────────────────────────────────

export interface Faction {
  id: FactionId;
  /** Doctrina con la que empieza una cuenta que jura a esta facción. */
  originDoctrine: DoctrineId;
  /** Doctrinas con descuento. Incluye siempre la de origen. */
  affineDoctrines: readonly DoctrineId[];
  /** Anomalías con descuento. */
  affineAnomalies: readonly AnomalyId[];
  palette: { primary: string; secondary: string; ink: string };
}

export const FACTIONS: Readonly<Record<FactionId, Faction>> = {
  vantera: {
    id: 'vantera',
    originDoctrine: 'ledger',
    affineDoctrines: ['ledger', 'shroud'],
    affineAnomalies: ['seal', 'echo', 'flare'],
    palette: { primary: '#C9A227', secondary: '#E8E2D4', ink: '#2A2418' },
  },
  koldvik: {
    id: 'koldvik',
    originDoctrine: 'anvil',
    affineDoctrines: ['anvil', 'wedge'],
    affineAnomalies: ['anchor', 'exodus', 'veil'],
    palette: { primary: '#C9683A', secondary: '#8A8F98', ink: '#1C1E22' },
  },
  saranth: {
    id: 'saranth',
    originDoctrine: 'chorus',
    affineDoctrines: ['chorus', 'ledger'],
    affineAnomalies: ['rift', 'fold', 'flare'],
    palette: { primary: '#3FA9A0', secondary: '#D8C9A3', ink: '#16211F' },
  },
  meridia: {
    id: 'meridia',
    originDoctrine: 'wedge',
    affineDoctrines: ['wedge', 'swarm'],
    affineAnomalies: ['fold', 'exodus', 'anchor'],
    palette: { primary: '#4A8B5F', secondary: '#C7CBD1', ink: '#16211A' },
  },
  oshara: {
    id: 'oshara',
    originDoctrine: 'shroud',
    affineDoctrines: ['shroud', 'chorus'],
    affineAnomalies: ['veil', 'echo', 'rift'],
    palette: { primary: '#5C8C9B', secondary: '#A88A5C', ink: '#141E22' },
  },
  tarn: {
    id: 'tarn',
    originDoctrine: 'swarm',
    affineDoctrines: ['swarm', 'anvil'],
    affineAnomalies: ['anchor', 'flare', 'seal'],
    palette: { primary: '#B58A3C', secondary: '#6E6A66', ink: '#1E1B16' },
  },
} as const;

export const FACTION_IDS: readonly FactionId[] = Object.keys(FACTIONS).sort() as FactionId[];

export const ALL_DOCTRINES: readonly DoctrineId[] =
  ['anvil', 'chorus', 'ledger', 'shroud', 'swarm', 'wedge'];

export const ALL_ANOMALIES: readonly AnomalyId[] =
  ['anchor', 'echo', 'exodus', 'flare', 'fold', 'rift', 'seal', 'veil'];

/**
 * Anomalías con las que empieza CUALQUIER cuenta, sea cual sea su facción.
 * Son las tres más fáciles de entender: el onboarding no debe depender del juramento.
 */
export const STARTING_ANOMALIES: readonly AnomalyId[] = ['anchor', 'echo', 'veil'];

// ──────────────────────────── Claves de desbloqueo ────────────────────────────

export type UnlockKey =
  | `doctrine:${DoctrineId}`
  | `anomaly:${AnomalyId}`
  | `city:${FactionId}`;

export const UNLOCK_BASE_COST = {
  doctrine: 90,
  anomaly: 70,
  city: 55,
} as const;

/** Solo hay descuento por afinidad. Nada se encarece nunca. Ver FACTIONS.md §3. */
export const AFFINITY_DISCOUNT = 0.6;

export function parseUnlockKey(
  key: UnlockKey,
): { kind: 'doctrine' | 'anomaly' | 'city'; id: string } {
  const idx = key.indexOf(':');
  return {
    kind: key.slice(0, idx) as 'doctrine' | 'anomaly' | 'city',
    id: key.slice(idx + 1),
  };
}

export function isAffine(key: UnlockKey, factionId: FactionId): boolean {
  const faction = FACTIONS[factionId];
  const { kind, id } = parseUnlockKey(key);
  if (kind === 'doctrine') return faction.affineDoctrines.includes(id as DoctrineId);
  if (kind === 'anomaly') return faction.affineAnomalies.includes(id as AnomalyId);
  return false;
}

/**
 * Coste de un desbloqueo en Ceniza depositada.
 * Nunca supera el coste base: la afinidad solo abarata.
 */
export function unlockCost(key: UnlockKey, factionId: FactionId): number {
  const { kind } = parseUnlockKey(key);
  const base = UNLOCK_BASE_COST[kind];
  return isAffine(key, factionId) ? Math.round(base * AFFINITY_DISCOUNT) : base;
}

/** Todas las claves que existen. Idéntico para toda facción — ese es el invariante. */
export function allUnlockKeys(): UnlockKey[] {
  return [
    ...ALL_DOCTRINES.map((d): UnlockKey => `doctrine:${d}`),
    ...ALL_ANOMALIES.map((a): UnlockKey => `anomaly:${a}`),
    ...FACTION_IDS.map((f): UnlockKey => `city:${f}`),
  ].sort();
}

// ────────────────────────────── Estado de cuenta ──────────────────────────────

export interface AccountFaction {
  factionId: FactionId;
  /** Campañas completadas desde el juramento actual. */
  sworn: number;
  /** Ceniza aportada a esta facción. Solo cosmético. No desbloquea nada mecánico. */
  renown: number;
  schismsUsed: number;
  lastSchismCampaign: number | null;
}

export interface Account {
  faction: AccountFaction;
  /** Ordenado. Es la única fuente de verdad de qué puede llevar la cuenta. */
  unlocks: UnlockKey[];
  ashBank: number;
  /** Campañas completadas en total, de todas las facciones. */
  campaigns: number;
}

export function newAccount(factionId: FactionId): Account {
  const faction = FACTIONS[factionId];
  const unlocks: UnlockKey[] = [
    `doctrine:${faction.originDoctrine}`,
    ...STARTING_ANOMALIES.map((a): UnlockKey => `anomaly:${a}`),
    `city:${factionId}`,
  ];
  return {
    faction: {
      factionId,
      sworn: 0,
      renown: 0,
      schismsUsed: 0,
      lastSchismCampaign: null,
    },
    unlocks: unlocks.sort(),
    ashBank: 0,
    campaigns: 0,
  };
}

export function hasUnlock(account: Account, key: UnlockKey): boolean {
  return account.unlocks.includes(key);
}

export type UnlockOutcome =
  | { ok: true; account: Account; spent: number }
  | { ok: false; reason: 'already_owned' | 'insufficient_ash' };

/** Compra un desbloqueo. Función pura: devuelve una cuenta nueva. */
export function purchaseUnlock(account: Account, key: UnlockKey): UnlockOutcome {
  if (hasUnlock(account, key)) return { ok: false, reason: 'already_owned' };

  const cost = unlockCost(key, account.faction.factionId);
  if (account.ashBank < cost) return { ok: false, reason: 'insufficient_ash' };

  return {
    ok: true,
    spent: cost,
    account: {
      ...account,
      ashBank: account.ashBank - cost,
      unlocks: [...account.unlocks, key].sort(),
    },
  };
}

// ─────────────────────────────────── Cisma ────────────────────────────────────

export const SCHISM = {
  cost: 60,
  cooldownCampaigns: 3,
  /** El primer Cisma dentro de las 3 primeras campañas es gratis y sin espera. */
  graceCampaigns: 3,
} as const;

export type SchismOutcome =
  | { ok: true; account: Account; spent: number }
  | { ok: false; reason: 'same_faction' | 'insufficient_ash' | 'cooldown' };

/**
 * Cambiar de facción.
 *
 * **Los desbloqueos ya obtenidos se conservan todos**: son de la cuenta, no de la
 * facción. Eso es lo que impide que el Cisma sea una trampa. Lo que se paga es la
 * Ceniza y la espera, no el progreso.
 */
export function performSchism(account: Account, to: FactionId): SchismOutcome {
  const { faction, campaigns } = account;
  if (faction.factionId === to) return { ok: false, reason: 'same_faction' };

  const inGrace = faction.schismsUsed === 0 && campaigns < SCHISM.graceCampaigns;
  const cost = inGrace ? 0 : SCHISM.cost;

  if (!inGrace) {
    const since = campaigns - (faction.lastSchismCampaign ?? -SCHISM.cooldownCampaigns);
    if (since < SCHISM.cooldownCampaigns) return { ok: false, reason: 'cooldown' };
    if (account.ashBank < cost) return { ok: false, reason: 'insufficient_ash' };
  }

  return {
    ok: true,
    spent: cost,
    account: {
      ...account,
      ashBank: account.ashBank - cost,
      // Se conserva `unlocks` intacto. Y se concede la doctrina de origen de la nueva
      // facción, para que nadie quede sin doctrina con la que jugar.
      unlocks: [
        ...new Set([...account.unlocks, `doctrine:${FACTIONS[to].originDoctrine}` as UnlockKey]),
      ].sort(),
      faction: {
        factionId: to,
        sworn: 0,
        renown: 0,
        schismsUsed: faction.schismsUsed + 1,
        lastSchismCampaign: campaigns,
      },
    },
  };
}

// ────────────────────────────────── Concordia ─────────────────────────────────

/**
 * Asientos que comparten facción. Información **pública y puramente informativa**:
 * no otorga absolutamente ningún efecto mecánico (ver FACTIONS.md §4.1).
 *
 * Devuelve grupos ordenados de 2+ asientos, ordenados a su vez por el primer asiento.
 */
export function concordanceGroups(
  seats: readonly { seat: number; factionId: FactionId }[],
): { factionId: FactionId; seats: number[] }[] {
  const byFaction = new Map<FactionId, number[]>();
  for (const s of [...seats].sort((a, b) => a.seat - b.seat)) {
    const list = byFaction.get(s.factionId) ?? [];
    list.push(s.seat);
    byFaction.set(s.factionId, list);
  }
  return [...byFaction.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([factionId, list]) => ({ factionId, seats: list }))
    .sort((a, b) => (a.seats[0] as number) - (b.seats[0] as number));
}
