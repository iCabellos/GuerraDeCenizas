import type { ReactNode } from 'react';

/**
 * Marco de página y piezas comunes.
 *
 * Mobile-first de verdad: la columna se diseña a 360 px y el escritorio es la misma
 * interfaz con más aire — nunca reglas distintas ni información distinta.
 *
 * Los objetivos táctiles se miden en píxeles reales, no en unidades de `viewBox`. Es una
 * lección que ya costó cara: las regiones del mapa parecían grandes y medían 21 px.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
      {children}
    </main>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <h1 className="text-2xl font-semibold tracking-tight text-ink">{children}</h1>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-sharp border border-line bg-panel p-4">{children}</div>;
}

/** 56 px de alto: el mínimo son 44, y 44 en la mano de alguien con prisa falla. */
export function Button({
  children, onClick, type = 'button', tone = 'primary', disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  tone?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const palette = tone === 'primary'
    ? 'bg-rust text-void hover:bg-ash-glow disabled:bg-line disabled:text-faint'
    : 'border border-line bg-raised text-ink hover:border-muted disabled:text-faint';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`min-h-14 w-full rounded-sharp px-4 text-base font-medium transition-colors disabled:cursor-not-allowed ${palette}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label, children,
}: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' }) {
  if (!children) return null;
  const palette = tone === 'error'
    ? 'border-danger/50 bg-danger/10 text-ink'
    : 'border-line bg-raised text-muted';
  return (
    <p className={`rounded-sharp border px-3 py-2 text-sm ${palette}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
