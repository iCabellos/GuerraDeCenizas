import 'server-only';

/**
 * Variables de entorno del servidor.
 *
 * `server-only` arriba no es decorativo: hace que el build falle si algún componente de
 * cliente importa este módulo por accidente. Una clave de servicio que llega al bundle
 * del navegador da acceso completo a `game_states`, y con eso la niebla de guerra deja
 * de existir para quien abra las herramientas de desarrollo.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Se falla al arrancar, no al primer jugador que intente entrar. Un servidor
    // configurado a medias que responde 500 en mitad de una partida es mucho peor de
    // depurar que uno que no arranca.
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const SUPABASE_URL = () => required('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_ANON_KEY = () => required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
export const SUPABASE_SERVICE_ROLE_KEY = () => required('SUPABASE_SERVICE_ROLE_KEY');

/**
 * Secreto compartido con `pg_cron`. Sin esto, `/api/cron/resolve-due` sería un endpoint
 * público capaz de forzar la resolución de cualquier partida vencida.
 */
export const CRON_SECRET = () => required('CRON_SECRET');
