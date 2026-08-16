import { afterEach, describe, expect, it, vi } from 'vitest';

// `env.ts` importa `server-only`, que fuera de Next lanza a propósito. Aquí no se está
// probando esa barrera —la comprueba el build— sino la resolución de nombres.
vi.mock('server-only', () => ({}));

const {
  CRON_SECRET, ENV_ALIASES, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL,
} = await import('../lib/server/env');

const NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
];

/** Deja el entorno como estaba: los tests de seguridad comparten proceso. */
const saved = new Map(NAMES.map((name) => [name, process.env[name]]));
afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function only(pairs: Record<string, string>) {
  for (const name of NAMES) delete process.env[name];
  Object.assign(process.env, pairs);
}

describe('variables de entorno', () => {
  it('acepta los nombres nuevos de Supabase', () => {
    only({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_nueva',
      SUPABASE_SECRET_KEY: 'sb_secret_nueva',
      CRON_SECRET: 'x',
    });

    expect(SUPABASE_URL()).toBe('https://proyecto.supabase.co');
    expect(SUPABASE_ANON_KEY()).toBe('sb_publishable_nueva');
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe('sb_secret_nueva');
    expect(CRON_SECRET()).toBe('x');
  });

  it('sigue aceptando los antiguos: un despliegue existente no se rompe al actualizar', () => {
    only({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proyecto.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ.anon',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service',
      CRON_SECRET: 'x',
    });

    expect(SUPABASE_ANON_KEY()).toBe('eyJ.anon');
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe('eyJ.service');
  });

  it('con los dos definidos gana el nuevo', () => {
    only({
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_nueva',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ.anon',
      SUPABASE_SECRET_KEY: 'sb_secret_nueva',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJ.service',
    });

    expect(SUPABASE_ANON_KEY()).toBe('sb_publishable_nueva');
    expect(SUPABASE_SERVICE_ROLE_KEY()).toBe('sb_secret_nueva');
  });

  it('una cadena vacía no cuenta como definida', () => {
    only({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJ.anon' });
    expect(SUPABASE_ANON_KEY()).toBe('eyJ.anon');
  });

  it('al faltar, el error nombra los dos: es el mensaje que se lee en el log', () => {
    only({});
    expect(() => SUPABASE_ANON_KEY()).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    );
  });

  /**
   * El test que de verdad importa. `NEXT_PUBLIC_` en Next significa «esto acaba en el
   * bundle del navegador»: si algún día alguien añadiera un alias así para la clave
   * secreta, `service_role` sería público y `game_states` se leería entero.
   */
  it('ningún alias de la clave secreta lleva prefijo NEXT_PUBLIC_', () => {
    const secret = ENV_ALIASES.find((names) => names.includes('SUPABASE_SERVICE_ROLE_KEY'));
    expect(secret).toBeDefined();
    for (const name of secret!) expect(name.startsWith('NEXT_PUBLIC_')).toBe(false);
  });

  it('ENV_ALIASES cubre las cuatro claves que /api/health comprueba', () => {
    expect(ENV_ALIASES).toHaveLength(4);
    for (const names of ENV_ALIASES) expect(names.length).toBeGreaterThan(0);
  });
});
