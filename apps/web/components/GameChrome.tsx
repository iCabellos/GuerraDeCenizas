'use client';

import type { ReactNode } from 'react';
import type { FactionId, Resources, Seat } from '@gdc/core';
import {
  Ash, FactionKoldvik, FactionMeridia, FactionOshara, FactionSaranth, FactionTarn,
  FactionVantera, Industry, Intel, Supply,
} from '@/components/art/generated';
import { seatColor } from '@/lib/theme';

/**
 * Cromo del tablero: la cabecera de mando y la barra de órdenes.
 *
 * Vive aparte y lo comparten el prototipo local y el tablero en red **a propósito**. Si
 * cada uno tuviera el suyo, la pantalla que se puede probar sin base de datos dejaría de
 * parecerse a la que juega la gente, y las regresiones visuales solo se verían en
 * producción.
 *
 * El registro visual es el de una carta de situación: rótulos condensados en versales,
 * cifras tabulares que se alinean en columna, esquinas de 4 px y ni una sombra.
 */

const FACTION_EMBLEM = {
  vantera: FactionVantera,
  koldvik: FactionKoldvik,
  saranth: FactionSaranth,
  meridia: FactionMeridia,
  oshara: FactionOshara,
  tarn: FactionTarn,
} as const;

const RESOURCE_ART = {
  supply: Supply,
  industry: Industry,
  intel: Intel,
  ash: Ash,
} as const;

export type ResourceKey = keyof typeof RESOURCE_ART;
export const RESOURCE_ORDER: readonly ResourceKey[] = ['supply', 'industry', 'intel', 'ash'];

/**
 * Cabecera de mando.
 *
 * El asiento se identifica por **barra de color y emblema a la vez**, nunca solo por
 * color: quien no distinga rojo de verde tiene que poder jugar igual
 * ([UX_MOBILE §7](../../../docs/UX_MOBILE.md#7-accesibilidad)).
 */
export function CommandHeader({
  seat, name, factionId, doctrine, phase, turn, regions, regionsLabel, resources,
  floating = false,
}: {
  seat: Seat;
  name: string;
  factionId: FactionId;
  doctrine: string;
  phase: string;
  turn: string;
  regions: number;
  regionsLabel: string;
  resources: Resources;
  /** Sobre el mapa la cabecera se translucida en vez de cortar la pantalla en dos. */
  floating?: boolean;
}) {
  const Emblem = FACTION_EMBLEM[factionId] ?? FactionVantera;

  return (
    <header
      className={`shrink-0 ${
        floating ? 'bg-panel/80 backdrop-blur-sm' : 'border-b border-line bg-panel'
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <span
          className="h-9 w-1"
          style={{ background: seatColor(seat) }}
          aria-hidden
        />
        <Emblem size={22} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="type-title truncate text-sm leading-tight text-ink">{name}</p>
          <p className="type-label truncate !tracking-wider">{doctrine}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="type-title text-sm leading-tight text-ink">{phase}</p>
          <p className="type-label !tracking-wider">{turn}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-3 py-1.5">
        <ResourceRow resources={resources} />
        <span className="type-label !tracking-wider">
          <span className="type-figure">{regions}</span> {regionsLabel}
        </span>
      </div>
    </header>
  );
}

/** Fila de recursos con iconos reales. Los números van tabulares para poder compararse. */
export function ResourceRow({ resources }: { resources: Resources }) {
  return (
    <ul className="flex items-center gap-4">
      {RESOURCE_ORDER.map((key) => {
        const Icon = RESOURCE_ART[key];
        return (
          <li key={key} className="flex items-center gap-1.5">
            <Icon size={14} className={key === 'ash' ? 'text-ash' : 'text-faint'} />
            <span className="type-figure text-sm text-ink">{Math.round(resources[key])}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Emblema de facción por identificador. Lo usan la lista de partidas y la cabecera. */
export function FactionEmblem({
  factionId, size = 24, className, title,
}: { factionId: FactionId; size?: number; className?: string; title?: string }) {
  const Emblem = FACTION_EMBLEM[factionId] ?? FactionVantera;
  return <Emblem size={size} className={className} title={title} />;
}

/**
 * Barra de órdenes. Vive en el tercio inferior porque es la zona cómoda del pulgar
 * ([UX_MOBILE §1.2](../../../docs/UX_MOBILE.md#12-zona-del-pulgar)) y porque una acción
 * irreversible no puede estar donde se toca sin querer.
 */
export function OrderBar({
  status, phase, children, primary,
}: {
  status: string;
  phase: string;
  children?: ReactNode;
  primary: ReactNode;
}) {
  return (
    <footer className="shrink-0 border-t border-line bg-panel px-3 pb-3 pt-2">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="type-label">{status}</span>
        <span className="type-label !tracking-wider">{phase}</span>
      </div>
      <div className="flex gap-2">
        {children}
        {primary}
      </div>
    </footer>
  );
}

/** Botón secundario cuadrado de la barra de órdenes: solo icono, 56 px de lado. */
export function OrderTool({
  onClick, label, children,
}: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex min-h-14 min-w-14 items-center justify-center rounded-sharp border
        border-line bg-raised text-muted transition-colors duration-150 ease-out
        hover:border-faint hover:text-ink"
    >
      {children}
    </button>
  );
}

/** Acción primaria de la barra: enviar el turno. */
export function OrderCommit({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="type-title min-h-14 flex-1 rounded-sharp border border-rust bg-rust text-sm
        text-void transition-all duration-150 ease-out hover:brightness-110
        disabled:cursor-not-allowed disabled:border-line
        disabled:bg-transparent disabled:text-faint"
    >
      {children}
    </button>
  );
}
