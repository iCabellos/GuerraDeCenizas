'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command, Legend, Muted, Notice, Panel, Rule } from '@/components/ui/Shell';
import { Copy, Seat as SeatIcon, Submitted } from '@/components/art/generated';
import { browserClient } from '@/lib/supabase-browser';

type Messages = Record<string, string>;

interface SeatRow {
  seat: number;
  taken: boolean;
  you: boolean;
}

const SEAT_COLOR = ['--color-p0', '--color-p1', '--color-p2', '--color-p3', '--color-p4'];

/**
 * Sala de espera.
 *
 * El código de invitación es el flujo principal de la beta: juntar a cinco conocidos es
 * mucho más fácil que llenar una cola pública ([DISCOVERY P1](../../../docs/DISCOVERY.md)).
 * Por eso el código es lo más grande de la pantalla y no un detalle en una esquina.
 *
 * Se suscribe a Realtime en vez de sondear. Con cadencia Blitz, sondear cada dos segundos
 * por cinco jugadores y cuarenta partidas es tráfico suficiente para agotar el free tier
 * sin que nadie esté haciendo nada.
 */
export function LobbyRoom({
  messages, gameId, inviteCode, playerCount, isHost, seats,
}: {
  messages: Messages;
  gameId: string;
  inviteCode: string;
  playerCount: number;
  isHost: boolean;
  seats: SeatRow[];
}) {
  const t = (key: string, params?: Record<string, string | number>) => {
    const template = messages[key] ?? key;
    return params
      ? template.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m))
      : template;
  };

  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const taken = seats.filter((seat) => seat.taken).length;
  const missing = playerCount - taken;

  useEffect(() => {
    const supabase = browserClient();
    const channel = supabase
      .channel(`lobby:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [gameId, router]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/games/${gameId}/start`, { method: 'POST' });
      const payload = (await response.json()) as { ok: boolean; code?: string };
      if (!payload.ok) setError(t(`error.${payload.code ?? 'internal'}`));
      else router.refresh();
    } catch {
      setError(t('error.network'));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles el código sigue en pantalla: no hay nada que recuperar.
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 pt-8">
      {inviteCode && (
        <Panel tone="void">
          <Legend>{t('lobby.share')}</Legend>
          <p className="type-figure mt-3 text-center text-4xl tracking-[0.3em] text-ash">
            {inviteCode}
          </p>
          <button
            type="button"
            onClick={copy}
            className="type-label mx-auto mt-3 flex items-center gap-2 hover:text-ink"
          >
            {copied ? <Submitted size={14} /> : <Copy size={14} />}
            {copied ? t('lobby.copied') : t('lobby.copy')}
          </button>
        </Panel>
      )}

      <Rule />

      <ul className="flex flex-col gap-2">
        {seats.map((seat) => (
          <li
            key={seat.seat}
            className="registered flex min-h-14 items-center gap-3 rounded-sharp border border-line bg-panel px-4"
          >
            {/* Barra del color del asiento. Nunca es lo único que distingue: al lado va
                el número, porque quien no distinga rojo de verde debe poder jugar. */}
            <span
              aria-hidden
              className="h-8 w-1"
              style={{ background: seat.taken ? `var(${SEAT_COLOR[seat.seat]})` : 'var(--color-line)' }}
            />
            <span className="type-label flex-1 !tracking-widest">
              {t('lobby.seat', { seat: seat.seat })}
            </span>
            {seat.taken ? (
              <span className="flex items-center gap-2 text-sm text-ink">
                <SeatIcon size={16} className="text-muted" />
                {seat.you ? t('lobby.host') : ''}
              </span>
            ) : (
              <span className="text-sm text-faint">{t('lobby.seatEmpty')}</span>
            )}
          </li>
        ))}
      </ul>

      <Muted>{missing > 0 ? t('lobby.waiting', { missing }) : t('lobby.ready')}</Muted>

      <div className="mt-auto flex flex-col gap-3">
        {error && <Notice tone="error">{error}</Notice>}
        {isHost && (
          <Command disabled={busy || missing > 0} onClick={start}>
            {t('lobby.start')}
          </Command>
        )}
      </div>
    </div>
  );
}
