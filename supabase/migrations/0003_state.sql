-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0003 · Estado autoritativo, proyecciones y órdenes                           ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- ⚠ ESTE ES EL ARCHIVO QUE SOSTIENE LA NIEBLA DE GUERRA.
--
-- Supabase expone PostgREST. Si `game_states` fuera legible, cualquier jugador haría
-- `GET /rest/v1/game_states?game_id=eq.X` y vería posiciones ocultas, stocks ajenos y
-- órdenes: la niebla sería puramente cosmética. Es el riesgo técnico nº 1 del proyecto
-- (DISCOVERY T1, TECHNICAL_DESIGN §6).
--
--   game_states   → RLS activa y NINGUNA política ⇒ nadie lee. Solo `service_role`.
--   player_views  → una fila por asiento, YA filtrada por `reduce()`. Aquí lee el cliente.
--
-- El filtrado no ocurre en la consulta: ocurre en el servidor, dentro de la etapa
-- `computeVisibility`. Lo que un jugador no debe ver no sale nunca del servidor.

-- ────────────────────────── Estado completo · PROHIBIDO ───────────────────────

create table if not exists public.game_states (
  game_id    uuid not null references public.games on delete cascade,
  turn       smallint not null,
  state      jsonb not null,
  checksum   text not null,
  created_at timestamptz not null default now(),
  primary key (game_id, turn)
);

alter table public.game_states enable row level security;

-- Sin políticas: a propósito. `service_role` omite RLS por definición, así que el
-- motor sigue escribiendo. El `revoke` es cinturón además de tirantes: Supabase concede
-- ALL sobre `public` a `anon` y `authenticated` por defecto, y una tabla protegida solo
-- por RLS queda a un `alter table ... disable row level security` de distancia.
revoke all on public.game_states from anon, authenticated;

-- ─────────────────────── Proyección por asiento · lo que se lee ───────────────

create table if not exists public.player_views (
  game_id    uuid not null references public.games on delete cascade,
  turn       smallint not null,
  seat       smallint not null check (seat between 0 and 4),
  view       jsonb not null,
  events     jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, turn, seat)
);

alter table public.player_views enable row level security;

drop policy if exists "ver mi propia vista" on public.player_views;
create policy "ver mi propia vista" on public.player_views
  for select using (public.is_seat(game_id, seat));

revoke insert, update, delete on public.player_views from anon, authenticated;

-- ──────────────────────────────────  Órdenes  ─────────────────────────────────
--
-- La vía prevista es `POST /api/games/:id/orders`, con validación de dos niveles
-- (TECHNICAL_DESIGN §7.2). Estas políticas existen porque PostgREST es alcanzable:
-- si algún día alguien apunta ahí, no debe poder hacer daño.

create table if not exists public.orders (
  game_id      uuid not null references public.games on delete cascade,
  turn         smallint not null,
  seat         smallint not null check (seat between 0 and 4),
  payload      jsonb not null,
  -- Lo que el servidor realmente ejecutó, tras validar y recortar. Se guarda aparte
  -- del `payload` para poder reproducir la partida desde (semilla, órdenes) y obtener
  -- el mismo checksum aunque cambie la validación.
  applied      jsonb,
  source       text not null default 'player'
               check (source in ('player','standing','autocommand')),
  -- `null` ⇒ borrador. Cerrar la pestaña a mitad de turno no puede perder el trabajo
  -- (TECHNICAL_DESIGN §9.2), pero un borrador tampoco cuenta como turno enviado: si
  -- contara, guardar sin querer resolvería el turno de los demás.
  submitted_at timestamptz,
  primary key (game_id, turn, seat)
);

alter table public.orders enable row level security;

drop policy if exists "leer mis órdenes" on public.orders;
create policy "leer mis órdenes" on public.orders
  for select using (public.is_seat(game_id, seat));

-- Solo en mi asiento, solo del turno en curso, solo con la partida activa. Un turno
-- pasado o futuro se rechaza: sin esto se podrían sembrar órdenes por adelantado y
-- leer el mapa antes de comprometerse.
drop policy if exists "enviar mis órdenes" on public.orders;
create policy "enviar mis órdenes" on public.orders
  for insert with check (
    public.is_seat(game_id, seat)
    and exists (
      select 1 from public.games g
      where g.id = orders.game_id and g.status = 'active' and g.turn = orders.turn
    )
  );

drop policy if exists "reenviar mis órdenes" on public.orders;
create policy "reenviar mis órdenes" on public.orders
  for update using (public.is_seat(game_id, seat))
  with check (
    public.is_seat(game_id, seat)
    and exists (
      select 1 from public.games g
      where g.id = orders.game_id and g.status = 'active' and g.turn = orders.turn
    )
  );

-- `applied` y `source` los pone el servidor. Que el cliente pudiera escribirlos sería
-- entregarle la reproducción de la partida.
revoke insert, update, delete on public.orders from anon, authenticated;
grant  insert (game_id, turn, seat, payload) on public.orders to authenticated;
grant  update (payload) on public.orders to authenticated;

-- ─────────────────────────────  Realtime  ─────────────────────────────────────
-- El cliente se suscribe a su propia vista y al estado del lobby. Nunca a `game_states`:
-- la publicación tiene lista explícita justamente para no poder equivocarse.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.player_views;
    alter publication supabase_realtime add table public.games;
  end if;
exception when duplicate_object then null;
end $$;
