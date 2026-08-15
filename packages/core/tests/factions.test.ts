/**
 * Tests del sistema de facciones.
 *
 * El bloque «invariante del techo» es el que hace que las facciones sean compatibles con
 * el juego competitivo: convierte «la facción cambia el camino, no el destino» de
 * promesa a aserción ejecutable. Si alguno de esos tests falla, hay que revertir el
 * cambio, no ajustar el test.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ALL_ANOMALIES, ALL_DOCTRINES, FACTIONS, FACTION_IDS, SCHISM, STARTING_ANOMALIES,
  UNLOCK_BASE_COST, allUnlockKeys, concordanceGroups, hasUnlock, isAffine, newAccount,
  performSchism, purchaseUnlock, unlockCost, type Account, type UnlockKey,
} from '../src/factions/index';
import type { AnomalyId, DoctrineId, FactionId } from '../src/types/index';

/** Compra todo lo comprable dando por hecho Ceniza infinita. */
function maxAccount(factionId: FactionId): Account {
  let account: Account = { ...newAccount(factionId), ashBank: 100_000 };
  for (const key of allUnlockKeys()) {
    const result = purchaseUnlock(account, key);
    if (result.ok) account = result.account;
  }
  return account;
}

describe('integridad del catálogo', () => {
  it('hay exactamente 6 facciones', () => {
    expect(FACTION_IDS).toHaveLength(6);
    expect(Object.keys(FACTIONS).sort()).toEqual([...FACTION_IDS]);
  });

  it('cada facción declara su propio id', () => {
    for (const id of FACTION_IDS) expect(FACTIONS[id].id).toBe(id);
  });

  it('cada doctrina es el origen de exactamente una facción', () => {
    const origins = FACTION_IDS.map((id) => FACTIONS[id].originDoctrine);
    expect(new Set(origins).size).toBe(ALL_DOCTRINES.length);
    expect([...origins].sort()).toEqual([...ALL_DOCTRINES].sort());
  });

  it('la doctrina de origen siempre es afín a su propia facción', () => {
    for (const id of FACTION_IDS) {
      expect(FACTIONS[id].affineDoctrines).toContain(FACTIONS[id].originDoctrine);
    }
  });

  it('cada facción tiene 2 doctrinas y 3 anomalías afines', () => {
    for (const id of FACTION_IDS) {
      expect(FACTIONS[id].affineDoctrines).toHaveLength(2);
      expect(FACTIONS[id].affineAnomalies).toHaveLength(3);
      expect(new Set(FACTIONS[id].affineDoctrines).size).toBe(2);
      expect(new Set(FACTIONS[id].affineAnomalies).size).toBe(3);
    }
  });

  it('ninguna doctrina ni anomalía queda huérfana ni sobrerrepresentada', () => {
    const doctrineCount = new Map<DoctrineId, number>();
    const anomalyCount = new Map<AnomalyId, number>();
    for (const id of FACTION_IDS) {
      for (const d of FACTIONS[id].affineDoctrines) {
        doctrineCount.set(d, (doctrineCount.get(d) ?? 0) + 1);
      }
      for (const a of FACTIONS[id].affineAnomalies) {
        anomalyCount.set(a, (anomalyCount.get(a) ?? 0) + 1);
      }
    }
    for (const d of ALL_DOCTRINES) expect(doctrineCount.get(d)).toBe(2);
    for (const a of ALL_ANOMALIES) {
      expect(anomalyCount.get(a)).toBeGreaterThanOrEqual(2);
      expect(anomalyCount.get(a)).toBeLessThanOrEqual(3);
    }
  });
});

describe('invariante del techo — la facción cambia el camino, no el destino', () => {
  it('dos cuentas al máximo tienen exactamente las mismas opciones', () => {
    const reference = maxAccount('vantera').unlocks;
    for (const id of FACTION_IDS) {
      expect(maxAccount(id).unlocks).toEqual(reference);
    }
  });

  it('toda cuenta al máximo tiene TODAS las doctrinas y anomalías', () => {
    const account = maxAccount('tarn');
    for (const d of ALL_DOCTRINES) expect(hasUnlock(account, `doctrine:${d}`)).toBe(true);
    for (const a of ALL_ANOMALIES) expect(hasUnlock(account, `anomaly:${a}`)).toBe(true);
  });

  it('desbloquearlo todo cuesta lo mismo para las 6 facciones', () => {
    const totals = FACTION_IDS.map((id) =>
      allUnlockKeys().reduce((sum, key) => sum + unlockCost(key, id), 0),
    );
    expect(new Set(totals).size).toBe(1);
  });

  it('la afinidad solo abarata: nunca encarece', () => {
    for (const id of FACTION_IDS) {
      for (const key of allUnlockKeys()) {
        const kind = key.split(':')[0] as keyof typeof UNLOCK_BASE_COST;
        expect(unlockCost(key, id)).toBeLessThanOrEqual(UNLOCK_BASE_COST[kind]);
      }
    }
  });

  it('lo afín es estrictamente más barato que lo no afín', () => {
    for (const id of FACTION_IDS) {
      const affine = ALL_DOCTRINES.filter((d) => isAffine(`doctrine:${d}`, id));
      const foreign = ALL_DOCTRINES.filter((d) => !isAffine(`doctrine:${d}`, id));
      expect(affine.length).toBe(2);
      expect(unlockCost(`doctrine:${affine[0]!}`, id))
        .toBeLessThan(unlockCost(`doctrine:${foreign[0]!}`, id));
    }
  });

  it('factions/ no importa balance/ — barrera estructural de la regla de oro', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../src/factions/index.ts', import.meta.url)),
      'utf8',
    );
    expect(source).not.toMatch(/from\s+['"].*balance/);
    expect(source).not.toMatch(/\bBALANCE\b/);
  });
});

describe('cuenta nueva', () => {
  it('empieza con 1 doctrina, las mismas 3 anomalías y su ciudad', () => {
    for (const id of FACTION_IDS) {
      const account = newAccount(id);
      const doctrines = account.unlocks.filter((k) => k.startsWith('doctrine:'));
      const anomalies = account.unlocks.filter((k) => k.startsWith('anomaly:'));

      expect(doctrines).toEqual([`doctrine:${FACTIONS[id].originDoctrine}`]);
      expect(anomalies.sort()).toEqual(
        STARTING_ANOMALIES.map((a) => `anomaly:${a}`).sort(),
      );
      expect(hasUnlock(account, `city:${id}`)).toBe(true);
      expect(account.ashBank).toBe(0);
    }
  });

  it('las anomalías iniciales son idénticas para todas las facciones', () => {
    const sets = FACTION_IDS.map((id) =>
      newAccount(id).unlocks.filter((k) => k.startsWith('anomaly:')).join(','),
    );
    expect(new Set(sets).size).toBe(1);
  });
});

describe('compra de desbloqueos', () => {
  it('rechaza si no hay Ceniza suficiente', () => {
    const account = newAccount('koldvik');
    const result = purchaseUnlock(account, 'doctrine:chorus');
    expect(result).toEqual({ ok: false, reason: 'insufficient_ash' });
  });

  it('rechaza lo ya poseído', () => {
    const account = { ...newAccount('koldvik'), ashBank: 1000 };
    const result = purchaseUnlock(account, 'doctrine:anvil');
    expect(result).toEqual({ ok: false, reason: 'already_owned' });
  });

  it('descuenta exactamente el coste y no muta la cuenta original', () => {
    const account = { ...newAccount('koldvik'), ashBank: 200 };
    const before = JSON.stringify(account);
    const result = purchaseUnlock(account, 'doctrine:wedge'); // afín a Koldvik

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spent).toBe(54);
    expect(result.account.ashBank).toBe(146);
    expect(JSON.stringify(account)).toBe(before);
  });

  it('los desbloqueos quedan ordenados', () => {
    let account: Account = { ...newAccount('oshara'), ashBank: 1000 };
    for (const key of ['doctrine:swarm', 'anomaly:rift', 'city:tarn'] as UnlockKey[]) {
      const result = purchaseUnlock(account, key);
      if (result.ok) account = result.account;
    }
    expect(account.unlocks).toEqual([...account.unlocks].sort());
  });
});

describe('cisma', () => {
  it('el primero es gratis y sin espera durante las 3 primeras campañas', () => {
    const account = newAccount('vantera');
    const result = performSchism(account, 'koldvik');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spent).toBe(0);
    expect(result.account.faction.factionId).toBe('koldvik');
  });

  it('conserva todos los desbloqueos', () => {
    let account: Account = { ...newAccount('vantera'), ashBank: 1000, campaigns: 10 };
    const bought = purchaseUnlock(account, 'anomaly:rift');
    if (bought.ok) account = bought.account;
    const before = [...account.unlocks];

    const result = performSchism(account, 'saranth');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const key of before) expect(result.account.unlocks).toContain(key);
  });

  it('concede la doctrina de origen de la nueva facción', () => {
    const account: Account = { ...newAccount('vantera'), ashBank: 1000, campaigns: 10 };
    const result = performSchism(account, 'tarn');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(hasUnlock(result.account, 'doctrine:swarm')).toBe(true);
  });

  it('cobra y respeta la espera a partir del segundo', () => {
    const base: Account = {
      ...newAccount('vantera'),
      ashBank: 1000,
      campaigns: 10,
      faction: { ...newAccount('vantera').faction, schismsUsed: 1, lastSchismCampaign: 9 },
    };
    expect(performSchism(base, 'tarn')).toEqual({ ok: false, reason: 'cooldown' });

    const later = { ...base, campaigns: 9 + SCHISM.cooldownCampaigns };
    const result = performSchism(later, 'tarn');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spent).toBe(SCHISM.cost);
  });

  it('rechaza cambiar a la misma facción', () => {
    expect(performSchism(newAccount('tarn'), 'tarn')).toEqual({
      ok: false,
      reason: 'same_faction',
    });
  });

  it('el renombre se reinicia pero la ceniza gastada no vuelve', () => {
    const account: Account = {
      ...newAccount('vantera'),
      ashBank: 500,
      campaigns: 20,
      faction: { ...newAccount('vantera').faction, renown: 800, schismsUsed: 1, lastSchismCampaign: 0 },
    };
    const result = performSchism(account, 'meridia');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.account.faction.renown).toBe(0);
    expect(result.account.ashBank).toBe(500 - SCHISM.cost);
  });
});

describe('concordia', () => {
  it('detecta los grupos que comparten facción', () => {
    const groups = concordanceGroups([
      { seat: 0, factionId: 'koldvik' },
      { seat: 1, factionId: 'vantera' },
      { seat: 2, factionId: 'koldvik' },
      { seat: 3, factionId: 'saranth' },
      { seat: 4, factionId: 'vantera' },
    ]);
    expect(groups).toEqual([
      { factionId: 'koldvik', seats: [0, 2] },
      { factionId: 'vantera', seats: [1, 4] },
    ]);
  });

  it('no devuelve grupos de uno', () => {
    const groups = concordanceGroups([
      { seat: 0, factionId: 'koldvik' },
      { seat: 1, factionId: 'vantera' },
    ]);
    expect(groups).toEqual([]);
  });

  it('es determinista y está ordenada por asiento', () => {
    const seats = [
      { seat: 4, factionId: 'tarn' as FactionId },
      { seat: 0, factionId: 'tarn' as FactionId },
      { seat: 2, factionId: 'oshara' as FactionId },
      { seat: 1, factionId: 'oshara' as FactionId },
    ];
    expect(concordanceGroups(seats)).toEqual([
      { factionId: 'tarn', seats: [0, 4] },
      { factionId: 'oshara', seats: [1, 2] },
    ]);
  });
});
