-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ Emulación mínima de Supabase sobre Postgres puro                             ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Este archivo NO es una migración y NO se aplica al proyecto remoto: allí lo pone
-- Supabase. Existe para que los tests de RLS corran contra un Postgres de verdad, sin
-- Docker ni servicios externos (ADR-024).
--
-- ⚠ Lo importante de este archivo son los GRANT del final.
--
-- Supabase concede ALL sobre todo lo de `public` a `anon` y `authenticated`. Si el shim
-- no lo hiciera, los tests pasarían porque falta el permiso, no porque la política
-- funcione — y el día del despliegue real la niebla de guerra se caería entera. Es
-- exactamente la lección nº 4 del CLAUDE.md raíz: un test que no puede fallar no prueba
-- nada.

create schema if not exists auth;

-- `is_anonymous` está aquí porque el trigger de alta (0009) la lee. Si el shim no la
-- tuviera, los tests probarían un camino de alta distinto del de producción, que es la
-- forma más cara de tener tests en verde.
create table if not exists auth.users (
  id                uuid primary key default gen_random_uuid(),
  email             text unique,
  is_anonymous      boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

-- Misma implementación que la de Supabase: el asiento del que habla sale del JWT que
-- PostgREST deja en `request.jwt.claims`, no de nada que la consulta pueda elegir.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    'anon'
  );
$$;

-- ─────────────────────────────────── Los tres roles ───────────────────────────

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;

-- `bypassrls` es lo que hace que el motor pueda escribir `game_states`. Es también el
-- motivo por el que la clave de servicio no puede salir jamás del servidor.
do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;
grant select on auth.users   to service_role;

-- ─────────────────────── Los permisos por defecto de Supabase ─────────────────
-- Sin esto, los tests de RLS serían un placebo.

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
