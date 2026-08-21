'use client';

import { useMemo } from 'react';
import { makeRng, type FactionId } from '@gdc/core';
import { FactionEmblem } from '@/components/GameChrome';
import World from '@/components/world/World';

/**
 * Tu ciudad, en cenital.
 *
 * Es **la pantalla**: al abrir el juego no hay portada ni menú, hay una ciudad
 * ([ADR-026](../../../docs/DECISIONS.md#adr-026)). Y no es decorado — es el hub de
 * progresión de [ADR-010](../../../docs/DECISIONS.md#adr-010) hecho imagen: los distritos
 * que has desbloqueado están **construidos** y los que no, dibujados como cimientos. El
 * jugador ve lo que tiene y lo que le falta sin leer una sola frase.
 *
 * El trazado es **determinista a partir del perfil**: la misma cuenta ve siempre la misma
 * ciudad. Usa el `makeRng` del motor, no `Math.random()`, precisamente para eso — una
 * ciudad que cambiara de forma en cada carga no sería «tu» ciudad.
 *
 * Se dibuja con el mismo lenguaje que el resto del arte: planta ortogonal, trazo
 * constante, sin perspectiva y sin sombras. Es un plano, no una maqueta.
 */

/** Los seis distritos de [METAPROGRESSION §4.4](../../../docs/METAPROGRESSION.md#44-distritos-de-la-ciudad-6--3-niveles). */
export const DISTRICTS = ['archive', 'foundry', 'antenna', 'chamber', 'reliquary', 'hall'] as const;
export type District = (typeof DISTRICTS)[number];
export type DistrictLevels = Partial<Record<District, number>>;

const VIEW = 260;
const CENTRE = VIEW / 2;
const PLAZA_R = 30;
const WALL_R = 118;
/** Aire alrededor de la ciudad cuando llegan rivales. */
const ARRIVAL_MARGIN = 46;

interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  tall: boolean;
}

/**
 * Manzanas de un distrito.
 *
 * El nivel no añade «más de lo mismo»: añade densidad y una pieza alta. Es la lectura
 * inmediata de «esto ha crecido» sin un número al lado.
 */
function blocksFor(level: number, seed: number): Block[] {
  const rng = makeRng(seed, 0);
  const count = level === 0 ? 3 : 2 + level * 2;
  const blocks: Block[] = [];

  for (let index = 0; index < count; index += 1) {
    const w = 12 + rng.int(10);
    const h = 10 + rng.int(9);
    blocks.push({
      // Rejilla de calles: las manzanas se alinean, no se esparcen. Una ciudad con
      // edificios en ángulos arbitrarios se lee como ruido.
      x: -26 + (index % 3) * 20 + rng.int(4),
      y: -22 + Math.floor(index / 3) * 20 + rng.int(4),
      w,
      h,
      tall: level >= 2 && index === 0,
    });
  }
  return blocks;
}

export interface CityProps {
  factionId: FactionId;
  profileId: string;
  districts?: DistrictLevels;
  ash?: number;
  /** Ciudades rivales que ya han llegado. Es la espera del emparejamiento, dibujada. */
  arrivals?: number;
  arrivalTotal?: number;
  className?: string;
  /** Descripción para lector de pantalla. Llega traducida desde i18n. */
  label?: string;
}

/**
 * La planta de la ciudad, en cenital y sin perspectiva.
 *
 * Dejó de ser la vista principal cuando entró el relieve ([ADR-034](../../../docs/DECISIONS.md#adr-034)),
 * pero **no es código muerto ni un adorno degradado**: es lo que se ve sin WebGL o con
 * `prefers-reduced-motion`, y muestra exactamente la misma información. Por eso sigue
 * siendo determinista a partir del perfil: la misma cuenta ve siempre la misma ciudad,
 * la vea en relieve o en planta.
 */
export function CityPlan({
  factionId, profileId, districts = {}, ash = 0, arrivals = 0, arrivalTotal = 0, className,
  label,
}: CityProps) {
  // Semilla estable por cuenta: mismo perfil, misma ciudad, siempre.
  const seed = useMemo(() => {
    let hash = 2166136261;
    for (const char of profileId) {
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    }
    return hash;
  }, [profileId]);

  const plots = useMemo(
    () =>
      DISTRICTS.map((district, index) => {
        const angle = (index / DISTRICTS.length) * Math.PI * 2 - Math.PI / 2;
        const distance = (PLAZA_R + WALL_R) / 2 + 6;
        return {
          district,
          level: districts[district] ?? 0,
          x: CENTRE + Math.cos(angle) * distance,
          y: CENTRE + Math.sin(angle) * distance,
          angle,
          blocks: blocksFor(districts[district] ?? 0, seed + index * 7919),
        };
      }),
    [districts, seed],
  );

  /**
   * Perímetro amurallado, irregular.
   *
   * Con un círculo perfecto y seis radios, la planta se leía como un gráfico de sectores
   * en vez de como una ciudad. Un contorno con vértices desiguales —siempre el mismo para
   * la misma cuenta— basta para que parezca un asentamiento y no un diagrama.
   */
  const wall = useMemo(() => {
    const rng = makeRng(seed ^ 0x5f5e0ff, 0);
    const vertices = 14;
    return Array.from({ length: vertices }, (_, index) => {
      const angle = (index / vertices) * Math.PI * 2;
      const radius = WALL_R - 4 + rng.int(14);
      return `${(CENTRE + Math.cos(angle) * radius).toFixed(1)} ${(CENTRE + Math.sin(angle) * radius).toFixed(1)}`;
    }).join(' ');
  }, [seed]);

  /**
   * Trama común: las manzanas que no son de ningún distrito.
   *
   * Sin ellas, dentro de la muralla solo había seis grupos de edificios y mucho vacío —
   * se leía como un diagrama de seis elementos, no como una ciudad. Estas manzanas no
   * significan nada mecánicamente, y ese es justo su trabajo: son el tejido sobre el que
   * los distritos destacan.
   */
  const fabric = useMemo(() => {
    const rng = makeRng(seed ^ 0x9e3779b9, 0);
    const blocks: { x: number; y: number; w: number; h: number }[] = [];
    for (let index = 0; index < 44; index += 1) {
      const angle = (rng.int(3600) / 3600) * Math.PI * 2;
      const radius = PLAZA_R + 6 + rng.int(WALL_R - PLAZA_R - 18);
      blocks.push({
        x: CENTRE + Math.cos(angle) * radius,
        y: CENTRE + Math.sin(angle) * radius,
        w: 5 + rng.int(9),
        h: 5 + rng.int(8),
      });
    }
    return blocks;
  }, [seed]);

  // La Ceniza acumulada llena el silo. Se satura a 500 para que el depósito siga
  // significando algo cuando la cuenta lleve muchas campañas encima.
  const ashLevel = Math.min(1, ash / 500);

  return (
    <svg
      // Al esperar, la cámara se abre para dejar sitio a las ciudades que llegan: con el
      // encuadre de la ciudad sola se salían del lienzo y se veían cortadas por la mitad.
      viewBox={
        arrivalTotal > 0
          ? `${-ARRIVAL_MARGIN} ${-ARRIVAL_MARGIN} ${VIEW + ARRIVAL_MARGIN * 2} ${VIEW + ARRIVAL_MARGIN * 2}`
          : `0 0 ${VIEW} ${VIEW}`
      }
      className={className}
      role="img"
      // El lector de pantalla sí recibe la descripción: «sin texto» es una decisión
      // visual, nunca una excusa para dejar fuera a quien no ve la pantalla.
      aria-label={label ?? factionId}
    >
      <defs>
        <pattern id="city-grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke="var(--color-line)" strokeWidth="0.5" />
        </pattern>
        <clipPath id="city-wall">
          <polygon points={wall} />
        </clipPath>
      </defs>

      {/* Suelo: la trama catastral bajo la ciudad. */}
      <polygon points={wall} fill="var(--color-panel)" />
      <polygon points={wall} fill="url(#city-grid)" opacity={0.6} />

      {/* Muralla, y el anillo de reconocimiento por fuera. */}
      <polygon points={wall} fill="none" stroke="var(--color-line)" strokeWidth={3} />
      <circle
        cx={CENTRE} cy={CENTRE} r={WALL_R + 14}
        fill="none" stroke="var(--color-faint)" strokeWidth={1}
        strokeDasharray="6 8" opacity={0.55}
      />

      <g clipPath="url(#city-wall)">
        {/* El tejido común, primero: los distritos se dibujan encima y destacan. */}
        <g fill="var(--color-raised)" stroke="var(--color-line)" strokeWidth={1} opacity={0.55}>
          {fabric.map((block, index) => (
            <rect key={index} x={block.x} y={block.y} width={block.w} height={block.h} />
          ))}
        </g>

        {/* Avenidas radiales: una por distrito. Ordenan la planta y explican por qué las
            manzanas están donde están. */}
        {plots.map((plot) => (
          <line
            key={`av-${plot.district}`}
            x1={CENTRE + Math.cos(plot.angle) * PLAZA_R}
            y1={CENTRE + Math.sin(plot.angle) * PLAZA_R}
            x2={CENTRE + Math.cos(plot.angle) * (WALL_R + 4)}
            y2={CENTRE + Math.sin(plot.angle) * (WALL_R + 4)}
            stroke="var(--color-line)"
            strokeWidth={5}
          />
        ))}

        {plots.map((plot) => (
          <g key={plot.district} transform={`translate(${plot.x} ${plot.y})`}>
            {plot.level > 0 && (
              <g stroke="var(--color-line)" strokeWidth={1.5} opacity={0.8}>
                <line x1={-32} y1={-2} x2={32} y2={-2} />
                <line x1={-6} y1={-30} x2={-6} y2={30} />
              </g>
            )}
            {plot.blocks.map((block, index) => (
              <rect
                key={index}
                x={block.x} y={block.y} width={block.w} height={block.h}
                fill={plot.level === 0 ? 'none' : 'var(--color-raised)'}
                stroke={plot.level === 0 ? 'var(--color-faint)' : 'var(--color-muted)'}
                strokeWidth={plot.level === 0 ? 1 : 1.5}
                // Cimientos: el distrito existe pero está sin construir. Es la forma de
                // enseñar lo que falta sin escribir «bloqueado».
                strokeDasharray={plot.level === 0 ? '3 3' : undefined}
                opacity={plot.level === 0 ? 0.55 : 1}
              />
            ))}
            {/* La pieza alta del nivel 3 marca el distrito terminado. */}
            {plot.blocks
              .filter((block) => block.tall)
              .map((block, index) => (
                <rect
                  key={`t-${index}`}
                  x={block.x + 3} y={block.y + 3}
                  width={block.w - 6} height={block.h - 6}
                  fill="var(--color-line)" stroke="var(--color-ink)" strokeWidth={1}
                  opacity={0.8}
                />
              ))}
          </g>
        ))}
      </g>

      {/* Plaza central con el emblema de la facción: la identidad va en el centro. */}
      <circle
        cx={CENTRE} cy={CENTRE} r={PLAZA_R}
        fill="var(--color-void)" stroke="var(--color-line)" strokeWidth={2}
      />
      <g transform={`translate(${CENTRE - 20} ${CENTRE - 20})`}>
        <FactionEmblem factionId={factionId} size={40} className="text-rust" />
      </g>

      {/* Silo de Ceniza: se llena con lo acumulado en la cuenta. */}
      <g transform={`translate(${CENTRE - 9} ${CENTRE + PLAZA_R + 6})`}>
        <rect x={0} y={0} width={18} height={30} fill="var(--color-void)"
          stroke="var(--color-line)" strokeWidth={1.5} />
        <rect
          x={2} y={30 - 26 * ashLevel} width={14} height={26 * ashLevel}
          fill="var(--color-ash)" opacity={0.85}
        />
      </g>

      {/* Ciudades que llegan al campo de batalla. Es la espera del emparejamiento hecha
          imagen: la narrativa del juego es que las ciudades son teletransportadas, así
          que buscar partida ES verlas aparecer, cada una en su posición rotacional. */}
      {arrivalTotal > 0 &&
        Array.from({ length: arrivalTotal }, (_, index) => {
          const angle = (index / arrivalTotal) * Math.PI * 2 - Math.PI / 2;
          const distance = WALL_R + 30;
          const here = index < arrivals;
          return (
            <g
              key={`arrival-${index}`}
              transform={`translate(${CENTRE + Math.cos(angle) * distance} ${
                CENTRE + Math.sin(angle) * distance
              })`}
              opacity={here ? 1 : 0.3}
            >
              <circle
                r={9}
                fill={here ? 'var(--color-panel)' : 'none'}
                stroke={here ? 'var(--color-ash)' : 'var(--color-faint)'}
                strokeWidth={here ? 2 : 1}
                strokeDasharray={here ? undefined : '3 3'}
                className={here ? undefined : 'ember'}
              />
              {here && <circle r={3} fill="var(--color-ash)" />}
            </g>
          );
        })}
    </svg>
  );
}

/**
 * Qué edificio levanta cada distrito.
 *
 * Las dos listas se diseñaron por separado y no se corresponden: los distritos del repo
 * son **desbloqueos de metaprogresión** ([METAPROGRESSION §4.4](../../../docs/METAPROGRESSION.md#44-distritos-de-la-ciudad-6--3-niveles))
 * y los edificios del motor son **siluetas**. Sin este mapa, el rótulo diría «Archivo»
 * sobre un granero, que es peor que no poner nada.
 *
 * El criterio es la silueta que hace creíble la función: el Archivo almacena, la Antena
 * es un mástil que mira, el Reliquiario guarda algo precioso, el Salón es ceremonial.
 * Es una lectura, no una verdad: cambiarla es cambiar esta tabla y nada más.
 */
const DISTRICT_BUILDING: Record<District, string> = {
  archive: 'granary',
  foundry: 'foundry',
  antenna: 'watchtower',
  chamber: 'wall',
  reliquary: 'silo',
  hall: 'monument',
};

/** Nivel en cifra romana: se lee de un vistazo y no se confunde con una cantidad. */
const ROMAN = ['', 'I', 'II', 'III'] as const;

/**
 * Cuánto se aleja la cámara. El motor encuadra **por radio**, así que el multiplicador
 * depende de la proporción del hueco: el diseño usaba 0,82 sobre un lienzo de 430×932 y
 * una pantalla de móvil real es más ancha en proporción, luego hay que alejarse un poco
 * más para que la muralla entera siga entrando.
 */
const CITY_ZOOM = 1.2;

/**
 * Tu ciudad. **Es la pantalla** ([ADR-026](../../../docs/DECISIONS.md#adr-026)).
 *
 * Dos capas con un reparto de trabajo estricto:
 *
 * - El **relieve** lo pone el mundo 2.5D, que es decorado y va `aria-hidden`.
 * - Lo que hay que **leer** —qué distrito es cada uno y por qué nivel va— son rótulos
 *   DOM de verdad, anunciables, que el motor se limita a colocar proyectando el mundo.
 *
 * Así la ciudad gana volumen sin que la accesibilidad dependa de una GPU: quien no
 * pueda o no quiera ver el relieve recibe `CityPlan` con la misma información.
 */
export function CityView({ className, messages, ...city }: CityProps & {
  /** Diccionario ya resuelto por el servidor, como en el resto de la interfaz. */
  messages?: Readonly<Record<string, string>>;
}) {
  const t = (key: string): string => messages?.[key] ?? key;
  const levels = DISTRICTS.map((district) => city.districts?.[district] ?? 0);
  // «granary:3» — cada solar levanta su edificio en vez de una caja genérica.
  const plots = DISTRICTS.map(
    (district, index) => `${DISTRICT_BUILDING[district]}:${levels[index] ?? 0}`,
  );

  return (
    <div role="group" aria-label={city.label} className={className} style={{ position: 'relative' }}>
      <World
        scene="city"
        districts={plots}
        arrivals={city.arrivals}
        arrivalTotal={city.arrivalTotal}
        ash={(city.ash ?? 0) > 0}
        zoom={CITY_ZOOM}
        elevation={0.6}
        azimuth={-0.5}
        fallback={<CityPlan {...city} className="h-full w-full" />}
      >
        {DISTRICTS.map((district, index) => {
          const level = levels[index] ?? 0;
          return (
            <span
              key={district}
              data-tile={`d${index}`}
              data-lift={level > 0 ? '1.5' : '0.8'}
              className={`type-label pointer-events-none whitespace-nowrap rounded-sharp border px-2 py-1 text-[10px] ${
                level > 0
                  ? 'border-ink/20 bg-void/85 text-ink'
                  : 'border-dashed border-ink/25 bg-void/70 text-muted'
              }`}
            >
              {level > 0 ? `${t(`district.${district}`)} ${ROMAN[level] ?? ''}` : t('district.empty')}
            </span>
          );
        })}
      </World>
    </div>
  );
}
