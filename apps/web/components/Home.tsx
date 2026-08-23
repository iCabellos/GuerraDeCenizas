'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FactionId, PlayerCount } from '@gdc/core';
import { CityView, type DistrictLevels } from '@/components/CityView';
import { Ash, Close, Mark } from '@/components/art/generated';
import { FactionEmblem } from '@/components/GameChrome';
import { browserClient } from '@/lib/supabase-browser';
import type { Cadence } from '@/lib/cadence';

type Messages = Record<string, string>;

/**
 * La vista. En singular: **no hay otra pantalla antes de jugar**.
 *
 * Al abrir el juego se ve tu ciudad en cenital y un botón. Sin portada, sin lista de
 * partidas, sin sala de espera y sin formulario ([ADR-026](../../../docs/DECISIONS.md#adr-026)).
 *
 * Y **sin texto explicativo** ([ADR-027](../../../docs/DECISIONS.md#adr-027)). Nada de lo
 * que hay aquí se explica con una frase:
 *
 * · El tamaño de la partida se elige **dibujando la simetría del mapa** — dos ciudades
 *   enfrentadas, tres en triángulo, cinco en pentágono. Es literalmente cómo se generará
 *   el mapa, así que la elección enseña la regla.
 * · La cadencia son marcas de ritmo: una, dos o tres. Más marcas, más lento.
 * · La Ceniza acumulada llena un silo dentro de la propia ciudad.
 * · Buscar partida **es ver llegar a las demás ciudades**, que es exactamente lo que
 *   cuenta la ficción del juego.
 *
 * Los rótulos siguen existiendo para el lector de pantalla: prescindir de texto es una
 * decisión visual, jamás una excusa para dejar fuera a quien no ve la pantalla.
 */

const SIZES: readonly PlayerCount[] = [2, 3, 5];
const CADENCES: readonly Cadence[] = ['blitz', 'daily', 'relaxed'];

/**
 * El selector de tamaño dibuja la disposición rotacional real del mapa: `n` ciudades
 * repartidas alrededor del Núcleo. No es un icono decorativo, es el mapa en miniatura.
 */
function SymmetryGlyph({ count, active }: { count: number; active: boolean }) {
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
    return { x: 16 + Math.cos(angle) * 10, y: 16 + Math.sin(angle) * 10 };
  });

  return (
    <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden>
      <circle cx={16} cy={16} r={11} fill="none"
        stroke={active ? 'var(--color-rust)' : 'var(--color-faint)'}
        strokeWidth={1} strokeDasharray="3 3" />
      {points.map((point, index) => (
        <rect
          key={index}
          x={point.x - 3} y={point.y - 3} width={6} height={6}
          fill={active ? 'var(--color-rust)' : 'var(--color-muted)'}
        />
      ))}
      <path d="M16 12 20 16 16 20 12 16Z"
        fill={active ? 'var(--color-ash)' : 'var(--color-faint)'} />
    </svg>
  );
}

/** Marcas de ritmo: una es rápida, tres es lenta. La escala se entiende sola. */
function TempoGlyph({ steps, active }: { steps: number; active: boolean }) {
  return (
    <svg viewBox="0 0 32 32" width={30} height={30} aria-hidden>
      {Array.from({ length: 3 }, (_, index) => (
        <rect
          key={index}
          x={7 + index * 7} y={index <= steps - 1 ? 10 : 14}
          width={4} height={index <= steps - 1 ? 12 : 4}
          fill={
            index <= steps - 1
              ? active ? 'var(--color-rust)' : 'var(--color-muted)'
              : 'var(--color-faint)'
          }
        />
      ))}
    </svg>
  );
}

function Toggle({
  selected, onClick, label, children,
}: { selected: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      className={`flex min-h-14 flex-1 items-center justify-center rounded-sharp border
        transition-colors duration-150 ease-out ${
          selected
            ? 'border-rust bg-rust/12'
            : 'border-line bg-panel hover:border-faint'
        }`}
    >
      {children}
    </button>
  );
}

export function Home({
  messages, profileId, factionId, displayName, districts, ash,
}: {
  messages: Messages;
  profileId: string;
  factionId: FactionId;
  /** Cómo te llamas en la mesa. Sin esto la pantalla no dice de quién es la ciudad. */
  displayName: string;
  districts: DistrictLevels;
  ash: number;
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
  const [size, setSize] = useState<PlayerCount>(3);
  const [cadence, setCadence] = useState<Cadence>('daily');
  const [searching, setSearching] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (poll.current) clearInterval(poll.current);
    poll.current = null;
  }, []);

  /**
   * Mientras se busca, la partida puede aparecer por dos caminos: la forma otro jugador
   * al entrar en la cola, o la forma el cron al rellenar con Mando Automático. El primero
   * llega empujado por Realtime; el segundo necesita una consulta, porque nadie está
   * escribiendo nada que suscribirse.
   */
  useEffect(() => {
    if (!searching) return;

    const supabase = browserClient();
    const channel = supabase
      .channel('matched')
      .on(
        'postgres_changes',
        // Sin filtro: RLS solo deja pasar la vista de mi propio asiento, así que la
        // primera fila que llegue es la de mi partida nueva.
        { event: 'INSERT', schema: 'public', table: 'player_views' },
        (payload) => {
          const gameId = (payload.new as { game_id?: string }).game_id;
          if (gameId) router.push(`/g/${gameId}`);
        },
      )
      .subscribe();

    poll.current = setInterval(async () => {
      const response = await fetch('/api/match').catch(() => null);
      if (!response?.ok) return;
      const payload = (await response.json()) as {
        queue: { queued: boolean; waiting?: number };
      };
      if (!payload.queue.queued) {
        // Ya no estoy en la cola: o me emparejaron o me sacaron. Recargar resuelve las dos.
        stopPolling();
        router.refresh();
        return;
      }
      setWaiting(payload.queue.waiting ?? 0);
    }, 5000);

    return () => {
      stopPolling();
      void supabase.removeChannel(channel);
    };
  }, [router, searching, stopPolling]);

  async function play() {
    setFailed(false);
    setSearching(true);
    setWaiting(1);
    try {
      const response = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerCount: size, cadence }),
      });
      const payload = (await response.json()) as {
        ok: boolean; gameId: string | null; waiting: number | null;
      };
      if (!payload.ok) { setSearching(false); setFailed(true); return; }
      if (payload.gameId) { router.push(`/g/${payload.gameId}`); return; }
      setWaiting(payload.waiting ?? 1);
    } catch {
      setSearching(false);
      setFailed(true);
    }
  }

  async function stop() {
    stopPolling();
    setSearching(false);
    await fetch('/api/match', { method: 'DELETE' }).catch(() => null);
  }

  return (
    <div className="relative h-dvh overflow-hidden bg-void">
      {/* La ciudad va a sangre: es el sujeto de la pantalla, no una ilustración dentro
          de un hueco. Todo lo demás flota encima. */}
      <div className="absolute inset-0">
        <CityView
          className="h-full w-full"
          messages={messages}
          label={searching ? t('a11y.searching') : t('a11y.city')}
          factionId={factionId}
          profileId={profileId}
          districts={districts}
          ash={ash}
          arrivals={searching ? waiting : 0}
          arrivalTotal={searching ? size : 0}
        />
      </div>

      <div className="chart-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="ashfall" />

      {/* Velo superior. Sin él, el emblema y la Ceniza compiten con los edificios.
          `pointer-events-none`: nada que flote sobre la ciudad intercepta un gesto. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52
        bg-gradient-to-b from-void/95 via-void/45 to-transparent" />

      {/*
        Barra superior: de quién es esta ciudad.
        Antes eran dos iconos sin una palabra, y una pantalla sin texto no es sobria: es
        ilegible. Ahora dice el nombre y el juramento, que son las dos cosas que el
        jugador ha elegido.
      */}
      <header className="pointer-events-none relative z-10 flex items-center
        justify-between gap-3 px-4 pt-4">
        <span className="flex min-w-0 items-center gap-2.5">
          <FactionEmblem factionId={factionId} size={24} className="shrink-0 text-rust" />
          <span className="min-w-0">
            <span className="type-title block truncate text-sm text-ink">{displayName}</span>
            <span className="type-label block truncate">{t(`faction.${factionId}`)}</span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Ash size={18} className="text-ash" title={t('resource.ash')} />
          <span className="type-figure text-lg text-ink">{ash}</span>
        </span>
      </header>

      <footer className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-4 pb-5
        pt-20 bg-gradient-to-b from-transparent via-void/95 to-void">
        {!searching && (
          <>
            <p className="type-label">{t('lobby.size')}</p>
            <div className="flex gap-2">
              {SIZES.map((option) => (
                <Toggle
                  key={option}
                  selected={size === option}
                  onClick={() => setSize(option)}
                  label={`${option} · ${t('lobby.players')}`}
                >
                  <SymmetryGlyph count={option} active={size === option} />
                  <span className="type-figure mt-1 block text-sm">{option}</span>
                </Toggle>
              ))}
            </div>

            <p className="type-label mt-1">{t('lobby.cadence')}</p>
            <div className="flex gap-2">
              {CADENCES.map((option, index) => (
                <Toggle
                  key={option}
                  selected={cadence === option}
                  onClick={() => setCadence(option)}
                  label={t(`cadence.${option}Detail`)}
                >
                  <TempoGlyph steps={index + 1} active={cadence === option} />
                  <span className="type-label mt-1 block !text-[10px]">
                    {t(`cadence.${option}`)}
                  </span>
                </Toggle>
              ))}
            </div>
          </>
        )}

        {searching ? (
          <button
            type="button"
            onClick={stop}
            aria-label={t('a11y.cancel')}
            className="flex min-h-16 items-center justify-center gap-3 rounded-sharp border
              border-line bg-panel text-muted transition-colors duration-150 ease-out
              hover:border-danger hover:text-danger"
          >
            <Close size={20} />
            <span className="type-title text-sm">{t('lobby.searching')}</span>
            <span className="type-figure text-lg">
              {waiting}/{size}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={play}
            aria-label={t('lobby.newCampaign')}
            className={`type-title flex min-h-16 items-center justify-center gap-3
              rounded-sharp border border-rust bg-rust text-void transition-all
              duration-150 ease-out hover:brightness-110
              ${failed ? 'border-danger bg-danger' : ''}`}
          >
            <Mark size={24} />
            {t('lobby.play')}
            <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden>
              <path d="M8 4 18 12 8 20Z" fill="currentColor" />
            </svg>
          </button>
        )}
      </footer>
    </div>
  );
}
