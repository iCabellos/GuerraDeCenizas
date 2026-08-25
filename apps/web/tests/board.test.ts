/**
 * Las cuentas de la pantalla de campaña.
 *
 * Antes vivían dentro de tres componentes de React y no había forma de probarlas sin
 * montar un navegador: quién manda en qué, dónde está el enemigo y qué se puede hacer en
 * una región se comprobaban mirando la pantalla. Aquí son funciones puras sobre una
 * `PlayerView` de verdad —`createGame` + `reduce` + `projectViews`, el motor entero— y lo
 * que se fija es la **intención**, no las constantes: un test que comparase
 * `regions === 12` bendeciría cualquier reparto en cuanto cambiara el generador.
 */

import { describe, expect, it } from 'vitest';
import {
  ENGINE_VERSION, botOrders, botProfile, buildAdjacency, createGame, projectViews, reduce,
  type OrdersBySeat, type PlayerView, type Seat,
} from '@gdc/core';
import {
  MAX_DISTRICT, briefOf, buildOptions, districtRegions, dominantArm, homeSector, ledger,
  ownForces, sizeOf, threatened, zoneSummaries,
} from '../lib/board';

const SEED = 424242;

/** Una partida de tres jugada por bots: el mapa, la niebla y el frente son los de verdad. */
function played(turns: number): { view: PlayerView; adjacency: ReturnType<typeof buildAdjacency> } {
  let state = createGame({
    gameId: '00000000-0000-4000-8000-0000000000b0',
    seed: SEED,
    players: 3,
    seats: [
      { name: 'Kael', factionId: 'vantera' },
      { name: 'Bren', factionId: 'koldvik' },
      { name: 'Ysolde', factionId: 'saranth' },
    ],
  }).state;

  for (let round = 0; round < turns; round += 1) {
    const adjacency = buildAdjacency(state.map.regions.length, state.map.edges);
    const views = projectViews(state);
    const bySeat: OrdersBySeat = {};
    for (const seat of [0, 1, 2] as Seat[]) {
      const view = views[seat];
      if (view) bySeat[seat] = botOrders(view, adjacency, botProfile(SEED, seat), SEED);
    }
    state = reduce(state, bySeat, { engineVersion: ENGINE_VERSION, now: 0 }).state;
  }

  const view = projectViews(state)[0]!;
  return { view, adjacency: buildAdjacency(view.map.regions.length, view.map.edges) };
}

describe('fuerzas propias', () => {
  const { view } = played(5);

  it('solo devuelve las tuyas', () => {
    expect(ownForces(view).every((force) => force.own)).toBe(true);
    expect(ownForces(view).every((force) => force.seat === view.seat)).toBe(true);
  });

  it('el orden es estable: la pizarra no baila entre renders', () => {
    expect(ownForces(view).map((f) => f.id)).toEqual(ownForces(view).map((f) => f.id));
  });

  it('el arma dominante es la mayor de las tres', () => {
    for (const force of ownForces(view)) {
      const counts = { line: force.line ?? 0, fire: force.fire ?? 0, sky: force.sky ?? 0 };
      expect(counts[dominantArm(force)]).toBe(Math.max(...Object.values(counts)));
    }
  });

  it('el tamaño de una fuerza propia es la suma exacta de sus armas', () => {
    for (const force of ownForces(view)) {
      expect(sizeOf(force)).toBe((force.line ?? 0) + (force.fire ?? 0) + (force.sky ?? 0));
    }
  });

  it('de una fuerza ajena sin desglose se usa el tamaño aproximado', () => {
    const hidden = view.forces.find((force) => !force.own && force.line === null);
    // Puede no haber ninguna en este turno; si la hay, no puede devolver 0 por sumar nulos.
    if (hidden) expect(sizeOf(hidden)).toBe(hidden.approxTotal);
  });
});

describe('ficha de región', () => {
  const { view } = played(5);
  const bastion = view.map.bastions[view.seat]!;

  it('el Bastión propio es tuyo, produce y lleva tu asiento', () => {
    const brief = briefOf(view, bastion)!;
    expect(brief.kind).toBe('bastion');
    expect(brief.bastionOf).toBe(view.seat);
    expect(brief.owner).toBe(view.seat);
    expect(brief.canProduce).toBe(true);
  });

  it('en una llanura no se produce, por muy tuya que sea', () => {
    const plain = view.map.regions.find(
      (region) => region.kind === 'plain' && view.control[region.id] === view.seat,
    );
    if (plain) expect(briefOf(view, plain.id)!.canProduce).toBe(false);
  });

  it('separa tus fuerzas de las ajenas y no cuenta ninguna dos veces', () => {
    for (const region of view.map.regions) {
      const brief = briefOf(view, region.id)!;
      expect(brief.mine.every((force) => force.own)).toBe(true);
      expect(brief.enemies.every((force) => !force.own)).toBe(true);
      expect(brief.mine.length + brief.enemies.length).toBe(
        view.forces.filter((force) => force.regionId === region.id).length,
      );
    }
  });

  it('una región que no existe no revienta la pantalla', () => {
    expect(briefOf(view, 9999)).toBeNull();
  });
});

describe('reparto', () => {
  const { view, adjacency } = played(6);
  const rows = ledger(view, adjacency);

  it('hay una fila por asiento y solo una es la tuya', () => {
    expect(rows).toHaveLength(view.opponents.length + 1);
    expect(rows.filter((row) => row.own)).toHaveLength(1);
    expect(rows.find((row) => row.own)!.seat).toBe(view.seat);
  });

  it('las regiones de cada asiento suman las regiones con dueño', () => {
    // El control territorial es público (GDD §6.2): esta suma tiene que cuadrar sin
    // niebla de por medio, o el reparto estaría mintiendo sobre quién va ganando.
    const owned = view.control.filter((owner) => owner !== null).length;
    expect(rows.reduce((total, row) => total + row.regions, 0)).toBe(owned);
  });

  it('va ordenado por territorio, y el desempate no es al azar', () => {
    for (let i = 1; i < rows.length; i += 1) {
      const before = rows[i - 1]!;
      const after = rows[i]!;
      expect(
        before.regions > after.regions
        || (before.regions === after.regions && before.seams >= after.seams),
      ).toBe(true);
    }
    expect(ledger(view, adjacency).map((row) => row.seat))
      .toEqual(ledger(view, adjacency).map((row) => row.seat));
  });

  it('solo un asiento puede tener el Núcleo', () => {
    expect(rows.filter((row) => row.core).length).toBeLessThanOrEqual(1);
  });

  it('la frontera de un rival son regiones suyas que tocan una tuya', () => {
    for (const row of rows.filter((r) => !r.own)) {
      let counted = 0;
      for (let regionId = 0; regionId < view.control.length; regionId += 1) {
        if (view.control[regionId] !== row.seat) continue;
        if ((adjacency[regionId] ?? []).some((other) => view.control[other] === view.seat)) {
          counted += 1;
        }
      }
      expect(row.contact).toBe(counted);
    }
  });

  it('sin frontera con nadie, nadie tiene frontera contigo', () => {
    // La frontera es una relación simétrica entre territorios: si ningún rival toca lo
    // tuyo, tú no puedes estar tocando lo de nadie. Es lo que hace que la tabla se pueda
    // leer como el mapa de quién puede atacarte mañana.
    const mine = rows.find((row) => row.own)!;
    const rivals = rows.filter((row) => !row.own).reduce((total, row) => total + row.contact, 0);
    expect(mine.contact === 0).toBe(rivals === 0);
  });
});

describe('amenazas', () => {
  const { view, adjacency } = played(6);

  it('marca regiones tuyas y solo tuyas', () => {
    for (const regionId of threatened(view, adjacency)) {
      expect(view.control[regionId]).toBe(view.seat);
    }
  });

  it('una región marcada tiene enemigo al lado, y una sin marcar no', () => {
    const enemyAt = new Set(view.forces.filter((f) => !f.own).map((f) => f.regionId));
    const marked = threatened(view, adjacency);
    for (let regionId = 0; regionId < view.control.length; regionId += 1) {
      if (view.control[regionId] !== view.seat) continue;
      const touches = (adjacency[regionId] ?? []).some((other) => enemyAt.has(other));
      expect(marked.has(regionId), `región ${regionId}`).toBe(touches);
    }
  });
});

// ─────────────────────── Zonas: recorrer sin pasarse del DOM ──────────────────

describe('el distrito acota lo que se pinta', () => {
  it('nunca pasa del presupuesto de render, con ningún número de jugadores', () => {
    // Ésta es LA propiedad de [ADR-042]: el mapa triplicó y el presupuesto no se relaja.
    // Si algún día una zona crece por encima del tope, este test lo dice antes de que un
    // jugador se encuentre 271 hexágonos de 12 px en un móvil.
    for (const players of [2, 3, 5] as const) {
      const state = createGame({
        gameId: '00000000-0000-4000-8000-0000000000c0',
        seed: 91,
        players,
        seats: Array.from({ length: players }, (_, i) => ({
          name: `P${i}`,
          factionId: (['vantera', 'koldvik', 'saranth', 'meridia', 'oshara'] as const)[i]!,
        })),
      }).state;
      const view = projectViews(state)[0] as PlayerView;
      const adjacency = buildAdjacency(view.map.regions.length, view.map.edges);

      for (const zone of [1, 2, 3] as const) {
        const district = districtRegions(view, zone, adjacency);
        expect(district.size).toBeGreaterThan(0);
        expect(district.size).toBeLessThanOrEqual(MAX_DISTRICT);
      }
    }
  });

  it('el Solar que se pinta es el TUYO, no la zona 1 entera', () => {
    // La zona 1 son los cinco Solares: 165 regiones con cinco jugadores. La de los demás
    // no es tu partida; su frontera sí, y por eso el distrito la incluye.
    const { view, adjacency } = played(3);
    const district = districtRegions(view, 1, adjacency);
    const mine = view.map.regions.filter(
      (r) => r.zone === 1 && r.sector === homeSector(view),
    );

    for (const region of mine) expect(district.has(region.id)).toBe(true);
    const wholeZone = view.map.regions.filter((r) => r.zone === 1).length;
    expect(district.size).toBeLessThan(wholeZone);
  });

  it('las cifras de las tres zonas cuadran con el mapa', () => {
    const { view } = played(3);
    const zones = zoneSummaries(view, new Set(view.visible));

    expect(zones.map((z) => z.zone)).toEqual([1, 2, 3]);
    const total = zones.reduce((sum, z) => sum + z.total, 0);
    expect(total).toBe(view.map.regions.length);

    // Todas las Puertas empiezan cerradas, así que la Corona no es alcanzable todavía.
    const crown = zones.find((z) => z.zone === 3)!;
    expect(crown.gates).toBeGreaterThan(0);
  });
});

describe('lo que se puede construir', () => {
  it('la Extractora solo se ofrece donde hay Mena', () => {
    const { view } = played(3);
    const bastion = view.map.bastions[view.seat]!;

    // Todo Bastión se funda sobre una veta: ahí siempre hay Extractora que subir.
    expect(buildOptions(view, bastion).some((o) => o.kind === 'extractor')).toBe(true);

    const barren = view.map.regions.find(
      (r) => view.control[r.id] === view.seat
        && !view.map.veins.some((v) => v.regionId === r.id),
    );
    if (barren) {
      expect(buildOptions(view, barren.id).some((o) => o.kind === 'extractor')).toBe(false);
    }
  });

  it('en una región ajena no se ofrece nada', () => {
    const { view } = played(3);
    const theirs = view.map.regions.find(
      (r) => view.control[r.id] !== null && view.control[r.id] !== view.seat,
    );
    if (theirs) expect(buildOptions(view, theirs.id)).toEqual([]);
  });

  it('el techo de la Fundición se enseña, no se esconde', () => {
    const { view } = played(3);
    const bastion = view.map.bastions[view.seat]!;
    // Sin Fundición, cualquier nivel 2 está bloqueado — y la ficha tiene que decirlo en
    // vez de ofrecer un botón que el servidor va a rechazar.
    for (const option of buildOptions(view, bastion)) {
      if (option.kind !== 'foundry' && option.target !== null && option.target > 1) {
        expect(option.blocked).toBe(true);
      }
    }
  });
});
