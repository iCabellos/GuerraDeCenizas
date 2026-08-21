'use client';

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerView, RegionId, Seat, TerrainKind } from '@gdc/core';
import { SEAT_PATTERN, TERRAIN_FILL, TERRAIN_NAME, seatColor } from '@/lib/theme';

const NODE_R = 32;

/**
 * Radio por tipo de región. No es decoración: el Núcleo es el objetivo de la partida
 * entera y en un grafo de nodos idénticos se pierde entre los demás. La jerarquía visual
 * tiene que contar la jerarquía del juego.
 */
const RADIUS: Partial<Record<TerrainKind, number>> = {
  core: NODE_R * 1.35,
  bastion: NODE_R * 1.12,
};

const radiusOf = (kind: TerrainKind) => RADIUS[kind] ?? NODE_R;

/**
 * Una región, dibujada como hexágono.
 *
 * Punta arriba, la misma orientación que usa el mundo 2.5D, para que el mapa plano y el
 * de relieve enseñen la misma pieza ([ADR-037](../../../docs/DECISIONS.md#adr-037)).
 *
 * **No tejen un panal.** Las regiones viven en coordenadas polares —`mapgen` las coloca
 * con `cos(θ)·r`— y la adyacencia son aristas explícitas, no losas que se tocan. Son
 * fichas hexagonales sobre un tablero, con junta entre ellas, y eso es deliberado: una
 * retícula hexagonal de verdad **no admite simetría de orden 5**, así que tejer el panal
 * costaría la equidad de las mesas de cinco, que es la premisa del juego entero.
 *
 * `radius` es el circunradio: la distancia del centro a cada vértice.
 */
function hexPath(cx: number, cy: number, radius: number): string {
  let path = '';
  for (let corner = 0; corner < 6; corner += 1) {
    const angle = Math.PI / 6 + (corner * Math.PI) / 3;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    path += `${corner === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${path}Z`;
}

interface Props {
  view: PlayerView;
  selected: RegionId | null;
  reachable: readonly RegionId[];
  ordered: ReadonlyMap<RegionId, RegionId>;
  onSelect: (regionId: RegionId) => void;
}

/** Encuadra el centroide de un conjunto de regiones. */
function centroid(view: PlayerView, ids: readonly RegionId[]): { x: number; y: number } | null {
  const points = ids.map((id) => view.map.regions[id]).filter(Boolean);
  if (points.length === 0) return null;
  return {
    x: points.reduce((s, r) => s + r!.x, 0) / points.length,
    y: points.reduce((s, r) => s + r!.y, 0) / points.length,
  };
}

/**
 * Mapa en SVG. Ver ADR-012: no es Canvas ni WebGL a propósito.
 *
 * Cada región es un `<g role="button" tabindex="0">`, así que el mapa es navegable con
 * teclado y anunciable por un lector de pantalla sin escribir una sola línea extra.
 * Con Canvas, cada uno de esos dos puntos costaría una implementación paralela.
 *
 * El zoom y el desplazamiento se aplican por `transform` sobre el `<g>` raíz, manipulado
 * por ref: durante un gesto NO hay re-render de React (docs/UX_MOBILE.md §9).
 */
export function MapView({ view, selected, reachable, ordered, onSelect }: Props) {
  const rootRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const gesture = useRef<{ pointers: Map<number, { x: number; y: number }>; startDist: number; startScale: number }>({
    pointers: new Map(),
    startDist: 0,
    startScale: 1,
  });

  const apply = useCallback(() => {
    const { x, y, scale } = camera.current;
    rootRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }, []);

  const centerOn = useCallback(
    (regionId: RegionId, biasToCore = 0) => {
      const region = view.map.regions[regionId];
      if (!region) return;
      const core = view.map.regions[view.map.coreId];
      // El Bastión está en el anillo exterior: centrarlo exactamente deja medio
      // encuadre fuera del mapa. Se sesga hacia el Núcleo, que es hacia donde se juega.
      const x = region.x + ((core?.x ?? 0) - region.x) * biasToCore;
      const y = region.y + ((core?.y ?? 0) - region.y) * biasToCore;
      const { scale } = camera.current;
      camera.current = { x: -x * scale, y: -y * scale, scale };
      apply();
    },
    [apply, view.map.coreId, view.map.regions],
  );

  /**
   * Zoom inicial derivado del ancho REAL del viewport, no de una constante.
   *
   * Un mapa de 5 jugadores no cabe entero en 360 px con regiones tocables: a escala 1
   * cada región mide 21 px, menos de la mitad del mínimo de 44 px. En vez de encoger el
   * mapa (que lo volvería trivial) o de fingir que cumple, se entra con el zoom
   * necesario para que una región mida ~52 px y se centra en el Bastión propio. El
   * jugador ve su sector y el Núcleo, y navega desde ahí (docs/UX_MOBILE.md §1.4).
   */
  useEffect(() => {
    const width = svgRef.current?.getBoundingClientRect().width ?? 360;
    const TARGET_PX = 52;
    camera.current.scale = clamp(
      (TARGET_PX * 2 * view.map.extent) / (2 * NODE_R * width),
      0.5,
      3,
    );
    const bastion = view.map.bastions[view.seat];
    if (bastion !== undefined) centerOn(bastion, 0.42);
    else apply();
  }, [apply, centerOn, view.map.bastions, view.map.extent, view.seat]);

  /**
   * Al seleccionar una fuerza, se encuadra su vecindario.
   *
   * Sin esto, algunos destinos alcanzables quedaban **fuera de la pantalla** al zoom por
   * defecto y el jugador tenía que desplazar el mapa a ciegas para poder ordenar un
   * movimiento que el juego ya le estaba ofreciendo. Resaltar una opción que no se puede
   * tocar es peor que no ofrecerla.
   */
  useEffect(() => {
    if (selected === null || reachable.length === 0) return;
    const focus = centroid(view, [selected, ...reachable]);
    if (!focus) return;
    const { scale } = camera.current;
    camera.current = { x: -focus.x * scale, y: -focus.y * scale, scale };
    apply();
  }, [apply, reachable, selected, view]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    gesture.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.current.pointers.size === 2) {
      const [a, b] = [...gesture.current.pointers.values()];
      gesture.current.startDist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      gesture.current.startScale = camera.current.scale;
    }
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const previous = gesture.current.pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    gesture.current.pointers.set(event.pointerId, next);

    if (gesture.current.pointers.size === 2) {
      const [a, b] = [...gesture.current.pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (gesture.current.startDist > 0) {
        const scale = clamp(
          (gesture.current.startScale * distance) / gesture.current.startDist,
          0.5,
          3,
        );
        camera.current.scale = scale;
        apply();
      }
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const unitsPerPixel = (view.map.extent * 2) / rect.width;
    camera.current.x += (next.x - previous.x) * unitsPerPixel;
    camera.current.y += (next.y - previous.y) * unitsPerPixel;
    apply();
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    gesture.current.pointers.delete(event.pointerId);
  };

  const extent = view.map.extent;
  const visible = new Set(view.visible);
  const reachableSet = new Set(reachable);
  const forcesByRegion = new Map<RegionId, typeof view.forces>();
  for (const force of view.forces) {
    const list = forcesByRegion.get(force.regionId) ?? [];
    list.push(force);
    forcesByRegion.set(force.regionId, list);
  }

  return (
    <svg
      ref={svgRef}
      className="map-surface h-full w-full"
      viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
      role="application"
      aria-label="Mapa de la campaña"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <defs>
        <Patterns />
      </defs>

      <g ref={rootRef}>
        {/* Rutas primero: siempre por debajo de las regiones. */}
        <g stroke="var(--color-line)" strokeWidth={3} strokeLinecap="round">
          {view.map.edges.map((edge) => {
            const a = view.map.regions[edge.a];
            const b = view.map.regions[edge.b];
            if (!a || !b) return null;
            const lit = visible.has(edge.a) || visible.has(edge.b);
            return (
              <line
                key={`${edge.a}-${edge.b}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                opacity={lit ? 0.85 : 0.35}
              />
            );
          })}
        </g>

        {/* Flechas de las órdenes ya dadas. */}
        <g stroke="var(--color-ash-glow)" strokeWidth={5} strokeLinecap="round" opacity={0.9}>
          {[...ordered.entries()].map(([from, to]) => {
            const a = view.map.regions[from];
            const b = view.map.regions[to];
            if (!a || !b) return null;
            return <line key={`o-${from}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
        </g>

        {view.map.regions.map((region) => {
          const owner = view.control[region.id] ?? null;
          const observed = visible.has(region.id);
          const isSelected = selected === region.id;
          const isReachable = reachableSet.has(region.id);
          const forces = forcesByRegion.get(region.id) ?? [];
          const mine = forces.filter((f) => f.own);
          const enemies = forces.filter((f) => !f.own);

          return (
            <g
              key={region.id}
              className="region"
              role="button"
              tabIndex={0}
              data-region={region.id}
              data-reachable={isReachable ? 'true' : undefined}
              data-enemy={enemies.length > 0 ? 'true' : undefined}
              aria-label={describe(region.kind, owner, view.seat, observed, forces.length)}
              opacity={observed ? 1 : 0.55}
              onClick={() => onSelect(region.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(region.id);
                }
              }}
            >
              <path
                className="region-shape"
                d={hexPath(region.x, region.y, radiusOf(region.kind))}
                fill={TERRAIN_FILL[region.kind]}
                stroke={owner === null ? 'var(--color-line)' : seatColor(owner)}
                strokeWidth={owner === null ? 2 : 5}
                strokeLinejoin="miter"
              />
              {owner !== null && (
                <path
                  d={hexPath(region.x, region.y, radiusOf(region.kind))}
                  fill={`url(#pat-${SEAT_PATTERN[owner]})`}
                  opacity={0.28}
                  pointerEvents="none"
                />
              )}
              {/* Anillo de registro del Núcleo. Es el objetivo de la campaña: se ve desde
                  cualquier parte del mapa sin tener que buscarlo. */}
              {region.kind === 'core' && (
                <path
                  d={hexPath(region.x, region.y, radiusOf(region.kind) + 7)}
                  fill="none" stroke="var(--color-ash)" strokeWidth={1.5}
                  strokeDasharray="10 7" opacity={0.75} pointerEvents="none"
                />
              )}

              {isReachable && (
                <path
                  d={hexPath(region.x, region.y, radiusOf(region.kind) + 8)}
                  fill="none" stroke="var(--color-ash-glow)" strokeWidth={3}
                  strokeDasharray="8 6" opacity={0.9} pointerEvents="none"
                />
              )}
              {isSelected && (
                <path
                  d={hexPath(region.x, region.y, radiusOf(region.kind) + 12)}
                  fill="none" stroke="var(--color-rust)" strokeWidth={5}
                  strokeLinejoin="miter" pointerEvents="none"
                />
              )}

              <TerrainMark kind={region.kind} x={region.x} y={region.y} />

              {mine.length > 0 && (
                <ForceBadge x={region.x} y={region.y - radiusOf(region.kind) - 4} seat={view.seat}
                  label={String(mine.reduce((s, f) => s + (f.approxTotal ?? 0), 0))} />
              )}
              {enemies.map((force, index) => (
                <ForceBadge
                  key={force.id}
                  x={region.x + (index - (enemies.length - 1) / 2) * 30}
                  y={region.y + radiusOf(region.kind) + 20}
                  seat={force.seat}
                  label={force.line === null ? `~${force.approxTotal}` : String(force.approxTotal)}
                />
              ))}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function ForceBadge({ x, y, seat, label }: { x: number; y: number; seat: Seat; label: string }) {
  return (
    <g pointerEvents="none">
      <rect
        x={x - 17} y={y - 12} width={34} height={22} rx={3}
        fill="var(--color-void)" stroke={seatColor(seat)} strokeWidth={2.5}
      />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--color-ink)">
        {label}
      </text>
    </g>
  );
}

/** Tramas por asiento: la identidad nunca depende solo del color. */
function Patterns() {
  return (
    <>
      <pattern id="pat-stripes" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 0 L0 8" stroke="#fff" strokeWidth="3" />
      </pattern>
      <pattern id="pat-grid" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 0 L8 0 M0 0 L0 8" stroke="#fff" strokeWidth="2" />
      </pattern>
      <pattern id="pat-diagonal" width="8" height="8" patternUnits="userSpaceOnUse">
        <path d="M0 8 L8 0" stroke="#fff" strokeWidth="3" />
      </pattern>
      <pattern id="pat-dots" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="2" fill="#fff" />
      </pattern>
      <pattern id="pat-solid" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#fff" />
      </pattern>
    </>
  );
}

function describe(
  kind: keyof typeof TERRAIN_NAME,
  owner: Seat | null,
  seat: Seat,
  observed: boolean,
  forceCount: number,
): string {
  const parts = [TERRAIN_NAME[kind]];
  parts.push(owner === null ? 'neutral' : owner === seat ? 'tuya' : `del asiento ${owner + 1}`);
  if (!observed) parts.push('sin observación');
  else if (forceCount > 0) parts.push(`${forceCount} fuerza${forceCount > 1 ? 's' : ''} visible${forceCount > 1 ? 's' : ''}`);
  return parts.join(', ');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Marca de terreno.
 *
 * El terreno **no lleva iconos**: lleva marcas geométricas dibujadas con el mismo
 * lenguaje que el resto del arte —trazo constante, ángulos construidos, sin perspectiva—
 * ([ASSET_PIPELINE §3.2](../../../docs/ASSET_PIPELINE.md#32-regiones-8)). Antes eran
 * glifos Unicode, que dependían de la fuente del sistema y se veían distintos en cada
 * dispositivo: en un juego donde leer el mapa es la mitad de la decisión, eso no vale.
 */
function TerrainMark({ kind, x, y }: { kind: TerrainKind; x: number; y: number }) {
  const common = {
    fill: 'none' as const,
    stroke: 'var(--color-ink)',
    strokeWidth: 2.5,
    strokeLinecap: 'square' as const,
    opacity: 0.55,
    pointerEvents: 'none' as const,
  };

  switch (kind) {
    case 'urban':
      // Manzana de tres bloques.
      return (
        <g {...common}>
          <rect x={x - 11} y={y - 5} width={7} height={10} />
          <rect x={x - 2} y={y - 8} width={7} height={13} />
          <rect x={x + 7} y={y - 3} width={5} height={8} />
        </g>
      );
    case 'high':
      // Curvas de nivel.
      return (
        <g {...common}>
          <path d={`M${x - 12} ${y + 6} ${x} ${y - 8} ${x + 12} ${y + 6}`} />
          <path d={`M${x - 6} ${y + 8} ${x} ${y + 1} ${x + 6} ${y + 8}`} />
        </g>
      );
    case 'forest':
      return (
        <g {...common}>
          <path d={`M${x - 9} ${y + 7} ${x - 9} ${y - 7}`} />
          <path d={`M${x} ${y + 9} ${x} ${y - 9}`} />
          <path d={`M${x + 9} ${y + 7} ${x + 9} ${y - 7}`} />
        </g>
      );
    case 'water':
      return (
        <g {...common} strokeDasharray="7 5">
          <path d={`M${x - 12} ${y - 4} H${x + 12}`} />
          <path d={`M${x - 12} ${y + 4} H${x + 12}`} />
        </g>
      );
    case 'seam':
      // Yacimiento de Ceniza: la única marca con el color de la Ceniza.
      return (
        <path
          d={`M${x} ${y - 12} ${x + 3.5} ${y - 3.5} ${x + 12} ${y} ${x + 3.5} ${y + 3.5} ${x} ${y + 12} ${x - 3.5} ${y + 3.5} ${x - 12} ${y} ${x - 3.5} ${y - 3.5}Z`}
          fill="var(--color-ash)"
          opacity={0.85}
          pointerEvents="none"
        />
      );
    case 'bastion':
      // Almena.
      return (
        <g {...common} opacity={0.7}>
          <path d={`M${x - 12} ${y + 8} V${y - 4} h4 v-4 h4 v4 h4 v-4 h4 v4 h4 V${y + 8}Z`} />
        </g>
      );
    case 'core':
      // El Núcleo, con la simetría de orden 3 del emblema.
      return (
        <g pointerEvents="none">
          <path
            d={`M${x} ${y - 11} ${x + 11} ${y} ${x} ${y + 11} ${x - 11} ${y}Z`}
            fill="var(--color-ash)"
            opacity={0.9}
          />
          <path
            d={`M${x} ${y - 5} ${x + 5} ${y} ${x} ${y + 5} ${x - 5} ${y}Z`}
            fill="var(--color-void)"
          />
        </g>
      );
    default:
      return null;
  }
}
