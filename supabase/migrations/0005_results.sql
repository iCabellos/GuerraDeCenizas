-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0005 · Resultados de campaña                                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Lo único normalizado del proyecto: `game_states` es jsonb porque solo lo lee el motor
-- entero y de una vez (ADR-007), pero los resultados sí se consultan por columnas —
-- «cuántas veces ha ganado el asiento 0», «cuánta Ceniza reparte una partida de 5».
-- Sin esto, calibrar la metaprogresión exigiría desempaquetar miles de estados.

create table if not exists public.match_results (
  game_id     uuid not null references public.games on delete cascade,
  seat        smallint not null check (seat between 0 and 4),
  profile_id  uuid references public.profiles on delete set null,
  outcome     text not null
              check (outcome in ('attuned','coalition','lesser','survivor','reduced','abandoned')),
  seams       smallint,
  ash         integer,
  regions     smallint,
  ash_awarded integer not null default 0 check (ash_awarded >= 0),
  unlocks     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  primary key (game_id, seat)
);

create index if not exists match_results_profile_idx
  on public.match_results (profile_id, created_at desc);

alter table public.match_results enable row level security;

-- El resultado de una partida es público para quienes la jugaron: la Ceniza repartida es
-- justamente el número sobre el que se negocia (GDD §9), y ocultarlo convertiría la
-- diplomacia en un asunto de fe.
drop policy if exists "ver resultados de mis partidas" on public.match_results;
create policy "ver resultados de mis partidas" on public.match_results
  for select using (public.is_player(game_id));

revoke insert, update, delete on public.match_results from anon, authenticated;
