import 'server-only';

import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { currentProfileId } from './supabase';

/**
 * Contrato de respuesta de la API.
 *
 * Siempre `{ ok: true, ... }` o `{ ok: false, code }`. **`code` es una clave, no un
 * mensaje**: el cliente lo traduce. Devolver texto desde el servidor obligaría a que la
 * API supiera el idioma de quien pregunta, y haría imposible que dos jugadores con
 * idiomas distintos vieran el mismo error ([ADR-015](../../../docs/DECISIONS.md#adr-015)).
 */

export type ApiError =
  | 'unauthorized' | 'bad_request' | 'not_found' | 'forbidden'
  | 'game_not_found' | 'game_full' | 'game_not_joinable' | 'already_started'
  | 'not_the_host' | 'seats_empty' | 'not_your_seat' | 'wrong_turn'
  | 'game_not_active' | 'code_collision' | 'bad_player_count' | 'seed_mismatch'
  | 'internal';

export function ok<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(code: ApiError | string, status = 400) {
  return NextResponse.json({ ok: false, code }, { status });
}

/**
 * Valida el cuerpo con Zod. Todos los esquemas son `strictObject`: un campo desconocido
 * es rechazo, no algo que se ignore.
 *
 * Los detalles del fallo van al log del servidor, no a la respuesta: decirle a un cliente
 * manipulado exactamente qué campo sobra es enseñarle a afinar la siguiente petición.
 */
export async function parseBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: fail('bad_request') };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[api] cuerpo inválido:', parsed.error.issues.map((i) => i.path.join('.')));
    return { ok: false, response: fail('bad_request') };
  }
  return { ok: true, data: parsed.data };
}

/** Exige sesión. El identificador del jugador **nunca** viene del cuerpo de la petición. */
export async function requireProfile():
  Promise<{ ok: true; profileId: string } | { ok: false; response: NextResponse }> {
  const profileId = await currentProfileId();
  if (!profileId) return { ok: false, response: fail('unauthorized', 401) };
  return { ok: true, profileId };
}

/** Convierte una excepción inesperada en un 500 sin filtrar el interior. */
export function internal(error: unknown) {
  console.error('[api]', error);
  return fail('internal', 500);
}
