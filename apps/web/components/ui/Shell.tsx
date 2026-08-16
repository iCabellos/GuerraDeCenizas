import type { ReactNode } from 'react';
import { Mark } from '@/components/art/generated';

/**
 * Kit de interfaz.
 *
 * La dirección visual es **una carta de situación desplegada sobre una mesa de mando**
 * ([ASSET_PIPELINE §2.1](../../../../docs/ASSET_PIPELINE.md#21-concepto)). De ahí salen
 * todas las decisiones de este archivo y ninguna es estética por sí sola:
 *
 * · **Esquinas de 4 px.** Nada redondeado: es un juego militar, no una aplicación.
 * · **Sin sombras.** La profundidad la dan el borde y la superficie, como en un plano.
 * · **Rótulos condensados en versales.** Es la tipografía de un instrumento.
 * · **Marcas de registro** en las esquinas de los paneles: el detalle que separa una
 *   caja de un instrumento.
 * · **Números tabulares** en todo lo que se compare — recursos, plazos, asientos.
 *
 * Se diseña a 360×640 primero. El escritorio es la misma interfaz con más aire, nunca
 * información distinta.
 */

/** Pantalla completa con retícula cartográfica y caída de Ceniza. */
export function Screen({ children, quiet = false }: { children: ReactNode; quiet?: boolean }) {
  return (
    <div className="relative min-h-dvh overflow-hidden bg-void">
      <div className="chart-grid pointer-events-none absolute inset-0 opacity-40" />
      {/* La Ceniza cae en los menús y NUNCA sobre el mapa: allí competiría con las
          fuerzas, que es justo lo que hay que mirar. */}
      {!quiet && <div className="ashfall" />}
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
        {children}
      </main>
    </div>
  );
}

/** Cabecera de marca: emblema + nombre. El emblema es el Núcleo con simetría de orden 3. */
export function Masthead({ subtitle }: { subtitle?: string }) {
  return (
    <header className="flex items-center gap-3">
      <Mark size={40} className="ember text-rust" />
      <div className="min-w-0">
        <p className="type-display text-xl text-ink">Guerra de Cenizas</p>
        {subtitle && <p className="type-label mt-1 truncate">{subtitle}</p>}
      </div>
    </header>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="type-display text-2xl text-ink">{children}</h1>;
}

export function Legend({ children }: { children: ReactNode }) {
  return <p className="type-label">{children}</p>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

/** Panel con marcas de registro en las esquinas. */
export function Panel({ children, tone = 'panel' }: { children: ReactNode; tone?: 'panel' | 'void' }) {
  return (
    <div
      className={`registered rounded-sharp border border-line p-4 ${
        tone === 'void' ? 'bg-void/60' : 'bg-panel'
      }`}
    >
      {children}
    </div>
  );
}

/** Regla graduada. Separa secciones sin gastar una línea entera de tinta. */
export function Rule() {
  return <div className="tick-rule my-1" aria-hidden />;
}

/**
 * Acción principal. 56 px de alto: el mínimo accesible son 44, y 44 en la mano de
 * alguien con prisa falla.
 */
export function Command({
  children, onClick, type = 'button', tone = 'primary', disabled = false, icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  tone?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const palette = {
    primary: 'border-rust bg-rust text-void hover:brightness-110',
    ghost: 'border-line bg-raised text-ink hover:border-muted',
    danger: 'border-danger bg-transparent text-danger hover:bg-danger/10',
  }[tone];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`type-title flex min-h-14 w-full items-center justify-center gap-2 rounded-sharp
        border text-sm transition-colors duration-150 ease-out
        disabled:cursor-not-allowed disabled:border-line disabled:bg-transparent
        disabled:text-faint ${palette}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="type-label">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`min-h-14 rounded-sharp border border-line bg-raised px-3 text-base
        text-ink transition-colors duration-150 ease-out placeholder:text-faint
        focus:border-rust focus:outline-none ${props.className ?? ''}`}
    />
  );
}

/** Opción de una lista de una sola elección. El estado se anuncia, no solo se colorea. */
export function Choice({
  selected, onClick, children, detail,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  detail?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`registered flex min-h-14 w-full items-center gap-3 rounded-sharp border px-3
        text-left transition-colors duration-150 ease-out ${
          selected
            ? 'border-rust bg-rust/12 text-ink'
            : 'border-line bg-raised text-muted hover:border-faint'
        }`}
    >
      {/* Indicador cuadrado, no un círculo: aquí no hay nada redondeado. */}
      <span
        aria-hidden
        className={`size-3 shrink-0 border ${
          selected ? 'border-rust bg-rust' : 'border-faint bg-transparent'
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="type-title block text-sm text-ink">{children}</span>
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </span>
    </button>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  if (!children) return null;
  const palette = tone === 'error'
    ? 'border-danger/60 bg-danger/10 text-ink'
    : 'border-line bg-raised text-muted';
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-sharp border-l-2 px-3 py-2 text-sm ${palette}`}
    >
      {children}
    </p>
  );
}

/** Cifra con su rótulo. Alineada en columna con las demás por los números tabulares. */
export function Figure({
  icon, value, label,
}: { icon?: ReactNode; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={label}>
      {icon}
      <span className="type-figure text-sm text-ink">{value}</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}
