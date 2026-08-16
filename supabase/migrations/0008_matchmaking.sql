-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0008 · Emparejamiento                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Una sola cola, un solo botón. El jugador pulsa buscar y o entra en una campaña o
-- espera viendo cómo llegan las demás ciudades — nunca rellena un formulario
-- ([ADR-026](../docs/DECISIONS.md#adr-026)).
--
-- La partida emparejada **empieza sola**, sin sala de espera. Una sala en la que hay que
-- pulsar «empezar» es un peaje entre el jugador y el turno que quiere jugar, y en cadencia
-- Blitz ese peaje se come un tercio del primer plazo.
--
-- Nadie se queda esperando indefinidamente: pasados unos minutos los asientos que falten
-- se rellenan con Mando Automático ([DISCOVERY P1](../docs/DISCOVERY.md#23-riesgos-de-producto)).
-- Que no haya suficientes jugadores es el riesgo de producto número uno de un juego nuevo
-- de 2, 3 o 5 personas, y la mitigación no puede ser «vuelve más tarde».

create table if not exists public.matchmaking_queue (
  -- Una sola entrada por perfil: no se puede hacer cola en dos tamaños a la vez y llevarse
  -- el asiento de otro en la partida que salga primero.
  profile_id   uuid primary key references public.profiles on delete cascade,
  player_count smallint not null check (player_count in (2,3,5)),
  cadence      text not null check (cadence in ('blitz','daily','relaxed')),
  joined_at    timestamptz not null default now()
);

-- La cola se consume por antigüedad dentro de cada combinación tamaño+cadencia.
create index if not exists matchmaking_bucket_idx
  on public.matchmaking_queue (player_count, cadence, joined_at);

alter table public.matchmaking_queue enable row level security;

drop policy if exists "ver mi lugar en la cola" on public.matchmaking_queue;
create policy "ver mi lugar en la cola" on public.matchmaking_queue
  for select using (profile_id = auth.uid());

-- Entrar y salir pasan por la API: el servidor decide el tamaño y la cadencia a partir de
-- lo que el jugador eligió, y sobre todo decide **cuándo** se forma la partida.
revoke insert, update, delete on public.matchmaking_queue from anon, authenticated;

-- ────────────────────────────────── Entrar ────────────────────────────────────

create or replace function public.enqueue(
  p_profile uuid,
  p_size    smallint,
  p_cadence text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_waiting int;
begin
  if p_size not in (2,3,5) then
    return jsonb_build_object('ok', false, 'code', 'bad_player_count');
  end if;

  insert into public.matchmaking_queue (profile_id, player_count, cadence)
  values (p_profile, p_size, p_cadence)
  on conflict (profile_id) do update
    set player_count = excluded.player_count,
        cadence      = excluded.cadence,
        -- Cambiar de tamaño reinicia la antigüedad: si no, se podría esperar en la cola
        -- de 5 y saltar al principio de la de 2 en cuanto conviniera.
        joined_at    = now();

  select count(*) into v_waiting from public.matchmaking_queue
   where player_count = p_size and cadence = p_cadence;

  return jsonb_build_object('ok', true, 'waiting', v_waiting, 'needed', p_size);
end;
$$;

create or replace function public.dequeue(p_profile uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with removed as (
    delete from public.matchmaking_queue where profile_id = p_profile returning 1
  )
  select jsonb_build_object('ok', true, 'left', (select count(*) from removed));
$$;

-- ────────────────────────────── Dónde estoy ───────────────────────────────────
--
-- Devuelve lo justo para pintar la espera sin una sola frase: cuántos hay, cuántos hacen
-- falta y cuánto llevo esperando. La interfaz lo dibuja como ciudades que van llegando.

create or replace function public.queue_status(p_profile uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
       'ok', true,
       'queued', true,
       'player_count', q.player_count,
       'cadence', q.cadence,
       'waiting', (select count(*) from public.matchmaking_queue o
                    where o.player_count = q.player_count and o.cadence = q.cadence),
       'waited_seconds', floor(extract(epoch from now() - q.joined_at))::int
     )
     from public.matchmaking_queue q where q.profile_id = p_profile),
    jsonb_build_object('ok', true, 'queued', false)
  );
$$;

-- ──────────────────────────────── Formar partida ──────────────────────────────
--
-- Saca de la cola a los N más antiguos de un grupo y los devuelve. Es una operación
-- atómica **y destructiva**: quien recibe los identificadores tiene que crear la partida
-- sí o sí, porque esos jugadores ya no están en la cola.
--
-- `for update skip locked` es lo que hace que dos peticiones simultáneas no puedan
-- llevarse al mismo jugador: la segunda salta las filas que la primera tiene cerradas.

create or replace function public.claim_match(
  p_size    smallint,
  p_cadence text,
  p_bot_fill_after interval default interval '3 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_oldest timestamptz;
begin
  select array_agg(profile_id order by joined_at), min(joined_at)
    into v_ids, v_oldest
    from (
      select profile_id, joined_at
        from public.matchmaking_queue
       where player_count = p_size and cadence = p_cadence
       order by joined_at
       limit p_size
       for update skip locked
    ) candidates;

  if v_ids is null then
    return jsonb_build_object('ok', false, 'code', 'empty');
  end if;

  -- Con la cola llena se forma la partida entera. Si no, solo cuando el más antiguo lleva
  -- esperando lo suficiente: entonces los asientos que faltan los ocupa el Mando
  -- Automático, que juega en defensa y no decide la partida.
  if array_length(v_ids, 1) < p_size and now() - v_oldest < p_bot_fill_after then
    return jsonb_build_object('ok', false, 'code', 'not_enough',
                              'waiting', array_length(v_ids, 1), 'needed', p_size);
  end if;

  delete from public.matchmaking_queue where profile_id = any (v_ids);

  return jsonb_build_object('ok', true, 'profiles', to_jsonb(v_ids),
                            'bots', p_size - array_length(v_ids, 1));
end;
$$;

-- ─────────────────────────── Sentar a los emparejados ─────────────────────────
--
-- `create_game` sienta al creador en el asiento 0 y deja el resto libres. Esto ocupa los
-- demás de una vez, en el orden en que llegaron a la cola, y marca como bot los que
-- sobren.

create or replace function public.seat_match(p_game uuid, p_profiles jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_seat smallint := 0;
  v_id   uuid;
begin
  for v_id in select value::text::uuid from jsonb_array_elements_text(p_profiles) loop
    update public.game_players
       set profile_id = v_id,
           faction_id = (select faction_id from public.profiles where id = v_id),
           joined_at  = now()
     where game_id = p_game and seat = v_seat;
    v_seat := v_seat + 1;
  end loop;

  -- Los asientos que queden vacíos son Mando Automático. Público desde el primer turno:
  -- saber que hay un bot en la mesa cambia el cálculo diplomático de todos.
  update public.game_players
     set is_bot = true
   where game_id = p_game and profile_id is null;

  return jsonb_build_object('ok', true, 'seated', v_seat);
end;
$$;

-- ────────────────────────────── Quién puede llamarlas ─────────────────────────

revoke all on function public.enqueue(uuid, smallint, text)          from public, anon, authenticated;
revoke all on function public.dequeue(uuid)                          from public, anon, authenticated;
revoke all on function public.queue_status(uuid)                     from public, anon, authenticated;
revoke all on function public.claim_match(smallint, text, interval)  from public, anon, authenticated;
revoke all on function public.seat_match(uuid, jsonb)                from public, anon, authenticated;

grant execute on function public.enqueue(uuid, smallint, text)         to service_role;
grant execute on function public.dequeue(uuid)                         to service_role;
grant execute on function public.queue_status(uuid)                    to service_role;
grant execute on function public.claim_match(smallint, text, interval) to service_role;
grant execute on function public.seat_match(uuid, jsonb)               to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.matchmaking_queue;
  end if;
exception when duplicate_object then null;
end $$;
