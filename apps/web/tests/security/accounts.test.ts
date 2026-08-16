/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Alta de cuenta e invitados · BLOQUEANTES                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * El alta de perfil la hace un trigger sobre `auth.users` (migración 0009) y no la API.
 * Eso arregla dos cosas —el callejón sin salida de una cuenta sin perfil, y que el
 * invitado llegue a la base **por el mismo camino** que una cuenta con correo— pero
 * traslada la responsabilidad a un sitio donde nada del código de la aplicación la
 * vigila. Si el trigger dejara de existir, ningún test de servidor fallaría: la aplicación
 * simplemente mandaría a todo el mundo a `/sign-in` para siempre.
 *
 * De ahí estos tests. Corren contra el Postgres real, con el mismo shim y las mismas
 * migraciones que producción.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asOutsider, asSeat0, asService, column, query, seed } from './psql';

/**
 * Las dos altas del seed que **no** llevan perfil escrito a mano: una con correo y otra
 * anónima. Su perfil, si existe, lo ha creado el trigger.
 *
 * Se crean en el seed y no aquí porque `query()` envuelve cada consulta en
 * `begin … rollback` — es lo que permite que los tests de escritura no se estorben, y
 * también lo que hace imposible montar una fixture desde un `beforeAll`.
 */
const NUEVA = '00000000-0000-4000-8000-0000000000a1';
const INVITADA = '00000000-0000-4000-8000-0000000000a2';

beforeAll(() => {
  seed();
});

describe('alta automática de perfil', () => {
  it('un usuario nuevo sale de auth.users con perfil', () => {
    const rows = column(asService, `select display_name from profiles where id = '${NUEVA}'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]!.length).toBeLessThanOrEqual(20);
  });

  it('y con Ciudad: el trigger de 0001 se encadena', () => {
    // Un perfil sin Ciudad es una cuenta a medias, y la pantalla única lee la Ciudad
    // nada más entrar. Sin esto, la primera partida empezaría con un `null`.
    expect(column(asService, `select ash_bank from cities where profile_id = '${NUEVA}'`))
      .toEqual(['0']);
  });

  it('el nombre generado es determinista', () => {
    const once = column(asService, `select callsign('${NUEVA}'::uuid)`);
    const twice = column(asService, `select callsign('${NUEVA}'::uuid)`);
    expect(once).toEqual(twice);
    expect(once[0]).toBe(column(asService, `select display_name from profiles where id = '${NUEVA}'`)[0]);
  });

  it('dos usuarios distintos no reciben el mismo nombre', () => {
    // La primera versión del generador leía los 7 primeros dígitos hex del uuid y daba
    // el mismo nombre a todos los uuid secuenciales. Este test es el que lo cazó.
    const names = column(
      asService,
      `select distinct callsign(id) from auth.users`,
    );
    const total = column(asService, 'select count(*) from auth.users');
    expect(names.length).toBe(Number(total[0]));
  });
});

describe('invitados', () => {
  it('la sesión anónima queda marcada como invitada', () => {
    expect(column(asService, `select is_guest from profiles where id = '${INVITADA}'`))
      .toEqual(['t']);
  });

  it('una cuenta con correo no queda marcada como invitada', () => {
    expect(column(asService, `select is_guest from profiles where id = '${NUEVA}'`))
      .toEqual(['f']);
  });

  it('un invitado es un jugador normal para RLS: lee su perfil y solo el suyo', () => {
    const asGuest = { role: 'authenticated', profileId: INVITADA } as const;
    expect(column(asGuest, 'select count(*) from profiles')).toEqual(['1']);
    expect(column(asGuest, `select count(*) from profiles where id = '${NUEVA}'`)).toEqual(['0']);
  });

  it('nadie puede quitarse la marca de invitado', () => {
    // Si `is_guest` fuera escribible, la marca no significaría nada: cualquier
    // limitación que se le ponga a un invitado se levantaría con un `update`.
    const asGuest = { role: 'authenticated', profileId: INVITADA } as const;
    const result = query(asGuest, `update profiles set is_guest = false where id = '${INVITADA}'`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/permission denied|column/i);
  });

  it('tampoco puede marcarse invitado otro jugador', () => {
    const result = query(asSeat0, `update profiles set is_guest = true where id = '${NUEVA}'`);
    expect(result.ok).toBe(false);
  });

  it('lo que sí puede cambiar un invitado es su nombre', () => {
    // El nombre generado existe para no pedir uno al entrar, no para imponerlo.
    const asGuest = { role: 'authenticated', profileId: INVITADA } as const;
    expect(query(asGuest, `update profiles set display_name = 'Ceniza' where id = '${INVITADA}'`).ok)
      .toBe(true);
  });
});

describe('el alta no abre nada por el camino', () => {
  it('auth.users sigue sin ser legible desde el cliente', () => {
    // El trigger es `security definer`: corre con privilegios elevados. Eso no puede
    // haber convertido `auth.users` en legible de rebote.
    expect(query(asSeat0, 'select * from auth.users').ok).toBe(false);
    expect(query(asAnon, 'select * from auth.users').ok).toBe(false);
  });

  it('`callsign` no filtra nada: solo transforma el id que ya tienes', () => {
    // Es invocable por cualquiera —está en `public`— así que conviene dejar por escrito
    // que eso es inocuo: no lee ninguna tabla, es una función pura del argumento.
    const volatility = column(
      asService,
      `select provolatile from pg_proc where proname = 'callsign'`,
    );
    expect(volatility).toEqual(['i']);   // immutable: no puede tocar la base
  });

  it('un forastero no ve los perfiles creados por el trigger', () => {
    expect(column(asOutsider, `select count(*) from profiles where id = '${INVITADA}'`))
      .toEqual(['0']);
  });
});
