'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FACTIONS, FACTION_IDS, type FactionId } from '@gdc/core';
import { Back } from '@/components/art/generated';
import { FactionEmblem } from '@/components/GameChrome';
import { CityView } from '@/components/CityView';
import { seatColor } from '@/lib/theme';

/**
 * El Juramento: vista 02 del diseño.
 *
 * Existe porque faltaba lo más básico — **nadie elegía facción**. `profiles.faction_id`
 * nace con un valor por defecto, así que toda cuenta era de Vantera sin haberlo decidido,
 * y el emblema de la Ciudad no significaba nada.
 *
 * Dos pasos, como el diseño: juramento y nombre. El segundo no es relleno; es la otra
 * cosa que no se podía configurar, y el nombre es lo que ven los demás en la mesa.
 *
 * Se jura **una vez**. Cambiar después es un Cisma y cuesta Ceniza
 * ([FACTIONS §5](../../../docs/FACTIONS.md)), así que la condición vive en la base de
 * datos y no en este formulario.
 */

type Messages = Readonly<Record<string, string>>;

export function OathForm({
  messages, profileId, initialName,
}: {
  messages: Messages;
  profileId: string;
  initialName: string;
}) {
  const t = (key: string, params?: Record<string, string | number>): string => {
    const template = messages[key] ?? key;
    return params
      ? template.replace(/\{(\w+)\}/g, (m, name: string) => String(params[name] ?? m))
      : template;
  };

  const router = useRouter();
  const [chosen, setChosen] = useState<FactionId>('vantera');
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * El sigilo elegido, siempre a la vista.
   *
   * La lista va en orden alfabético, así que con Vantera —el valor por defecto— la ficha
   * activa quedaba fuera del carrusel: la pantalla decía «Vantera» arriba y abajo no se
   * veía ninguna seleccionada.
   */
  const active = useRef<HTMLLIElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [chosen]);

  const faction = FACTIONS[chosen];
  const nameOk = name.trim().length >= 3 && name.trim().length <= 20;

  async function swear() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/oath', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ factionId: chosen }),
      });
      const payload = (await response.json()) as { ok: boolean; code?: string };
      if (!payload.ok) { setError(t(`error.${payload.code ?? 'internal'}`)); return; }
      router.replace('/');
      router.refresh();
    } catch {
      setError(t('error.network'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-void">
      {/* La ciudad de la facción elegida, en relieve. Cambia al tocar cada sigilo: la
          decisión se ve antes de tomarla, que es lo que pedía ADR-027. */}
      <div className="relative h-[46vh] shrink-0">
        <CityView
          className="h-full w-full"
          messages={messages}
          factionId={chosen}
          profileId={profileId}
          districts={{ archive: 2, foundry: 2, antenna: 1, chamber: 1 }}
          label={t('lobby.city')}
          labels={false}
        />
        <div className="pointer-events-none absolute inset-0
          bg-gradient-to-b from-void/95 via-void/30 to-void" />

        <header className="absolute inset-x-0 top-0 flex items-center gap-3 px-5 pt-10">
          {step === 2 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              aria-label={t('oath.back')}
              className="flex h-11 w-11 items-center justify-center rounded-sharp
                border border-line bg-void/60"
            >
              <Back size={19} />
            </button>
          )}
          <div>
            <p className="type-label">{step === 1 ? t('oath.step1') : t('oath.step2')}</p>
            <h1 className="type-display mt-1 text-xl text-ink">
              {step === 1 ? t('oath.title') : t('oath.nameTitle')}
            </h1>
          </div>
        </header>

        <div className="absolute bottom-4 left-5 flex items-end gap-3">
          <span
            className="grid h-14 w-14 shrink-0 place-items-center rounded-sharp border"
            style={{ borderColor: seatColor(0), background: `${faction.palette.primary}22` }}
          >
            <FactionEmblem factionId={chosen} size={28} className="text-ink" />
          </span>
          <div>
            <p className="type-display text-2xl leading-none text-ink">{t(`faction.${chosen}`)}</p>
            <p className="mt-1 max-w-[16rem] text-xs text-muted">{t(`faction.tag.${chosen}`)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-2">
        {step === 1 ? (
          <>
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {FACTION_IDS.map((id) => {
                const on = id === chosen;
                return (
                  <li key={id} ref={on ? active : null}>
                    <button
                      type="button"
                      onClick={() => setChosen(id)}
                      aria-pressed={on}
                      className={`flex h-[76px] w-[58px] shrink-0 flex-col items-center
                        justify-center gap-1.5 rounded-sharp border ${
                          on ? 'border-rust bg-rust/15' : 'border-line'
                        }`}
                    >
                      <FactionEmblem factionId={id} size={22} className={on ? 'text-rust' : 'text-muted'} />
                      <span className={`text-[10px] font-bold ${on ? 'text-ink' : 'text-muted'}`}>
                        {t(`faction.${id}`)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2">
              <p className="type-label">{t('oath.onlyOptions')}</p>
              {/* Lo que el juramento añade son OPCIONES, nunca números: es la regla de oro
                  de la metaprogresión y por eso se enuncia aquí, donde se elige. */}
              <Perk text={t('oath.doctrine', { name: t(`doctrine.${faction.originDoctrine}`) })} />
              {faction.affineDoctrines
                .filter((id) => id !== faction.originDoctrine)
                .map((id) => (
                  <Perk key={id} text={t('oath.affinity', { name: t(`doctrine.${id}`) })} />
                ))}
            </div>

            <p className="type-label !normal-case !tracking-normal !text-faint">{t('oath.once')}</p>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="type-title mt-auto min-h-14 rounded-sharp border border-ink bg-ink
                text-sm text-void"
            >
              {t('oath.swear', { name: t(`faction.${chosen}`) })}
            </button>
          </>
        ) : (
          <>
            <label className="flex flex-col gap-2">
              <span className="type-label">{t('oath.namePlaceholder')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={20}
                className="min-h-14 rounded-sharp border border-line bg-panel px-4 text-lg
                  font-semibold text-ink outline-none focus:border-rust"
              />
            </label>
            {!nameOk && <p className="type-label !text-danger">{t('oath.nameTooShort')}</p>}

            <button
              type="button"
              onClick={swear}
              disabled={busy || !nameOk}
              className="type-title mt-auto min-h-14 rounded-sharp border border-rust bg-rust
                text-sm text-void disabled:border-line disabled:bg-transparent disabled:text-faint"
            >
              {t('oath.confirm')}
            </button>
          </>
        )}

        {error && <p role="alert" className="type-label !text-danger">{error}</p>}
      </div>
    </div>
  );
}

/** Una ventaja del juramento. Siempre una opción nueva, jamás una cifra mayor. */
function Perk({ text }: { text: string }) {
  return (
    <p className="rounded-sharp border border-line bg-ink/5 px-3 py-3 text-sm font-semibold text-ink">
      {text}
    </p>
  );
}
