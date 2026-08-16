import 'server-only';

/**
 * Variables de entorno del servidor.
 *
 * `server-only` arriba no es decorativo: hace que el build falle si algún componente de
 * cliente importa este módulo por accidente. Una clave de servicio que llega al bundle
 * del navegador da acceso completo a `game_states`, y con eso la niebla de guerra deja
 * de existir para quien abra las herramientas de desarrollo.
 */

/**
 * Cada clave admite **dos nombres**, y no por comodidad.
 *
 * Supabase cambió su sistema de claves: las de tipo JWT (`eyJ…`, con los nombres `anon` y
 * `service_role`) conviven ahora con `sb_publishable_…` y `sb_secret_…`, y el panel sugiere
 * variables llamadas `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.
 *
 * Cambia el nombre, no el rol: la clave publicable sigue autenticando como `anon` y la
 * secreta como `service_role`, así que ni una política de RLS ni un test cambian. Lo que
 * no puede pasar es que copiar los nombres que sugiere el panel deje el despliegue caído
 * con «Internal Server Error» — que es exactamente lo que pasó, y costó una tarde.
 *
 * El orden importa: primero el nombre nuevo. Un proyecto creado hoy solo tiene ese.
 */
const ALIASES = {
  url: ['NEXT_PUBLIC_SUPABASE_URL'],
  publishable: ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
  secret: ['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  cron: ['CRON_SECRET'],
} as const satisfies Record<string, readonly string[]>;

function required(names: readonly string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  // Se falla al arrancar, no al primer jugador que intente entrar. Un servidor
  // configurado a medias que responde 500 en mitad de una partida es mucho peor de
  // depurar que uno que no arranca.
  throw new Error(`Falta la variable de entorno ${names.join(' o ')}`);
}

export const SUPABASE_URL = () => required(ALIASES.url);
export const SUPABASE_ANON_KEY = () => required(ALIASES.publishable);
export const SUPABASE_SERVICE_ROLE_KEY = () => required(ALIASES.secret);

/**
 * Secreto compartido con `pg_cron`. Sin esto, `/api/cron/resolve-due` sería un endpoint
 * público capaz de forzar la resolución de cualquier partida vencida.
 */
export const CRON_SECRET = () => required(ALIASES.cron);

/**
 * Los nombres aceptados, para `/api/health`. Se exporta la tabla y no una lista plana
 * porque lo que hay que comprobar es que **cada grupo** tenga un nombre definido, no que
 * los tengan todos.
 */
export const ENV_ALIASES: readonly (readonly [string, ...string[]])[] = Object.values(ALIASES);
