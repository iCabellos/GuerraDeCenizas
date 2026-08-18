'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * El mundo 2.5D como telón: monta `<gdc-world>` (ADR-034).
 *
 * Tres cosas que no son negociables y explican la forma de este componente:
 *
 * 1. **Es decorativo.** `aria-hidden` sobre el lienzo. Todo lo que hay que leer o
 *    tocar vive en `children`, que son DOM de verdad y el motor se limita a
 *    colocar proyectando el mundo (`[data-tile]`).
 * 2. **Se carga aparte.** `import()` dentro del efecto: three.js pesa más que el
 *    presupuesto entero de la ruta de partida, así que no entra en el bundle base
 *    ni se ejecuta en el servidor.
 * 3. **Se puede no querer.** Sin WebGL, o con `prefers-reduced-motion`, no se monta
 *    nada y queda el telón plano. La interfaz sigue completa: sólo pierde el relieve.
 */

export type WorldScene = 'city' | 'map' | 'skirmish';

export type WorldProps = {
  scene: WorldScene;
  /** Niveles de los seis distritos de la ciudad, 0–3. */
  districts?: readonly number[];
  /** Asiento desde el que se mira. Decide qué tapa la niebla. */
  seat?: number;
  seats?: number;
  fog?: boolean;
  ash?: boolean;
  focus?: 'core' | 'bastion' | 'plaza';
  zoom?: number;
  elevation?: number;
  azimuth?: number;
  radius?: number;
  arrivals?: number;
  arrivalTotal?: number;
  className?: string;
  /** Rótulos anclados al mundo. Cada uno con `data-tile`. */
  children?: ReactNode;
  /**
   * Lo que se ve cuando el mundo no se monta: sin WebGL o con movimiento reducido.
   * No es un hueco gris — es la vista plana de siempre, que sigue siendo completa.
   */
  fallback?: ReactNode;
};

/** ¿Puede este navegador, y quiere esta persona, ver el mundo en relieve? */
function useWantsWorld(): boolean {
  const [wants, setWants] = useState(false);
  useEffect(() => {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (calm.matches) return;
    try {
      const probe = document.createElement('canvas');
      if (!probe.getContext('webgl2') && !probe.getContext('webgl')) return;
    } catch {
      return;
    }
    setWants(true);
  }, []);
  return wants;
}

export default function World({
  scene, districts, seat, seats, fog, ash, focus,
  zoom, elevation, azimuth, radius, arrivals, arrivalTotal,
  className, children, fallback,
}: WorldProps) {
  const host = useRef<HTMLDivElement>(null);
  const wants = useWantsWorld();
  const [ready, setReady] = useState(false);
  // Un array nuevo en cada render reconstruiría el mundo entero: se compara el texto.
  const plan = districts ? districts.join(',') : undefined;

  useEffect(() => {
    if (!wants) return;
    let alive = true;
    void import('./engine').then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [wants]);

  useEffect(() => {
    const el = host.current;
    if (!ready || !el) return;

    const world = document.createElement('gdc-world');
    world.setAttribute('scene', scene);
    world.setAttribute('aria-hidden', 'true');
    Object.assign(world.style, { position: 'absolute', inset: '0' });

    const attr = (name: string, value: number | string | undefined) => {
      if (value !== undefined) world.setAttribute(name, String(value));
    };
    attr('districts', plan);
    attr('seat', seat);
    attr('seats', seats);
    attr('focus', focus);
    attr('zoom', zoom);
    attr('elevation', elevation);
    attr('azimuth', azimuth);
    attr('radius', radius);
    attr('arrivals', arrivals);
    attr('arrival-total', arrivalTotal);
    if (fog !== undefined) world.setAttribute('fog', fog ? 'true' : 'false');
    if (ash) world.setAttribute('ash', '');

    // El mundo va detrás; los rótulos son hermanos suyos y siguen siendo de React.
    // El motor los localiza subiendo al contenedor común (`_markers`).
    el.prepend(world);
    return () => { world.remove(); };
  }, [ready, scene, plan, seat, seats, fog, ash, focus, zoom, elevation, azimuth, radius, arrivals, arrivalTotal]);

  return (
    <div ref={host} className={className} style={{ position: 'absolute', inset: 0 }}>
      {ready ? children : fallback}
    </div>
  );
}
