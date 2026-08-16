/**
 * La URL pública de este despliegue.
 *
 * Existe por un fallo concreto: el enlace del correo de alta llegaba con
 * `redirect_to=http://localhost:3000`, así que confirmar la cuenta te mandaba a una
 * máquina que no existe. El correo lo escribe Supabase, y **Supabase solo acepta un
 * `redirect_to` que esté en su lista blanca**: si no lo está, lo sustituye en silencio por
 * su Site URL — que de fábrica es `http://localhost:3000`.
 *
 * Es decir: el fallo no se arregla del todo desde aquí. Hacen falta las dos mitades, y por
 * eso `supabase/config.toml` declara `site_url` y `additional_redirect_urls`, y el
 * despliegue las empuja al proyecto. Esto es la mitad del cliente: pedir la URL correcta.
 *
 * El orden va de lo más explícito a lo más adivinado:
 *
 *  1. `NEXT_PUBLIC_SITE_URL` — lo que hayas configurado. Manda siempre.
 *  2. `NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL` — el dominio de producción del proyecto.
 *     Vercel la inyecta sola, y es estable entre despliegues.
 *  3. `window.location.origin` — de dónde vino esta pestaña. Correcto en desarrollo y en
 *     un preview; en el servidor no existe, y ahí se cae a `localhost`, que es justo lo
 *     que se está intentando evitar. Por eso es la última.
 *
 * No se usa `NEXT_PUBLIC_VERCEL_URL`: cambia en cada despliegue, así que jamás estaría en
 * la lista blanca de Supabase. Esa es la trampa que parece la solución obvia.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  const production = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  if (typeof window !== 'undefined') return window.location.origin;

  return 'http://localhost:3000';
}

/** Destino del enlace mágico. Un solo sitio que lo construya, un solo sitio que revisar. */
export function authCallbackUrl(): string {
  return `${siteUrl()}/auth/callback`;
}
