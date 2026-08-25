-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ El mapa deja de viajar en cada vista                        (ADR-044)        ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- `player_views` guarda una fila por (partida, turno, asiento) y hasta ahora cada una
-- llevaba el mapa entero. El mapa es **inmutable durante toda la partida**, así que eso
-- eran 120 copias del mismo objeto en una campaña de cinco a 24 turnos.
--
-- Medido con el mapa nuevo, 5 jugadores, 271 regiones:
--
--     mapa .................. 36,3 KB
--     vista completa ........ 43,2 KB   ← el 84 % era el mapa
--     vista sin el mapa ......  6,9 KB
--     campaña entera ......... 5,2 MB   → 0,85 MB
--
-- Sobre los 500 MB del free tier eso son ~95 campañas archivadas frente a ~580, y de ese
-- número depende que el objetivo de 0 €/mes durante la beta siga siendo posible.
--
-- El mapa se guarda **una vez por partida** aquí y la capa de autoridad lo vuelve a
-- pegar a la vista al leerla. El motor y la interfaz no se enteran: `PlayerView` sigue
-- teniendo su `map`, que es lo que evita tocar cada componente que lo usa.

create table if not exists public.game_maps (
  game_id    uuid primary key references public.games on delete cascade,
  map        jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.game_maps enable row level security;

-- La topología es **pública entre los jugadores de esa partida** y de nadie más. Lo
-- secreto son las fuerzas, no el terreno — pero eso se escribe como política, no se da
-- por hecho: un asiento de otra partida no puede leer este mapa.
drop policy if exists "ver el mapa de mi partida" on public.game_maps;
create policy "ver el mapa de mi partida" on public.game_maps
  for select using (public.is_player(game_id));

-- Nadie escribe desde el cliente: lo pone la autoridad con `service_role` al crear la
-- partida, y no vuelve a cambiar nunca.
revoke insert, update, delete on public.game_maps from anon, authenticated;

-- `start_game` guarda además el mapa. No hace falta un parámetro nuevo: el estado que
-- ya recibe lo lleva dentro, y así la firma de la función no cambia.
create or replace function public.start_game(
  p_game     uuid,
  p_profile  uuid,
  p_state    jsonb,
  p_checksum text,
  p_views    jsonb,
  p_deadline timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game  public.games;
  v_empty int;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'game_not_found');
  end if;
  if v_game.status <> 'lobby' then
    return jsonb_build_object('ok', false, 'code', 'already_started');
  end if;
  if v_game.created_by is distinct from p_profile then
    return jsonb_build_object('ok', false, 'code', 'not_the_host');
  end if;

  select count(*) into v_empty from public.game_players
   where game_id = p_game and profile_id is null and not is_bot;
  if v_empty > 0 then
    return jsonb_build_object('ok', false, 'code', 'seats_empty', 'empty', v_empty);
  end if;

  -- El mapa lo genera el motor en Node a partir de `map_seed`. Comprobar aquí que el
  -- estado que llega salió de esa semilla evita que un fallo de la capa de autoridad
  -- meta en la partida un mapa que no corresponde a lo que dice la fila.
  if (p_state->'meta'->>'seed')::bigint is distinct from v_game.map_seed then
    return jsonb_build_object('ok', false, 'code', 'seed_mismatch');
  end if;

  insert into public.game_states (game_id, turn, state, checksum)
  values (p_game, 0, p_state, p_checksum)
  on conflict (game_id, turn) do update
    set state = excluded.state, checksum = excluded.checksum;

  -- Una vez y para siempre. `do nothing` y no `do update`: si el mapa de una partida
  -- cambiara a mitad, las vistas ya servidas dejarían de corresponder con el estado.
  insert into public.game_maps (game_id, map)
  values (p_game, p_state->'map')
  on conflict (game_id) do nothing;

  insert into public.player_views (game_id, turn, seat, view, events)
  select p_game, 0, (v->>'seat')::smallint, v->'view', coalesce(v->'events', '[]'::jsonb)
    from jsonb_array_elements(p_views) v
  on conflict (game_id, turn, seat) do update
    set view = excluded.view, events = excluded.events;

  update public.games
     set status = 'active', phase = 'parley', turn = 0,
         state_version = state_version + 1, deadline_at = p_deadline
   where id = p_game;

  return jsonb_build_object('ok', true, 'game_id', p_game);
end;
$$;

-- Se vuelve a revocar: una función `security definer` recreada nace otra vez con el
-- GRANT que Supabase concede por defecto a `anon` y `authenticated`, y ésta escribe el
-- estado autoritativo. Hay que nombrar los tres roles; `from public` no basta.
revoke all on function public.start_game(uuid, uuid, jsonb, text, jsonb, timestamptz)
  from public, anon, authenticated;
