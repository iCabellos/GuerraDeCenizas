import { NextResponse } from 'next/server';
import { ENGINE_VERSION, MAPGEN_VERSION } from '@gdc/core';

/**
 * `GET /api/health` — ¿está este despliegue configurado?
 *
 * Nace de una tarde perdida. Con una variable de entorno sin definir, la aplicación
 * respondía **«Internal Server Error»** y nada más: ni qué faltaba, ni dónde. El mensaje
 * explícito de `env.ts` existía, pero se quedaba en el log de una función que hay que
 * saber buscar.
 *
 * Esto convierte esos diez minutos de misterio en una petición. Devuelve **nombres, nunca
 * valores** — y los nombres ya están publicados en `.env.example`, así que no revela nada
 * que no esté en el repositorio. Un valor filtrado aquí sería la clave de servicio, y con
 * ella la niebla de guerra deja de existir.
 */

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
] as const;

export async function GET() {
  const missing = REQUIRED.filter((name) => !process.env[name]);

  return NextResponse.json(
    {
      ok: missing.length === 0,
      missing,
      engine: ENGINE_VERSION,
      mapgen: MAPGEN_VERSION,
    },
    // 503 y no 200: un despliegue a medias **no** está sano, y así lo puede detectar
    // cualquier comprobación automática sin leer el cuerpo.
    { status: missing.length === 0 ? 200 : 503 },
  );
}
