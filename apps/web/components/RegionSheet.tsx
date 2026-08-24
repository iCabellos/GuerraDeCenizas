'use client';

import type { Buildable, CombatPreview as Preview, Seat, VisibleForce } from '@gdc/core';
import {
  Ash, Bridge, Close, Fire, Fortified, Hold, Industry, Intel, Line, Move, Sky, Supply, Support,
} from '@/components/art/generated';
import { dominantArm, sizeOf, troops, type RegionBrief } from '@/lib/board';
import { seatColor } from '@/lib/theme';

/**
 * La región, tocada en el mapa.
 *
 * Es el único sitio donde se dan órdenes, y todas empiezan con un tap sobre el mapa: se
 * toca una región, aparece esta ficha, y lo que se puede hacer en ella son botones. No hay
 * menú, no hay modo, no hay formulario.
 *
 * **Flota sobre el mapa sin taparlo**: el contenedor va `pointer-events-none` y solo los
 * controles recuperan `auto`, y su alto está limitado para que el mapa siga viéndose
 * detrás. Tercera lección cara del repositorio; no se repite.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

/** Qué se puede construir aquí, tal y como lo ofrece el motor. */
export interface BuildChoice {
  item: Buildable;
  industry: number;
  /** ¿Llega la Industria? Lo decide el servidor al resolver; esto solo lo enseña. */
  affordable: boolean;
}

const ARM_ICON = { line: Line, fire: Fire, sky: Sky } as const;
const BUILD_ICON: Record<Buildable, typeof Line> = {
  line: Line, fire: Fire, sky: Sky, fort: Fortified, bridge: Bridge,
};

export function RegionSheet({
  brief, place, seat, aiming, orderText, canOrder, onMove, onHold, onSupport, onCancel,
  builds, onBuild, forecast, onClose, t,
}: {
  brief: RegionBrief;
  /** Cómo se llama la región, ya traducido. */
  place: string;
  seat: Seat;
  /** Se está eligiendo destino desde aquí. */
  aiming: 'move' | 'support' | null;
  /** La orden que ya tiene la fuerza de aquí, ya resuelta a texto. */
  orderText: string | null;
  /** Hay fuerza propia y la fase permite ordenarla. */
  canOrder: boolean;
  onMove: () => void;
  onHold: () => void;
  onSupport: () => void;
  onCancel: () => void;
  builds: readonly BuildChoice[];
  onBuild: (item: Buildable) => void;
  forecast: Preview | null;
  onClose: () => void;
  t: T;
}) {
  const owner = brief.owner;
  const ownerLabel = owner === null
    ? t('region.ownerNone')
    : owner === seat ? t('region.ownerYou') : t('region.ownerSeat', { seat: owner + 1 });

  return (
    <section
      aria-label={place}
      className="max-h-[42dvh] overflow-y-auto border-t-2 bg-panel px-3 pb-3 pt-2.5"
      style={{ borderTopColor: owner === null ? 'var(--color-line)' : seatColor(owner) }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="type-title truncate text-base leading-tight text-ink">{place}</h2>
          <p className="type-label truncate !tracking-wider">
            {ownerLabel}
            {brief.fortification > 0 ? ` · ${t('region.fort', { level: brief.fortification })}` : ''}
            {brief.bridge ? ` · ${t('build.bridge')}` : ''}
            {!brief.observed ? ` · ${t('region.unobserved')}` : ''}
          </p>
        </div>
        <button
          type="button" onClick={onClose} aria-label={t('region.close')}
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center text-faint
            hover:text-ink"
        >
          <Close size={16} />
        </button>
      </div>

      <Yields brief={brief} t={t} />

      {(brief.mine.length > 0 || brief.enemies.length > 0) && (
        <ul className="mt-2 flex flex-col gap-1">
          {brief.mine.map((force) => (
            <ForceRow key={force.id} force={force} seat={seat} t={t} />
          ))}
          {brief.enemies.map((force) => (
            <ForceRow key={force.id} force={force} seat={force.seat} t={t} enemy />
          ))}
        </ul>
      )}

      {forecast && <Forecast forecast={forecast} seat={seat} t={t} />}

      {orderText && (
        <p className="type-label mt-2 flex items-center gap-2 border-l-2 border-l-rust bg-ink/5
          px-2 py-1.5 !normal-case !tracking-normal !text-ink"
        >
          {orderText}
        </p>
      )}

      {/* Lo que se puede hacer aquí. Si no se puede, no se enseña: un botón apagado que
          nunca se enciende es ruido, no información. */}
      {canOrder && (
        <div className="mt-2 flex gap-1.5">
          <Action
            onClick={onMove} label={t(brief.enemies.length > 0 ? 'action.attack' : 'action.move')}
            active={aiming === 'move'} tone={brief.enemies.length > 0 ? 'attack' : undefined}
          >
            <Move size={18} />
          </Action>
          <Action onClick={onHold} label={t('action.hold')}>
            <Hold size={18} />
          </Action>
          <Action onClick={onSupport} label={t('action.support')} active={aiming === 'support'}>
            <Support size={18} />
          </Action>
          {orderText && (
            <Action onClick={onCancel} label={t('action.cancel')}>
              <Close size={18} />
            </Action>
          )}
        </div>
      )}

      {aiming && (
        <p className="type-label mt-2 !text-rust">
          {t(aiming === 'move' ? 'region.pickTarget' : 'region.pickSupport')}
        </p>
      )}

      {builds.length > 0 && (
        <div className="mt-3 border-t border-line/70 pt-2">
          <span className="type-label">{t('build.title')}</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {builds.map((choice) => {
              const Icon = BUILD_ICON[choice.item];
              return (
                <button
                  key={choice.item}
                  type="button"
                  onClick={() => onBuild(choice.item)}
                  disabled={!choice.affordable}
                  className="flex min-h-11 items-center gap-1.5 border border-line bg-raised px-2.5
                    text-sm font-semibold disabled:border-line/50 disabled:text-faint"
                >
                  <Icon size={15} className="text-muted" />
                  {t(`build.${choice.item}`)}
                  <span className="type-figure text-xs text-muted">{choice.industry}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Renta bruta del terreno. Es la razón por la que una región vale una guerra. */
function Yields({ brief, t }: { brief: RegionBrief; t: T }) {
  const cells = [
    { key: 'supply', Icon: Supply, value: brief.yields.supply },
    { key: 'industry', Icon: Industry, value: brief.yields.industry },
    { key: 'intel', Icon: Intel, value: brief.yields.intel },
    { key: 'ash', Icon: Ash, value: brief.yields.ash },
  ] as const;

  return (
    <ul className="mt-2 flex gap-1.5">
      {cells.map(({ key, Icon, value }) => (
        <li
          key={key}
          className={`flex-1 border border-line/60 px-2 py-1 ${value === 0 ? 'opacity-45' : ''}`}
        >
          <span className="flex items-center gap-1.5">
            <Icon size={13} className={key === 'ash' ? 'text-ash' : 'text-faint'} />
            <span className="type-figure text-sm text-ink">{value}</span>
          </span>
          <span className="type-label block !text-[9px] !tracking-normal">{t(`resource.${key}`)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Una fuerza.
 *
 * De las propias se sabe el desglose exacto; de las ajenas, a veces solo el tamaño. La
 * diferencia se enseña con el `~`, no se disimula: lo que no sabes es media partida.
 */
function ForceRow({
  force, seat, enemy = false, t,
}: { force: VisibleForce; seat: Seat; enemy?: boolean; t: T }) {
  const Icon = ARM_ICON[dominantArm(force)];
  const known = force.line !== null;

  return (
    <li className="flex items-center gap-2 border-l-2 bg-ink/[0.03] py-1.5 pl-2 pr-1"
      style={{ borderLeftColor: seatColor(seat) }}
    >
      <Icon size={16} className={enemy ? 'text-danger' : 'text-muted'} />
      <span className="flex-1 truncate text-sm">
        {known
          ? `${t('arm.line')} ${troops(force.line)} · ${t('arm.fire')} ${troops(force.fire)} · ${t('arm.sky')} ${troops(force.sky)}`
          : t('region.unknownForce')}
      </span>
      {force.unsupplied !== null && force.unsupplied > 0 && (
        <span className="type-label !text-warn">{t('region.unsupplied')}</span>
      )}
      <span className="type-figure text-sm text-ink">{known ? sizeOf(force) : `~${sizeOf(force)}`}</span>
    </li>
  );
}

/**
 * El pronóstico de combate.
 *
 * Sale de la MISMA función que resuelve el turno, así que no puede mentir sobre las
 * reglas. Lo único que puede fallar es la información de partida — y por eso el aviso de
 * incertidumbre no es letra pequeña: el resultado es exacto *dado lo que sabes*.
 */
function Forecast({ forecast, seat, t }: { forecast: Preview; seat: Seat; t: T }) {
  const mine = forecast.sides.find((side) => side.seat === seat);
  const theirs = forecast.sides.filter((side) => side.seat !== seat);
  const win = forecast.winner === seat;
  const draw = forecast.winner === null;

  return (
    <div className="mt-2 border border-line bg-raised px-2.5 py-2">
      <div className="flex items-center justify-between">
        <span className="type-label">{t('forecast.title')}</span>
        <span className={`type-title text-sm ${draw ? 'text-warn' : win ? 'text-success' : 'text-danger'}`}>
          {t(draw ? 'forecast.draw' : win ? 'forecast.win' : 'forecast.lose')}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="type-figure text-lg" style={{ color: seatColor(seat) }}>
          {round(mine?.power ?? 0)}
        </span>
        <span className="type-label flex-1">{t('forecast.power')}</span>
        <span
          className="type-figure text-lg"
          style={{ color: seatColor(theirs[0]?.seat ?? 0) }}
        >
          {round(Math.max(0, ...theirs.map((side) => side.power)))}
        </span>
      </div>
      {forecast.uncertain && (
        <p className="type-label mt-1 !normal-case !tracking-normal !text-warn">
          {t('forecast.uncertain')}
        </p>
      )}
    </div>
  );
}

/** Botón de acción: glifo **y** nombre. Un icono sin rótulo no enseña, esconde (ADR-038). */
function Action({
  onClick, label, active = false, tone, children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  tone?: 'attack';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`type-label flex min-h-14 flex-1 flex-col items-center justify-center gap-1 border
        ${active
          ? 'border-rust bg-rust text-void'
          : tone === 'attack'
            ? 'border-rust/70 bg-rust/15 !text-rust'
            : 'border-line bg-raised !text-muted'}`}
    >
      {children}
      <span className={active ? 'text-void' : ''}>{label}</span>
    </button>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
