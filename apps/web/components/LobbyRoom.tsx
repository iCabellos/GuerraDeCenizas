'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Muted, Notice, Title } from '@/components/ui/Shell';
import { browserClient } from '@/lib/supabase-browser';

type Messages = Record<string, string>;

interface SeatRow {
  seat: number;
  taken: boolean;
  you: boolean;
}

/**
 * Sala de espera.
 *
 * El código de invitación es el flujo principal de la beta: juntar a cinco conocidos es
 * mucho más fácil que llenar una cola pública ([DISCOVERY P1](../../../docs/DISCOVERY.md)).
 *
 * Se suscribe a Realtime en vez de sondear. Con cadencia Blitz, sondear cada dos segundos
 * multiplicado por cinco jugadores y cuarenta partidas es tráfico suficiente para agotar
 * el free tier haciendo nada.
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
    <>
      <Title>{t('lobby.share')}</Title>

      {inviteCode && (
        <Card>
          <p className="text-center font-mono text-4xl tracking-[0.4em] text-ash">{inviteCode}</p>
          <div className="mt-3">
            <Button tone="ghost" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</Button>
          </div>
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {seats.map((seat) => (
          <li
            key={seat.seat}
            className="flex min-h-14 items-center justify-between rounded-sharp border border-line bg-panel px-4"
          >
            <span className="text-sm text-muted">{t('lobby.seat', { seat: seat.seat })}</span>
            <span className={seat.taken ? 'text-ink' : 'text-faint'}>
              {seat.taken
                ? (seat.you ? `${t('lobby.host')}` : '●')
                : t('lobby.seatEmpty')}
            </span>
          </li>
        ))}
      </ul>

      <Muted>{missing > 0 ? t('lobby.waiting', { missing }) : t('lobby.ready')}</Muted>

      {isHost && (
        <Button disabled={busy || missing > 0} onClick={start}>
          {t('lobby.start')}
        </Button>
      )}

      {error && <Notice tone="error">{error}</Notice>}
    </>
  );
}
