/**
 * El Juramento.
 *
 * Lo que se prueba aquí es la puerta, no la pantalla: **se jura una vez**. Cambiar de
 * facción después es un Cisma y cuesta Ceniza y renombre
 * ([FACTIONS §5](../../../../docs/FACTIONS.md)); si esta función se pudiera repetir, sería
 * una forma de cambiar gratis y se saltaría la regla entera desde el cliente.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { rpc, scalar } from './rpc';

const WHO = '00000000-0000-4000-8000-0000000000d0';
const sql = (text: string): string => scalar(text);

beforeEach(() => {
  sql(`truncate table public.cities, public.profiles restart identity cascade;
       delete from auth.users;
       insert into auth.users (id, email) values ('${WHO}', 'oath@ceniza.test');`);
});

describe('jurar', () => {
  it('una cuenta recién creada NO ha jurado, aunque tenga facción por defecto', () => {
    // Es la distinción que obligó a añadir la columna: con `not null default` los dos
    // casos —«juré Vantera» y «nadie me preguntó»— eran la misma fila.
    expect(sql(`select faction_id from public.profiles where id = '${WHO}'`)).toBe('vantera');
    expect(sql(`select coalesce(sworn_at::text, 'null') from public.profiles
                 where id = '${WHO}'`)).toBe('null');
  });

  it('jurar fija la facción y deja constancia', async () => {
    const result = await rpc('swear_oath', { p_profile: WHO, p_faction: 'tarn' }) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(sql(`select faction_id from public.profiles where id = '${WHO}'`)).toBe('tarn');
    expect(sql(`select coalesce(sworn_at::text, 'null') from public.profiles
                 where id = '${WHO}'`)).not.toBe('null');
  });

  it('no se jura dos veces: el segundo intento se rechaza y no cambia nada', async () => {
    await rpc('swear_oath', { p_profile: WHO, p_faction: 'tarn' });
    const again = await rpc('swear_oath', { p_profile: WHO, p_faction: 'koldvik' }) as
      { ok: boolean; code?: string };

    expect(again.ok).toBe(false);
    expect(again.code).toBe('already_sworn');
    expect(sql(`select faction_id from public.profiles where id = '${WHO}'`),
      'la facción no puede haberse movido').toBe('tarn');
  });

  it('una facción que no existe se rechaza', async () => {
    const result = await rpc('swear_oath', { p_profile: WHO, p_faction: 'atlantis' }) as
      { ok: boolean; code?: string };
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unknown_faction');
  });

  it('no la puede invocar un jugador con sesión', () => {
    // Supabase concede `all on functions` a `authenticated` por defecto: revocarlo hay
    // que nombrarlo, y por eso se comprueba (lección 7).
    const granted = sql(`select count(*) from information_schema.role_routine_grants
                          where routine_name = 'swear_oath'
                            and grantee in ('anon', 'authenticated')`);
    expect(Number(granted)).toBe(0);
  });
});
