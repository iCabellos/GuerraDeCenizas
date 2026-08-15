'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Notice } from '@/components/ui/Shell';

type Messages = Record<string, string>;

const PLAYER_COUNTS = [2, 3, 5] as const;
const CADENCES = ['blitz', 'daily', 'relaxed'] as const;

/**
 * Crear una partida o entrar con un código.
 *
 * Las dos acciones van juntas porque son la misma decisión desde el punto de vista del
 * jugador: *quiero jugar con esta gente*. Separarlas en dos pantallas obligaría a elegir
 * antes de saber si alguien ya ha creado la partida.
 *
 * Todo pasa por la API. El cliente manda `playerCount`, `cadence` y el código; la semilla,
 * el asiento y el mapa los pone el servidor.
 */
export function NewGame({ messages }: { messages: Messages }) {
  const t = (key: string, params?: Record<string, string | number>) => {
    const template = messages[key] ?? key;
    return params
      ? template.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m))
      : template;
  };

  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'create' | 'join'>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [playerCount, setPlayerCount] = useState<2 | 3 | 5>(3);
  const [cadence, setCadence] = useState<'blitz' | 'daily' | 'relaxed'>('daily');
  const [code, setCode] = useState('');

  async function post(path: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { ok: boolean; code?: string; gameId?: string };
      if (!payload.ok) {
        // La API devuelve códigos, no frases: aquí es donde se traducen.
        setError(t(`error.${payload.code ?? 'internal'}`));
        return;
      }
      router.push(`/games/${payload.gameId}`);
      router.refresh();
    } catch {
      setError(t('error.network'));
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'idle') {
    return (
      <div className="flex flex-col gap-3">
        <Button onClick={() => setMode('create')}>{t('lobby.create')}</Button>
        <Button tone="ghost" onClick={() => setMode('join')}>{t('lobby.join')}</Button>
      </div>
    );
  }

  return (
    <Card>
      {mode === 'create' ? (
        <div className="flex flex-col gap-4">
          <Field label={t('lobby.players')}>
            <div className="flex gap-2">
              {PLAYER_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPlayerCount(count)}
                  aria-pressed={playerCount === count}
                  className={`min-h-14 flex-1 rounded-sharp border text-base ${
                    playerCount === count
                      ? 'border-rust bg-rust/15 text-ink'
                      : 'border-line bg-raised text-muted'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </Field>

          <Field label={t('lobby.cadence')}>
            <div className="flex flex-col gap-2">
              {CADENCES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCadence(option)}
                  aria-pressed={cadence === option}
                  className={`min-h-14 rounded-sharp border px-3 text-left ${
                    cadence === option
                      ? 'border-rust bg-rust/15 text-ink'
                      : 'border-line bg-raised text-muted'
                  }`}
                >
                  <span className="block text-base">{t(`cadence.${option}`)}</span>
                  <span className="block text-xs text-muted">{t(`cadence.${option}Detail`)}</span>
                </button>
              ))}
            </div>
          </Field>

          <Button
            disabled={busy}
            onClick={() => post('/api/games', { playerCount, cadence, visibility: 'private' })}
          >
            {busy ? t('lobby.creating') : t('lobby.create')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label={t('lobby.code')}>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              placeholder={t('lobby.codePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              className="min-h-14 rounded-sharp border border-line bg-raised px-3 text-center font-mono text-2xl tracking-[0.3em] text-ink placeholder:text-sm placeholder:tracking-normal placeholder:text-faint focus:border-rust focus:outline-none"
            />
          </Field>
          <Button disabled={busy || code.length !== 6} onClick={() => post('/api/games/join', { code })}>
            {busy ? t('lobby.joining') : t('lobby.join')}
          </Button>
        </div>
      )}

      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-3">
        <Button tone="ghost" onClick={() => { setMode('idle'); setError(''); }}>
          ←
        </Button>
      </div>
    </Card>
  );
}
