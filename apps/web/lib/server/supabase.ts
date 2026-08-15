import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL,
} from './env';
import type { Rpc } from './resolve';

/**
 * Los dos clientes de Supabase, y por qué son dos.
 *
 * | Cliente | Rol | Ve | Se usa para |
 * |---|---|---|---|
 * | `userClient()` | `authenticated` | lo que RLS le deje | saber **quién** pide |
 * | `serviceClient()` | `service_role` | todo | hacer lo que la autoridad decide |
 *
 * La identidad se resuelve **siempre** con el primero, aunque la operación la ejecute el
 * segundo. Con `service_role` cualquier `profile_id` que llegue en el cuerpo de la
 * petición sería aceptado, y «hazme esta jugada como el asiento 2» dejaría de ser un
 * ataque para pasar a ser una llamada bien formada.
 */

/** Cliente con la sesión del usuario. RLS activa. */
export async function userClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL(), SUPABASE_ANON_KEY(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // En un Route Handler sí se pueden escribir; en un Server Component, no. Se
        // ignora en ese caso porque el middleware ya refrescó la sesión.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch { /* Server Component: la cookie ya viene refrescada del middleware */ }
      },
    },
  });
}

/** Cliente con la clave de servicio. Omite RLS. Nunca cerca del navegador. */
export function serviceClient() {
  return createClient(SUPABASE_URL(), SUPABASE_SERVICE_ROLE_KEY(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * `Rpc` de producción. Lo que `resolveTurn` y `startGame` reciben inyectado.
 *
 * Un error del transporte se lanza en vez de devolverse: si la base de datos no responde,
 * la resolución **no puede continuar** — seguir con un estado a medias es peor que fallar.
 */
export function serviceRpc(): Rpc {
  const supabase = serviceClient();
  return async (fn, args) => {
    const { data, error } = await supabase.rpc(fn, args);
    if (error) throw new Error(`${fn}(): ${error.message}`);
    return data;
  };
}

/** El perfil de quien hace la petición, o `null`. La única fuente de identidad. */
export async function currentProfileId(): Promise<string | null> {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
