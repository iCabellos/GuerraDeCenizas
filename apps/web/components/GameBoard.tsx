'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BALANCE, buildAdjacency, buildWardIndex, canCross, previewAttack,
  type Buildable, type BuildingKind, type MoveOrder, type Orders, type PlayerView, type Posture,
  type ProductionOrder, type RegionId, type ResearchOrder, type Seat, type WorkOrder,
} from '@gdc/core';
import { MapView, type MapHandle } from '@/components/MapView';
import { CampaignHeader, MapControls, PhaseRail, RivalLedger, ZoneRail } from '@/components/BoardHud';
import { RegionSheet, type BuildChoice } from '@/components/RegionSheet';
import { CommitBar, OrderSlate, type BuildRow, type OrderKind, type SlateRow } from '@/components/OrderSlate';
import { ResearchPanel } from '@/components/ResearchPanel';
import {
  briefOf, buildOptions, colossusAt, districtRegions, dominantArm, homeSector, ledger,
  ownForces, sizeOf, stockAtRegion, threatened, veinAtRegion, zoneSummaries,
  type ZoneId,
} from '@/lib/board';
import { browserClient } from '@/lib/supabase-browser';

type Messages = Record<string, string>;

/**
 * El tablero en red.
 *
 * **Todo se hace tocando el mapa.** Tocas una región, sale su ficha, y lo que se puede
 * hacer allí son botones con nombre; tocas un destino resaltado y la orden queda dada. No
 * hay menús de modo, no hay formularios paralelos y ningún panel tapa el mapa: la pizarra
 * de órdenes es el índice de lo que ya decidiste, no el sitio donde se decide.
 *
 * Tres piezas de estado de juego y ninguna más, como manda `apps/web/CLAUDE.md`:
 *
 *   1. La vista del servidor — llega por props, se refresca por Realtime.
 *   2. El borrador de órdenes — un `useReducer`, y su forma es **exactamente** la que se
 *      envía a la API, sin transformación intermedia.
 *   3. Preferencias de interfaz —selección, apuntado, foco, pestaña— que no se persisten.
 *
 * **Este componente no decide nada.** Calcula un pronóstico de combate con el mismo
 * `reduce()` que el servidor, pero ese resultado no se envía ni se guarda: solo se pinta.
 * Lo que viaja son identificadores de fuerza, destino y postura; las cantidades, la
 * legalidad y el resultado los pone el servidor contra el estado autoritativo.
 */

interface Draft {
  moves: MoveOrder[];
  /**
   * Lo que se construye este turno. Sin esto el jugador podía mover pero **nunca gastar
   * Industria**, mientras los bots sí producían: doce turnos de asimetría creciente.
   */
  production: ProductionOrder[];
  /** Obras: una por región y turno. El motor lo vuelve a comprobar. */
  works: WorkOrder[];
  /** Investigación: como mucho una por turno. `null` = este turno no se investiga. */
  research: ResearchOrder | null;
}

type DraftAction =
  | { type: 'order'; forceId: string; to?: RegionId; posture: Posture; fireSupport?: RegionId }
  | { type: 'cancel'; forceId: string }
  | { type: 'produce'; regionId: RegionId; item: Buildable }
  | { type: 'unproduce'; index: number }
  | { type: 'work'; regionId: RegionId; kind: BuildingKind }
  | { type: 'unwork'; regionId: RegionId }
  | { type: 'research'; order: ResearchOrder | null }
  | { type: 'load'; moves: MoveOrder[]; production: ProductionOrder[]; works: WorkOrder[]; research: ResearchOrder | null }
  | { type: 'clear' };

/** Las órdenes de producción, agrupadas y en orden estable. */
function tidy(orders: readonly ProductionOrder[]): ProductionOrder[] {
  const byKey = new Map<string, ProductionOrder>();
  for (const order of orders) {
    const key = `${order.regionId}:${order.item}`;
    const found = byKey.get(key);
    if (found) found.qty += order.qty;
    else byKey.set(key, { ...order });
  }
  // Mismo borrador, mismo JSON: así el guardado automático no reescribe la fila por un
  // simple cambio de orden.
  return [...byKey.values()].sort(
    (a, b) => a.regionId - b.regionId || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0),
  );
}

function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'order': {
      const rest = draft.moves.filter((move) => move.forceId !== action.forceId);
      const order: MoveOrder = { forceId: action.forceId, posture: action.posture };
      if (action.to !== undefined) order.to = action.to;
      if (action.fireSupport !== undefined) order.fireSupport = action.fireSupport;
      return {
        ...draft,
        // Ordenadas por identificador: el mismo borrador produce el mismo JSON, y así
        // el guardado automático no reescribe la fila por un simple cambio de orden.
        moves: [...rest, order].sort((a, b) => (a.forceId < b.forceId ? -1 : 1)),
      };
    }
    case 'cancel':
      return { ...draft, moves: draft.moves.filter((move) => move.forceId !== action.forceId) };
    case 'produce':
      return {
        ...draft,
        production: tidy([...draft.production, { regionId: action.regionId, item: action.item, qty: 1 }]),
      };
    case 'unproduce': {
      const target = draft.production[action.index];
      if (!target) return draft;
      const next = draft.production.map((order, i) =>
        i === action.index ? { ...order, qty: order.qty - 1 } : order);
      return { ...draft, production: next.filter((order) => order.qty > 0) };
    }
    case 'work': {
      // Una obra por región: pedir dos es pedir una cola, y aquí no hay colas.
      const rest = draft.works.filter((work) => work.regionId !== action.regionId);
      return {
        ...draft,
        works: [...rest, { regionId: action.regionId, kind: action.kind }]
          .sort((a, b) => a.regionId - b.regionId || (a.kind < b.kind ? -1 : 1)),
      };
    }
    case 'unwork':
      return { ...draft, works: draft.works.filter((work) => work.regionId !== action.regionId) };
    case 'research':
      return { ...draft, research: action.order };
    case 'load':
      return {
        moves: [...action.moves].sort((a, b) => (a.forceId < b.forceId ? -1 : 1)),
        production: tidy(action.production),
        works: [...action.works].sort((a, b) => a.regionId - b.regionId || (a.kind < b.kind ? -1 : 1)),
        research: action.research,
      };
    case 'clear':
      return { moves: [], production: [], works: [], research: null };
  }
}

/**
 * El cuerpo que viaja a la API.
 *
 * Existe una sola vez a propósito: el borrador automático y el envío mandaban el mismo
 * objeto construido en dos sitios, y el día que uno de los dos se olvide de un campo la
 * diferencia es un turno que se envía a medias sin que falle nada.
 *
 * `undefined` en vez de vacío: el esquema es `strictObject` y el motor trata «ausente»
 * como «no hay», así que mandar `[]` y `null` solo engorda la fila del borrador.
 */
function ordersPayload(draft: Draft, turn: number): Orders {
  return {
    turn,
    moves: draft.moves,
    ...(draft.production.length > 0 ? { production: draft.production } : {}),
    ...(draft.works.length > 0 ? { works: draft.works } : {}),
    ...(draft.research ? { research: draft.research } : {}),
  };
}

/** Con qué fuerza se está apuntando, y a qué. */
interface Aim {
  forceId: string;
  from: RegionId;
  /**
   * `plunder` es una clase propia y no una variante de `move` a propósito: el Botín se
   * **declara antes** de tocar el destino. Que sea una decisión anunciada es lo que
   * permite prometerla —y mentir sobre ella—, que es de lo que va el juego.
   */
  kind: 'move' | 'support' | 'plunder';
}

export function GameBoard({
  messages, gameId, view, draft: savedDraft, submitted, deadlineAt,
}: {
  messages: Messages;
  gameId: string;
  view: PlayerView;
  draft: unknown;
  submitted: boolean;
  deadlineAt: string | null;
}) {
  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const template = messages[key] ?? key;
      return params
        ? template.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m))
        : template;
    },
    [messages],
  );

  const router = useRouter();
  const map = useRef<MapHandle | null>(null);
  const [selected, setSelected] = useState<RegionId | null>(null);
  const [aim, setAim] = useState<Aim | null>(null);
  const [spotlight, setSpotlight] = useState<Seat | null>(null);
  const [tab, setTab] = useState<'orders' | 'ledger' | 'research'>(
    view.phase === 'parley' ? 'ledger' : 'orders',
  );
  /**
   * Qué zona se está mirando. Empieza en el Solar, que es donde estás.
   *
   * No es un modo ni una pantalla: es **dónde está la cámara**. Cambiarla mueve el
   * encuadre, y por eso [ADR-026](../../docs/DECISIONS.md#adr-026) sigue en pie — no hay
   * peaje nuevo entre el jugador y su turno.
   */
  const [zone, setZone] = useState<ZoneId>(1);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(submitted);

  const initial = useMemo<Draft>(() => {
    const parsed = savedDraft as Orders | null;
    return {
      moves: Array.isArray(parsed?.moves) ? parsed.moves : [],
      production: Array.isArray(parsed?.production) ? tidy(parsed.production) : [],
      works: Array.isArray(parsed?.works) ? parsed.works : [],
      research: parsed?.research ?? null,
    };
  }, [savedDraft]);

  const [draft, dispatch] = useReducer(draftReducer, initial);

  const adjacency = useMemo(
    () => buildAdjacency(view.map.regions.length, view.map.edges),
    [view.map.edges, view.map.regions.length],
  );

  const forces = useMemo(() => ownForces(view), [view]);
  const rows = useMemo(() => ledger(view, adjacency), [adjacency, view]);
  const threats = useMemo(() => threatened(view, adjacency), [adjacency, view]);
  const wards = useMemo(() => buildWardIndex(view.map), [view.map]);

  /** Lo que se pinta ahora mismo. Nunca el mapa entero: 271 hexágonos no caben. */
  const district = useMemo(
    () => districtRegions(view, zone, adjacency),
    [adjacency, view, zone],
  );

  // En el Parlamento no hay combate, así que tampoco hay a dónde ir.
  const isParley = view.phase === 'parley';
  const reachable = useMemo(() => {
    if (!aim || isParley) return [];
    // Un Cerco cerrado no es un destino caro: es un destino imposible. Ofrecerlo sería
    // enseñar una regla con un rechazo del servidor, que es la peor forma de enseñarla.
    return (adjacency[aim.from] ?? []).filter(
      (to) => canCross(wards, view.gatesOpen, aim.from, to),
    );
  }, [adjacency, aim, isParley, view.gatesOpen, wards]);

  /** Las tres zonas con sus cifras: el nivel 1 del mapa, que no es un menú. */
  const zones = useMemo(
    () => zoneSummaries(view, new Set(view.visible)),
    [view],
  );

  /** Cómo se llama una región: por su terreno y su número, que es lo que existe. */
  const placeOf = useCallback(
    (regionId: RegionId): string =>
      `${t(`terrain.${view.map.regions[regionId]?.kind ?? 'plain'}`)} ${regionId}`,
    [t, view.map.regions],
  );

  const enemiesAt = useCallback(
    (regionId: RegionId) => view.forces.some((force) => !force.own && force.regionId === regionId),
    [view.forces],
  );

  /** Adónde va cada fuerza que se mueve. Lo pinta el mapa como flecha. */
  const ordered = useMemo(() => {
    const byRegion = new Map<RegionId, RegionId>();
    for (const move of draft.moves) {
      const force = forces.find((f) => f.id === move.forceId);
      if (force && move.to !== undefined) byRegion.set(force.regionId, move.to);
    }
    return byRegion;
  }, [draft.moves, forces]);

  /** Qué región apoya cada fuerza que se queda firme. Trazo discontinuo en el mapa. */
  const supports = useMemo(() => {
    const byRegion = new Map<RegionId, RegionId>();
    for (const move of draft.moves) {
      const force = forces.find((f) => f.id === move.forceId);
      if (force && move.fireSupport !== undefined) byRegion.set(force.regionId, move.fireSupport);
    }
    return byRegion;
  }, [draft.moves, forces]);

  /**
   * La pizarra: **una casilla por fuerza**, con orden o sin ella.
   *
   * El arma que se enseña es la dominante: en una pantalla de 360 px no caben tres cifras
   * por fila, y la que decide el carácter de la fuerza es la mayor. Los destinos se nombran
   * por su terreno porque las regiones **no tienen nombre** en el motor.
   */
  const slate = useMemo<SlateRow[]>(() => forces.map((force) => {
    const move = draft.moves.find((m) => m.forceId === force.id);
    let kind: OrderKind | null = null;
    let order: string | null = null;

    if (move?.to !== undefined) {
      kind = enemiesAt(move.to) ? 'attack' : 'move';
      order = t(kind === 'attack' ? 'order.attack' : 'order.move', { place: placeOf(move.to) });
    } else if (move?.fireSupport !== undefined) {
      kind = 'support';
      order = t('order.support', { place: placeOf(move.fireSupport) });
    } else if (move) {
      kind = 'hold';
      order = t('order.hold');
    }

    return {
      forceId: force.id,
      regionId: force.regionId,
      arm: dominantArm(force),
      size: sizeOf(force),
      where: placeOf(force.regionId),
      order,
      kind,
    };
  }), [draft.moves, enemiesAt, forces, placeOf, t]);

  const builds = useMemo<BuildRow[]>(
    () => draft.production.map((order) => ({
      item: order.item, qty: order.qty, where: placeOf(order.regionId),
    })),
    [draft.production, placeOf],
  );

  const brief = useMemo(
    () => (selected === null ? null : briefOf(view, selected)),
    [selected, view],
  );

  /**
   * Qué se puede construir en la región seleccionada.
   *
   * Dónde se produce lo decide `@gdc/core`, no esta pantalla: si el cliente lo
   * reimplementara, el servidor y el simulador tendrían que mantener la misma condición
   * en tres sitios y el día que cambie solo se acordarán dos.
   */
  const choices = useMemo<BuildChoice[]>(() => {
    if (!brief?.canProduce) return [];
    const industry = view.self.resources.industry;
    return (['line', 'fire', 'sky', 'fort', 'bridge'] as Buildable[]).map((item) => ({
      item,
      industry: BALANCE.production[item].industry,
      affordable: industry >= BALANCE.production[item].industry,
    }));
  }, [brief, view.self.resources.industry]);

  /**
   * El pronóstico de un ataque ya ordenado sobre la región que se está mirando.
   *
   * Sale del mismo `reduce()` que resuelve el turno, así que no puede mentir sobre las
   * reglas — pero **no se envía nunca**: es exclusivamente para pintar.
   */
  /** Qué se puede levantar aquí, con su precio. No decide nada: `reduce()` lo revisa. */
  const works = useMemo(
    () => (selected === null ? [] : buildOptions(view, selected)),
    [selected, view],
  );

  /** Lo que hay bajo el suelo de la región mirada, y lo que guarda encima. */
  const ground = useMemo(() => {
    if (selected === null) return null;
    return {
      vein: veinAtRegion(view, selected) ?? null,
      stock: stockAtRegion(view, selected),
      colossus: colossusAt(view, selected) ?? null,
      buildings: view.buildings.filter((b) => b.regionId === selected),
    };
  }, [selected, view]);

  const forecast = useMemo(() => {
    if (selected === null) return null;
    const move = draft.moves.find((m) => m.to === selected);
    if (!move) return null;
    const region = view.map.regions[selected];
    if (!region || !enemiesAt(selected)) return null;
    return previewAttack(view, move.forceId, selected, adjacency, region.kind);
  }, [adjacency, draft.moves, enemiesAt, selected, view]);

  // ── Realtime: el turno nuevo llega empujado, nunca sondeado ──────────────────
  useEffect(() => {
    // Sin credenciales no hay canal. Pasa en `/dev/board`, que monta esta misma pantalla
    // sin base de datos: una pantalla que no se puede mirar no se puede revisar.
    let supabase;
    try {
      supabase = browserClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_views', filter: `game_id=eq.${gameId}` },
        // RLS filtra el asiento aunque el filtro sea por partida: la seguridad no
        // depende de lo que pida el cliente.
        () => {
          dispatch({ type: 'clear' });
          setSent(false);
          setSelected(null);
          setAim(null);
          router.refresh();
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [gameId, router]);

  // ── Borrador con retardo: cerrar la pestaña no puede costar el trabajo hecho ──
  useEffect(() => {
    const empty = draft.moves.length === 0 && draft.production.length === 0
      && draft.works.length === 0 && draft.research === null;
    if (sent || empty) return;
    const timer = setTimeout(() => {
      void fetch(`/api/g/${gameId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordersPayload(draft, view.turn), submit: false }),
      }).catch(() => { /* un borrador perdido se reintenta al siguiente cambio */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [draft, gameId, sent, view.turn]);

  async function submit() {
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/g/${gameId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordersPayload(draft, view.turn), submit: true }),
      });
      const payload = (await response.json()) as {
        ok: boolean; code?: string; pending?: number; resolvedTurn?: number | null;
      };
      if (!payload.ok) { setError(t(`error.${payload.code ?? 'internal'}`)); return; }
      setSent(true);
      if (payload.resolvedTurn !== null) router.refresh();
    } catch {
      setError(t('error.network'));
    } finally {
      setSending(false);
    }
  }

  /** Selecciona una región y, si hay fuerza propia, arma el apuntado de movimiento. */
  const inspect = useCallback((regionId: RegionId) => {
    setSelected(regionId);
    const force = forces.find((f) => f.regionId === regionId);
    setAim(force && !isParley ? { forceId: force.id, from: regionId, kind: 'move' } : null);
  }, [forces, isParley]);

  /**
   * Un tap en el mapa. Es **la** interacción del juego.
   *
   * Si se estaba apuntando y el destino es alcanzable, la orden queda dada ahí mismo: dos
   * taps desde ver la fuerza hasta tenerla en marcha. Si no, se inspecciona la región.
   */
  function choose(regionId: RegionId) {
    if (aim && reachable.includes(regionId)) {
      dispatch(
        aim.kind === 'support'
          // El apoyo de Fuego exige postura Firme y no moverse (GDD §7.5).
          ? { type: 'order', forceId: aim.forceId, posture: 'hold', fireSupport: regionId }
          : {
            type: 'order',
            forceId: aim.forceId,
            to: regionId,
            posture: aim.kind === 'plunder' ? 'plunder' : 'assault',
          },
      );
      setAim(null);
      setSelected(regionId);
      setSpotlight(null);
      return;
    }
    if (regionId === selected) { setSelected(null); setAim(null); return; }
    inspect(regionId);
  }

  /** Lleva la cámara a una fuerza desde la pizarra y la deja lista para ordenar. */
  function pick(regionId: RegionId) {
    inspect(regionId);
    map.current?.focus(regionId);
  }

  function spot(seat: Seat | null) {
    setSpotlight(seat);
    const row = rows.find((r) => r.seat === seat);
    if (row?.bastion !== undefined) map.current?.focus(row.bastion, { bias: 0.25 });
  }

  const given = slate.filter((row) => row.order !== null).length;
  const home = view.map.bastions[view.seat];

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/*
        El mapa se queda con todo lo que sobra y **los paneles ocupan sitio de verdad**.
        Flotando encima del mapa entero, un destino resaltado podía quedar debajo de la
        hoja: se le ofrecía al jugador una casilla que no podía tocar, que es peor que no
        ofrecérsela (ROADMAP v0.2, hallazgo 3). Lo único que flota es el cromo que no
        intercepta gestos.
      */}
      <div className="relative min-h-0 flex-1">
        <MapView
          ref={map}
          view={view}
          district={district}
          selected={selected}
          reachable={reachable}
          ordered={ordered}
          supports={supports}
          spotlight={spotlight}
          threats={threats}
          label={t('a11y.map')}
          onSelect={choose}
        />

        <div className="pointer-events-none absolute inset-x-0 top-0">
          <CampaignHeader
            seat={view.seat}
            name={view.self.name}
            factionId={view.self.factionId}
            phase={view.phase}
            turn={view.turn}
            deadlineAt={deadlineAt}
            resources={view.self.resources}
            t={t}
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-24 flex items-start
          justify-between px-3"
        >
          <PhaseRail phase={view.phase} label={t('a11y.phase')} t={t} act={view.act} />
          <MapControls
            onHome={() => { if (home !== undefined) map.current?.focus(home, { bias: 0.42 }); }}
            onCore={() => map.current?.focus(view.map.coreId)}
            onZoomIn={() => map.current?.zoomBy(1.3)}
            onZoomOut={() => map.current?.zoomBy(0.77)}
            t={t}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="absolute inset-x-3 bottom-3 border border-danger/60 bg-danger/90 px-3
              py-2 text-sm"
          >
            {error}
          </p>
        )}
      </div>

      {/* Un solo panel abierto a la vez (UX_MOBILE §11): la ficha de región sustituye a la
          pizarra en vez de apilarse encima. La barra de confirmar no se va nunca. */}
      <div className="flex shrink-0 flex-col">
        {/*
          Las tres zonas. No es un menú: es el mapa alejado, y por eso enseña estado —
          cuántas regiones tienes ahí, cuántas Menas explotas, cuántas Puertas quedan— y
          no acciones. Cambiar de zona mueve la cámara y nada más.
        */}
        <ZoneRail
          zones={zones}
          active={zone}
          onZone={(next: ZoneId) => {
            setZone(next);
            setSelected(null);
            setAim(null);
            const target = next === 3
              ? view.map.coreId
              : next === 1
                ? (home ?? view.map.coreId)
                : view.map.regions.find(
                  (r) => r.zone === 2 && r.sector === homeSector(view),
                )?.id ?? view.map.coreId;
            map.current?.focus(target, { bias: 0.2 });
          }}
          t={t}
        />
        {brief ? (
          <RegionSheet
            brief={brief}
            place={placeOf(brief.id)}
            seat={view.seat}
            aiming={aim && aim.from === brief.id ? aim.kind : null}
            // La orden de la fuerza que está aquí o, si no hay, la que viene hacia aquí:
            // al tocar un destino lo primero que hay que poder leer es qué le ordenaste.
            orderText={
              slate.find((row) => row.regionId === brief.id)?.order
              ?? slate.find((row) => draft.moves.some(
                (m) => m.forceId === row.forceId
                  && (m.to === brief.id || m.fireSupport === brief.id),
              ))?.order
              ?? null
            }
            canOrder={brief.mine.length > 0 && !isParley}
            onMove={() => {
              const force = brief.mine[0];
              if (force) setAim({ forceId: force.id, from: brief.id, kind: 'move' });
            }}
            onHold={() => {
              const force = brief.mine[0];
              if (force) {
                dispatch({ type: 'order', forceId: force.id, posture: 'hold' });
                setAim(null);
              }
            }}
            onSupport={() => {
              const force = brief.mine[0];
              if (force) setAim({ forceId: force.id, from: brief.id, kind: 'support' });
            }}
            onPlunder={() => {
              const force = brief.mine[0];
              if (force) setAim({ forceId: force.id, from: brief.id, kind: 'plunder' });
            }}
            onCancel={() => {
              const force = brief.mine[0];
              if (force) dispatch({ type: 'cancel', forceId: force.id });
              setAim(null);
            }}
            builds={choices}
            onBuild={(item) => dispatch({ type: 'produce', regionId: brief.id, item })}
            works={works}
            workOrdered={draft.works.find((w) => w.regionId === brief.id)?.kind ?? null}
            onWork={(kind: BuildingKind) => dispatch({ type: 'work', regionId: brief.id, kind })}
            onUnwork={() => dispatch({ type: 'unwork', regionId: brief.id })}
            ground={ground}
            forecast={forecast}
            onClose={() => { setSelected(null); setAim(null); }}
            t={t}
          />
        ) : (
          <>
            <Tabs tab={tab} onTab={setTab} given={given} total={slate.length} t={t} />
            {tab === 'orders' && (
              <OrderSlate
                rows={slate}
                builds={builds}
                seat={view.seat}
                onPick={pick}
                onRemove={(forceId) => dispatch({ type: 'cancel', forceId })}
                onUnbuild={(index) => dispatch({ type: 'unproduce', index })}
                t={t}
              />
            )}
            {tab === 'ledger' && (
              <div className="max-h-[28dvh] overflow-y-auto bg-panel px-3 pb-2 pt-2">
                <RivalLedger rows={rows} spotlight={spotlight} onSpotlight={spot} t={t} />
              </div>
            )}
            {tab === 'research' && (
              <ResearchPanel
                view={view}
                chosen={draft.research}
                onChoose={(order) => dispatch({ type: 'research', order })}
                t={t}
              />
            )}
          </>
        )}

        <CommitBar
          canClear={given > 0 || builds.length > 0 || draft.works.length > 0 || draft.research !== null}
          onClear={() => { dispatch({ type: 'clear' }); setAim(null); }}
          onSubmit={submit}
          disabled={sending || sent}
          label={sent ? t('game.submitted') : sending ? t('game.submitting') : t('game.submit')}
          t={t}
        />
      </div>
    </div>
  );
}

/**
 * Órdenes o reparto.
 *
 * El reparto no está escondido en un menú porque **es la mitad del juego**: quién va
 * delante decide con quién se habla. Y en el Parlamento entra abierto, que es el turno en
 * el que no se puede mover y sí se puede negociar.
 */
type Tab = 'orders' | 'ledger' | 'research';

const TAB_LABEL: Record<Tab, string> = {
  orders: 'orders.title',
  ledger: 'ledger.title',
  research: 'research.title',
};

function Tabs({
  tab, onTab, given, total, t,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  /** Cuántas fuerzas tienen orden, de cuántas. Va en la pestaña: se lee sin abrirla. */
  given: number;
  total: number;
  t: (key: string) => string;
}) {
  return (
    <div role="tablist" className="flex border-t border-line bg-panel">
      {(['orders', 'ledger', 'research'] as const).map((key) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => onTab(key)}
          className={`type-label flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 ${
            tab === key ? 'border-b-rust !text-rust' : 'border-b-transparent'
          }`}
        >
          {t(TAB_LABEL[key])}
          {key === 'orders' && (
            <span className="type-figure text-xs">
              <span className={given === total ? 'text-success' : 'text-ink'}>{given}</span>
              <span className="text-faint">/{total}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
