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
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
