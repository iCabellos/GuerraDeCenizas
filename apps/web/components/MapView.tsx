'use client';

import {
  useCallback, useEffect, useImperativeHandle, useMemo, useRef,
  type PointerEvent as ReactPointerEvent, type Ref,
} from 'react';
import {
  regionCells,
  type PlayerView, type Point, type RegionId, type Seat, type TerrainKind, type VisibleForce,
} from '@gdc/core';
import { SEAT_PATTERN, TERRAIN_FILL, TERRAIN_NAME, seatColor } from '@/lib/theme';

// A escala 1 el disco del mapa cabe justo en el `viewBox`: alejar más solo deja negro.
const MIN_SCALE = 0.95;
const MAX_SCALE = 3.2;

/** Un polígono, listo para el atributo `d`. */
function cellPath(cell: readonly Point[]): string {
  let path = '';
  for (let i = 0; i < cell.length; i += 1) {
    const point = cell[i]!;
    path += `${i === 0 ? 'M' : 'L'}${point.x} ${point.y}`;
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
function centroid(view: PlayerView, ids: readonly RegionId[]): Point | null {
  const points = ids.map((id) => view.map.regions[id]).filter(Boolean);
  if (points.length === 0) return null;
  return {
    x: points.reduce((s, r) => s + r!.x, 0) / points.length,
    y: points.reduce((s, r) => s + r!.y, 0) / points.length,
  };
}

/**
 * El mapa: **territorio, no grafo**.
 *
 * El motor guarda el mapa como nodos en polares y aristas explícitas, y durante tres
 * versiones se dibujó tal cual: hexágonos sueltos unidos por líneas. Eso no se lee como un
 * 4X de conquista, se lee como un árbol de investigación — y con razón, porque es
 * literalmente el dibujo de un grafo. Ahora cada región es una **provincia** y el mapa una
 * superficie continua, sin huecos y sin radios
 * ([ADR-041](../../../docs/DECISIONS.md#adr-041)).
 *
 * Los polígonos los da `regionCells()` en `@gdc/core`, no esta pantalla, porque la
 * teselación **define la adyacencia que se ve**: dos provincias comparten frontera si y
 * solo si el motor las considera adyacentes. Si la geometría viviera aquí y la adyacencia
 * allí, el día que una de las dos cambie el mapa ofrecería movimientos imposibles.
 *
 * Sigue siendo SVG y DOM ([ADR-012](../../../docs/DECISIONS.md#adr-012),
 * [ADR-035](../../../docs/DECISIONS.md#adr-035)): cada provincia es un
 * `<g role="button" tabindex="0">`, así que el mapa es navegable con teclado y anunciable
 * por un lector de pantalla sin escribir una línea extra.
 *
 * El zoom y el desplazamiento se aplican por `transform` sobre el `<g>` raíz, manipulado
 * por ref: durante un gesto NO hay re-render de React (docs/UX_MOBILE.md §9).
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

  /**
   * Las provincias. Se recalculan solo cuando cambia el mapa —una vez por partida—, no en
   * cada render: son 96 polígonos y el presupuesto de INP al tocar una región es de 100 ms.
   */
  const cells = useMemo(() => regionCells(view.map), [view.map]);
  const paths = useMemo(() => cells.map(cellPath), [cells]);

  /**
   * Radio interior de cada provincia: la distancia de su centro al vértice más cercano.
   *
   * Es lo que se usa para colocar fichas y para acortar las flechas. Con hexágonos era una
   * constante; con provincias de tamaños distintos, una constante deja la ficha fuera de
   * unas y encima del rótulo de otras.
   */
  const inradius = useMemo(() => cells.map((cell, id) => {
    const region = view.map.regions[id];
    if (!region) return 20;
    let least = Infinity;
    for (const point of cell) {
      least = Math.min(least, Math.hypot(point.x - region.x, point.y - region.y));
    }
    return Number.isFinite(least) ? least : 20;
  }), [cells, view.map.regions]);

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
   * en un mapa de 96 provincias es justo lo que hay que conservar. Va por
   * `requestAnimationFrame` sobre el `transform`, así que cuesta cero renders de React.
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
   * Un mapa de 5 jugadores no cabe entero en 360 px con provincias tocables. En vez de
   * encoger el mapa (que lo volvería trivial) o de fingir que cumple, se entra con el zoom
   * necesario para que una provincia mida ~50 px y se centra en el Bastión propio. Una
   * provincia se toca **entera**, así que 50 px de ancho sobran para el mínimo de 44. El
   * jugador ve su sector y el Núcleo, y navega desde ahí (docs/UX_MOBILE.md §1.4).
   */
  useEffect(() => {
    const width = svgRef.current?.getBoundingClientRect().width ?? 360;
    const TARGET_PX = 50;
    const typical = median(inradius) * 2;
    const scale = clamp(
      (TARGET_PX * 2 * view.map.extent) / (typical * width),
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
  }, [inradius, place, view.map.bastions, view.map.coreId, view.map.extent, view.map.regions, view.seat]);

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
    place(
      here.x - (next.x - previous.x) * unitsPerPixel,
      here.y - (next.y - previous.y) * unitsPerPixel,
      camera.current.scale,
    );
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    gesture.current.pointers.delete(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    const here = look();
    place(
      here.x, here.y,
      clamp(camera.current.scale * (event.deltaY < 0 ? 1.12 : 0.89), MIN_SCALE, MAX_SCALE),
    );
  };

  /** Un arrastre que termina sobre una provincia no puede seleccionarla. */
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

  /**
   * Cuánto se apaga cada provincia. Tres motivos posibles y solo el más fuerte manda: si
   * se multiplicaran, una provincia quedaría invisible.
   */
  const dim = (regionId: RegionId, owner: Seat | null): number => {
    if (aiming && !reachableSet.has(regionId) && regionId !== selected) return 0.45;
    if (spotlight !== null && owner !== spotlight) return 0.36;
    return visible.has(regionId) ? 1 : 0.55;
  };

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
        {/* La cuadrícula del plano, fuera del mapa. Es lo que hace que un arrastre se note
            aunque el dedo pase por encima del vacío. */}
        <rect
          x={-extent * 2} y={-extent * 2} width={extent * 4} height={extent * 4}
          fill="url(#pat-chart)" pointerEvents="none"
        />

        {/* 1 · Las provincias. Aquí vive la interacción: la superficie entera del mapa es
               tocable, no solo un hexágono en el centro de cada región. */}
        {view.map.regions.map((region) => {
          const owner = view.control[region.id] ?? null;
          const forces = forcesByRegion.get(region.id) ?? [];
          return (
            <g
              key={region.id}
              className="region"
              role="button"
              tabIndex={0}
              data-region={region.id}
              data-reachable={reachableSet.has(region.id) ? 'true' : undefined}
              data-enemy={forces.some((f) => !f.own) ? 'true' : undefined}
              opacity={dim(region.id, owner)}
              aria-label={describe(region.kind, owner, view.seat, visible.has(region.id), forces.length)}
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
                d={paths[region.id]}
                fill={TERRAIN_FILL[region.kind]}
              />
              {owner !== null && (
                <>
                  {/* Quién manda aquí se lee del relleno, no de repasar bordes: es la
                      diferencia entre ver un frente y contar regiones una por una. */}
                  <path d={paths[region.id]} fill={seatColor(owner)} opacity={0.26} pointerEvents="none" />
                  <path
                    d={paths[region.id]}
                    fill={`url(#pat-${SEAT_PATTERN[owner]})`}
                    opacity={0.2}
                    pointerEvents="none"
                  />
                </>
              )}
            </g>
          );
        })}

        {/* 2 · Las fronteras, en una pasada aparte. Dibujadas dentro de cada provincia,
               la vecina las repisaba y el mapa quedaba con medio borde. */}
        <g fill="none" pointerEvents="none">
          {view.map.regions.map((region) => (
            <path
              key={region.id}
              d={paths[region.id]}
              stroke="var(--color-void)"
              strokeWidth={2}
              strokeLinejoin="round"
              opacity={0.75}
            />
          ))}
          {view.map.regions.map((region) => {
            const owner = view.control[region.id] ?? null;
            if (owner === null) return null;
            return (
              <path
                key={`o-${region.id}`}
                d={paths[region.id]}
                stroke={seatColor(owner)}
                strokeWidth={2.5}
                strokeLinejoin="round"
                opacity={dim(region.id, owner) * 0.9}
              />
            );
          })}
        </g>

        {/* 3 · Marcas de terreno y estado. */}
        <g pointerEvents="none">
          {view.map.regions.map((region) => (
            <g key={region.id} opacity={dim(region.id, view.control[region.id] ?? null)}>
              <TerrainMark kind={region.kind} x={region.x} y={region.y} />
            </g>
          ))}
        </g>

        {/* 4 · Resaltados. Van encima de todo el terreno: un anillo pintado antes que la
               provincia vecina se pierde bajo ella. */}
        <g fill="none" pointerEvents="none">
          {view.map.bastions[view.seat] !== undefined && (
            <path
              d={paths[view.map.bastions[view.seat]!]}
              stroke={seatColor(view.seat)} strokeWidth={4} strokeLinejoin="round"
            />
          )}
          {/* Amenaza: región tuya con una fuerza enemiga al lado. Muy tenue a propósito —
              con el territorio ya teñido por dueño, un trazo grueso en cada frontera
              convertía el frente en un borrón rojo. */}
          {[...(threats ?? [])].map((regionId) => (
            <path
              key={`t-${regionId}`}
              d={paths[regionId]}
              stroke="var(--color-danger)" strokeWidth={2}
              strokeDasharray="3 10" strokeLinejoin="round" opacity={0.6}
            />
          ))}
          {reachable.map((regionId) => (
            <path
              key={`r-${regionId}`}
              d={paths[regionId]}
              fill="var(--color-ash-glow)" fillOpacity={0.14}
              stroke="var(--color-ash-glow)" strokeWidth={3}
              strokeDasharray="9 7" strokeLinejoin="round"
            />
          ))}
          {selected !== null && paths[selected] && (
            <path
              d={paths[selected]}
              stroke="var(--color-rust)" strokeWidth={5} strokeLinejoin="round"
            />
          )}
        </g>

        {/* 5 · Las órdenes ya dadas: adónde va cada fuerza, sin abrir un panel. */}
        <g
          stroke="var(--color-ash-glow)" strokeWidth={5} strokeLinecap="round"
          markerEnd="url(#arrow-head)" opacity={0.95} pointerEvents="none"
        >
          {[...ordered.entries()].map(([from, to]) => {
            const a = view.map.regions[from];
            const b = view.map.regions[to];
            if (!a || !b) return null;
            return <line key={`o-${from}`} x1={a.x} y1={a.y} {...shortened(a, b, inradius[to]! * 0.55)} />;
          })}
        </g>

        {/* Apoyos de Fuego: trazo discontinuo, porque no es un avance. */}
        <g
          stroke="var(--color-rust)" strokeWidth={4} strokeLinecap="round"
          strokeDasharray="10 8" opacity={0.9} pointerEvents="none"
        >
          {[...(supports?.entries() ?? [])].map(([from, to]) => {
            const a = view.map.regions[from];
            const b = view.map.regions[to];
            if (!a || !b) return null;
            return <line key={`s-${from}`} x1={a.x} y1={a.y} {...shortened(a, b, inradius[to]! * 0.55)} />;
          })}
        </g>

        {/* 6 · Las fuerzas. Lo último: una cifra tapada no sirve de nada. */}
        <g pointerEvents="none">
          {view.map.regions.map((region) => {
            const forces = forcesByRegion.get(region.id) ?? [];
            if (forces.length === 0) return null;
            const mine = forces.filter((f) => f.own);
            const enemies = forces.filter((f) => !f.own);
            const reach = inradius[region.id]!;
            return (
              <g key={region.id} opacity={dim(region.id, view.control[region.id] ?? null)}>
                {mine.length > 0 && (
                  <ForceBadge
                    x={region.x} y={region.y - reach * 0.52} seat={view.seat} own
                    label={String(mine.reduce((s, f) => s + (f.approxTotal ?? 0), 0))}
                  />
                )}
                {enemies.map((force, index) => (
                  <ForceBadge
                    key={force.id}
                    x={region.x + (index - (enemies.length - 1) / 2) * 34}
                    y={region.y + reach * 0.52}
                    seat={force.seat}
                    label={force.line === null ? `~${force.approxTotal}` : String(force.approxTotal)}
                  />
                ))}
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
}

/** Acorta un segmento para que la punta de flecha no se meta bajo la provincia de destino. */
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
 * Las propias van arriba y las ajenas abajo, siempre: en un vistazo se ve de qué lado está
 * cada cifra sin leer el color. Y la ajena lleva la barra de su asiento, porque el color
 * nunca es el único distintivo (UX_MOBILE §7).
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
      {!own && <rect x={x - 19} y={y - 12} width={5} height={23} fill={seatColor(seat)} />}
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
      <pattern id="pat-stripes" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 0 L0 10" stroke="#fff" strokeWidth="3" />
      </pattern>
      <pattern id="pat-grid" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 0 L10 0 M0 0 L0 10" stroke="#fff" strokeWidth="2" />
      </pattern>
      <pattern id="pat-diagonal" width="10" height="10" patternUnits="userSpaceOnUse">
        <path d="M0 10 L10 0" stroke="#fff" strokeWidth="3" />
      </pattern>
      <pattern id="pat-dots" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="2.2" fill="#fff" />
      </pattern>
      <pattern id="pat-solid" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="#fff" />
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 32;
}

/**
 * Marca de terreno.
 *
 * El terreno **no lleva iconos**: lleva marcas geométricas dibujadas con el mismo lenguaje
 * que el resto del arte —trazo constante, ángulos construidos, sin perspectiva—
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
    opacity: 0.5,
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
        <g {...common} opacity={0.75}>
          <path d={`M${x - 12} ${y + 8} V${y - 4} h4 v-4 h4 v4 h4 v-4 h4 v4 h4 V${y + 8}Z`} />
        </g>
      );
    case 'core':
      // El Núcleo, con la simetría de orden 3 del emblema.
      return (
        <g pointerEvents="none">
          <path
            d={`M${x} ${y - 14} ${x + 14} ${y} ${x} ${y + 14} ${x - 14} ${y}Z`}
            fill="var(--color-ash)"
            opacity={0.9}
          />
          <path
            d={`M${x} ${y - 6} ${x + 6} ${y} ${x} ${y + 6} ${x - 6} ${y}Z`}
            fill="var(--color-void)"
          />
        </g>
      );
    default:
      return null;
  }
}
