'use client';

import { useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { regionCells, type PlayerView, type RegionId, type Seat } from '@gdc/core';
import World, { type WorldHandle } from '@/components/world/World';
import { MapFlat, type MapHandle, type MapProps } from '@/components/MapFlat';
import type { CampaignMap, CampaignMark, CampaignOverlay } from '@/components/world/engine';
import { troops } from '@/lib/board';
import { TERRAIN_NAME, seatColor } from '@/lib/theme';

export type { MapHandle } from '@/components/MapFlat';

/**
 * El mapa de la campaña, en relieve.
 *
 * Monta el mundo 2.5D de [ADR-034](../../../docs/DECISIONS.md#adr-034) sobre el mapa
 * **real**: el motor extruye las provincias que devuelve `regionCells()` de `@gdc/core`,
 * no un tablero decorativo. Por eso deja de valer la objeción de
 * [ADR-035](../../../docs/DECISIONS.md#adr-035) —«su tablero son 37 losas fijas»—: ahora
 * dibuja las 45 a 96 regiones que hay, con la adyacencia que hay
 * ([ADR-042](../../../docs/DECISIONS.md#adr-042)).
 *
 * El reparto de capas sigue siendo el de ADR-034 y no se negocia:
 *
 * | Capa | Qué es |
 * |---|---|
 * | Mundo | `<gdc-world scene="campaign">`, `aria-hidden`. **No decide nada** |
 * | Rótulos | DOM con `data-tile`: las fichas de fuerza. El motor solo los coloca |
 * | Acceso | Una lista de provincias enfocable, para teclado y lector de pantalla |
 * | Respaldo | `MapFlat`, la vista plana completa, sin WebGL o con movimiento reducido |
 *
 * El motor **emite** (`gdc-pick`) y esta pantalla decide: tocar una provincia en relieve
 * llama exactamente al mismo `onSelect` que tocarla en el plano, así que todo lo que
 * cuelga de un tap —ficha de región, apuntado, órdenes— es el mismo código.
 */
export function MapView(props: MapProps) {
  const {
    view, selected, reachable, ordered, onSelect, label, supports, spotlight = null, threats, ref,
  } = props;

  const flat = useRef<MapHandle | null>(null);
  const world = useRef<WorldHandle | null>(null);

  /**
   * El mapa que se extruye. Las provincias son las del motor, no un decorado: `regionCells`
   * es la misma función que define qué se toca con qué.
   *
   * Se recalcula una vez por turno —cambia el control, cambia la niebla— y eso reconstruye
   * el mundo. Es el único momento en que se reconstruye: el resaltado va por `overlay`.
   */
  const campaign = useMemo<CampaignMap>(() => {
    const cells = regionCells(view.map);
    const seen = new Set(view.visible);
    return {
      seat: view.seat,
      extent: view.map.extent,
      regions: view.map.regions.map((region) => ({
        id: region.id,
        kind: region.kind,
        x: region.x,
        y: region.y,
        cell: cells[region.id] ?? [],
        owner: view.control[region.id] ?? null,
        seen: seen.has(region.id),
        fort: view.fortification[region.id] ?? 0,
      })),
      // Las fuerzas son piezas sobre el tablero. De las ajenas solo se sabe el tamaño
      // aproximado, así que su arma va en `null` y el motor pone una peana sin insignia:
      // ponerles silueta de Línea sería enseñar lo que el motor no sabe.
      forces: view.forces.map((force) => ({
        regionId: force.regionId,
        seat: force.seat,
        arm: force.own ? dominant(force) : null,
      })),
    };
  }, [view]);

  /**
   * Lo que se resalta. Una sola marca por provincia y gana la más fuerte: si se
   * acumularan, una provincia acabaría iluminada y apagada a la vez.
   */
  const overlay = useMemo<CampaignOverlay>(() => {
    const marks: Record<number, CampaignMark> = {};
    const aiming = reachable.length > 0;

    for (const region of view.map.regions) {
      const owner = view.control[region.id] ?? null;
      if (aiming && !reachable.includes(region.id) && region.id !== selected) {
        marks[region.id] = 'dim';
      } else if (spotlight !== null && owner !== spotlight && region.id !== selected) {
        marks[region.id] = 'dim';
      }
    }
    const home = view.map.bastions[view.seat];
    if (home !== undefined) marks[home] = 'home';
    for (const regionId of threats ?? []) marks[regionId] = 'threat';
    for (const regionId of reachable) marks[regionId] = 'reachable';
    if (selected !== null) marks[selected] = 'selected';

    return {
      marks,
      arrows: [
        ...[...ordered.entries()].map(([from, to]) => ({ from, to })),
        ...[...(supports?.entries() ?? [])].map(([from, to]) => ({ from, to, support: true })),
      ],
    };
  }, [ordered, reachable, selected, spotlight, supports, threats, view]);

  const handle = useCallback((next: WorldHandle | null) => { world.current = next; }, []);

  useImperativeHandle(ref, () => ({
    focus(regionId, options) {
      if (world.current) world.current.focusRegion(regionId, options?.bias ?? 0);
      else flat.current?.focus(regionId, options);
    },
    zoomBy(factor) {
      if (world.current) world.current.zoomBy(factor);
      else flat.current?.zoomBy(factor);
    },
  }), []);

  const forcesByRegion = new Map<RegionId, { own: number; enemies: { seat: Seat; total: number; exact: boolean }[] }>();
  for (const force of view.forces) {
    const entry = forcesByRegion.get(force.regionId) ?? { own: 0, enemies: [] };
    if (force.own) entry.own += troops(force.approxTotal);
    else entry.enemies.push({ seat: force.seat, total: troops(force.approxTotal), exact: force.line !== null });
    forcesByRegion.set(force.regionId, entry);
  }

  return (
    <World
      scene="campaign"
      seat={view.seat}
      // Sin `zoom`: el mundo se abre a un número fijo de **provincias** en pantalla, que es
      // lo que hace que se vean igual de grandes en una partida de tres y en una de cinco.
      // Sobre tu Bastión —tu territorio y quien te rodea, que es por donde empieza un 4X—,
      // y el mando de alejar llega hasta el mapa completo.
      focus="bastion"
      elevation={0.78}
      azimuth={-1.05}
      campaign={campaign}
      overlay={overlay}
      onPick={onSelect}
      handle={handle}
      fallback={<MapFlat {...props} ref={flat} />}
    >
      {/*
        Las cifras de fuerza son DOM de verdad: el motor solo las coloca proyectando el
        mundo. Si vivieran dentro del lienzo, para media clase de jugadores no existirían.
      */}
      {[...forcesByRegion.entries()].map(([regionId, entry]) => (
        <div
          key={regionId}
          data-tile={`r${regionId}`}
          data-lift="0.75"
          data-edge="hide"
          className="type-figure pointer-events-none absolute flex items-center gap-1
            whitespace-nowrap border bg-void/90 px-1.5 py-0.5 text-xs"
          style={{ borderColor: seatColor(entry.own > 0 ? view.seat : entry.enemies[0]?.seat ?? null) }}
        >
          {entry.own > 0 && (
            <span style={{ color: seatColor(view.seat) }}>{entry.own}</span>
          )}
          {entry.enemies.map((enemy, index) => (
            <span key={index} style={{ color: seatColor(enemy.seat) }}>
              {enemy.exact ? enemy.total : `~${enemy.total}`}
            </span>
          ))}
        </div>
      ))}

      {/*
        La capa de acceso. El relieve se toca con el dedo por raycasting, que no da foco ni
        orden de lectura; esto sí. Aparece al tabular, así que un teclado sin ratón sigue
        pudiendo recorrer el mapa y ordenar.
      */}
      <ul aria-label={label} className="absolute inset-x-0 bottom-0 flex flex-wrap gap-1">
        {view.map.regions.map((region) => (
          <li key={region.id}>
            <button
              type="button"
              data-region={region.id}
              data-reachable={reachable.includes(region.id) ? 'true' : undefined}
              onClick={() => onSelect(region.id)}
              className="sr-only focus:not-sr-only focus:relative focus:z-10 focus:m-1
                focus:border focus:border-rust focus:bg-panel focus:px-2 focus:py-1
                focus:text-xs"
            >
              {describe(region.kind, view.control[region.id] ?? null, view.seat, region.id)}
            </button>
          </li>
        ))}
      </ul>
    </World>
  );
}

/** El arma que más pesa en una fuerza propia: la que le da silueta sobre el tablero. */
function dominant(force: PlayerView['forces'][number]): 'line' | 'fire' | 'sky' {
  const line = force.line ?? 0;
  const fire = force.fire ?? 0;
  const sky = force.sky ?? 0;
  if (fire > line && fire >= sky) return 'fire';
  if (sky > line && sky > fire) return 'sky';
  return 'line';
}

/** Cómo se anuncia una provincia. El mismo texto que usaba el mapa plano. */
function describe(
  kind: keyof typeof TERRAIN_NAME,
  owner: Seat | null,
  seat: Seat,
  id: RegionId,
): string {
  const who = owner === null ? 'neutral' : owner === seat ? 'tuya' : `del asiento ${owner + 1}`;
  return `${TERRAIN_NAME[kind]} ${id}, ${who}`;
}
