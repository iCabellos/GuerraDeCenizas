import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refresca la sesión en cada navegación.
 *
 * Los tokens de Supabase caducan en una hora. Sin esto, un jugador con la pestaña abierta
 * durante un turno Diario —doce horas— volvería a una sesión muerta justo cuando va a
 * enviar sus órdenes. El middleware renueva la cookie antes de que la página se renderice.
 *
 * `getUser()` y no `getSession()`: el primero valida el token contra Supabase, el segundo
 * se fía de la cookie. En el servidor, fiarse de la cookie es fiarse del cliente.
 *
 * Se llama `proxy.ts` porque Next 16 renombró la convención `middleware`: mismo
 * mecanismo, otro nombre.
 */
export default async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Los dos nombres de la clave publicable, por lo mismo que en `lib/supabase-browser.ts`:
  // Next solo sustituye los accesos escritos literalmente.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  /**
   * Sin configuración, se deja pasar la petición.
   *
   * Esto corre en **todas** las rutas, así que reventar aquí convierte cualquier variable
   * de entorno ausente en un «Internal Server Error» pelado en el sitio entero, sin una
   * pista de qué falta. Dejando pasar, el fallo aflora en la página, que sí dice cuál es
   * la variable — y `/api/health` lo dice sin siquiera mirar un log.
   *
   * No se pierde ninguna garantía: refrescar la sesión es una optimización. Las páginas
   * validan el token con `getUser()` por su cuenta, y RLS decide lo que se ve.
   */
  if (!url || !anonKey) return response;

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Ni estáticos ni imágenes: renovar la sesión al pedir un icono es puro gasto.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.svg$).*)'],
};
