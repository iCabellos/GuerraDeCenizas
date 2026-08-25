'use client';

import type { FactionId, Phase, Resources, Seat, Zone } from '@gdc/core';
import { City, Core, Minus, Plus } from '@/components/art/generated';
import { FactionEmblem, ResourceRow } from '@/components/GameChrome';
import type { LedgerRow, ZoneId, ZoneSummary } from '@/lib/board';
import { SEAT_PATTERN, seatColor } from '@/lib/theme';

/**
 * Todo lo que flota sobre el mapa sin taparlo: cabecera, raíl de fases, mandos de cámara
 * y el reparto.
 *
 * Las cuatro piezas obedecen la regla que más caro ha salido en este repositorio: **el
 * contenedor va `pointer-events-none` y solo los controles recuperan `auto`**. Hacer el
 * panel más pequeño no arregla nada — siempre queda una región tocable debajo.
 *
 * Aquí no se decide nada: se recibe información ya resuelta y se pinta.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

/** Las tres fases que el motor tiene HOY. El diseño dibuja «Reposo», que aún no existe. */
const PHASES: readonly Phase[] = ['parley', 'war', 'resolved'];

/**
 * Cabecera de campaña.
 *
 * Translúcida y a sangre sobre el mapa: la pantalla no se parte en dos, y el mapa sigue
 * empezando en el píxel cero. El asiento se identifica por **barra de color y emblema a la
 * vez**, nunca solo por color ([UX_MOBILE §7](../../../docs/UX_MOBILE.md#7-accesibilidad)).
 */
export function CampaignHeader({
  seat, name, factionId, phase, turn, deadlineAt, resources, t,
}: {
  seat: Seat;
  name: string;
  factionId: FactionId;
  phase: Phase;
  turn: number;
  deadlineAt: string | null;
  resources: Resources;
  t: T;
}) {
  return (
    // El degradado cubre las dos filas y se apaga después: con el mapa a sangre detrás, un
    // velo tibio deja que un hexágono se lea entre el nombre y las cifras.
    <header className="pointer-events-none bg-gradient-to-b from-void from-45% via-void/80
      via-80% to-transparent px-3 pb-5 pt-2">
      <div className="flex items-center gap-2">
        <span className="h-8 w-1" style={{ background: seatColor(seat) }} aria-hidden />
        <FactionEmblem factionId={factionId} size={20} className="shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <p className="type-title truncate text-sm leading-tight text-ink">{name}</p>
          <p className="type-label truncate !tracking-wider">{t(`faction.${factionId}`)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="type-title text-sm leading-tight text-ink">{t(`game.${phase}`)}</p>
          <p className="type-label !tracking-wider">{t('game.turn', { turn })}</p>
        </div>
        <Countdown deadlineAt={deadlineAt} t={t} />
      </div>

      <div className="mt-1 flex items-center">
        <ResourceRow resources={resources} />
      </div>
    </header>
  );
}

/** Lo que queda de plazo, en la unidad que importa. Los segundos solo al final. */
function Countdown({ deadlineAt, t }: { deadlineAt: string | null; t: T }) {
  if (!deadlineAt) return null;
  const left = new Date(deadlineAt).getTime() - Date.now();
  const minutes = Math.floor(left / 60_000);

  const text = left <= 0
    ? t('game.expired')
    : minutes >= 60
      ? t('game.deadlineHours', { n: Math.floor(minutes / 60) })
      : minutes >= 1
        ? t('game.deadlineMinutes', { n: minutes })
        : t('game.deadlineSeconds', { n: Math.max(0, Math.floor(left / 1000)) });

  return (
    <span className={`type-figure shrink-0 border px-2 py-1 text-xs ${
      left <= 0 || minutes < 60
        ? 'border-rust/60 bg-rust/15 text-rust'
        : 'border-line bg-panel/80 text-muted'
    }`}
    >
      {text}
    </span>
  );
}

/** Raíl de fases. Es un indicador, no un control: no intercepta un solo gesto. */
export function PhaseRail(
  { phase, label, t, act }: { phase: Phase; label: string; t: T; act?: Zone },
) {
  return (
    <ol
      aria-label={label}
      className="pointer-events-none flex flex-col border border-line/70 bg-panel/70 p-1
        backdrop-blur-sm"
    >
      {/* El acto en curso, arriba del todo. La campaña cambia de forma dos veces y las
          dos por una decisión de los jugadores; saber en cuál estás no es decoración. */}
      {act !== undefined && (
        <li className="type-label border-b border-line/50 px-1.5 pb-1 !text-[10px] !text-ash">
          {t(`zone.act${act}`)}
        </li>
      )}
      {PHASES.map((step) => {
        const now = step === phase;
        return (
          <li
            key={step}
            aria-current={now ? 'step' : undefined}
            className={`type-label flex items-center gap-1.5 px-1.5 py-0.5 !text-[10px] ${
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

/**
 * Mandos de cámara.
 *
 * El que importa es el primero: **volver a tu ciudad**. En un mapa de hasta 96 regiones,
 * perder el Bastión de vista y tener que buscarlo arrastrando es la forma más rápida de
 * que la partida deje de parecer un juego. Cada botón lleva su nombre al lado del glifo
 * ([ADR-038](../../../docs/DECISIONS.md#adr-038)): un icono suelto no enseña, esconde.
 */
export function MapControls({
  onHome, onCore, onZoomIn, onZoomOut, t,
}: {
  onHome: () => void;
  onCore: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  t: T;
}) {
  return (
    <div className="pointer-events-none flex flex-col items-end gap-1.5">
      <CameraButton onClick={onHome} label={t('camera.city')} tone="home">
        <City size={18} />
      </CameraButton>
      <CameraButton onClick={onCore} label={t('camera.core')}>
        <Core size={18} />
      </CameraButton>
      <div className="pointer-events-auto flex flex-col border border-line bg-panel/85 backdrop-blur-sm">
        <button
          type="button" onClick={onZoomIn} aria-label={t('camera.in')} title={t('camera.in')}
          className="flex h-11 w-11 items-center justify-center text-muted hover:text-ink"
        >
          <Plus size={18} />
        </button>
        <span className="mx-2 h-px bg-line" aria-hidden />
        <button
          type="button" onClick={onZoomOut} aria-label={t('camera.out')} title={t('camera.out')}
          className="flex h-11 w-11 items-center justify-center text-muted hover:text-ink"
        >
          <Minus size={18} />
        </button>
      </div>
    </div>
  );
}

function CameraButton({
  onClick, label, tone, children,
}: {
  onClick: () => void;
  label: string;
  tone?: 'home';
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`type-label pointer-events-auto flex h-11 items-center gap-2 border px-2.5
        backdrop-blur-sm ${
        tone === 'home'
          ? 'border-rust/60 bg-rust/15 !text-rust'
          : 'border-line bg-panel/85 !text-muted hover:!text-ink'
      }`}
    >
      {children}
      {label}
    </button>
  );
}

/**
 * El reparto.
 *
 * Es la diplomacia que este juego **sí** puede enseñar hoy, y no es un adorno: el control
 * territorial es público (GDD §6.2), así que quién va delante se sabe con certeza. Toda la
 * premisa del juego es que negociar es aritmética — sin esta tabla, la aritmética estaba
 * repartida por 96 hexágonos y no la miraba nadie.
 *
 * Tocar una fila enciende su territorio en el mapa y lleva la cámara a su Bastión: es la
 * respuesta a «¿dónde está el enemigo?» en un tap.
 */
export function RivalLedger({
  rows, spotlight, onSpotlight, t,
}: {
  rows: readonly LedgerRow[];
  spotlight: Seat | null;
  onSpotlight: (seat: Seat | null) => void;
  t: T;
}) {
  return (
    // El rótulo lo pone la pestaña que abre este panel: repetirlo aquí era decir dos
    // veces lo mismo en dos centímetros de pantalla.
    <section aria-label={t('ledger.title')}>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => {
          const lit = spotlight === row.seat;
          return (
            <li key={row.seat}>
              <button
                type="button"
                onClick={() => onSpotlight(lit ? null : row.seat)}
                aria-pressed={lit}
                className={`flex min-h-11 w-full items-center gap-2.5 border px-2 py-1.5 text-left
                  ${lit ? 'border-rust bg-rust/10' : 'border-line/70 bg-ink/[0.03]'}`}
              >
                {/* Color y trama a la vez: quien no distinga rojo de verde lee la trama. */}
                <span
                  aria-hidden
                  className={`h-7 w-3 shrink-0 border border-line/60 pat-${SEAT_PATTERN[row.seat]}`}
                  style={{ color: seatColor(row.seat) }}
                />
                <FactionEmblem factionId={row.factionId} size={16} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1">
                  <span className="type-title block truncate text-xs text-ink">
                    {row.own ? t('ledger.you') : row.name}
                  </span>
                  <span className="type-label block truncate !tracking-wider">
                    {t(`faction.${row.factionId}`)}
                    {row.core ? ` · ${t('ledger.core')}` : ''}
                  </span>
                </span>
                <Figure value={row.regions} label={t('ledger.regions')} />
                <Figure value={row.seams} label={t('ledger.seams')} tone="ash" />
                <Figure value={row.contact} label={t('ledger.contact')} tone={row.own ? undefined : 'danger'} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Figure({
  value, label, tone,
}: { value: number; label: string; tone?: 'ash' | 'danger' }) {
  return (
    <span className="w-9 shrink-0 text-center">
      <span className={`type-figure block text-sm ${
        tone === 'ash' ? 'text-ash' : tone === 'danger' && value > 0 ? 'text-danger' : 'text-ink'
      }`}
      >
        {value}
      </span>
      <span className="type-label block !text-[9px] !tracking-normal">{label}</span>
    </span>
  );
}

/**
 * El raíl de zonas: el **nivel 1 del mapa**.
 *
 * No es un menú y no debe parecerlo. Es el mapa visto de lejos: tres bandas con lo que
 * hay en cada una —cuánto es tuyo, cuántas Menas explotas, cuántas Puertas quedan por
 * pagar— y tocar una lleva la cámara allí. La razón de que exista está medida: con 271
 * hexágonos, dibujarlos todos deja cada uno en ~12 px, la cuarta parte del objetivo
 * táctil ([ADR-042](../../../docs/DECISIONS.md#adr-042)).
 *
 * Ocupa sitio en la columna, no flota sobre el mapa. Un panel flotante vuelve a traer el
 * fallo de siempre: un destino resaltado que queda debajo.
 */
export function ZoneRail({
  zones, active, onZone, t,
}: {
  zones: readonly ZoneSummary[];
  active: ZoneId;
  onZone: (zone: ZoneId) => void;
  t: T;
}) {
  return (
    <nav aria-label={t('zone.rail')} className="flex border-b border-line/60 bg-panel">
      {zones.map((zone) => {
        const now = zone.zone === active;
        const sealed = zone.gates > 0 && zone.gatesOpen === 0;

        return (
          <button
            key={zone.zone}
            type="button"
            aria-current={now ? 'true' : undefined}
            onClick={() => onZone(zone.zone)}
            className={`min-h-11 flex-1 border-r border-line/40 px-2 py-1 text-left
              last:border-r-0 ${now ? 'bg-rust/15' : ''}`}
          >
            {/* Nombre primero: un control que solo se distingue por su glifo no enseña,
                esconde ([ADR-038]). Dos líneas y no cuatro: cada píxel que se lleva este
                raíl se lo quita al mapa, y el mapa es la interfaz ([ADR-040]). */}
            <span className={`type-label block !text-[11px] ${now ? '!text-rust' : '!text-ash'}`}>
              {t(`zone.${zone.zone}`)}
            </span>
            <span className="type-figure block text-[11px] tabular-nums">
              <span className="text-faint">{zone.mine}/{zone.total}</span>
              {zone.gates > 0 && (
                // Cuántas Puertas quedan por abrir es la cifra que decide la partida: es
                // lo que hay que pagar para entrar, y lo pagará alguien delante de todos.
                <span className={`ml-1.5 ${sealed ? 'text-danger' : 'text-faint'}`}>
                  {t('zone.gates', { open: zone.gatesOpen, total: zone.gates })}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
