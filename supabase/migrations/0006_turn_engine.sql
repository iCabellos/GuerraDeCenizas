-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0006 · Lobby y resolución de turnos                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- El motor es TypeScript, así que la resolución no puede vivir entera dentro de una
-- función de Postgres. Y PostgREST no ofrece transacciones que abarquen varias
-- peticiones, de modo que el `pg_advisory_xact_lock` del pseudocódigo de
-- TECHNICAL_DESIGN §8.2 no puede sostenerse mientras corre `reduce()` en Node.
--
-- La resolución se parte en dos llamadas, cada una atómica (ADR-025):
--
--   begin_resolution()   → cierra la fila, comprueba que toca, arrienda y devuelve
--                          estado + órdenes
--   ...reduce() en Node...
--   commit_resolution()  → escribe todo con `state_version` como condición
--
-- Siguen siendo tres defensas superpuestas: `for update` serializa, el turno esperado
-- da idempotencia y el bloqueo optimista es la última red. El arrendamiento solo evita
-- trabajo duplicado; aunque venciera, la escritura seguiría siendo exclusiva.
--
-- Todas estas funciones son para `service_role`. Un jugador no puede invocarlas: el
-- `revoke` de abajo es parte de la seguridad, no higiene.

-- ─────────────────────────────── Código de invitación ─────────────────────────
-- Alfabeto sin caracteres confundibles (0/O, 1/I/L, 2/Z, 5/S, 8/B): el código se dicta
-- en voz alta o se teclea en un móvil, y un 0 leído como O es una partida perdida.

create or replace function public.new_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('ACDEFGHJKMNPQRTUVWXY34679', 1 + floor(random() * 25)::int, 1), ''
  )
  from generate_series(1, 6);
$$;

-- ──────────────────────────────── Crear una partida ───────────────────────────
--
-- La partida nace en `lobby` con todos los asientos creados y vacíos salvo el del
-- creador. Tenerlos creados desde el principio hace que unirse sea un `update` sobre una
-- fila que ya existe, y `join_game` puede cerrarla con `for update`: dos jugadores no
-- pueden reclamar el mismo asiento ni con la misma milésima.

create or replace function public.create_game(
  p_profile      uuid,
  p_player_count smallint,
  p_cadence      text,
  p_private      boolean,
  p_seed         bigint,
  p_engine       text,
  p_mapgen       text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game  uuid;
  v_code  text;
  v_try   int := 0;
begin
  if p_player_count not in (2,3,5) then
    return jsonb_build_object('ok', false, 'code', 'bad_player_count');
  end if;

  if p_private then
    -- Seis caracteres de un alfabeto de 25 son 244 millones de combinaciones; la colisión
    -- es improbable, pero «improbable» no es «imposible» y aquí cuesta tres líneas.
    loop
      v_code := public.new_invite_code();
      exit when not exists (select 1 from public.games where invite_code = v_code);
      v_try := v_try + 1;
      if v_try > 10 then
        return jsonb_build_object('ok', false, 'code', 'code_collision');
      end if;
    end loop;
  end if;

  insert into public.games (status, phase, player_count, cadence, map_seed,
                            mapgen_version, engine_version, invite_code, created_by)
  values ('lobby', 'parley', p_player_count, p_cadence, p_seed,
          p_mapgen, p_engine, v_code, p_profile)
  returning id into v_game;

  insert into public.game_players (game_id, seat, profile_id, faction_id, joined_at)
  select v_game, s::smallint,
         case when s = 0 then p_profile end,
         case when s = 0 then (select faction_id from public.profiles where id = p_profile) end,
         case when s = 0 then now() end
    from generate_series(0, p_player_count - 1) s;

  return jsonb_build_object('ok', true, 'game_id', v_game, 'invite_code', v_code, 'seat', 0);
end;
$$;

-- ──────────────────────────────── Estado del lobby ────────────────────────────
--
-- Quién está sentado, con qué nombre y qué facción. Lo lee la capa de autoridad antes de
-- generar el mapa: los asientos con los que se crea la partida salen de aquí y **nunca**
-- de la petición. Si vinieran del cliente, elegir el nombre de los demás sería lo de
-- menos — se podría empezar una partida de tres con un solo asiento ocupado.

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
               'name', coalesce(p.display_name, 'Mando Automático'),
               'faction_id', coalesce(gp.faction_id, p.faction_id, 'vantera'),
               'is_bot', gp.is_bot
             ) order by gp.seat), '[]'::jsonb)
        from public.game_players gp
        left join public.profiles p on p.id = gp.profile_id
       where gp.game_id = g.id)
  )
  from public.games g where g.id = p_game;
$$;

-- ──────────────────────────────── Empezar la partida ──────────────────────────

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

-- ──────────────────────────────── Unirse a una partida ────────────────────────

create or replace function public.join_game(p_code text, p_profile uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game  public.games;
  v_seat  smallint;
begin
  -- `for update` evita que dos jugadores reclamen el mismo asiento libre a la vez.
  select * into v_game from public.games
   where invite_code = upper(p_code) for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'game_not_found');
  end if;
  if v_game.status <> 'lobby' then
    return jsonb_build_object('ok', false, 'code', 'game_not_joinable');
  end if;

  -- Reincorporarse a un asiento propio no es unirse dos veces.
  select seat into v_seat from public.game_players
   where game_id = v_game.id and profile_id = p_profile;
  if found then
    return jsonb_build_object('ok', true, 'game_id', v_game.id, 'seat', v_seat,
                              'rejoined', true);
  end if;

  select seat into v_seat from public.game_players
   where game_id = v_game.id and profile_id is null and not is_bot
   order by seat limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'game_full');
  end if;

  update public.game_players
     set profile_id = p_profile,
         faction_id = (select faction_id from public.profiles where id = p_profile),
         joined_at  = now()
   where game_id = v_game.id and seat = v_seat;

  return jsonb_build_object('ok', true, 'game_id', v_game.id, 'seat', v_seat,
                            'rejoined', false);
end;
$$;

-- ──────────────────────────────── Enviar órdenes ──────────────────────────────
--
-- El asiento **no viene en la petición**: se deduce de quién eres. Si llegara en el
-- cuerpo, «juega por mí en el asiento 2» sería una llamada bien formada en vez de un
-- ataque. Y el turno se comprueba contra `games.turn`, no contra lo que diga el cliente.

create or replace function public.submit_orders(
  p_game    uuid,
  p_profile uuid,
  p_turn    smallint,
  p_payload jsonb,
  p_submit  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game    public.games;
  v_seat    smallint;
  v_pending int;
begin
  select * into v_game from public.games where id = p_game;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'game_not_found');
  end if;
  if v_game.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'game_not_active');
  end if;
  if v_game.turn <> p_turn then
    return jsonb_build_object('ok', false, 'code', 'wrong_turn', 'turn', v_game.turn);
  end if;

  select seat into v_seat from public.game_players
   where game_id = p_game and profile_id = p_profile;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_your_seat');
  end if;

  insert into public.orders (game_id, turn, seat, payload, source, submitted_at)
  values (p_game, p_turn, v_seat, p_payload, 'player',
          case when p_submit then now() end)
  on conflict (game_id, turn, seat) do update
    set payload = excluded.payload,
        source  = 'player',
        -- Un borrador nuevo no retira un envío ya hecho: guardar sin querer no puede
        -- deshacer el turno que ya comprometiste.
        submitted_at = case when p_submit then now() else public.orders.submitted_at end;

  -- Quién falta. Lo devuelve para que el cliente pinte «faltan 2» sin otra petición, y
  -- para que la capa de autoridad sepa si toca disparar la resolución inmediata.
  select count(*) into v_pending
    from public.game_players gp
    left join public.orders o
      on o.game_id = gp.game_id and o.turn = p_turn and o.seat = gp.seat
     and o.submitted_at is not null
   where gp.game_id = p_game and gp.profile_id is not null and not gp.is_bot
     and o.seat is null;

  return jsonb_build_object('ok', true, 'seat', v_seat, 'pending', v_pending,
                            'submitted', p_submit);
end;
$$;

-- ──────────────────────────────── Partidas vencidas ───────────────────────────
-- La usa `/api/cron/resolve-due` (pg_cron cada minuto) y también cualquier petición
-- de cliente como red de seguridad oportunista.

create or replace function public.due_games(p_now timestamptz, p_limit int default 20)
returns table (game_id uuid, turn smallint)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select g.id, g.turn
    from public.games g
   where g.status = 'active'
     and g.deadline_at is not null
     and g.deadline_at <= p_now
     and (g.resolving_until is null or g.resolving_until <= p_now)
   order by g.deadline_at
   limit p_limit;
$$;

-- ─────────────────────────────── Fase 1 · arrendar ────────────────────────────

create or replace function public.begin_resolution(p_game uuid, p_now timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_game    public.games;
  v_pending int;
  v_state   jsonb;
  v_orders  jsonb;
begin
  select * into v_game from public.games where id = p_game for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'game_not_found');
  end if;
  if v_game.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'not_active');
  end if;
  if v_game.resolving_until is not null and v_game.resolving_until > p_now then
    return jsonb_build_object('ok', false, 'code', 'in_progress');
  end if;

  -- ¿Están todos? Un bot y un asiento vacante nunca bloquean el turno; un borrador
  -- (`submitted_at is null`) tampoco cuenta como enviado.
  select count(*) into v_pending
    from public.game_players gp
    left join public.orders o
      on o.game_id = gp.game_id and o.turn = v_game.turn and o.seat = gp.seat
     and o.submitted_at is not null
   where gp.game_id = p_game
     and gp.profile_id is not null
     and not gp.is_bot
     and o.seat is null;

  if v_pending > 0
     and (v_game.deadline_at is null or v_game.deadline_at > p_now) then
    return jsonb_build_object('ok', false, 'code', 'not_ready', 'pending', v_pending);
  end if;

  select gs.state into v_state
    from public.game_states gs
   where gs.game_id = p_game and gs.turn = v_game.turn;
  if v_state is null then
    return jsonb_build_object('ok', false, 'code', 'state_missing');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'seat', o.seat, 'payload', o.payload, 'source', o.source
         ) order by o.seat), '[]'::jsonb)
    into v_orders
    from public.orders o
   where o.game_id = p_game and o.turn = v_game.turn and o.submitted_at is not null;

  -- Arrendamiento corto: si el resolutor muere a media faena, otro lo reintenta en
  -- treinta segundos en vez de dejar la partida colgada para siempre.
  update public.games set resolving_until = p_now + interval '30 seconds'
   where id = p_game;

  return jsonb_build_object(
    'ok', true,
    'turn', v_game.turn,
    'state_version', v_game.state_version,
    'player_count', v_game.player_count,
    'cadence', v_game.cadence,
    'deadline_at', v_game.deadline_at,
    'map_seed', v_game.map_seed,
    'state', v_state,
    'orders', v_orders,
    -- Control del turno anterior. Lo usa el Mando Automático para saber qué le quitaron:
    -- sin esto no ataca nunca, que es la degradación correcta pero deja al asiento
    -- ausente perdiendo territorio sin reaccionar jamás. Sale de `player_views` porque
    -- el control es público (GDD §6.2) y esas filas se conservan tres turnos.
    'prev_control', (select pv.view->'control' from public.player_views pv
                      where pv.game_id = p_game and pv.turn = v_game.turn - 1
                      order by pv.seat limit 1),
    'seats', (select coalesce(jsonb_agg(jsonb_build_object(
                       'seat', gp.seat, 'is_bot', gp.is_bot,
                       'missed_turns', gp.missed_turns,
                       'standing_orders', gp.standing_orders
                     ) order by gp.seat), '[]'::jsonb)
                from public.game_players gp where gp.game_id = p_game)
  );
end;
$$;

-- ──────────────────────────────── Fase 2 · escribir ───────────────────────────

create or replace function public.commit_resolution(
  p_game          uuid,
  p_turn          smallint,
  p_state_version integer,
  p_state         jsonb,
  p_checksum      text,
  p_views         jsonb,        -- [{seat, view, events}]
  p_applied       jsonb,        -- [{seat, applied, source}]
  p_submitted     smallint[],   -- asientos que sí enviaron órdenes
  p_deadline      timestamptz,
  p_phase         public.game_phase,
  p_status        public.game_status
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows int;
begin
  -- Bloqueo optimista. Si otro resolutor ganó la carrera, aquí se acaba el viaje: la
  -- transacción entera se descarta y nadie escribe dos veces el mismo turno.
  update public.games
     set turn            = p_turn + 1,
         state_version   = state_version + 1,
         deadline_at     = p_deadline,
         phase           = p_phase,
         status          = p_status,
         resolving_until = null,
         finished_at     = case when p_status = 'finished' then now() else finished_at end
   where id = p_game and turn = p_turn and state_version = p_state_version;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    return jsonb_build_object('ok', false, 'code', 'stale');
  end if;

  insert into public.game_states (game_id, turn, state, checksum)
  values (p_game, p_turn + 1, p_state, p_checksum)
  on conflict (game_id, turn) do update
    set state = excluded.state, checksum = excluded.checksum;

  insert into public.player_views (game_id, turn, seat, view, events)
  select p_game, p_turn + 1, (v->>'seat')::smallint, v->'view',
         coalesce(v->'events', '[]'::jsonb)
    from jsonb_array_elements(p_views) v
  on conflict (game_id, turn, seat) do update
    set view = excluded.view, events = excluded.events;

  -- Las órdenes que el servidor generó por ausencia (Permanentes o Mando Automático)
  -- se guardan igual: sin ellas la partida no se podría reproducir desde (semilla,
  -- órdenes), que es el criterio de aceptación de v0.3.
  insert into public.orders (game_id, turn, seat, payload, applied, source, submitted_at)
  select p_game, p_turn, (a->>'seat')::smallint,
         coalesce(a->'payload', '{}'::jsonb), a->'applied',
         coalesce(a->>'source', 'player'), now()
    from jsonb_array_elements(p_applied) a
  on conflict (game_id, turn, seat) do update
    set applied = excluded.applied, source = excluded.source;

  update public.game_players gp
     set missed_turns = case when gp.seat = any (p_submitted) then 0
                             else gp.missed_turns + 1 end
   where gp.game_id = p_game and gp.profile_id is not null;

  -- Retención (TECHNICAL_DESIGN §5.3): un snapshot cada 4 turnos y el último. Los
  -- intermedios se reconstruyen desde (semilla, órdenes), que sí se guardan siempre.
  delete from public.game_states
   where game_id = p_game and turn < p_turn + 1 and turn % 4 <> 0;

  delete from public.player_views
   where game_id = p_game and turn < p_turn - 1;

  return jsonb_build_object('ok', true, 'turn', p_turn + 1);
end;
$$;

-- ────────────────────────────── Quién puede llamarlas ─────────────────────────
--
-- ⚠ `revoke ... from public` NO basta.
--
-- Supabase ejecuta `alter default privileges in schema public grant all on functions to
-- anon, authenticated`, así que cada función nace con un GRANT EXPLÍCITO para esos dos
-- roles. Revocar solo de `public` deja ese grant intacto y `begin_resolution` —que
-- devuelve el estado autoritativo entero— queda a una llamada RPC de cualquier jugador
-- con sesión. Hay que nombrar los roles.

revoke all on function public.new_invite_code()                    from public, anon, authenticated;
revoke all on function public.join_game(text, uuid)                from public, anon, authenticated;
revoke all on function public.create_game(uuid, smallint, text, boolean, bigint, text, text)
                                                                   from public, anon, authenticated;
revoke all on function public.start_game(uuid, uuid, jsonb, text, jsonb, timestamptz)
                                                                   from public, anon, authenticated;
revoke all on function public.lobby_state(uuid)                    from public, anon, authenticated;
revoke all on function public.submit_orders(uuid, uuid, smallint, jsonb, boolean)
                                                                   from public, anon, authenticated;
revoke all on function public.due_games(timestamptz, int)          from public, anon, authenticated;
revoke all on function public.begin_resolution(uuid, timestamptz)  from public, anon, authenticated;
revoke all on function public.commit_resolution(
  uuid, smallint, integer, jsonb, text, jsonb, jsonb, smallint[],
  timestamptz, public.game_phase, public.game_status)              from public, anon, authenticated;
revoke all on function public.handle_new_profile()                 from public, anon, authenticated;

grant execute on function public.new_invite_code()                   to service_role;
grant execute on function public.join_game(text, uuid)               to service_role;
grant execute on function public.create_game(uuid, smallint, text, boolean, bigint, text, text)
                                                                     to service_role;
grant execute on function public.start_game(uuid, uuid, jsonb, text, jsonb, timestamptz)
                                                                     to service_role;
grant execute on function public.lobby_state(uuid)                   to service_role;
grant execute on function public.submit_orders(uuid, uuid, smallint, jsonb, boolean)
                                                                     to service_role;
grant execute on function public.due_games(timestamptz, int)         to service_role;
grant execute on function public.begin_resolution(uuid, timestamptz) to service_role;
grant execute on function public.commit_resolution(
  uuid, smallint, integer, jsonb, text, jsonb, jsonb, smallint[],
  timestamptz, public.game_phase, public.game_status)                to service_role;
