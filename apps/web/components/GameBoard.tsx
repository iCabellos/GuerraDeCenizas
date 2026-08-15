'use client';

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  buildAdjacency, previewAttack, type MoveOrder, type Orders, type PlayerView,
  type Posture, type RegionId,
} from '@gdc/core';
import { MapView } from '@/components/MapView';
import { CombatPreview } from '@/components/CombatPreview';
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
}

type DraftAction =
  | { type: 'order'; forceId: string; to?: RegionId; posture: Posture }
  | { type: 'cancel'; forceId: string }
  | { type: 'load'; moves: MoveOrder[] }
  | { type: 'clear' };

function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case 'order': {
      const rest = draft.moves.filter((move) => move.forceId !== action.forceId);
      return {
        moves: [...rest, { forceId: action.forceId, to: action.to, posture: action.posture }]
          // Ordenadas por identificador: el mismo borrador produce el mismo JSON, y así
          // el guardado automático no reescribe la fila por un simple cambio de orden.
          .sort((a, b) => (a.forceId < b.forceId ? -1 : 1)),
      };
    }
    case 'cancel':
      return { moves: draft.moves.filter((move) => move.forceId !== action.forceId) };
    case 'load':
      return { moves: [...action.moves].sort((a, b) => (a.forceId < b.forceId ? -1 : 1)) };
    case 'clear':
      return { moves: [] };
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
    return { moves: Array.isArray(parsed?.moves) ? parsed.moves : [] };
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
    if (sent || draft.moves.length === 0) return;
    const timer = setTimeout(() => {
      void fetch(`/api/games/${gameId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: { turn: view.turn, moves: draft.moves }, submit: false }),
      }).catch(() => { /* un borrador perdido se reintenta al siguiente cambio */ });
    }, 2000);
    return () => clearTimeout(timer);
  }, [draft.moves, gameId, sent, view.turn]);

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
      const response = await fetch(`/api/games/${gameId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: { turn: view.turn, moves: draft.moves }, submit: true }),
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
    <div className="flex h-dvh flex-col">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <span className="text-base text-ink">{t('game.turn', { turn: view.turn })}</span>
        <span className="text-xs uppercase tracking-wide text-muted">
          {t(`game.${view.phase}`)}
          {deadlineAt ? ` · ${new Date(deadlineAt).toLocaleTimeString()}` : ''}
        </span>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <MapView
          view={view}
          selected={selected}
          reachable={reachable}
          ordered={ordered}
          onSelect={choose}
        />

        {/* Panel flotante: `pointer-events-none` en el contenedor y `auto` solo en los
            controles. Hacerlo más pequeño no resuelve nada — siempre queda una región
            tocable debajo, y eso ya hizo imposible mover a un destino en v0.1. */}
        {preview && (
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
        )}
      </div>

      <footer className="flex flex-col gap-2 border-t border-line px-4 py-3">
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={sending || sent}
          className="min-h-14 w-full rounded-sharp bg-rust px-4 text-base font-medium text-void disabled:bg-line disabled:text-faint"
        >
          {sent ? t('game.submitted') : sending ? t('game.submitting') : t('game.submit')}
        </button>
      </footer>
    </div>
  );
}
