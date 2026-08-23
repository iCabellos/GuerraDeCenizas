'use client';

import {
  useCallback, useEffect, useImperativeHandle, useRef,
  type PointerEvent as ReactPointerEvent, type Ref,
} from 'react';
import type { PlayerView, RegionId, Seat, TerrainKind, VisibleForce } from '@gdc/core';
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

const MIN_SCALE = 0.45;
const MAX_SCALE = 3.2;

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

/** Lo que la pantalla puede pedirle a la cámara. Nada de esto pasa por el estado de React. */
export interface MapHandle {
  /** Lleva la cámara a una región. `bias` la desplaza hacia el Núcleo, de 0 a 1. */
  focus: (regionId: RegionId, options?: { bias?: number; scale?: number }) => void;
  /** Acerca (`> 1`) o aleja (`< 1`) sin mover el centro. */
  zoomBy: (factor: number) => void;
}

interface Props {
  view: PlayerView;
  selected: RegionId | null;
  reachable: readonly RegionId[];
  ordered: ReadonlyMap<RegionId, RegionId>;
  onSelect: (regionId: RegionId) => void;
  /** Cómo se anuncia el mapa a un lector de pantalla. Llega traducido. */
  label: string;
  /** Apoyos de Fuego del borrador: origen → región apoyada. */
  supports?: ReadonlyMap<RegionId, RegionId>;
  /** Asiento resaltado desde el reparto: su territorio se enciende y el resto se apaga. */
  spotlight?: Seat | null;
  /** Regiones propias con una fuerza enemiga al lado. */
  threats?: ReadonlySet<RegionId>;
  ref?: Ref<MapHandle>;
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
 * Mapa en SVG. Ver ADR-012 y ADR-035: no es Canvas ni WebGL a propósito.
 *
 * Cada región es un `<g role="button" tabindex="0">`, así que el mapa es navegable con
 * teclado y anunciable por un lector de pantalla sin escribir una sola línea extra.
 * Con Canvas, cada uno de esos dos puntos costaría una implementación paralela.
 *
 * El zoom y el desplazamiento se aplican por `transform` sobre el `<g>` raíz, manipulado
 * por ref: durante un gesto NO hay re-render de React (docs/UX_MOBILE.md §9). Por el mismo
 * motivo la cámara se expone como un `MapHandle` imperativo: un botón que la mueva no
 * puede costar un render del mapa entero.
 */
export function MapView({
  view, selected, reachable, ordered, onSelect, label, supports, spotlight = null, threats, ref,
}: Props) {
  const rootRef = useRef<SVGGElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const camera = useRef({ x: 0, y: 0, scale: 1 });
  const flight = useRef(0);
  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    startDist: number;
    startScale: number;
    /** Distancia recorrida en el gesto. Un arrastre no puede acabar seleccionando. */
    travel: number;
  }>({ pointers: new Map(), startDist: 0, startScale: 1, travel: 0 });

  const apply = useCallback(() => {
    const { x, y, scale } = camera.current;
    rootRef.current?.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }, []);

  /** Coloca la cámara sobre un punto del mundo. `x`/`y` son coordenadas de región. */
  const place = useCallback((x: number, y: number, scale: number) => {
    // Sin límite, un arrastre largo deja el mapa fuera de la pantalla y no hay forma de
    // volver: la libertad de movimiento acaba en un lienzo vacío.
    const limit = view.map.extent * 1.15;
    const cx = clamp(x, -limit, limit);
    const cy = clamp(y, -limit, limit);
    camera.current = { x: -cx * scale, y: -cy * scale, scale };
    apply();
  }, [apply, view.map.extent]);

  /** Dónde mira la cámara ahora, en coordenadas del mundo. */
  const look = () => ({
    x: -camera.current.x / camera.current.scale,
    y: -camera.current.y / camera.current.scale,
  });

  /**
   * Vuelo suave hasta un punto.
   *
   * Un salto instantáneo obliga a reorientarse: se pierde de vista de dónde venías, que
   * en un mapa de 96 regiones es justo lo que hay que conservar. Va por `requestAnimationFrame`
   * sobre el `transform`, así que cuesta cero renders de React.
   */
  const flyTo = useCallback((x: number, y: number, scale?: number) => {
    cancelAnimationFrame(flight.current);
    const from = { ...look(), scale: camera.current.scale };
    const target = { x, y, scale: clamp(scale ?? from.scale, MIN_SCALE, MAX_SCALE) };
    const instant = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (instant) { place(target.x, target.y, target.scale); return; }

    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 320);
      const ease = 1 - (1 - k) ** 3;
      place(
        from.x + (target.x - from.x) * ease,
        from.y + (target.y - from.y) * ease,
        from.scale + (target.scale - from.scale) * ease,
      );
      if (k < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  }, [place]);

  useImperativeHandle(ref, () => ({
    focus(regionId, options) {
      const region = view.map.regions[regionId];
      if (!region) return;
      const core = view.map.regions[view.map.coreId];
      // El Bastión está en el anillo exterior: centrarlo exactamente deja medio encuadre
      // fuera del mapa. Se sesga hacia el Núcleo, que es hacia donde se juega.
      const bias = options?.bias ?? 0;
      flyTo(
        region.x + ((core?.x ?? 0) - region.x) * bias,
        region.y + ((core?.y ?? 0) - region.y) * bias,
        options?.scale,
      );
    },
    zoomBy(factor) {
      const here = look();
      flyTo(here.x, here.y, camera.current.scale * factor);
    },
  }), [flyTo, view.map.coreId, view.map.regions]);

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
    const scale = clamp(
      (TARGET_PX * 2 * view.map.extent) / (2 * NODE_R * width),
      MIN_SCALE,
      MAX_SCALE,
    );
    const bastion = view.map.bastions[view.seat];
    const home = bastion !== undefined ? view.map.regions[bastion] : undefined;
    const core = view.map.regions[view.map.coreId];
    if (home) {
      place(home.x + ((core?.x ?? 0) - home.x) * 0.42, home.y + ((core?.y ?? 0) - home.y) * 0.42, scale);
    } else {
      place(0, 0, scale);
    }
    // Solo al montar el mapa de esta partida: después manda el jugador.
  }, [place, view.map.bastions, view.map.coreId, view.map.extent, view.map.regions, view.seat]);

  /**
   * Al apuntar con una fuerza, se encuadra su vecindario.
   *
   * Sin esto, algunos destinos alcanzables quedaban **fuera de la pantalla** al zoom por
   * defecto y el jugador tenía que desplazar el mapa a ciegas para poder ordenar un
   * movimiento que el juego ya le estaba ofreciendo. Resaltar una opción que no se puede
   * tocar es peor que no ofrecerla.
   */
  const aimKey = reachable.length > 0 && selected !== null ? `${selected}` : '';
  useEffect(() => {
    if (aimKey === '') return;
    const focus = centroid(view, [Number(aimKey), ...reachable]);
    if (focus) flyTo(focus.x, focus.y);
    // `aimKey` cambia solo al entrar en una selección nueva: mover la cámara en cada
    // render pelearía con el dedo del jugador.

  }, [aimKey]);

  useEffect(() => () => cancelAnimationFrame(flight.current), []);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    cancelAnimationFrame(flight.current);
    gesture.current.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.current.pointers.size === 1) gesture.current.travel = 0;
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
    gesture.current.travel += Math.hypot(next.x - previous.x, next.y - previous.y);

    if (gesture.current.pointers.size === 2) {
      const [a, b] = [...gesture.current.pointers.values()];
      const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (gesture.current.startDist > 0) {
        const here = look();
        place(
          here.x, here.y,
          clamp(
            (gesture.current.startScale * distance) / gesture.current.startDist,
            MIN_SCALE, MAX_SCALE,
          ),
        );
      }
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const unitsPerPixel = (view.map.extent * 2) / rect.width / camera.current.scale;
    const here = look();
    place(here.x - (next.x - previous.x) * unitsPerPixel, here.y - (next.y - previous.y) * unitsPerPixel,
      camera.current.scale);
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    gesture.current.pointers.delete(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    const here = look();
    place(here.x, here.y, clamp(camera.current.scale * (event.deltaY < 0 ? 1.12 : 0.89), MIN_SCALE, MAX_SCALE));
  };

  /** Un arrastre que termina sobre una región no puede seleccionarla. */
  const tap = (regionId: RegionId) => {
    if (gesture.current.travel > 8) return;
    onSelect(regionId);
  };

  const extent = view.map.extent;
  const visible = new Set(view.visible);
  const reachableSet = new Set(reachable);
  const aiming = reachableSet.size > 0;
  const forcesByRegion = new Map<RegionId, VisibleForce[]>();
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
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <defs>
        <Patterns />
        <marker
          id="arrow-head" viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="4" markerHeight="4" orient="auto-start-reverse"
        >
          <path d="M0 0 10 5 0 10Z" fill="var(--color-ash-glow)" />
        </marker>
      </defs>

      <g ref={rootRef}>
        {/* La cuadrícula del plano. Se desplaza con el mapa: es lo que hace que un
            arrastre se note aunque el dedo pase por encima del vacío. */}
        <rect
          x={-extent * 2} y={-extent * 2} width={extent * 4} height={extent * 4}
          fill="url(#pat-chart)" pointerEvents="none"
        />

        {/* Rutas primero: siempre por debajo de las regiones, y muy por debajo en peso.
            Dibujadas al grosor de antes tejían una telaraña que competía con el mapa. */}
        <g stroke="var(--color-line)" strokeWidth={2} strokeLinecap="round">
          {view.map.edges.map((edge) => {
            const a = view.map.regions[edge.a];
            const b = view.map.regions[edge.b];
            if (!a || !b) return null;
            const lit = visible.has(edge.a) || visible.has(edge.b);
            return (
              <line
                key={`${edge.a}-${edge.b}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                opacity={lit ? 0.5 : 0.22}
              />
            );
          })}
        </g>

        {/* Flechas de las órdenes ya dadas: adónde va cada fuerza, sin abrir un panel. */}
        <g
          stroke="var(--color-ash-glow)" strokeWidth={5} strokeLinecap="round"
          markerEnd="url(#arrow-head)" opacity={0.9}
        >
          {[...ordered.entries()].map(([from, to]) => {
            const a = view.map.regions[from];
            const b = view.map.regions[to];
            if (!a || !b) return null;
            return <line key={`o-${from}`} x1={a.x} y1={a.y} {...shortened(a, b, radiusOf(b.kind) + 10)} />;
          })}
        </g>

        {/* Apoyos de Fuego: trazo discontinuo, porque no es un avance. */}
        <g
          stroke="var(--color-rust)" strokeWidth={4} strokeLinecap="round"
          strokeDasharray="10 8" opacity={0.85}
        >
          {[...(supports?.entries() ?? [])].map(([from, to]) => {
            const a = view.map.regions[from];
            const b = view.map.regions[to];
            if (!a || !b) return null;
            return <line key={`s-${from}`} x1={a.x} y1={a.y} {...shortened(a, b, radiusOf(b.kind) + 6)} />;
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
          const radius = radiusOf(region.kind);
          // Tres apagados posibles, y solo el más fuerte manda: la niebla, el foco sobre un
          // rival y el modo de apuntar. Si se multiplicaran, una región quedaría invisible.
          const dim = aiming && !isReachable && !isSelected ? 0.45
            : spotlight !== null && owner !== spotlight ? 0.36
              : observed ? 1 : 0.5;

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
              opacity={dim}
              onClick={() => tap(region.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(region.id);
                }
              }}
            >
              <path
                className="region-shape"
                d={hexPath(region.x, region.y, radius)}
                fill={TERRAIN_FILL[region.kind]}
                stroke={owner === null ? 'var(--color-line)' : seatColor(owner)}
                strokeWidth={owner === null ? 2 : 5}
                strokeLinejoin="miter"
              />
              {owner !== null && (
                <>
                  {/* Quién manda aquí se lee del color del relleno, no de repasar bordes.
                      Es la diferencia entre ver un frente y contar hexágonos. */}
                  <path
                    d={hexPath(region.x, region.y, radius)}
                    fill={seatColor(owner)} opacity={0.2} pointerEvents="none"
                  />
                  <path
                    d={hexPath(region.x, region.y, radius)}
                    fill={`url(#pat-${SEAT_PATTERN[owner]})`}
                    opacity={0.22}
                    pointerEvents="none"
                  />
                </>
              )}
              {/* Anillo de registro del Núcleo. Es el objetivo de la campaña: se ve desde
                  cualquier parte del mapa sin tener que buscarlo. */}
              {region.kind === 'core' && (
                <path
                  d={hexPath(region.x, region.y, radius + 7)}
                  fill="none" stroke="var(--color-ash)" strokeWidth={1.5}
                  strokeDasharray="10 7" opacity={0.75} pointerEvents="none"
                />
              )}
              {/* Tu Bastión, marcado siempre: es a donde vuelve la cámara. */}
              {view.map.bastions[view.seat] === region.id && (
                <path
                  d={hexPath(region.x, region.y, radius + 7)}
                  fill="none" stroke={seatColor(view.seat)} strokeWidth={2}
                  opacity={0.9} pointerEvents="none"
                />
              )}
              {/* Amenaza: región tuya con enemigo al lado. */}
              {threats?.has(region.id) && (
                <path
                  d={hexPath(region.x, region.y, radius + 4)}
                  fill="none" stroke="var(--color-danger)" strokeWidth={3}
                  strokeDasharray="4 6" opacity={0.85} pointerEvents="none"
                />
              )}

              {isReachable && (
                <>
                  <path
                    d={hexPath(region.x, region.y, radius)}
                    fill="var(--color-ash-glow)" opacity={0.12} pointerEvents="none"
                  />
                  <path
                    d={hexPath(region.x, region.y, radius + 8)}
                    fill="none" stroke="var(--color-ash-glow)" strokeWidth={3}
                    strokeDasharray="8 6" opacity={0.9} pointerEvents="none"
                  />
                </>
              )}
              {isSelected && (
                <path
                  d={hexPath(region.x, region.y, radius + 12)}
                  fill="none" stroke="var(--color-rust)" strokeWidth={5}
                  strokeLinejoin="miter" pointerEvents="none"
                />
              )}

              <TerrainMark kind={region.kind} x={region.x} y={region.y} />

              {mine.length > 0 && (
                <ForceBadge
                  x={region.x} y={region.y - radius - 6} seat={view.seat} own
                  label={String(mine.reduce((s, f) => s + (f.approxTotal ?? 0), 0))}
                />
              )}
              {enemies.map((force, index) => (
                <ForceBadge
                  key={force.id}
                  x={region.x + (index - (enemies.length - 1) / 2) * 34}
                  y={region.y + radius + 22}
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

/** Acorta un segmento para que la punta de flecha no se meta bajo el hexágono de destino. */
function shortened(
  a: { x: number; y: number }, b: { x: number; y: number }, margin: number,
): { x2: number; y2: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const k = Math.max(0, (length - margin) / length);
  return { x2: a.x + dx * k, y2: a.y + dy * k };
}

/**
 * Marca de fuerza.
 *
 * Las propias van arriba y las ajenas abajo, siempre: en un vistazo se ve de qué lado
 * está cada cifra sin leer el color. Y la ajena lleva la trama de su asiento, porque el
 * color nunca es el único distintivo (UX_MOBILE §7).
 */
function ForceBadge({
  x, y, seat, label, own = false,
}: { x: number; y: number; seat: Seat; label: string; own?: boolean }) {
  return (
    <g pointerEvents="none">
      <rect
        x={x - 19} y={y - 12} width={38} height={23} rx={3}
        fill="var(--color-void)" stroke={seatColor(seat)} strokeWidth={2.5}
      />
      {!own && (
        <rect x={x - 19} y={y - 12} width={5} height={23} fill={seatColor(seat)} />
      )}
      <text
        x={own ? x : x + 2} y={y + 5} textAnchor="middle"
        fontSize={15} fontWeight={700} fill="var(--color-ink)"
      >
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
      {/* La retícula de la carta de situación. Muy tenue: si se ve, compite con el mapa. */}
      <pattern id="pat-chart" width="48" height="48" patternUnits="userSpaceOnUse">
        <path d="M0 0 L48 0 M0 0 L0 48" stroke="var(--color-line)" strokeWidth="1" opacity="0.5" />
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
