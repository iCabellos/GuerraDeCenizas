'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BALANCE, buildAdjacency, canProduceInView, previewAttack,
  type Buildable, type MoveOrder, type Orders, type PlayerView, type Posture,
  type ProductionOrder, type RegionId,
} from '@gdc/core';
import { MapView } from '@/components/MapView';
import {
  OrderSheet, PhaseRail, type BuildOption, type BuildRow, type OrderRow,
} from '@/components/OrderSheet';
import { CombatPreview } from '@/components/CombatPreview';
import { CommandHeader, OrderBar, OrderCommit } from '@/components/GameChrome';
import { browserClient } from '@/lib/supabase-browser';

type Messages = Record<string, string>;

/**
 * El tablero en red.
 *
 * Tres piezas de estado y ninguna más, como manda `apps/web/CLAUDE.md`:
 *
 *   1. La vista del servidor — llega por props, se refresca por Realtime.
 *   2. El borrador de órdenes — un `useReducer`, y su forma es **exactamente** la que se
 *      envía a la API, sin transformación intermedia.
 *   3. Preferencias de interfaz — nada de esto se persiste como estado de juego.
 *
 * **Este componente no decide nada.** Calcula una previsualización de combate con el
 * mismo `reduce()` que el servidor, pero ese resultado no se envía ni se guarda: solo se
 * pinta. Lo que viaja son identificadores de fuerza, destino y postura; las cantidades,
 * la legalidad y el resultado los pone el servidor contra el estado autoritativo.
 */

interface Draft {
  moves: MoveOrder[];
  /**
   * Lo que se construye este turno. Sin esto el jugador podía mover pero **nunca gastar
   * Industria**, mientras los bots sí producían: doce turnos de asimetría creciente.
   */
  production: ProductionOrder[];
}

type DraftAction =
  | { type: 'order'; forceId: string; to?: RegionId; posture: Posture }
  | { type: 'cancel'; forceId: string }
  | { type: 'produce'; regionId: RegionId; item: Buildable }
  | { type: 'unproduce'; index: number }
  | { type: 'load'; moves: MoveOrder[]; production: ProductionOrder[] }
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
      return {
        ...draft,
        moves: [...rest, { forceId: action.forceId, to: action.to, posture: action.posture }]
          // Ordenadas por identificador: el mismo borrador produce el mismo JSON, y así
          // el guardado automático no reescribe la fila por un simple cambio de orden.
          .sort((a, b) => (a.forceId < b.forceId ? -1 : 1)),
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
    case 'load':
      return {
        moves: [...action.moves].sort((a, b) => (a.forceId < b.forceId ? -1 : 1)),
        production: tidy(action.production),
      };
    case 'clear':
      return { moves: [], production: [] };
  }
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
  const [selected, setSelected] = useState<RegionId | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(submitted);

  const initial = useMemo<Draft>(() => {
    const parsed = savedDraft as Orders | null;
    return {
      moves: Array.isArray(parsed?.moves) ? parsed.moves : [],
      production: Array.isArray(parsed?.production) ? tidy(parsed.production) : [],
    };
  }, [savedDraft]);

  const [draft, dispatch] = useReducer(draftReducer, initial);

  const adjacency = useMemo(
    () => buildAdjacency(view.map.regions.length, view.map.edges),
    [view.map.edges, view.map.regions.length],
  );

  const ownForces = useMemo(() => view.forces.filter((force) => force.own), [view.forces]);
  const selectedForce = useMemo(
    () => ownForces.find((force) => force.regionId === selected) ?? null,
    [ownForces, selected],
  );

  // En el Parlamento no hay combate, así que tampoco hay a dónde ir.
  const isParley = view.phase === 'parley';
  const reachable = selectedForce && !isParley ? (adjacency[selectedForce.regionId] ?? []) : [];

  const ordered = useMemo(() => {
    const map = new Map<RegionId, RegionId>();
    for (const move of draft.moves) {
      const force = ownForces.find((f) => f.id === move.forceId);
      if (force && move.to !== undefined) map.set(force.regionId, move.to);
    }
    return map;
  }, [draft.moves, ownForces]);

  /** Cómo se llama una región: por su terreno y su número, que es lo que existe. */
  const placeOf = useCallback(
    (regionId: RegionId): string =>
      `${t(`terrain.${view.map.regions[regionId]?.kind ?? 'plain'}`)} ${regionId}`,
    [t, view.map.regions],
  );

  /**
   * Las órdenes del borrador, ya resueltas a texto.
   *
   * El arma que se enseña es la dominante de la fuerza: en una pantalla de 360 px no
   * caben tres cifras por fila, y la que decide el carácter del movimiento es la mayor.
   * El destino se nombra por su terreno porque las regiones **no tienen nombre** en el
   * motor — el mockup se los inventaba.
   */
  const orderRows = useMemo<OrderRow[]>(() => {
    const rows: OrderRow[] = [];
    for (const move of draft.moves) {
      const force = ownForces.find((f) => f.id === move.forceId);
      if (!force || move.to === undefined) continue;
      const region = view.map.regions[move.to];
      if (!region) continue;
      // La vista tipa las cifras como anulables porque de una fuerza ajena puede no
      // saberse la composición. Éstas son propias, así que el `?? 0` no oculta nada:
      // es lo que hay que pintar si el motor alguna vez devolviera un hueco.
      const arms = [
        { arm: 'line' as const, count: force.line ?? 0 },
        { arm: 'fire' as const, count: force.fire ?? 0 },
        { arm: 'sky' as const, count: force.sky ?? 0 },
      ].sort((a, b) => b.count - a.count);
      const top = arms[0] ?? { arm: 'line' as const, count: 0 };
      rows.push({
        forceId: force.id,
        arm: top.arm,
        count: top.count,
        to: placeOf(region.id),
      });
    }
    return rows;
  }, [draft.moves, ownForces, placeOf]);

  /**
   * Qué se puede construir en la región seleccionada.
   *
   * Dónde se produce lo decide `@gdc/core`, no esta pantalla: si el cliente lo
   * reimplementara, el servidor y el simulador tendrían que mantener la misma condición
   * en tres sitios y el día que cambie solo se acordarán dos.
   */
  const options = useMemo<BuildOption[]>(() => {
    if (selected === null || !canProduceInView(view, selected)) return [];
    const industry = view.self.resources.industry;
    return (['line', 'fire', 'sky', 'fort', 'bridge'] as Buildable[]).map((item) => ({
      item,
      industry: BALANCE.production[item].industry,
      affordable: industry >= BALANCE.production[item].industry,
    }));
  }, [selected, view]);

  const builds = useMemo<BuildRow[]>(
    () => draft.production.map((order) => ({
      item: order.item, qty: order.qty, where: placeOf(order.regionId),
    })),
    [draft.production, placeOf],
  );

  // ── Realtime: el turno nuevo llega empujado, nunca sondeado ──────────────────
  useEffect(() => {
    const supabase = browserClient();
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_views', filter: `game_id=eq.${gameId}` },
        // RLS filtra el asiento aunque el filtro sea por partida: la seguridad no
        // depende de lo que pida el cliente.
        () => { dispatch({ type: 'clear' }); setSent(false); router.refresh(); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [gameId, router]);

  // ── Borrador con retardo: cerrar la pestaña no puede costar el trabajo hecho ──
  useEffect(() => {
    if (sent || (draft.moves.length === 0 && draft.production.length === 0)) return;
    const timer = setTimeout(() => {
      void fetch(`/api/g/${gameId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: { turn: view.turn, moves: draft.moves, production: draft.production },
          submit: false,
        }),
      }).catch(() => { /* un borrador perdido se reintenta al siguiente cambio */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [draft.moves, draft.production, gameId, sent, view.turn]);

  const preview = useMemo(() => {
    if (!selectedForce || selected === null) return null;
    const move = draft.moves.find((m) => m.forceId === selectedForce.id);
    if (!move?.to) return null;
    const region = view.map.regions[move.to];
    if (!region) return null;
    return previewAttack(view, selectedForce.id, move.to, adjacency, region.kind);
  }, [adjacency, draft.moves, selected, selectedForce, view]);

  async function submit() {
    setSending(true);
    setError('');
    try {
      const response = await fetch(`/api/g/${gameId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: { turn: view.turn, moves: draft.moves, production: draft.production },
          submit: true,
        }),
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

  function choose(regionId: RegionId) {
    if (selectedForce && reachable.includes(regionId)) {
      dispatch({ type: 'order', forceId: selectedForce.id, to: regionId, posture: 'assault' });
      setSelected(regionId);
      return;
    }
    setSelected(regionId === selected ? null : regionId);
  }

  return (
    <div className="relative h-dvh overflow-hidden">
      {/* El mapa va a sangre y todo lo demás flota encima, como en el diseño. */}
      <div className="absolute inset-0">
        <MapView
          view={view}
          selected={selected}
          reachable={reachable}
          ordered={ordered}
          onSelect={choose}
        />
      </div>

      {/* Velo superior: sin él la cabecera compite con las regiones de arriba. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44
        bg-gradient-to-b from-void/90 to-transparent" />

      <div className="absolute inset-x-0 top-0">
        <CommandHeader
          floating
          seat={view.seat}
          name={view.self.name}
          factionId={view.self.factionId}
          doctrine={deadlineAt ? new Date(deadlineAt).toLocaleTimeString() : ''}
          phase={t(`game.${view.phase}`)}
          turn={t('game.turn', { turn: view.turn })}
          regions={view.control.filter((owner) => owner === view.seat).length}
          regionsLabel=""
          resources={view.self.resources}
        />
      </div>

      {/* Raíl de fases. No intercepta gestos: es un indicador, no un control. */}
      <div className="absolute left-3 top-32">
        <PhaseRail phase={view.phase} label={t('a11y.phase')} t={t} />
      </div>

      {/* Un solo panel abierto a la vez: la previsualización de combate sustituye a la
          hoja de órdenes en vez de apilarse encima (UX_MOBILE §11). */}
      {preview ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-3">
          <div className="pointer-events-auto">
            <CombatPreview
              preview={preview}
              seat={view.seat}
              onConfirm={() => setSelected(null)}
              onCancel={() => {
                if (selectedForce) dispatch({ type: 'cancel', forceId: selectedForce.id });
                setSelected(null);
              }}
            />
          </div>
        </div>
      ) : (
        <OrderSheet
          orders={orderRows}
          builds={builds}
          options={options}
          onRemove={(forceId) => dispatch({ type: 'cancel', forceId })}
          onClear={() => dispatch({ type: 'clear' })}
          onProduce={(item) => {
            if (selected !== null) {
              dispatch({ type: 'produce', regionId: selected, item: item as Buildable });
            }
          }}
          onUnproduce={(index) => dispatch({ type: 'unproduce', index })}
          t={t}
          primary={
            <OrderCommit onClick={submit} disabled={sending || sent}>
              {sent ? t('game.submitted') : sending ? t('game.submitting') : t('game.submit')}
            </OrderCommit>
          }
        />
      )}

      {error && (
        <p
          role="alert"
          className="absolute inset-x-0 top-24 mx-3 rounded-sharp border border-danger/60
            bg-danger/15 px-3 py-2 text-sm backdrop-blur-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
