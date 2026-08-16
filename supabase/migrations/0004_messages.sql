-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0004 · Mensajes y tratados                                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Las tablas llegan en v0.3; la diplomacia que las usa, en v0.4. Se crean ahora porque
-- el canal privado es uno de los siete tests de RLS bloqueantes y no quiero descubrir
-- en v0.4 que la política estaba mal.
--
-- Sobre el canal privado: TECHNICAL_DESIGN §6.3 lo ilustra con `channel like '%'||seat`,
-- y avisa de que la implementación real usa un array. Con `like`, el canal `'seat:1,3'`
-- sería visible para el asiento 1, el 3… y también para cualquier asiento cuyo dígito
-- aparezca por casualidad en otro sitio de la cadena. Un array `smallint[]` con
-- `= any(...)` es exacto e indexable con GIN.

create table if not exists public.messages (
  id            bigserial primary key,
  game_id       uuid not null references public.games on delete cascade,
  -- 'public' o 'private'. El reparto real lo decide `channel_seats`.
  channel       text not null default 'public' check (channel in ('public','private')),
  -- Asientos que ven el mensaje. Vacío ⇒ canal público.
  channel_seats smallint[] not null default '{}',
  sender_seat   smallint not null check (sender_seat between 0 and 4),
  body          text check (char_length(body) <= 500),
  -- Oferta por plantilla: datos, no frases (ADR-015). Dos jugadores con idiomas
  -- distintos ven exactamente la misma oferta.
  template      jsonb,
  created_at    timestamptz not null default now(),
  -- Un mensaje sin cuerpo ni plantilla no es un mensaje.
  check (body is not null or template is not null),
  -- El canal privado sin destinatarios sería un canal público disfrazado.
  check (channel = 'public' or array_length(channel_seats, 1) >= 2)
);

create index if not exists messages_game_idx
  on public.messages (game_id, created_at desc);
create index if not exists messages_seats_idx
  on public.messages using gin (channel_seats);

create table if not exists public.treaties (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games on delete cascade,
  kind          text not null check (kind in ('seal','transfer','coalition')),
  proposer_seat smallint not null check (proposer_seat between 0 and 4),
  target_seat   smallint not null check (target_seat between 0 and 4),
  terms         jsonb not null,
  status        text not null default 'proposed'
                check (status in ('proposed','active','fulfilled','breached','expired','rejected')),
  created_turn  smallint not null,
  expires_turn  smallint,
  created_at    timestamptz not null default now()
);

create index if not exists treaties_game_status_idx
  on public.treaties (game_id, status);

-- ────────────────────────────────────  RLS  ───────────────────────────────────

alter table public.messages enable row level security;
alter table public.treaties enable row level security;

drop policy if exists "leer mensajes visibles" on public.messages;
create policy "leer mensajes visibles" on public.messages
  for select using (
    public.is_player(game_id)
    and (
      channel = 'public'
      or public.my_seat(game_id) = any (channel_seats)
    )
  );

-- Los tratados propuestos son públicos en cuanto existen: la diplomacia es aritmética
-- verificable, no información privilegiada (GDD §9). Lo que se negocia en privado es la
-- conversación, no el tratado firmado.
drop policy if exists "leer tratados de mi partida" on public.treaties;
create policy "leer tratados de mi partida" on public.treaties
  for select using (public.is_player(game_id));

-- Enviar y proponer pasan por la API: el servidor pone `sender_seat` y `created_turn`,
-- que es exactamente lo que un cliente querría falsificar.
revoke insert, update, delete on public.messages from anon, authenticated;
revoke insert, update, delete on public.treaties from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.treaties;
  end if;
exception when duplicate_object then null;
end $$;
