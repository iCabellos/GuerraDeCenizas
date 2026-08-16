import { z } from 'zod';

/**
 * Esquemas de entrada de la API.
 *
 * Todo es `strictObject`: **un campo desconocido es rechazo, no se ignora.** Ignorarlo
 * convierte cualquier campo que se añada mañana en un vector silencioso — el cliente
 * manipulado manda `{ forceId, posture, ash: 999 }` y el día que alguien lea `ash` de
 * ahí, ya está dentro.
 *
 * Estos esquemas validan **forma**, no legalidad. Que una orden sea legal —que la fuerza
 * sea tuya, que la región sea adyacente, que tengas ⬢ suficiente— lo decide el motor
 * contra el estado autoritativo cargado de la base de datos, nunca contra lo que llega
 * en la petición ([TECHNICAL_DESIGN §7.2](../../../docs/TECHNICAL_DESIGN.md#72-validación-en-dos-niveles)).
 */

const regionId = z.number().int().min(0).max(400);
const quantity = z.number().int().min(0).max(9999);

export const postureSchema = z.enum(['assault', 'hold', 'screen']);

export const moveOrderSchema = z.strictObject({
  forceId: z.string().min(1).max(40),
  to: regionId.optional(),
  detach: z.strictObject({ line: quantity, fire: quantity, sky: quantity }).optional(),
  posture: postureSchema,
  fireSupport: regionId.optional(),
});

export const productionOrderSchema = z.strictObject({
  regionId,
  item: z.enum(['line', 'fire', 'sky', 'fort', 'bridge']),
  qty: z.number().int().min(1).max(999),
});

/**
 * Los topes de `max()` no son estéticos: sin ellos, un cliente puede mandar cien mil
 * órdenes y hacer que la resolución del turno tarde lo bastante como para tumbar la
 * partida de los otros cuatro. Ninguna partida legítima se acerca a estos números.
 */
export const ordersSchema = z.strictObject({
  turn: z.number().int().min(0).max(99),
  moves: z.array(moveOrderSchema).max(120),
  production: z.array(productionOrderSchema).max(60).optional(),
});

export const submitOrdersSchema = z.strictObject({
  orders: ordersSchema,
  /** `false` guarda borrador; `true` lo envía y puede disparar la resolución. */
  submit: z.boolean(),
});

export const createGameSchema = z.strictObject({
  playerCount: z.union([z.literal(2), z.literal(3), z.literal(5)]),
  cadence: z.enum(['blitz', 'daily', 'relaxed']),
  visibility: z.enum(['public', 'private']),
});

export const joinGameSchema = z.strictObject({
  // El código se dicta en voz alta; se acepta en cualquier caja y se normaliza arriba.
  code: z.string().trim().length(6),
});

export const searchMatchSchema = z.strictObject({
  playerCount: z.union([z.literal(2), z.literal(3), z.literal(5)]),
  cadence: z.enum(['blitz', 'daily', 'relaxed']),
});

export const standingOrdersSchema = z.strictObject({
  posture: z.enum(['hold', 'screen']),
  production: z.enum(['none', 'line', 'repeat']),
});

export type SubmitOrdersInput = z.infer<typeof submitOrdersSchema>;
export type CreateGameInput = z.infer<typeof createGameSchema>;
export type JoinGameInput = z.infer<typeof joinGameSchema>;
