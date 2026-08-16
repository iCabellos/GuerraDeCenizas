-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ Partida de tres asientos para los tests de RLS                               ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Cada asiento lleva un valor ÚNICO y reconocible (`SECRETO_ASIENTO_n`). Si los tres
-- vieran lo mismo, un test de fuga pasaría sin demostrar nada: es la lección nº 4 del
-- CLAUDE.md raíz, que ya costó un falso positivo en el test de fugas de `PlayerView`.

begin;

truncate table public.messages, public.orders, public.player_views,
               public.game_states, public.game_players, public.games,
               public.account_unlocks, public.reputation_events,
               public.cities, public.profiles restart identity cascade;
delete from auth.users;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000000', 'asiento0@ceniza.test'),
  ('00000000-0000-4000-8000-000000000001', 'asiento1@ceniza.test'),
  ('00000000-0000-4000-8000-000000000002', 'asiento2@ceniza.test'),
  ('00000000-0000-4000-8000-000000000009', 'ajeno@ceniza.test');

insert into public.profiles (id, display_name, locale, faction_id) values
  ('00000000-0000-4000-8000-000000000000', 'Asiento Cero',  'es', 'vantera'),
  ('00000000-0000-4000-8000-000000000001', 'Asiento Uno',   'es', 'koldvik'),
  ('00000000-0000-4000-8000-000000000002', 'Asiento Dos',   'en', 'saranth'),
  ('00000000-0000-4000-8000-000000000009', 'Forastera',     'es', 'tarn');

-- Bancos distintos: si un test de fuga leyera «el ash_bank de otro» y todos valieran
-- lo mismo, no se notaría.
update public.cities set ash_bank = 100 where profile_id = '00000000-0000-4000-8000-000000000000';
update public.cities set ash_bank = 200 where profile_id = '00000000-0000-4000-8000-000000000001';
update public.cities set ash_bank = 300 where profile_id = '00000000-0000-4000-8000-000000000002';
update public.cities set ash_bank = 999 where profile_id = '00000000-0000-4000-8000-000000000009';

insert into public.games
  (id, status, phase, player_count, cadence, turn, state_version,
   map_seed, mapgen_version, engine_version, deadline_at, invite_code, created_by)
values
  ('11111111-1111-4111-8111-111111111111', 'active', 'parley', 3, 'blitz', 4, 4,
   424242, '0.1.0', '0.2.0', now() + interval '1 hour', 'CENIZA',
   '00000000-0000-4000-8000-000000000000');

insert into public.game_players (game_id, seat, profile_id, faction_id, doctrine, joined_at) values
  ('11111111-1111-4111-8111-111111111111', 0, '00000000-0000-4000-8000-000000000000', 'vantera', 'wedge',  now()),
  ('11111111-1111-4111-8111-111111111111', 1, '00000000-0000-4000-8000-000000000001', 'koldvik', 'anvil',  now()),
  ('11111111-1111-4111-8111-111111111111', 2, '00000000-0000-4000-8000-000000000002', 'saranth', 'chorus', now());

-- El estado autoritativo lleva el secreto de los tres asientos a la vez: es
-- exactamente lo que ningún jugador puede llegar a leer.
insert into public.game_states (game_id, turn, state, checksum) values
  ('11111111-1111-4111-8111-111111111111', 4,
   '{"secreto":"SECRETO_DEL_ESTADO_COMPLETO","seats":[
       {"seat":0,"ash":100000},{"seat":1,"ash":200000},{"seat":2,"ash":300000}]}'::jsonb,
   'checksum-de-prueba');

insert into public.player_views (game_id, turn, seat, view, events) values
  ('11111111-1111-4111-8111-111111111111', 4, 0, '{"marca":"SECRETO_ASIENTO_0"}'::jsonb, '[]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 4, 1, '{"marca":"SECRETO_ASIENTO_1"}'::jsonb, '[]'::jsonb),
  ('11111111-1111-4111-8111-111111111111', 4, 2, '{"marca":"SECRETO_ASIENTO_2"}'::jsonb, '[]'::jsonb);

insert into public.orders (game_id, turn, seat, payload, submitted_at) values
  ('11111111-1111-4111-8111-111111111111', 4, 1,
   '{"turn":4,"moves":[{"forceId":"f1t0n0","posture":"hold","marca":"ORDENES_ASIENTO_1"}]}'::jsonb,
   now());

-- Canal privado entre los asientos 1 y 2. El asiento 0 no puede verlo: ese es el
-- corazón de la diplomacia — se puede pactar a espaldas de alguien.
insert into public.messages (game_id, channel, channel_seats, sender_seat, body) values
  ('11111111-1111-4111-8111-111111111111', 'public',  '{}',    0, 'MENSAJE_PUBLICO'),
  ('11111111-1111-4111-8111-111111111111', 'private', '{1,2}', 1, 'CONJURA_CONTRA_EL_CERO');

commit;
