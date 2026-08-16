-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║ 0009 · Alta de cuenta automática, e invitados                                ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝
--
-- Dos problemas con una sola respuesta.
--
-- **Uno.** Entrar por enlace mágico creaba el usuario en `auth.users` pero no el perfil,
-- y `currentViewer()` devuelve `null` sin perfil. Resultado: `/` redirige a `/sign-in`,
-- que muestra el formulario otra vez. Una cuenta recién confirmada quedaba en un callejón
-- sin salida, y encima silencioso — no hay error en ningún log, todo «funciona».
--
-- **Dos.** El modo invitado tiene que llegar a la base de datos **igual** que una cuenta
-- con correo. Si el invitado tuviera su propio camino de alta, habría dos rutas que
-- mantener sincronizadas y una de las dos se quedaría atrás.
--
-- La respuesta a las dos es la misma: **el perfil lo crea la base de datos**, con un
-- trigger sobre `auth.users`. No hay ruta de alta que se pueda olvidar de crearlo porque
-- no hay ruta de alta: hay un `insert` en `auth.users`, y de eso se encarga Supabase.
--
-- Es la misma forma que ya tenía `on_profile_created` para la Ciudad (0001), y por el
-- mismo motivo escrito allí: «el trigger evita que la API tenga que acordarse de crearla,
-- que es justo la clase de olvido que se descubre en producción».

-- ──────────────────────────────── Marca de invitado ───────────────────────────
--
-- `auth.users.is_anonymous` ya lo dice, pero `auth` no es legible desde el cliente y
-- `profiles` sí. Sin esta columna, la interfaz no puede saber si quien mira es un
-- invitado — y necesita saberlo para ofrecerle vincular un correo antes de que pierda el
-- dispositivo.

alter table public.profiles
  add column if not exists is_guest boolean not null default false;

comment on column public.profiles.is_guest is
  'Cuenta sin credenciales: la sesión vive en este navegador y en ningún otro.';

-- ──────────────────────────────── Nombre de alta ──────────────────────────────
--
-- Un nombre generado, no un formulario. La pantalla de elegir nombre sería justo la
-- pantalla intermedia que ADR-026 prohíbe, y para un invitado —que entra precisamente
-- para no rellenar nada— sería absurda. Se puede cambiar después.
--
-- Determinista a partir del uuid: el mismo usuario da siempre el mismo nombre, así que
-- los tests pueden afirmar algo sobre él.

create or replace function public.callsign(id uuid)
returns text
language sql
immutable
set search_path = pg_temp
as $$
  select (array[
            'Vado','Risco','Faro','Arco','Cima','Nave','Foso','Muro',
            'Puente','Cauce','Cresta','Loma','Talud','Bastión','Torre','Ala'
          ])[(n % 16) + 1]
         || '-' || lpad(((n / 16) % 1000)::text, 3, '0')
  from (
    -- `md5` del uuid entero, no un prefijo suyo. La primera versión cogía los 7 primeros
    -- dígitos hex del uuid y en producción habría funcionado —un v4 los tiene
    -- aleatorios—, pero daba el mismo nombre a todos los uuid de los tests, que son
    -- secuenciales. Un generador que depende de qué bits *suelen* variar es un generador
    -- que falla el día que cambie la fuente de los identificadores.
    --
    -- 28 bits y no 32 **a propósito**: `bit(32)::bigint` conserva el patrón con signo y
    -- devuelve negativos por encima de 2³¹, y `mod()` de un negativo es negativo, así que
    -- el índice se saldría del array. Es la lección nº 1 del CLAUDE.md raíz, que ya costó
    -- mapas con 2 yacimientos por sector en vez de 3, en otro lenguaje y con los mismos
    -- 32 bits con signo detrás.
    select ('x' || substr(md5(id::text), 1, 7))::bit(28)::bigint as n
  ) as h;
$$;

comment on function public.callsign(uuid) is
  'Nombre de alta determinista. Se puede cambiar; existe para no pedir uno al entrar.';

-- ───────────────────────────── Alta desde auth.users ──────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, is_guest)
  values (new.id, public.callsign(new.id), coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;   -- reintentos y backfill: el alta es idempotente
  return new;
end;
$$;

-- `after` y no `before`: si el perfil fallara, el usuario ya existe y el siguiente
-- intento de entrar lo vuelve a intentar. Al revés, un fallo aquí impediría registrarse.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nombrando a `anon` y `authenticated`, no solo a `public`.
--
-- Es la lección nº 7 del CLAUDE.md raíz, y esta es la tercera vez que aparece: Supabase
-- concede `all on functions` a esos dos roles por defecto, y `revoke ... from public` no
-- deshace un GRANT explícito. Un trigger no es invocable directamente —Postgres rechaza
-- llamar a una función que devuelve `trigger`—, así que aquí no había agujero; pero el
-- test que enumera las funciones `security definer` invocables por `authenticated` la
-- cazó igual, y esa lista solo sirve si se mantiene corta a propósito.
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- ─────────────────────────────────── Backfill ─────────────────────────────────
-- Las cuentas creadas antes de este trigger están en el callejón sin salida descrito
-- arriba. Esto las saca.

insert into public.profiles (id, display_name, is_guest)
select u.id, public.callsign(u.id), coalesce(u.is_anonymous, false)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ────────────────────────── Privilegios de columna ────────────────────────────
--
-- 0001 ya deja el `update` de `profiles` reducido a `display_name` y `locale`, así que
-- `is_guest` no es escribible desde el cliente. Se vuelve a declarar explícitamente
-- porque un `grant` de columna no es acumulativo con el anterior: si alguien añade una
-- columna editable mañana y reescribe el `grant`, esta línea es la que deja constancia de
-- cuál es el conjunto completo.
--
-- Que `is_guest` no sea escribible importa: un invitado que pudiera marcarse como cuenta
-- normal se quitaría de encima cualquier limitación que se le ponga después.
revoke update on public.profiles from anon, authenticated;
grant  update (display_name, locale) on public.profiles to authenticated;
