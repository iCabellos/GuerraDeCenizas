-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0002 · Partidas y asientos                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- `games` y `game_players` son públicos DENTRO de la partida: quién juega, en qué
-- asiento, con qué facción y doctrina. Eso no es información oculta — el GDD §6.2 dice
-- que lo secreto es la composición militar, no quién está sentado a la mesa.
--
-- Nada aquí es escribible desde el cliente. Crear partida, unirse y empezar pasan por
-- Route Handlers con `service_role` (TECHNICAL_DESIGN §7).

do $$ begin
  create type public.game_status as enum ('lobby','active','finished','abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.game_phase as enum ('parley','war','resolved');
exception when duplicate_object then null; end $$;

create table if not exists public.games (
  id             uuid primary key default gen_random_uuid(),
  status         public.game_status not null default 'lobby',
  phase          public.game_phase  not null default 'parley',
  player_count   smallint not null check (player_count in (2,3,5)),
  cadence        text not null check (cadence in ('blitz','daily','relaxed')),
  turn           smallint not null default 0 check (turn >= 0),
  -- Bloqueo optimista: cada resolución lo incrementa. Dos resoluciones simultáneas
  -- del mismo turno no pueden ganar las dos.
  state_version  integer  not null default 0,
  map_seed       bigint   not null,
  mapgen_version text     not null,
  engine_version text     not null,
  deadline_at    timestamptz,
  -- Arrendamiento de resolución: mientras esté en el futuro, otro resolutor no empieza.
  -- No sustituye al bloqueo optimista, solo evita trabajo duplicado (ADR-025).
  resolving_until timestamptz,
  invite_code    text unique,
  created_by     uuid references public.profiles,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);

create index if not exists games_due_idx
  on public.games (deadline_at) where status = 'active';

create table if not exists public.game_players (
  game_id         uuid not null references public.games on delete cascade,
  seat            smallint not null check (seat between 0 and 4),
  profile_id      uuid references public.profiles,      -- null ⇒ asiento libre o bot
  faction_id      text,
  doctrine        text,
  city            text,
  is_bot          boolean not null default false,
  -- Turnos consecutivos sin enviar órdenes. A partir de BALANCE.autocommand toma el
  -- Mando Automático; el jugador recupera el asiento en cuanto vuelve (ADR-013: no hay
  -- eliminación, tampoco por ausencia).
  missed_turns    smallint not null default 0 check (missed_turns >= 0),
  standing_orders jsonb    not null default '{}'::jsonb,
  joined_at       timestamptz,
  primary key (game_id, seat)
);

-- Un perfil no puede ocupar dos asientos de la misma partida. El índice parcial deja
-- fuera los asientos libres, que sí pueden repetir `null`.
create unique index if not exists game_players_one_seat_idx
  on public.game_players (game_id, profile_id) where profile_id is not null;

-- ─────────────────────── Ayudantes de política (sin recursión) ────────────────
--
-- Una política sobre `game_players` que consulte `game_players` se llama a sí misma:
-- Postgres corta con «infinite recursion detected in policy». Estas funciones son
-- `security definer`, así que leen la tabla sin RLS y rompen el ciclo. ADR-023.
--
-- `stable` y no `volatile` para que el planificador las evalúe una vez por consulta.

create or replace function public.is_player(p_game uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game and gp.profile_id = auth.uid()
  );
$$;

create or replace function public.is_seat(p_game uuid, p_seat smallint)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.game_players gp
    where gp.game_id = p_game and gp.seat = p_seat and gp.profile_id = auth.uid()
  );
$$;

create or replace function public.my_seat(p_game uuid)
returns smallint
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select gp.seat from public.game_players gp
  where gp.game_id = p_game and gp.profile_id = auth.uid();
$$;

-- Las tres se conceden también a `anon`, y es a propósito: las políticas se evalúan con
-- los permisos de quien consulta, así que un `anon` sin EXECUTE recibiría «permission
-- denied for function is_player» en vez de un resultado vacío. Conceder no abre nada —
-- sin sesión, `auth.uid()` es nulo y las tres devuelven falso o nulo—, y evita que un
-- error de permisos se confunda con un fallo de la aplicación.
revoke all on function public.is_player(uuid)        from public;
revoke all on function public.is_seat(uuid, smallint) from public;
revoke all on function public.my_seat(uuid)          from public;
grant execute on function public.is_player(uuid)        to anon, authenticated, service_role;
grant execute on function public.is_seat(uuid, smallint) to anon, authenticated, service_role;
grant execute on function public.my_seat(uuid)          to anon, authenticated, service_role;

-- ────────────────────────────────────  RLS  ───────────────────────────────────

alter table public.games        enable row level security;
alter table public.game_players enable row level security;

drop policy if exists "ver mis partidas" on public.games;
create policy "ver mis partidas" on public.games
  for select using (public.is_player(id));

drop policy if exists "ver los asientos de mis partidas" on public.game_players;
create policy "ver los asientos de mis partidas" on public.game_players
  for select using (public.is_player(game_id));

-- Órdenes Permanentes: es la única columna que el jugador escribe directamente, y solo
-- en su propio asiento. `missed_turns`, `is_bot` y `profile_id` quedan fuera por GRANT.
drop policy if exists "editar mis órdenes permanentes" on public.game_players;
create policy "editar mis órdenes permanentes" on public.game_players
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

revoke insert, update, delete on public.games        from anon, authenticated;
revoke insert, update, delete on public.game_players from anon, authenticated;
grant  update (standing_orders) on public.game_players to authenticated;
