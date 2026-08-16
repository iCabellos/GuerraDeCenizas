'use client';

import { useMemo, useReducer, useState } from 'react';
import {
  BALANCE, ENGINE_VERSION, FACTION_IDS, buildAdjacency, createGame, previewAttack, reduce,
  type Buildable, type CombatPreview as Preview, type FactionId, type GameState,
  type MoveOrder, type OrdersBySeat, type PlayerCount, type PlayerView,
  type ProductionOrder, type RegionId, type Seat,
} from '@gdc/core';
import { MapView } from './MapView';
import {
  CommandHeader, FactionEmblem, OrderBar, OrderCommit, OrderTool,
} from './GameChrome';
import { Command, Masthead, Screen } from './ui/Shell';
import { Back, Industry, Intel } from './art/generated';
import { CombatPreview } from './CombatPreview';
import {
  BUILDABLE_NAME, DOCTRINE_NAME, EVENT_TEXT, FACTION_NAME, POSTURE_NAME, RESOURCE_LABEL,
  TERRAIN_NAME, seatColor,
} from '@/lib/theme';

/**
 * Prototipo v0.1 — hot seat local.
 *
 * Cada asiento redacta sus órdenes por turno y pasa el dispositivo; cuando han pasado
 * todos, se resuelven **a la vez** con el mismo `reduce()` que ejecutará el servidor en
 * v0.3. Aquí no hay autoridad ni secreto real: el objetivo es validar el modelo de mapa
 * y de turno, no la seguridad. Ver apps/web/CLAUDE.md.
 */

type Screen = { kind: 'setup' } | { kind: 'play' } | { kind: 'handoff' };

interface Draft {
  moves: MoveOrder[];
  production: ProductionOrder[];
}

interface Session {
  state: GameState;
  seat: Seat;
  drafts: Partial<Record<Seat, Draft>>;
  /** Log del último turno resuelto, por asiento y ya filtrado por el motor. */
  log: Partial<Record<Seat, string[]>>;
}

const NAMES = ['Ash', 'Bors', 'Cira', 'Dov', 'Enna'];
const CTX = { engineVersion: ENGINE_VERSION, now: 0 };

export function PrototypeGame() {
  const [screen, setScreen] = useState<Screen>({ kind: 'setup' });
  const [session, setSession] = useState<Session | null>(null);

  if (screen.kind === 'setup' || !session) {
    return (
      <Setup
        onStart={(players, seed, factions) => {
          const { state } = createGame({
            gameId: `local-${seed}`,
            seed,
            players,
            seats: Array.from({ length: players }, (_, i) => ({
              name: NAMES[i] as string,
              factionId: factions[i] as FactionId,
            })),
          });
          setSession({ state, seat: 0, drafts: {}, log: {} });
          setScreen({ kind: 'play' });
        }}
      />
    );
  }

  if (screen.kind === 'handoff') {
    return (
      <Handoff
        seat={session.seat}
        name={session.state.seats[session.seat]?.name ?? ''}
        onReady={() => setScreen({ kind: 'play' })}
      />
    );
  }

  return (
    <Board
      session={session}
      onSubmitSeat={(draft) => {
        const drafts = { ...session.drafts, [session.seat]: draft };
        const players = session.state.meta.playerCount;

        if (session.seat < players - 1) {
          setSession({ ...session, drafts, seat: (session.seat + 1) as Seat });
          setScreen({ kind: 'handoff' });
          return;
        }

        const orders: OrdersBySeat = {};
        for (let s = 0; s < players; s++) {
          const d = drafts[s as Seat];
          orders[s as Seat] = {
            turn: session.state.meta.turn,
            moves: d?.moves ?? [],
            production: d?.production ?? [],
          };
        }
        const result = reduce(session.state, orders, CTX);

        // El log se guarda ya filtrado por el motor: la interfaz no esconde nada,
        // simplemente no recibe lo que no le toca.
        const log: Partial<Record<Seat, string[]>> = {};
        for (let s = 0; s < players; s++) {
          log[s as Seat] = result.views[s as Seat].events.map((e) =>
            describeEvent(e.type, e.data),
          );
        }

        setSession({ state: result.state, seat: 0, drafts: {}, log });
        setScreen({ kind: 'handoff' });
      }}
      onReset={() => {
        setSession(null);
        setScreen({ kind: 'setup' });
      }}
    />
  );
}

// ─────────────────────────────────── Setup ────────────────────────────────────

function Setup({
  onStart,
}: {
  onStart: (players: PlayerCount, seed: number, factions: FactionId[]) => void;
}) {
  const [players, setPlayers] = useState<PlayerCount>(5);
  const [seed, setSeed] = useState(4242);

  const factions = useMemo(
    () => Array.from({ length: players }, (_, i) => FACTION_IDS[i % FACTION_IDS.length] as FactionId),
    [players],
  );

  return (
    <Screen>
      <Masthead subtitle={`prototipo local · motor ${ENGINE_VERSION}`} />

      <section className="mt-8 flex flex-col gap-3">
        <p className="type-label">Jugadores</p>
        <div className="grid grid-cols-3 gap-2">
          {([2, 3, 5] as PlayerCount[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayers(n)}
              aria-pressed={players === n}
              className={`type-figure min-h-14 rounded-sharp border text-lg transition-colors
                duration-150 ease-out ${
                  players === n
                    ? 'border-rust bg-rust/12 text-ink'
                    : 'border-line bg-raised text-muted hover:border-faint'
                }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-3">
        <p className="type-label">Semilla</p>
        <div className="flex gap-2">
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
            className="type-figure min-h-14 flex-1 rounded-sharp border border-line bg-raised px-4
              text-lg text-ink focus:border-rust focus:outline-none"
            aria-label="Semilla del mapa"
          />
          <button
            type="button"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
            className="type-label min-h-14 rounded-sharp border border-line bg-raised px-4
              hover:border-faint hover:text-ink"
          >
            Azar
          </button>
        </div>
        <p className="text-xs leading-relaxed text-muted">
          La misma semilla produce siempre el mismo mapa. Reproducible entre sesiones.
        </p>
      </section>

      <section className="mt-6 flex flex-col gap-2">
        <p className="type-label">Facciones</p>
        <ul className="flex flex-col gap-2">
          {factions.map((faction, index) => (
            <li
              key={index}
              className="registered flex min-h-14 items-center gap-3 rounded-sharp border
                border-line bg-panel px-3"
            >
              {/* Barra de color + emblema. Nunca solo color: quien no distinga rojo de
                  verde tiene que poder jugar igual. */}
              <span
                className="h-8 w-1 shrink-0"
                style={{ background: seatColor(index as Seat) }}
                aria-hidden
              />
              <FactionEmblem factionId={faction} size={22} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="type-title block text-sm text-ink">{NAMES[index]}</span>
                <span className="type-label block !tracking-wider">{FACTION_NAME[faction]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-auto pt-8">
        <Command onClick={() => onStart(players, seed, factions)}>Empezar campaña</Command>
      </div>
    </Screen>
  );
}

// ────────────────────────────────── Handoff ───────────────────────────────────

function Handoff({ seat, name, onReady }: { seat: Seat; name: string; onReady: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center">
      <p className="text-xs uppercase tracking-widest text-muted">Pasa el dispositivo a</p>
      <p className="text-4xl font-bold" style={{ color: seatColor(seat) }}>
        {name}
      </p>
      <p className="max-w-xs text-sm text-faint">
        En v0.1 la niebla de guerra se respeta por asiento, pero el secreto es de
        cortesía: el estado vive en este navegador. La autoridad real llega en v0.3.
      </p>
      <button
        type="button"
        onClick={onReady}
        className="min-h-14 w-full max-w-xs rounded-sharp bg-rust text-lg font-bold text-void"
      >
        Estoy listo
      </button>
    </main>
  );
}

// ─────────────────────────────────── Board ────────────────────────────────────

function Board({
  session,
  onSubmitSeat,
  onReset,
}: {
  session: Session;
  onSubmitSeat: (draft: Draft) => void;
  onReset: () => void;
}) {
  const { state, seat } = session;

  // La vista del asiento se proyecta con el propio motor: la interfaz nunca ve el
  // estado completo, ni siquiera en el prototipo.
  const view: PlayerView = useMemo(() => reduce(state, {}, CTX).views[seat], [state, seat]);
  const adjacency = useMemo(
    () => buildAdjacency(state.map.regions.length, state.map.edges),
    [state.map],
  );

  const [draft, dispatch] = useReducer(draftReducer, { moves: [], production: [] });
  const [selected, setSelected] = useState<RegionId | null>(null);
  const [pending, setPending] = useState<{ preview: Preview; move: MoveOrder } | null>(null);
  const [panel, setPanel] = useState<'none' | 'build' | 'log'>('none');

  const myForces = view.forces.filter((f) => f.own);
  const selectedForce = selected === null ? undefined : myForces.find((f) => f.regionId === selected);

  const isParley = state.meta.phase === 'parley';
  const reachable = selectedForce && !isParley ? (adjacency[selectedForce.regionId] ?? []) : [];

  const orderedArrows = useMemo(() => {
    const map = new Map<RegionId, RegionId>();
    for (const move of draft.moves) {
      const force = myForces.find((f) => f.id === move.forceId);
      if (force && move.to !== undefined) map.set(force.regionId, move.to);
    }
    return map;
  }, [draft.moves, myForces]);

  const handleSelect = (regionId: RegionId) => {
    if (selectedForce && reachable.includes(regionId)) {
      const move: MoveOrder = { forceId: selectedForce.id, to: regionId, posture: 'assault' };
      const preview = previewAttack(
        view,
        selectedForce.id,
        regionId,
        adjacency,
        state.map.regions[regionId]?.kind ?? 'plain',
      );

      // Solo se pide confirmación si de verdad hay alguien enfrente. Confirmar un
      // avance sobre terreno vacío sería un tap de peaje.
      if (preview) setPending({ preview, move });
      else dispatch({ kind: 'move', move });

      setSelected(null);
      return;
    }
    setSelected(selected === regionId ? null : regionId);
  };

  const region = selected === null ? undefined : state.map.regions[selected];
  const bastion = state.map.bastions[seat];

  return (
    <main className="flex h-dvh flex-col">
      <TopBar view={view} state={state} />

      <div className="relative min-h-0 flex-1">
        <MapView
          view={view}
          selected={selected}
          reachable={reachable}
          ordered={orderedArrows}
          onSelect={handleSelect}
        />

        {pending && (
          <CombatPreview
            preview={pending.preview}
            seat={seat}
            onConfirm={() => {
              dispatch({ kind: 'move', move: pending.move });
              setPending(null);
            }}
            onCancel={() => setPending(null)}
          />
        )}

        {!pending && panel === 'build' && (
          <BuildPanel
            view={view}
            queued={draft.production}
            onBuild={(item) =>
              bastion !== undefined && dispatch({ kind: 'build', regionId: bastion, item })
            }
            onClear={() => dispatch({ kind: 'clearBuild' })}
            onClose={() => setPanel('none')}
          />
        )}

        {!pending && panel === 'log' && (
          <LogPanel entries={session.log[seat] ?? []} onClose={() => setPanel('none')} />
        )}

        {/*
          Al elegir destino, el panel se reduce a una barra: una hoja del 48 % taparía
          justo las regiones alcanzables que quedan debajo y el jugador no podría
          tocarlas. «Ningún panel oculta el mapa» (docs/UX_MOBILE.md §1.3) no es una
          preferencia estética: aquí bloqueaba literalmente la jugada.
        */}
        {!pending && panel === 'none' && region && reachable.length > 0 && (
          <TargetBar
            name={TERRAIN_NAME[region.kind]}
            force={selectedForce}
            onCancel={() => setSelected(null)}
          />
        )}

        {!pending && panel === 'none' && region && reachable.length === 0 && (
          <RegionSheet
            name={TERRAIN_NAME[region.kind]}
            regionId={region.id}
            owner={view.control[region.id] ?? null}
            fort={view.fortification[region.id] ?? 0}
            seat={seat}
            force={selectedForce}
            hasOrder={draft.moves.some((m) => m.forceId === selectedForce?.id)}
            onCancelOrder={() =>
              selectedForce && dispatch({ kind: 'clearMove', forceId: selectedForce.id })
            }
            onClose={() => setSelected(null)}
          />
        )}
      </div>

      <BottomBar
        orders={draft.moves.length + draft.production.length}
        phase={isParley ? 'Parlamento — sin movimiento' : `${myForces.length} fuerzas`}
        canBuild={bastion !== undefined}
        hasLog={(session.log[seat]?.length ?? 0) > 0}
        onBuild={() => setPanel(panel === 'build' ? 'none' : 'build')}
        onLog={() => setPanel(panel === 'log' ? 'none' : 'log')}
        onSubmit={() => {
          onSubmitSeat(draft);
          dispatch({ kind: 'reset' });
          setSelected(null);
          setPanel('none');
        }}
        onReset={onReset}
      />
    </main>
  );
}

type DraftAction =
  | { kind: 'move'; move: MoveOrder }
  | { kind: 'clearMove'; forceId: string }
  | { kind: 'build'; regionId: RegionId; item: Buildable }
  | { kind: 'clearBuild' }
  | { kind: 'reset' };

function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.kind) {
    case 'move':
      return {
        ...draft,
        moves: [...draft.moves.filter((m) => m.forceId !== action.move.forceId), action.move],
      };
    case 'clearMove':
      return { ...draft, moves: draft.moves.filter((m) => m.forceId !== action.forceId) };
    case 'build':
      return {
        ...draft,
        production: [...draft.production, { regionId: action.regionId, item: action.item, qty: 1 }],
      };
    case 'clearBuild':
      return { ...draft, production: [] };
    case 'reset':
      return { moves: [], production: [] };
  }
}

function TopBar({ view, state }: { view: PlayerView; state: GameState }) {
  const self = view.self;
  return (
    <CommandHeader
      seat={view.seat}
      name={`${self.name} · ${FACTION_NAME[self.factionId]}`}
      factionId={self.factionId}
      doctrine={DOCTRINE_NAME[self.doctrineId] ?? self.doctrineId}
      phase={state.meta.phase === 'parley' ? 'Parlamento' : 'Guerra'}
      turn={`Turno ${state.meta.turn}`}
      regions={view.control.filter((owner) => owner === view.seat).length}
      regionsLabel="regiones"
      resources={self.resources}
    />
  );
}

/**
 * Barra compacta de selección de destino. Ocupa ~76 px, así que deja el mapa entero
 * utilizable mientras el jugador elige a dónde mueve.
 */
function TargetBar({
  name,
  force,
  onCancel,
}: {
  name: string;
  force: PlayerView['forces'][number] | undefined;
  onCancel: () => void;
}) {
  return (
    // `pointer-events-none` sobre la barra entera, `auto` solo en el botón.
    //
    // Reducir el panel a una barra no bastaba: aunque mide 76 px, sigue habiendo
    // regiones alcanzables debajo, y seguían sin poder tocarse. Un panel flotante
    // sobre el mapa **no puede interceptar taps** salvo en sus controles reales.
    // Es la tercera vez que este mismo error muerde en este proyecto.
    <section
      className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 border-t-2 border-rust bg-panel/90 px-3 py-2 backdrop-blur-sm"
      aria-label="Elegir destino"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-ash">
          {force
            ? `Línea ${round(force.line)} · Fuego ${round(force.fire)} · Cielo ${round(force.sky)} — toca un destino`
            : 'Toca un destino resaltado'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="pointer-events-auto min-h-11 shrink-0 rounded-sharp border-2 border-line bg-panel px-4 text-sm text-muted"
      >
        Cancelar
      </button>
    </section>
  );
}

function RegionSheet({
  name, regionId, owner, fort, seat, force, hasOrder, onCancelOrder, onClose,
}: {
  name: string;
  regionId: RegionId;
  owner: Seat | null;
  fort: number;
  seat: Seat;
  force: PlayerView['forces'][number] | undefined;
  hasOrder: boolean;
  onCancelOrder: () => void;
  onClose: () => void;
}) {
  return (
    <section
      className="absolute inset-x-0 bottom-0 max-h-[48%] overflow-y-auto border-t-2 border-line bg-panel px-4 pb-4 pt-3"
      aria-label={`Región ${regionId}`}
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-sharp bg-line" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold leading-tight">{name}</h2>
          <p className="text-xs text-muted">
            {owner === null ? 'Neutral' : owner === seat ? 'Tuya' : `Asiento ${owner + 1}`}
            {fort > 0 && ` · Fortificación ${fort}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-sharp border border-line text-muted"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      {force && (
        <>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {(['line', 'fire', 'sky'] as const).map((arm) => (
              <div key={arm} className="rounded-sharp border border-line bg-raised py-2">
                <dt className="text-[10px] uppercase tracking-wider text-muted">
                  {arm === 'line' ? 'Línea' : arm === 'fire' ? 'Fuego' : 'Cielo'}
                </dt>
                <dd className="text-xl font-bold">{round(force[arm])}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">
            Postura: {POSTURE_NAME[force.posture ?? 'hold']}
            {(force.unsupplied ?? 0) > 0 && (
              <span className="ml-2 text-danger">
                ⚠ Sin suministro ({force.unsupplied} {force.unsupplied === 1 ? 'turno' : 'turnos'})
              </span>
            )}
          </p>
        </>
      )}

      {hasOrder && (
        <button
          type="button"
          onClick={onCancelOrder}
          className="mt-3 min-h-14 w-full rounded-sharp border-2 border-danger text-danger"
        >
          Cancelar orden
        </button>
      )}
    </section>
  );
}

function BuildPanel({
  view, queued, onBuild, onClear, onClose,
}: {
  view: PlayerView;
  queued: ProductionOrder[];
  onBuild: (item: Buildable) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const spent = queued.reduce((sum, o) => sum + BALANCE.production[o.item].industry * o.qty, 0);
  const available = view.self.resources.industry - spent;

  return (
    <section
      className="absolute inset-x-0 bottom-0 max-h-[62%] overflow-y-auto border-t-2 border-line bg-panel px-4 pb-4 pt-3"
      aria-label="Producción"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-sharp bg-line" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold leading-tight">Producción</h2>
          <p className="text-xs text-muted">Bastión · ⬢ {Math.round(available)} disponible</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-sharp border border-line text-muted"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <ul className="mt-3 flex flex-col gap-2">
        {(['line', 'fire', 'sky', 'fort'] as Buildable[]).map((item) => {
          const cost = BALANCE.production[item].industry;
          const affordable = available >= cost;
          return (
            <li key={item}>
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onBuild(item)}
                className={`flex min-h-14 w-full items-center justify-between rounded-sharp border-2 px-4 ${
                  affordable ? 'border-line bg-raised text-ink' : 'border-line/50 text-faint'
                }`}
              >
                <span className="font-semibold">{BUILDABLE_NAME[item]}</span>
                <span className="text-sm text-muted">⬢ {cost}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {queued.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mt-3 min-h-14 w-full rounded-sharp border-2 border-danger text-danger"
        >
          Vaciar cola ({queued.length})
        </button>
      )}
    </section>
  );
}

function LogPanel({ entries, onClose }: { entries: string[]; onClose: () => void }) {
  return (
    <section
      className="absolute inset-x-0 bottom-0 max-h-[62%] overflow-y-auto border-t-2 border-line bg-panel px-4 pb-4 pt-3"
      aria-label="Registro del turno"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-sharp bg-line" aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-bold leading-tight">Turno anterior</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 rounded-sharp border border-line text-muted"
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>
      <ol className="mt-3 flex flex-col gap-1.5 text-sm">
        {entries.map((entry, index) => (
          <li key={index} className="border-l-2 border-line pl-3 text-muted">
            {entry}
          </li>
        ))}
      </ol>
    </section>
  );
}

function BottomBar({
  orders, phase, canBuild, hasLog, onBuild, onLog, onSubmit, onReset,
}: {
  orders: number;
  phase: string;
  canBuild: boolean;
  hasLog: boolean;
  onBuild: () => void;
  onLog: () => void;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
    // Zona cómoda del pulgar: todas las acciones primarias viven aquí.
    <OrderBar
      status={orders > 0 ? `${orders} órdenes` : 'Sin órdenes'}
      phase={phase}
      primary={<OrderCommit onClick={onSubmit}>Enviar turno</OrderCommit>}
    >
      <OrderTool onClick={onReset} label="Nueva campaña">
        <Back size={20} />
      </OrderTool>
      {hasLog && (
        <OrderTool onClick={onLog} label="Registro del turno anterior">
          <Intel size={20} />
        </OrderTool>
      )}
      {canBuild && (
        <OrderTool onClick={onBuild} label="Producción">
          <Industry size={20} />
        </OrderTool>
      )}
    </OrderBar>
  );
}

function round(value: number | null): number {
  return Math.round((value ?? 0) * 10) / 10;
}

/** Traduce un evento del motor a una línea legible. */
export function describeEvent(type: string, data: Record<string, unknown>): string {
  return EVENT_TEXT[type]?.(data) ?? type;
}
