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
  orders, onRemove, onClear, primary, t,
}: {
  orders: readonly OrderRow[];
  onRemove: (forceId: string) => void;
  onClear: () => void;
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

      <div className="pointer-events-auto mt-4 flex">{primary}</div>
    </div>
  );
}
