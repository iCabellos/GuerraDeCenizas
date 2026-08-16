-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0001 · Cuentas y metaprogresión                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Todo lo que sobrevive a una campaña vive aquí. La regla de oro (ADR-009) dice que
-- la metaprogresión solo añade opciones: por eso `account_unlocks` guarda CLAVES, no
-- números, y ninguna de estas tablas puede tocar una constante de BALANCE.
--
-- Ninguna tabla de este archivo es escribible desde el cliente salvo el perfil propio.
-- `ash_bank` y los desbloqueos los mueve la capa de autoridad con `service_role`: si el
-- cliente pudiera sumarse Ceniza, la metaprogresión entera sería decorativa.

-- ─────────────────────────────────── Perfil ───────────────────────────────────

create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null check (char_length(display_name) between 3 and 20),
  locale        text not null default 'es' check (locale in ('es','en')),
  -- La facción de la cuenta (ADR-021). Se elige al crear el perfil y solo cambia
  -- mediante un Cisma, que cuesta Ceniza y lo aplica el servidor.
  faction_id    text not null default 'vantera'
                check (faction_id in ('vantera','koldvik','saranth','meridia','oshara','tarn')),
  schism_at     integer,               -- número de campaña del último Cisma; null = nunca
  campaigns     integer not null default 0 check (campaigns >= 0),
  created_at    timestamptz not null default now()
);

-- ─────────────────────────────────── Ciudad ───────────────────────────────────
-- La Ciudad es un hub de progresión, no un gestor de recursos (ADR-010).

create table if not exists public.cities (
  profile_id    uuid primary key references public.profiles on delete cascade,
  ash_bank      integer not null default 0 check (ash_bank >= 0),
  districts     jsonb   not null default '{}'::jsonb,
  loadout       jsonb   not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

create table if not exists public.account_unlocks (
  profile_id    uuid not null references public.profiles on delete cascade,
  unlock_key    text not null,
  unlocked_at   timestamptz not null default now(),
  primary key (profile_id, unlock_key)
);

create table if not exists public.reputation_events (
  id            bigserial primary key,
  profile_id    uuid not null references public.profiles on delete cascade,
  game_id       uuid,
  kind          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists reputation_events_profile_idx
  on public.reputation_events (profile_id, created_at desc);

-- ──────────────────────────── Alta automática de cuenta ───────────────────────
-- Un perfil sin Ciudad sería una cuenta a medias. El trigger evita que la API tenga
-- que acordarse de crearla, que es justo la clase de olvido que se descubre en
-- producción.

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.cities (profile_id) values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_profile();

-- ────────────────────────────────────  RLS  ───────────────────────────────────

alter table public.profiles          enable row level security;
alter table public.cities            enable row level security;
alter table public.account_unlocks   enable row level security;
alter table public.reputation_events enable row level security;

-- El perfil propio: leer, crear y editar nombre/idioma.
-- `faction_id`, `schism_at` y `campaigns` NO son escribibles desde el cliente; se
-- restringen por GRANT de columna más abajo, porque una política RLS no distingue
-- columnas.
drop policy if exists "leer mi perfil" on public.profiles;
create policy "leer mi perfil" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "crear mi perfil" on public.profiles;
create policy "crear mi perfil" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "editar mi perfil" on public.profiles;
create policy "editar mi perfil" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- La Ciudad se lee, nunca se escribe desde el cliente: sin política de update.
drop policy if exists "leer mi ciudad" on public.cities;
create policy "leer mi ciudad" on public.cities
  for select using (profile_id = auth.uid());

drop policy if exists "leer mis desbloqueos" on public.account_unlocks;
create policy "leer mis desbloqueos" on public.account_unlocks
  for select using (profile_id = auth.uid());

drop policy if exists "leer mi reputación" on public.reputation_events;
create policy "leer mi reputación" on public.reputation_events
  for select using (profile_id = auth.uid());

-- ───────────────────────────── Privilegios de columna ─────────────────────────
-- RLS decide QUÉ FILAS; los GRANT deciden QUÉ COLUMNAS. Hacen falta los dos: sin
-- esto, «editar mi perfil» permitiría cambiarse de facción gratis y saltarse el
-- coste del Cisma.

revoke update on public.profiles from anon, authenticated;
grant  update (display_name, locale) on public.profiles to authenticated;

revoke insert, update, delete on public.cities            from anon, authenticated;
revoke insert, update, delete on public.account_unlocks   from anon, authenticated;
revoke insert, update, delete on public.reputation_events from anon, authenticated;
