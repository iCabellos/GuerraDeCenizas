'use client';

import { useMemo, useReducer, useState } from 'react';
import {
  ENGINE_VERSION, FACTION_IDS, buildAdjacency, createGame, reduce,
  type FactionId, type GameState, type MoveOrder, type Orders, type OrdersBySeat,
  type PlayerCount, type PlayerView, type RegionId, type Seat,
} from '@gdc/core';
import { MapView } from './MapView';
import {
  DOCTRINE_NAME, EVENT_TEXT, FACTION_NAME, POSTURE_NAME, RESOURCE_LABEL,
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

interface Session {
  state: GameState;
  seat: Seat;
  drafts: Partial<Record<Seat, MoveOrder[]>>;
  history: string[];
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
          setSession({ state, seat: 0, drafts: {}, history: [] });
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
      onSubmitSeat={(moves) => {
        const drafts = { ...session.drafts, [session.seat]: moves };
        const players = session.state.meta.playerCount;

        if (session.seat < players - 1) {
          setSession({ ...session, drafts, seat: (session.seat + 1) as Seat });
          setScreen({ kind: 'handoff' });
          return;
        }

        const orders: OrdersBySeat = {};
        for (let s = 0; s < players; s++) {
          orders[s as Seat] = { turn: session.state.meta.turn, moves: drafts[s as Seat] ?? [] };
        }
        const result = reduce(session.state, orders, CTX);
        setSession({
          state: result.state,
          seat: 0,
          drafts: {},
          history: [
            `T${session.state.meta.turn} · ${result.checksum.slice(0, 8)}`,
            ...session.history,
          ].slice(0, 12),
        });
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-5">
      <header className="pt-8">
        <h1 className="text-3xl font-bold tracking-tight">Guerra de Cenizas</h1>
        <p className="mt-1 text-sm text-muted">
          Prototipo v0.1 · hot seat local · motor {ENGINE_VERSION}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-rust">Jugadores</h2>
        <div className="grid grid-cols-3 gap-2">
          {([2, 3, 5] as PlayerCount[]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayers(n)}
              aria-pressed={players === n}
              className={`min-h-14 rounded-sharp border-2 text-lg font-semibold transition-colors ${
                players === n
                  ? 'border-rust bg-raised text-ink'
                  : 'border-line bg-panel text-muted'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-rust">Semilla</h2>
        <div className="flex gap-2">
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(Number(e.target.value) || 0)}
            className="min-h-14 flex-1 rounded-sharp border-2 border-line bg-panel px-4 text-lg"
            aria-label="Semilla del mapa"
          />
          <button
            type="button"
            onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
            className="min-h-14 rounded-sharp border-2 border-line bg-panel px-4 text-sm text-muted"
          >
            Azar
          </button>
        </div>
        <p className="text-xs text-faint">
          La misma semilla produce siempre el mismo mapa. Reproducible entre sesiones.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-rust">Facciones</h2>
        <ul className="flex flex-col gap-2">
          {factions.map((faction, index) => (
            <li
              key={index}
              className="flex min-h-14 items-center gap-3 rounded-sharp border-2 border-line bg-panel px-3"
            >
              <span
                className="h-6 w-6 shrink-0 rounded-sharp border-2"
                style={{ borderColor: seatColor(index as Seat), background: seatColor(index as Seat) }}
                aria-hidden
              />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{NAMES[index]}</span>
                <span className="block text-xs text-muted">{FACTION_NAME[faction]}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={() => onStart(players, seed, factions)}
        className="mt-auto min-h-14 rounded-sharp bg-rust text-lg font-bold text-void"
      >
        Empezar campaña
      </button>
    </main>
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

type Selection = { region: RegionId | null };

function Board({
  session,
  onSubmitSeat,
  onReset,
}: {
  session: Session;
  onSubmitSeat: (moves: MoveOrder[]) => void;
  onReset: () => void;
}) {
  const { state, seat } = session;

  // Se proyecta la vista del asiento con el propio motor: la UI nunca ve el estado
  // completo, ni siquiera en el prototipo.
  const view: PlayerView = useMemo(
    () => reduce(state, {}, CTX).views[seat],
    [state, seat],
  );

  const adjacency = useMemo(
    () => buildAdjacency(state.map.regions.length, state.map.edges),
    [state.map],
  );

  const [moves, dispatch] = useReducer(movesReducer, [] as MoveOrder[]);
  const [selection, setSelection] = useState<Selection>({ region: null });

  const myForces = view.forces.filter((f) => f.own);
  const selectedForce = selection.region === null
    ? undefined
    : myForces.find((f) => f.regionId === selection.region);

  const isParley = state.meta.phase === 'parley';
  const reachable = selectedForce && !isParley
    ? (adjacency[selectedForce.regionId] ?? [])
    : [];

  const orderedArrows = useMemo(() => {
    const map = new Map<RegionId, RegionId>();
    for (const move of moves) {
      const force = myForces.find((f) => f.id === move.forceId);
      if (force && move.to !== undefined) map.set(force.regionId, move.to);
    }
    return map;
  }, [moves, myForces]);

  const handleSelect = (regionId: RegionId) => {
    if (selectedForce && reachable.includes(regionId)) {
      dispatch({ kind: 'move', forceId: selectedForce.id, to: regionId });
      setSelection({ region: null });
      return;
    }
    setSelection({ region: selection.region === regionId ? null : regionId });
  };

  const region = selection.region === null ? undefined : state.map.regions[selection.region];

  return (
    <main className="flex h-dvh flex-col">
      <TopBar view={view} state={state} />

      <div className="relative min-h-0 flex-1">
        <MapView
          view={view}
          selected={selection.region}
          reachable={reachable}
          ordered={orderedArrows}
          onSelect={handleSelect}
        />

        {/*
          Al elegir destino, el panel se reduce a una barra: una hoja del 48 % taparía
          justo las regiones alcanzables que quedan debajo y el jugador no podría
          tocarlas. «Ningún panel oculta el mapa» (docs/UX_MOBILE.md §1.3) no es una
          preferencia estética: aquí bloqueaba literalmente la jugada.
        */}
        {region && reachable.length > 0 && (
          <TargetBar
            name={TERRAIN_NAME[region.kind]}
            force={selectedForce}
            onCancel={() => setSelection({ region: null })}
          />
        )}

        {region && reachable.length === 0 && (
          <RegionSheet
            name={TERRAIN_NAME[region.kind]}
            regionId={region.id}
            owner={view.control[region.id] ?? null}
            seat={seat}
            force={selectedForce}
            canMove={false}
            hasOrder={moves.some((m) => m.forceId === selectedForce?.id)}
            onCancelOrder={() =>
              selectedForce && dispatch({ kind: 'clear', forceId: selectedForce.id })
            }
            onClose={() => setSelection({ region: null })}
          />
        )}
      </div>

      <BottomBar
        orders={moves.length}
        phase={isParley ? 'Parlamento — sin movimiento' : `${myForces.length} fuerzas`}
        onSubmit={() => {
          onSubmitSeat(moves);
          dispatch({ kind: 'reset' });
          setSelection({ region: null });
        }}
        onReset={onReset}
      />
    </main>
  );
}

function movesReducer(
  moves: MoveOrder[],
  action:
    | { kind: 'move'; forceId: string; to: RegionId }
    | { kind: 'clear'; forceId: string }
    | { kind: 'reset' },
): MoveOrder[] {
  switch (action.kind) {
    case 'move':
      return [
        ...moves.filter((m) => m.forceId !== action.forceId),
        { forceId: action.forceId, to: action.to, posture: 'assault' },
      ];
    case 'clear':
      return moves.filter((m) => m.forceId !== action.forceId);
    case 'reset':
      return [];
  }
}

function TopBar({ view, state }: { view: PlayerView; state: GameState }) {
  const self = view.self;
  return (
    <header className="shrink-0 border-b border-line bg-panel">
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="h-8 w-1.5 shrink-0 rounded-sharp"
          style={{ background: seatColor(view.seat) }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">
            {self.name} · {FACTION_NAME[self.factionId]}
          </p>
          <p className="truncate text-xs text-muted">{DOCTRINE_NAME[self.doctrineId]}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold leading-tight">
            {state.meta.phase === 'parley' ? 'Parlamento' : `Turno ${state.meta.turn}`}
          </p>
          <p className="text-xs text-muted">semilla {state.meta.seed}</p>
        </div>
      </div>
      <ul className="flex justify-between gap-1 border-t border-line px-3 py-1.5 text-sm">
        {(Object.keys(RESOURCE_LABEL) as (keyof typeof RESOURCE_LABEL)[]).map((key) => (
          <li key={key} className="flex items-center gap-1" title={RESOURCE_LABEL[key].name}>
            <span aria-hidden className="text-muted">{RESOURCE_LABEL[key].glyph}</span>
            <span className="font-semibold">{self.resources[key]}</span>
            <span className="sr-only">{RESOURCE_LABEL[key].name}</span>
          </li>
        ))}
      </ul>
    </header>
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
    <section
      className="absolute inset-x-0 bottom-0 flex items-center gap-3 border-t-2 border-rust bg-panel/95 px-3 py-2 backdrop-blur-sm"
      aria-label="Elegir destino"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-ash">
          {force
            ? `Línea ${force.line ?? '?'} · Fuego ${force.fire ?? '?'} · Cielo ${force.sky ?? '?'} — toca un destino resaltado`
            : 'Toca un destino resaltado'}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 shrink-0 rounded-sharp border-2 border-line px-4 text-sm text-muted"
      >
        Cancelar
      </button>
    </section>
  );
}

function RegionSheet({
  name, regionId, owner, seat, force, canMove, hasOrder, onCancelOrder, onClose,
}: {
  name: string;
  regionId: RegionId;
  owner: Seat | null;
  seat: Seat;
  force: PlayerView['forces'][number] | undefined;
  canMove: boolean;
  hasOrder: boolean;
  onCancelOrder: () => void;
  onClose: () => void;
}) {
  return (
    // Nunca cubre el mapa entero: el jugador debe ver el contexto de lo que decide.
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
            {' · '}región {regionId}
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
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(['line', 'fire', 'sky'] as const).map((arm) => (
            <div key={arm} className="rounded-sharp border border-line bg-raised py-2">
              <dt className="text-[10px] uppercase tracking-wider text-muted">
                {arm === 'line' ? 'Línea' : arm === 'fire' ? 'Fuego' : 'Cielo'}
              </dt>
              <dd className="text-xl font-bold">{force[arm] ?? '?'}</dd>
            </div>
          ))}
        </dl>
      )}

      {force && (
        <p className="mt-2 text-xs text-muted">
          Postura: {POSTURE_NAME[force.posture ?? 'hold']}
        </p>
      )}

      {canMove && !hasOrder && (
        <p className="mt-3 text-sm text-ash">
          Toca una región resaltada para mover esta fuerza.
        </p>
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

function BottomBar({
  orders, phase, onSubmit, onReset,
}: {
  orders: number;
  phase: string;
  onSubmit: () => void;
  onReset: () => void;
}) {
  return (
    // Zona cómoda del pulgar: todas las acciones primarias viven aquí.
    <footer className="shrink-0 border-t border-line bg-panel px-3 py-2">
      <div className="mb-2 flex items-center justify-between text-xs text-muted">
        <span>{orders > 0 ? `${orders} órdenes` : 'Sin órdenes'}</span>
        <span>{phase}</span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReset}
          className="min-h-14 rounded-sharp border-2 border-line px-4 text-sm text-muted"
        >
          Nueva
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="min-h-14 flex-1 rounded-sharp bg-rust text-lg font-bold text-void"
        >
          Enviar turno
        </button>
      </div>
    </footer>
  );
}

/** Reservado para el panel de log del turno; se activa en v0.2 con el combate. */
export function describeEvent(type: string, data: Record<string, unknown>): string {
  return EVENT_TEXT[type]?.(data) ?? type;
}
