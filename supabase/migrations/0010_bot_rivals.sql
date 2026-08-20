-- ─────────────────────────────── Rivales artificiales ────────────────────────
--
-- Hasta ahora un asiento sin humano era «Mando Automático»: sin facción, sin nombre y
-- jugando en defensa para no decidir la partida de nadie. Eso es lo correcto para cubrir
-- a un humano AUSENTE, y `standing.ts` sigue haciéndolo exactamente igual.
--
-- Un asiento de bot es otra cosa: nunca tuvo humano detrás. Para que sirva de rival de
-- pruebas necesita dos cosas que aquí se le dan —nombre y facción— y una tercera que le
-- da el motor (`rules/bot.ts`): jugar para ganar, con el perfil que le toque.
--
-- El reparto es determinista por (partida, asiento). No es un capricho: la resolución de
-- un turno tiene que poder reejecutarse y dar el mismo resultado.

alter table public.game_players
  add column if not exists bot_name text;

comment on column public.game_players.bot_name is
  'Nombre del rival artificial. Null en un asiento con humano.';

-- Nombres del mundo del juego. Que un rival se llame «Bot 2» delata la mesa entera y
-- cambia cómo negocia todo el mundo con él, que es justo lo que se quiere evitar en una
-- partida de pruebas.
create or replace function public.bot_display_name(p_game uuid, p_seat smallint)
returns text
language sql
immutable
as $$
  select (array[
    'Kael', 'Bren', 'Ysolde', 'Tovar', 'Mira', 'Adran', 'Sela', 'Korrin',
    'Nadia', 'Esben', 'Lira', 'Baldur', 'Onneth', 'Sarel', 'Dmitra', 'Vess'
  ])[1 + (('x' || substr(md5(p_game::text || ':' || p_seat::text), 1, 8))::bit(32)::bigint
          & 2147483647) % 16];
$$;

-- ───────────────────────────── Sentar a los emparejados ──────────────────────
--
-- Igual que antes para los humanos. Lo que cambia es el asiento que sobra: en vez de
-- quedarse anónimo, se le da nombre y una facción, elegidos de forma estable a partir del
-- identificador de la partida.

create or replace function public.seat_match(p_game uuid, p_profiles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seat smallint := 0;
  v_id   uuid;
  v_bot  record;
  v_factions text[] := array['vantera', 'koldvik', 'saranth', 'meridia', 'oshara', 'tarn'];
begin
  for v_id in select value::text::uuid from jsonb_array_elements_text(p_profiles) loop
    update public.game_players
       set profile_id = v_id,
           faction_id = (select faction_id from public.profiles where id = v_id),
           joined_at  = now()
     where game_id = p_game and seat = v_seat;
    v_seat := v_seat + 1;
  end loop;

  -- Los asientos que queden vacíos son rivales artificiales. `is_bot` sigue siendo
  -- público desde el primer turno: saber que hay un bot en la mesa cambia el cálculo
  -- diplomático de todos, y ocultarlo contradiría esa decisión.
  for v_bot in
    select seat from public.game_players
     where game_id = p_game and profile_id is null
     order by seat
  loop
    update public.game_players
       set is_bot     = true,
           bot_name   = public.bot_display_name(p_game, v_bot.seat),
           faction_id = v_factions[1 + (('x' || substr(md5(p_game::text || ':f:' || v_bot.seat::text), 1, 8))::bit(32)::bigint & 2147483647) % 6],
           joined_at  = now()
     where game_id = p_game and seat = v_bot.seat;
  end loop;

  return jsonb_build_object('ok', true, 'seated', v_seat);
end;
$$;

-- ──────────────────────────── El nombre que ve la mesa ───────────────────────
--
-- `lobby_state` componía el nombre con `coalesce(display_name, 'Mando Automático')`, así
-- que un rival artificial se presentaba a la mesa con esa etiqueta. Ahora tiene el suyo;
-- el literal se queda para el caso que de verdad describe: un asiento que nadie ocupa.
--
-- Se redefine entera porque es el sitio del que la capa de autoridad saca los asientos
-- con los que crea la partida, y esos asientos **nunca** vienen de la petición.

create or replace function public.lobby_state(p_game uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'ok', g.id is not null,
    'game_id', g.id,
    'status', g.status,
    'cadence', g.cadence,
    'player_count', g.player_count,
    'map_seed', g.map_seed,
    'turn', g.turn,
    'created_by', g.created_by,
    'invite_code', g.invite_code,
    'seats', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'seat', gp.seat,
               'profile_id', gp.profile_id,
               'name', coalesce(p.display_name, gp.bot_name, 'Mando Automático'),
               'faction_id', coalesce(gp.faction_id, p.faction_id, 'vantera'),
               'is_bot', gp.is_bot
             ) order by gp.seat), '[]'::jsonb)
        from public.game_players gp
        left join public.profiles p on p.id = gp.profile_id
       where gp.game_id = g.id)
  )
  from public.games g where g.id = p_game;
$$;

revoke all on function public.lobby_state(uuid) from public, anon, authenticated;
revoke all on function public.seat_match(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.bot_display_name(uuid, smallint) from public, anon, authenticated;
