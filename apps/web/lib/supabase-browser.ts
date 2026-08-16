'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente de navegador. Solo la clave anónima: RLS decide lo que ve.
 *
 * Se usa para dos cosas y ninguna más — autenticarse y suscribirse a Realtime. Las
 * lecturas del juego van por Server Components y las escrituras por la API: si el
 * navegador escribiera directo en PostgREST, la validación de dos niveles se quedaría en
 * uno.
 */
export function browserClient() {
  /**
   * Los dos nombres, escritos literalmente y a propósito.
   *
   * Next sustituye `process.env.NEXT_PUBLIC_ALGO` en tiempo de build, pero solo si el
   * acceso está escrito tal cual: una lectura dinámica —`process.env[nombre]`— no se
   * sustituye y en el navegador vale `undefined`. Por eso aquí no se puede compartir el
   * mecanismo de `lib/server/env.ts`.
   *
   * `||` y no `??`: si la variable no existe, la sustitución puede dejar una cadena vacía,
   * y `??` la daría por buena.
   */
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key!);
}
