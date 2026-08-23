'use client';

import type { Phase } from '@gdc/core';
import { Close, Fire, Line, Sky } from '@/components/art/generated';

/**
 * El raíl de fases y la hoja de órdenes de la pantalla de campaña.
 *
 * Las dos piezas flotan sobre el mapa, así que las dos obedecen la regla que más caro ha
 * salido en este repositorio: **el contenedor va `pointer-events-none` y solo los
 * controles recuperan `auto`**. Hacer el panel más pequeño no arregla nada — siempre
 * queda una región tocable debajo.
 *
 * Aquí no se decide nada: se recibe una lista ya resuelta y se pinta. Componer el texto
 * de cada orden es trabajo de quien tiene el estado, no de quien lo dibuja.
 */

/** Las tres fases que el motor tiene HOY. El diseño dibuja «Reposo», que aún no existe. */
const PHASES: readonly Phase[] = ['parley', 'war', 'resolved'];

export function PhaseRail({
  phase, label, t,
}: {
  phase: Phase;
  /** Descripción del conjunto para lector de pantalla. */
  label: string;
  t: (key: string) => string;
}) {
  return (
    <ol
      aria-label={label}
      className="pointer-events-none flex flex-col gap-0.5 rounded-sharp border
        border-line/70 bg-panel/70 p-2 backdrop-blur-sm"
    >
      {PHASES.map((step) => {
        const now = step === phase;
        return (
          <li
            key={step}
            aria-current={now ? 'step' : undefined}
            className={`type-label flex items-center gap-2 rounded-sharp px-2 py-1 ${
              now ? 'bg-rust/20 !text-rust' : '!text-faint'
            }`}
          >
            {/* La fase actual no se distingue solo por color: también lleva marca. */}
            <span
              aria-hidden
              className={`h-1.5 w-1.5 ${now ? 'bg-rust' : 'bg-transparent outline outline-1 outline-faint'}`}
            />
            {t(`game.${step}`)}
          </li>
        );
      })}
    </ol>
  );
}

/** Lo que se está construyendo, ya resuelto a texto. */
export interface BuildRow {
  item: string;
  qty: number;
  /** Dónde, ya traducido. */
  where: string;
}

/** Una opción de construcción con su coste, tal y como la ofrece el motor. */
export interface BuildOption {
  item: string;
  industry: number;
  /** ¿Llega la Industria? Lo decide el servidor al resolver; esto solo lo enseña. */
  affordable: boolean;
}

/** Una orden ya resuelta a texto. La construye quien tiene el estado autoritativo. */
export interface OrderRow {
  forceId: string;
  arm: 'line' | 'fire' | 'sky';
  count: number;
  /** Destino, ya traducido: «Bosque 12». */
  to: string;
}

const ARM_ICON = { line: Line, fire: Fire, sky: Sky } as const;
const ARM_TINT = { line: 'text-p0', fire: 'text-rust', sky: 'text-p2' } as const;

export function OrderSheet({
  orders, builds, options, onRemove, onClear, onProduce, onUnproduce, primary, t,
}: {
  orders: readonly OrderRow[];
  /** Lo ya encargado este turno. */
  builds: readonly BuildRow[];
  /** Qué se puede construir donde se ha seleccionado. Vacío = no hay dónde. */
  options: readonly BuildOption[];
  onRemove: (forceId: string) => void;
  onClear: () => void;
  onProduce: (item: string) => void;
  onUnproduce: (index: number) => void;
  /** El botón de confirmar turno. Lo monta quien sabe si se puede enviar. */
  primary: React.ReactNode;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-6 pt-24
        bg-gradient-to-b from-transparent from-0% via-void via-25% to-void"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <span className="type-label">
          {t('orders.title')} {orders.length > 0 && orders.length}
        </span>
        {orders.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="type-label pointer-events-auto -mr-2 flex min-h-11 items-center
              px-2 !text-rust"
          >
            {t('orders.clear')}
          </button>
        )}
      </div>

      {orders.length === 0 ? (
        <p className="type-label !normal-case !tracking-normal !text-faint">{t('orders.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {orders.map((order) => {
            const Icon = ARM_ICON[order.arm];
            return (
              <li
                key={order.forceId}
                className="pointer-events-auto flex items-center gap-3 rounded-sharp
                  border-l-2 border-l-rust bg-ink/5 py-3 pl-3 pr-2"
              >
                <Icon size={18} className={ARM_TINT[order.arm]} />
                <span className="flex-1 text-sm font-semibold">
                  {t(`arm.${order.arm}`)} {order.count} → {order.to}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(order.forceId)}
                  aria-label={t('orders.remove')}
                  className="flex min-h-11 min-w-11 items-center justify-center text-faint
                    transition-colors duration-150 ease-out hover:text-danger"
                >
                  <Close size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Producción. Sin esto se podía mover pero nunca gastar Industria, y los bots
          sí producían: doce turnos de asimetría creciente. */}
      {(options.length > 0 || builds.length > 0) && (
        <div className="mt-4 border-t border-line/70 pt-3">
          <span className="type-label">{t('build.title')}</span>

          {options.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {options.map((option) => (
                <button
                  key={option.item}
                  type="button"
                  onClick={() => onProduce(option.item)}
                  disabled={!option.affordable}
                  className="pointer-events-auto flex min-h-11 items-center gap-2 rounded-sharp
                    border border-line bg-raised px-3 text-sm font-semibold
                    disabled:border-line/50 disabled:text-faint"
                >
                  {t(`build.${option.item}`) === `build.${option.item}`
                    ? t(`arm.${option.item}`)
                    : t(`build.${option.item}`)}
                  <span className="type-figure text-xs text-muted">{option.industry}</span>
                </button>
              ))}
            </div>
          )}

          {builds.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {builds.map((build, index) => (
                <li
                  key={`${build.where}-${build.item}`}
                  className="pointer-events-auto flex items-center gap-2 text-sm"
                >
                  <span className="type-figure text-ink">×{build.qty}</span>
                  <span className="flex-1 truncate">
                    {t(`build.${build.item}`) === `build.${build.item}`
                      ? t(`arm.${build.item}`)
                      : t(`build.${build.item}`)} · {build.where}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUnproduce(index)}
                    aria-label={t('build.remove')}
                    className="flex min-h-11 min-w-11 items-center justify-center text-faint
                      transition-colors duration-150 ease-out hover:text-danger"
                  >
                    <Close size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="pointer-events-auto mt-4 flex">{primary}</div>
    </div>
  );
}
