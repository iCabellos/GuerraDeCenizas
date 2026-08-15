import type { Seat, TerrainKind } from '@gdc/core';

/**
 * Traducción de conceptos de juego a color y texto.
 *
 * En v0.1 los textos están aquí en español. En v0.9 esto se sustituye por next-intl y
 * cualquier literal visible en un componente pasa a ser un error de lint
 * (docs/TECHNICAL_DESIGN.md §10.3). El prototipo no debe consolidar deuda de i18n:
 * por eso ya está todo centralizado en un único módulo en vez de disperso en la UI.
 */

export const SEAT_COLOR: Record<number, string> = {
  0: 'var(--color-p0)',
  1: 'var(--color-p1)',
  2: 'var(--color-p2)',
  3: 'var(--color-p3)',
  4: 'var(--color-p4)',
};

/**
 * Trama por asiento. Los jugadores NUNCA se distinguen solo por color: quien no
 * distinga rojo de verde debe poder jugar igual (docs/UX_MOBILE.md §7).
 */
export const SEAT_PATTERN: Record<number, string> = {
  0: 'stripes',
  1: 'grid',
  2: 'diagonal',
  3: 'dots',
  4: 'solid',
};

export function seatColor(seat: Seat | null): string {
  return seat === null ? 'var(--color-line)' : (SEAT_COLOR[seat] ?? 'var(--color-line)');
}

export const TERRAIN_FILL: Record<TerrainKind, string> = {
  plain: 'var(--color-terrain-plain)',
  urban: 'var(--color-terrain-urban)',
  high: 'var(--color-terrain-high)',
  forest: 'var(--color-terrain-forest)',
  water: 'var(--color-terrain-water)',
  seam: 'var(--color-terrain-seam)',
  bastion: 'var(--color-terrain-bastion)',
  core: 'var(--color-terrain-core)',
};

export const TERRAIN_NAME: Record<TerrainKind, string> = {
  plain: 'Llanura',
  urban: 'Urbana',
  high: 'Elevación',
  forest: 'Bosque',
  water: 'Agua',
  seam: 'Yacimiento',
  bastion: 'Bastión',
  core: 'Núcleo',
};

/** Glifo corto para leer el mapa de un vistazo sin depender del color. */
export const TERRAIN_GLYPH: Record<TerrainKind, string> = {
  plain: '',
  urban: '▨',
  high: '▲',
  forest: '↟',
  water: '≈',
  seam: '✦',
  bastion: '★',
  core: '◎',
};

export const FACTION_NAME: Record<string, string> = {
  vantera: 'Vantera',
  koldvik: 'Koldvik',
  saranth: 'Saranth',
  meridia: 'Meridia',
  oshara: 'Oshara',
  tarn: 'Tarn',
};

export const DOCTRINE_NAME: Record<string, string> = {
  wedge: 'Cuña',
  anvil: 'Yunque',
  shroud: 'Mortaja',
  chorus: 'Coro',
  ledger: 'El Libro',
  swarm: 'Enjambre',
};

export const POSTURE_NAME: Record<string, string> = {
  assault: 'Asalto',
  hold: 'Firme',
  screen: 'Pantalla',
};

export const BUILDABLE_NAME: Record<string, string> = {
  line: 'Línea',
  fire: 'Fuego',
  sky: 'Cielo',
  fort: 'Fortificación',
  bridge: 'Puente',
};

export const EVENT_TEXT: Record<string, (data: Record<string, unknown>) => string> = {
  FORCE_MOVED: (d) => `Fuerza movida ${d['from']} → ${d['to']}`,
  FORCE_BLOCKED: () => 'Cruce mutuo: ninguna fuerza avanzó',
  FORCE_MERGED: (d) => `${d['count']} fuerzas fusionadas en ${d['regionId']}`,
  FORCE_DESTROYED: (d) => `Fuerza destruida en ${d['regionId']}`,
  FORCE_RETREATED: (d) => `Retirada de ${d['from']} a ${d['to']}`,
  COMBAT: (d) =>
    d['winner'] === null
      ? `Combate en ${d['regionId']}: empate, ambos destruidos`
      : `Combate en ${d['regionId']}: vence el asiento ${Number(d['winner']) + 1}`,
  REGION_CAPTURED: (d) => `Región ${d['regionId']} capturada`,
  REGION_CONTESTED: (d) => `Región ${d['regionId']} disputada`,
  REGION_FORTIFIED: (d) => `Región ${d['regionId']} fortificada a nivel ${d['level']}`,
  BRIDGE_BUILT: (d) => `Puente construido en ${d['regionId']}`,
  PRODUCED: (d) => `Producido ${BUILDABLE_NAME[String(d['item'])] ?? d['item']} en ${d['regionId']}`,
  INCOME: (d) =>
    `Renta: ▣${d['supply']} ⬢${d['industry']} ◈${d['intel']} ✦${d['ash']}` +
    (Number(d['scale']) < 1 ? ` (escala ×${d['scale']})` : ''),
  SUPPLY_FAILED: (d) =>
    `Sin suministro en ${d['regionId']} (${d['turns']} ${Number(d['turns']) === 1 ? 'turno' : 'turnos'})`,
  ORDER_REJECTED: (d) => `Orden rechazada: ${REJECT_TEXT[String(d['reason'])] ?? d['reason']}`,
  TURN_CLOSED: (d) => `Turno ${d['turn']} resuelto`,
  CONCORDANCE: () => 'Concordia declarada',
};

const REJECT_TEXT: Record<string, string> = {
  unknown_force: 'esa fuerza no existe',
  not_your_force: 'esa fuerza no es tuya',
  not_adjacent: 'destino no adyacente',
  detach_too_large: 'destacamento mayor que la fuerza',
  detach_empty: 'destacamento vacío',
  duplicate_order: 'orden duplicada',
  too_many_orders: 'demasiadas órdenes',
  wrong_turn: 'turno equivocado',
  no_movement_in_parley: 'no se puede mover durante el Parlamento',
  water_needs_bridge: 'el agua necesita un Puente para Línea y Fuego',
  support_needs_hold: 'el apoyo de Fuego exige postura Firme y no moverse',
  support_not_adjacent: 'la región apoyada no es adyacente',
  cannot_produce_here: 'aquí no se puede producir',
  not_enough_industry: 'no hay Industria suficiente',
};

export const RESOURCE_LABEL = {
  supply: { glyph: '▣', name: 'Suministro' },
  industry: { glyph: '⬢', name: 'Industria' },
  intel: { glyph: '◈', name: 'Intel' },
  ash: { glyph: '✦', name: 'Ceniza' },
} as const;
