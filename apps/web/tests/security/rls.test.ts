/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║ Tests de RLS · BLOQUEANTES                                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * Si uno de estos falla, no hay release (ROADMAP v0.3). No son tests de una función:
 * son la comprobación de que la niebla de guerra existe de verdad y no solo en el
 * cliente. Corren contra un Postgres real con el shim de Supabase aplicado, así que un
 * `revoke` olvidado o una política mal escrita se ven aquí y no en producción.
 *
 * El actor de cada test es un rol de Postgres con un JWT, igual que haría PostgREST.
 * Probar esto como superusuario no probaría nada: RLS ni se evalúa.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  GAME, SEAT_1, asAnon, asOutsider, asSeat0, asSeat1, asSeat2, asService,
  column, count, query, seed,
} from './psql';

beforeAll(() => {
  seed();
});

describe('game_states — el estado completo no sale del servidor', () => {
  // ✗ Un jugador NO puede leer game_states de su propia partida.
  it('un jugador de la partida no puede leerlo', () => {
    const result = query(asSeat0, `select state from game_states where game_id = '${GAME}'`);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/permission denied/i);
  });

  it('tampoco puede leerlo un anónimo', () => {
    expect(query(asAnon, 'select * from game_states').ok).toBe(false);
  });

  it('el secreto del estado no aparece por ninguna otra vía', () => {
    // Recorre lo que un jugador sí puede leer buscando la marca del estado completo.
    // Sin esto, bastaría con exponer el estado desde otra tabla para saltarse el test
    // anterior sin que nadie se enterase.
    const reachable = [
      "select coalesce(string_agg(view::text, ''), '') from player_views",
      "select coalesce(string_agg(payload::text, ''), '') from orders",
      "select coalesce(string_agg(coalesce(body,''), ''), '') from messages",
    ];
    for (const sql of reachable) {
      expect(column(asSeat0, sql).join('')).not.toContain('SECRETO_DEL_ESTADO_COMPLETO');
    }
  });

  it('el motor sí lo lee: la tabla no está simplemente rota', () => {
    // Lección nº 4 del CLAUDE.md raíz: un test que no puede fallar no prueba nada.
    // Si `game_states` estuviera vacía o mal referenciada, los tres tests anteriores
    // pasarían igual. Este obliga a que la tabla contenga lo que dice contener.
    expect(count(asService, `game_states where game_id = '${GAME}'`)).toBe(1);
    expect(column(asService, `select state->>'secreto' from game_states`))
      .toEqual(['SECRETO_DEL_ESTADO_COMPLETO']);
  });
});

describe('player_views — cada asiento ve el suyo', () => {
  // ✓ Un jugador SÍ puede leer su propio player_view.
  it('el asiento 0 lee su vista', () => {
    expect(column(asSeat0, `select view->>'marca' from player_views order by seat`))
      .toEqual(['SECRETO_ASIENTO_0']);
  });

  // ✗ Un jugador NO puede leer el player_view del asiento 2 siendo el asiento 0.
  it('el asiento 0 no ve la vista del asiento 2 ni pidiéndola por su nombre', () => {
    expect(column(asSeat0, 'select view::text from player_views where seat = 2')).toEqual([]);
  });

  it('cada asiento ve exactamente una vista, y es la suya', () => {
    for (const [actor, marca] of [
      [asSeat0, 'SECRETO_ASIENTO_0'], [asSeat1, 'SECRETO_ASIENTO_1'],
      [asSeat2, 'SECRETO_ASIENTO_2'],
    ] as const) {
      expect(column(actor, `select view->>'marca' from player_views`)).toEqual([marca]);
    }
  });

  it('quien no juega esta partida no ve ninguna vista', () => {
    expect(count(asOutsider, 'player_views')).toBe(0);
    expect(count(asAnon, 'player_views')).toBe(0);
  });

  it('un jugador no puede escribir su propia vista', () => {
    const result = query(
      asSeat0,
      `update player_views set view = '{"marca":"FALSIFICADA"}'::jsonb where seat = 0`,
    );
    expect(result.ok).toBe(false);
  });
});

describe('orders — solo las mías, solo del turno en curso', () => {
  // ✗ Un jugador NO puede insertar órdenes en el asiento de otro.
  it('no puedo enviar órdenes en el asiento de otro', () => {
    const result = query(
      asSeat0,
      `insert into orders (game_id, turn, seat, payload)
       values ('${GAME}', 4, 1, '{"turn":4,"moves":[]}'::jsonb)`,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/row-level security|permission denied/i);
  });

  // ✗ Un jugador NO puede insertar órdenes de un turno pasado o futuro.
  it('no puedo enviar órdenes de un turno pasado', () => {
    expect(query(asSeat0, `insert into orders (game_id, turn, seat, payload)
      values ('${GAME}', 3, 0, '{"turn":3,"moves":[]}'::jsonb)`).ok).toBe(false);
  });

  it('no puedo enviar órdenes de un turno futuro', () => {
    expect(query(asSeat0, `insert into orders (game_id, turn, seat, payload)
      values ('${GAME}', 5, 0, '{"turn":5,"moves":[]}'::jsonb)`).ok).toBe(false);
  });

  it('sí puedo enviar las mías del turno en curso', () => {
    // El contraste con los tres anteriores es lo que hace que signifiquen algo: si la
    // política rechazara todo, los rechazos de arriba pasarían por el motivo erróneo.
    expect(query(asSeat0, `insert into orders (game_id, turn, seat, payload)
      values ('${GAME}', 4, 0, '{"turn":4,"moves":[]}'::jsonb)`).ok).toBe(true);
  });

  it('no puedo leer las órdenes de otro asiento', () => {
    expect(column(asSeat0, 'select payload::text from orders')).toEqual([]);
    expect(column(asSeat1, `select payload::text from orders`)[0])
      .toContain('ORDENES_ASIENTO_1');
  });

  it('no puedo marcar mis órdenes como aplicadas ni cambiar su origen', () => {
    // `applied` y `source` son del servidor: con ellos se reproduce la partida.
    const applied = query(asSeat0,
      `insert into orders (game_id, turn, seat, payload, applied)
       values ('${GAME}', 4, 0, '{}'::jsonb, '{"trampa":true}'::jsonb)`);
    expect(applied.ok).toBe(false);
    const source = query(asSeat0,
      `insert into orders (game_id, turn, seat, payload, source)
       values ('${GAME}', 4, 0, '{}'::jsonb, 'autocommand')`);
    expect(source.ok).toBe(false);
  });

  it('un borrador no cuenta como turno enviado', () => {
    // Se inserta sin `submitted_at`, que es lo único que el cliente puede hacer.
    const draft = query(asSeat0,
      `insert into orders (game_id, turn, seat, payload)
       values ('${GAME}', 4, 0, '{"borrador":true}'::jsonb)
       returning coalesce(submitted_at::text, 'NULO')`);
    expect(draft.ok).toBe(true);
    expect(draft.rows[0]?.[0]).toBe('NULO');
  });
});

describe('messages — el canal privado es privado', () => {
  // ✗ Un jugador NO puede leer el canal privado de otros dos.
  it('el asiento 0 no ve la conjura entre el 1 y el 2', () => {
    const visible = column(asSeat0, 'select body from messages order by id');
    expect(visible).toEqual(['MENSAJE_PUBLICO']);
    expect(visible).not.toContain('CONJURA_CONTRA_EL_CERO');
  });

  it('los asientos 1 y 2 sí la ven', () => {
    for (const actor of [asSeat1, asSeat2]) {
      expect(column(actor, 'select body from messages order by id'))
        .toEqual(['MENSAJE_PUBLICO', 'CONJURA_CONTRA_EL_CERO']);
    }
  });

  it('el filtro es por asiento exacto, no por parecido de cadena', () => {
    // La versión ilustrativa del diseño usaba `channel like '%'||seat`. Con canales
    // como 'seat:1,3' eso deja entrar a cualquiera cuyo dígito aparezca por casualidad.
    expect(count(asSeat0, `messages where channel = 'private'`)).toBe(0);
  });

  it('nadie puede escribir mensajes directamente', () => {
    expect(query(asSeat0, `insert into messages (game_id, sender_seat, body)
      values ('${GAME}', 0, 'por la puerta de atrás')`).ok).toBe(false);
  });

  it('no puedo hacerme pasar por otro asiento aunque pudiera escribir', () => {
    expect(query(asSeat0, `insert into messages (game_id, sender_seat, body)
      values ('${GAME}', 2, 'yo soy el dos')`).ok).toBe(false);
  });
});

describe('escrituras que darían ventaja', () => {
  // ✗ Un jugador NO puede modificar games.turn, games.state_version ni cities.ash_bank.
  it('no puedo adelantar el turno de la partida', () => {
    expect(query(asSeat0, `update games set turn = 99 where id = '${GAME}'`).ok).toBe(false);
  });

  it('no puedo tocar el bloqueo optimista', () => {
    expect(query(asSeat0, `update games set state_version = 0 where id = '${GAME}'`).ok)
      .toBe(false);
  });

  it('no puedo darme Ceniza en la Ciudad', () => {
    expect(query(asSeat0, 'update cities set ash_bank = 999999').ok).toBe(false);
  });

  it('no puedo desbloquearme una doctrina a mano', () => {
    expect(query(asSeat0,
      `insert into account_unlocks (profile_id, unlock_key) values ('${SEAT_1}', 'doctrine:swarm')`,
    ).ok).toBe(false);
  });

  it('no puedo cambiarme de facción sin pagar el Cisma', () => {
    // El perfil sí es editable: nombre e idioma. La facción no, y eso lo decide el
    // GRANT de columna, no la política — RLS no distingue columnas.
    expect(query(asSeat0, `update profiles set faction_id = 'tarn'`).ok).toBe(false);
    expect(query(asSeat0, `update profiles set display_name = 'Nombre Nuevo'`).ok).toBe(true);
  });

  it('no puedo ascender a bot a un rival ni fingir que no ha faltado', () => {
    expect(query(asSeat0, `update game_players set is_bot = true where seat = 1`).ok)
      .toBe(false);
    expect(query(asSeat0, `update game_players set missed_turns = 0`).ok).toBe(false);
  });

  it('sí puedo editar mis Órdenes Permanentes, y solo las mías', () => {
    expect(query(asSeat0,
      `update game_players set standing_orders = '{"posture":"hold"}'::jsonb
       where game_id = '${GAME}' and seat = 0`).ok).toBe(true);
    const otherSeat = query(asSeat0,
      `update game_players set standing_orders = '{"posture":"assault"}'::jsonb
       where game_id = '${GAME}' and seat = 1 returning seat`);
    expect(otherSeat.rows).toEqual([]);
  });
});

describe('funciones de la capa de autoridad', () => {
  it('un jugador no puede resolver turnos a mano', () => {
    for (const fn of [
      `begin_resolution('${GAME}', now())`,
      `join_game('CENIZA', '${SEAT_1}')`,
      `due_games(now(), 10)`,
      `new_invite_code()`,
    ]) {
      const result = query(asSeat0, `select ${fn}`);
      expect(result.ok, `debería estar prohibido: ${fn}`).toBe(false);
      expect(result.error).toMatch(/permission denied/i);
    }
  });

  it('los ayudantes de política sí, porque los usan las políticas', () => {
    expect(column(asSeat0, `select is_player('${GAME}')`)).toEqual(['t']);
    expect(column(asOutsider, `select is_player('${GAME}')`)).toEqual(['f']);
  });

  it('un ayudante no filtra la partida de otros', () => {
    // `is_seat` es `security definer`: sin el `revoke`, serviría para sondear quién
    // está sentado en cualquier partida del sistema.
    expect(column(asOutsider, `select is_seat('${GAME}', 0::smallint)`)).toEqual(['f']);
  });

  it('ninguna otra función `security definer` es invocable por un jugador', () => {
    // Este test nació de un agujero real: `begin_resolution` devuelve el estado
    // autoritativo entero y era invocable por cualquiera con sesión, porque
    // `revoke ... from public` no anula el GRANT explícito que Supabase concede a
    // `authenticated` al crear la función. Enumerarlas todas evita repetir el olvido
    // con la siguiente función que se añada.
    const callable = column(
      asService,
      `select p.proname from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute')
        order by p.proname`,
    );
    expect(callable).toEqual(['is_player', 'is_seat', 'my_seat']);
  });
});

describe('el anónimo no ve nada', () => {
  it.each([
    'games', 'game_players', 'player_views', 'orders', 'messages',
    'treaties', 'profiles', 'cities', 'account_unlocks', 'match_results',
  ])('%s está vacía para anon', (table) => {
    expect(count(asAnon, table)).toBe(0);
  });
});

describe('todas las tablas del esquema tienen RLS', () => {
  it('ninguna tabla de public se queda sin activar', () => {
    // El olvido más fácil y más caro: crear una tabla y no ponerle RLS. Este test lo
    // caza al añadirla, no seis meses después.
    const naked = column(
      asService,
      `select tablename from pg_tables t
        where schemaname = 'public'
          and not exists (
            select 1 from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname = t.tablename and c.relrowsecurity)
        order by tablename`,
    );
    expect(naked).toEqual([]);
  });
});
