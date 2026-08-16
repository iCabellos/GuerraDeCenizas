'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Choice, Command, Field, Input, Notice, Panel } from '@/components/ui/Shell';
import { Back } from '@/components/art/generated';

type Messages = Record<string, string>;

const PLAYER_COUNTS = [2, 3, 5] as const;
const CADENCES = ['blitz', 'daily', 'relaxed'] as const;

/**
 * Crear una campaña o entrar con un código.
 *
 * Las dos van juntas porque para el jugador son la misma decisión: *quiero jugar con esta
 * gente*. Separarlas en dos pantallas obliga a elegir antes de saber si alguien ya ha
 * creado la partida.
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
      <div className="flex flex-col gap-2">
        <Command onClick={() => setMode('create')}>{t('lobby.newCampaign')}</Command>
        <Command tone="ghost" onClick={() => setMode('join')}>{t('lobby.enterCode')}</Command>
      </div>
    );
  }

  return (
    <Panel>
      <button
        type="button"
        onClick={() => { setMode('idle'); setError(''); }}
        className="type-label mb-4 flex items-center gap-2 hover:text-ink"
      >
        <Back size={14} />
        {t('lobby.back')}
      </button>

      {mode === 'create' ? (
        <div className="flex flex-col gap-5">
          <Field label={t('lobby.players')}>
            <div className="flex gap-2">
              {PLAYER_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setPlayerCount(count)}
                  aria-pressed={playerCount === count}
                  className={`type-figure min-h-14 flex-1 rounded-sharp border text-lg
                    transition-colors duration-150 ease-out ${
                      playerCount === count
                        ? 'border-rust bg-rust/12 text-ink'
                        : 'border-line bg-raised text-muted hover:border-faint'
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
                <Choice
                  key={option}
                  selected={cadence === option}
                  onClick={() => setCadence(option)}
                  detail={t(`cadence.${option}Detail`)}
                >
                  {t(`cadence.${option}`)}
                </Choice>
              ))}
            </div>
          </Field>

          <Command
            disabled={busy}
            onClick={() => post('/api/games', { playerCount, cadence, visibility: 'private' })}
          >
            {busy ? t('lobby.creating') : t('lobby.create')}
          </Command>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Field label={t('lobby.code')}>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              placeholder={t('lobby.codePlaceholder')}
              autoCapitalize="characters"
              autoComplete="off"
              className="type-figure !text-center !text-3xl tracking-[0.35em]"
            />
          </Field>
          <Command disabled={busy || code.length !== 6} onClick={() => post('/api/games/join', { code })}>
            {busy ? t('lobby.joining') : t('lobby.join')}
          </Command>
        </div>
      )}

      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
    </Panel>
  );
}
