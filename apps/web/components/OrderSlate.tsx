'use client';

import type { RegionId, Seat } from '@gdc/core';
import { Close, Fire, Hold, Line, Move, Sky, Support } from '@/components/art/generated';
import { seatColor } from '@/lib/theme';

/**
 * La pizarra de órdenes.
 *
 * Enseña **una casilla por fuerza**, tenga orden o no. Las vacías no son un hueco de
 * maquetación: son la pregunta que el juego le está haciendo al jugador este turno, y
 * mientras estuvieron ocultas la pantalla decía «Ninguna orden todavía» y se quedaba tan
 * ancha — el jugador no tenía forma de saber cuántas decisiones le quedaban por tomar.
 *
 * Cuántas casillas hay no lo decide esta pantalla: son las fuerzas que el motor te
 * reconoce, y el motor no acepta más de una orden por fuerza.
 *
 * Tocar una casilla vacía **lleva la cámara a esa fuerza y la selecciona**. Todo se ordena
 * en el mapa; esto es el índice, no un formulario paralelo.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

export type OrderKind = 'move' | 'attack' | 'hold' | 'support';

/** Una casilla, ya resuelta a texto por quien tiene el estado. */
export interface SlateRow {
  forceId: string;
  regionId: RegionId;
  arm: 'line' | 'fire' | 'sky';
  size: number;
  /** Dónde está, ya traducido. */
  where: string;
  /** La orden, ya traducida. `null` = casilla vacía. */
  order: string | null;
  kind: OrderKind | null;
}

/** Lo que se está construyendo, ya resuelto a texto. */
export interface BuildRow {
  item: string;
  qty: number;
  where: string;
}

const ARM_ICON = { line: Line, fire: Fire, sky: Sky } as const;
const KIND_ICON = { move: Move, attack: Fire, hold: Hold, support: Support } as const;

export function OrderSlate({
  rows, builds, seat, onPick, onRemove, onUnbuild, t,
}: {
  rows: readonly SlateRow[];
  builds: readonly BuildRow[];
  seat: Seat;
  /** Selecciona la fuerza en el mapa y lleva la cámara. */
  onPick: (regionId: RegionId) => void;
  onRemove: (forceId: string) => void;
  onUnbuild: (index: number) => void;
  t: T;
}) {
  return (
    <div className="max-h-[28dvh] overflow-y-auto bg-panel px-3 pb-2 pt-1.5
      backdrop-blur-sm"
    >
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const Icon = row.kind ? KIND_ICON[row.kind] : ARM_ICON[row.arm];
          return (
            <li key={row.forceId}>
              <div
                className={`flex items-center gap-2 border-l-2 py-0.5 pl-2 pr-1 ${
                  row.order === null
                    ? 'border-l-line border-y border-r border-dashed border-y-line/60 border-r-line/60 bg-transparent'
                    : 'bg-ink/5'
                }`}
                style={row.order === null ? undefined : { borderLeftColor: seatColor(seat) }}
              >
                <button
                  type="button"
                  onClick={() => onPick(row.regionId)}
                  className="flex min-h-11 flex-1 items-center gap-2 text-left"
                >
                  <Icon size={16} className={row.order === null ? 'text-faint' : 'text-rust'} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] font-semibold leading-tight ${
                      row.order === null ? 'text-muted' : ''}`}
                    >
                      {row.order ?? t('orders.slot')}
                    </span>
                    <span className="type-label block truncate !text-[10px] !tracking-wider">
                      {t(`arm.${row.arm}`)} {row.size} · {row.where}
                    </span>
                  </span>
                </button>
                {row.order !== null && (
                  <button
                    type="button"
                    onClick={() => onRemove(row.forceId)}
                    aria-label={t('orders.remove')}
                    className="flex min-h-11 min-w-11 items-center justify-center text-faint
                      hover:text-danger"
                  >
                    <Close size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {rows.length === 0 && (
        <p className="type-label !normal-case !tracking-normal !text-faint">{t('orders.noForces')}</p>
      )}

      {builds.length > 0 && (
        <div className="mt-2 border-t border-line/70 pt-2">
          <span className="type-label">{t('build.title')}</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {builds.map((build, index) => (
              <li key={`${build.where}-${build.item}`} className="flex items-center gap-2 text-sm">
                <span className="type-figure text-ink">×{build.qty}</span>
                <span className="flex-1 truncate">{t(`build.${build.item}`)} · {build.where}</span>
                <button
                  type="button"
                  onClick={() => onUnbuild(index)}
                  aria-label={t('build.remove')}
                  className="flex min-h-11 min-w-11 items-center justify-center text-faint
                    hover:text-danger"
                >
                  <Close size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * La barra de confirmación.
 *
 * Una sola fila: en 360×640 cada franja de cromo se le quita al mapa, y el mapa es el
 * juego. Va en el tercio inferior porque es la zona del pulgar y porque una acción
 * irreversible no puede estar donde se toca sin querer
 * ([UX_MOBILE §1.2](../../../docs/UX_MOBILE.md#12-zona-del-pulgar)).
 */
export function CommitBar({
  onClear, canClear, onSubmit, disabled, label, t,
}: {
  onClear: () => void;
  canClear: boolean;
  onSubmit: () => void;
  disabled: boolean;
  /** El texto del botón: enviar, enviando o enviado. Lo sabe quien envía. */
  label: string;
  t: T;
}) {
  return (
    <div className="flex gap-2 border-t border-line bg-panel px-3 pb-3 pt-2">
      {canClear && (
        <button
          type="button"
          onClick={onClear}
          className="type-label min-h-14 shrink-0 border border-line px-3 !text-rust"
        >
          {t('orders.clear')}
        </button>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="type-title min-h-14 flex-1 border border-rust bg-rust text-sm text-void
          transition-all duration-150 ease-out hover:brightness-110
          disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent
          disabled:text-faint"
      >
        {label}
      </button>
    </div>
  );
}
