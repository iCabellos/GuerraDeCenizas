# CLAUDE.md — `supabase/`

Esquema, migraciones y políticas RLS. **Aquí es donde se puede romper la seguridad del
juego entero.**

## La regla que lo gobierna todo

```
game_states   → RLS: NINGUNA POLÍTICA (nadie lee, solo service_role escribe)
player_views  → RLS: seat = mi asiento  (esto es lo que lee el cliente)
```

Supabase expone PostgREST. Si `game_states` fuera legible, cualquiera vería el estado
completo con una petición HTTP y **la niebla de guerra sería decorativa**. Es el riesgo
técnico número uno del proyecto.

## Al añadir una tabla

```
□ ¿Lleva `enable row level security`?            ← si no, es un agujero
□ ¿Tiene política de SELECT correcta?
□ ¿Tiene política de INSERT/UPDATE, o ninguna a propósito?
□ ¿Puede un jugador modificar algo que le beneficie? (recursos, turno, ash_bank)
□ ¿Hay un test en `apps/web/tests/security/` que lo verifique?
```

**Una tabla sin política de `update` es lo correcto por defecto** para cualquier cosa que
afecte al juego: se muta desde Route Handlers con `service_role`, no desde el cliente.

## Migraciones

- Numeradas e incrementales: `0001_profiles.sql`, `0002_games.sql`…
- **Nunca se edita una migración ya aplicada.** Se añade otra.
- Cada migración debe poder aplicarse sobre una base limpia y sobre una existente.

```bash
npm run db:reset            # Postgres efímero local: shim + migraciones (tools/pg)
npm run db:psql             # consola contra esa base
npm run test:security       # los tests de RLS — BLOQUEANTES
npx supabase db push        # aplica al proyecto remoto (normalmente lo hace el pipeline)
```

**Al proyecto real las aplica el despliegue**, no una persona: `.github/workflows/deploy.yml`
en cada cambio bajo `supabase/` que llegue a `main`, y comprueba después que `game_states`
sigue con RLS activa y cero políticas. Si eso falla, el despliegue se para.

## `config.toml` es la fuente de la verdad, el panel es el resultado

Los ajustes de Auth —Site URL, lista blanca de redirecciones, sesiones anónimas— y los
secretos del vault viven en [`config.toml`](config.toml) y los empuja el mismo workflow
([ADR-032](../docs/DECISIONS.md#adr-032)). **Un cambio hecho a mano en el panel se pierde
en el siguiente despliegue.**

Nació de un fallo que no dejaba rastro: el enlace de confirmación llevaba a
`http://localhost:3000` porque Supabase sustituye **en silencio** un `redirect_to` que no
esté en su lista blanca por la Site URL. Nada fallaba, ni había test que pudiera cazarlo,
porque el ajuste no estaba en el repositorio.

⚠️ `config push` empuja el bloque entero: **lo que no declares se manda con el valor por
defecto del CLI**, no se deja como está. Al añadir un ajuste, escríbelo aunque coincida
con el defecto.

## Al añadir un trigger o una función `security definer`

`revoke all on function ... from public, anon, authenticated;` — **nombrando a los tres**.
`revoke ... from public` no deshace el GRANT explícito que Supabase concede a `anon` y
`authenticated` al crear la función. Hay un test que enumera todas las funciones
`security definer` invocables por `authenticated` y exige que la lista sea exactamente la
esperada; ya ha cazado esto dos veces, una de ellas con `begin_resolution`, que devuelve
el estado autoritativo entero.

El arnés local **no usa Docker**: levanta un clúster con los binarios del sistema y
habla por socket unix. Ver [`tools/pg/README.md`](../tools/pg/README.md).

## Extensiones necesarias

`pg_cron` y `pg_net` — el disparador de resolución de turnos vencidos depende de ellas
porque Vercel Hobby solo permite un cron diario. Ver
[ADR-014](../docs/DECISIONS.md#adr-014).

## Lo que ya cazó este esquema

`revoke all on function ... from public` **no basta**. Supabase ejecuta
`alter default privileges in schema public grant all on functions to anon, authenticated`,
así que cada función nace con un GRANT explícito para esos roles y revocar de `public`
lo deja intacto. `begin_resolution` —que devuelve el estado autoritativo completo— era
invocable por cualquier jugador con sesión. Hay que nombrar los roles:

```sql
revoke all on function public.begin_resolution(uuid, timestamptz)
  from public, anon, authenticated;
```

Hay un test que enumera todas las funciones `security definer` invocables por
`authenticated` y exige que sean exactamente las tres ayudantes de política. Al añadir
una función nueva, ese test falla hasta que decidas a propósito quién puede llamarla.

## El mapa ya no viaja en cada vista

`player_views` guardaba una fila `(game_id, turn, seat)` con la vista entera, mapa
incluido. El mapa es **inmutable durante toda la partida**, así que eran 120 copias del
mismo objeto en una campaña de cinco a 24 turnos. Medido con el mapa de zonas:

```
mapa .................. 36,3 KB
vista completa ........ 43,2 KB   ← el 84 % era el mapa
vista sin el mapa ......  6,9 KB
campaña entera ......... 5,2 MB → 0,85 MB
```

Sobre los 500 MB del free tier, ~95 campañas archivadas frente a ~580. De ese número
depende que el objetivo de 0 €/mes durante la beta siga siendo posible.

Desde `0012_map_store.sql` el mapa vive en **`game_maps`**, una fila por partida, y
`lib/server/views.ts` lo quita al escribir y lo vuelve a pegar al leer
([ADR-044](../docs/DECISIONS.md#adr-044)). Tres cosas que hay que respetar:

```
□ game_maps es legible por CUALQUIER jugador de esa partida (is_player), y por nadie más
□ La topología es pública entre los de la mesa; lo secreto son las fuerzas
□ Nadie escribe desde el cliente: lo pone start_game, una vez, con `do nothing`
```

Y la regla que no se toca ni con el refactor: **el estado de juego sigue en un solo
`jsonb`**. Partir `buildings`, `stock` o `colossi` en tablas propias las expondría a
PostgREST y tiraría la niebla de guerra por el desagüe ([ADR-007](../docs/DECISIONS.md#adr-007)).

## Estado actual

**v0.3 en curso.** Esquema completo, RLS y funciones de resolución implementadas y
verificadas contra Postgres real: 43 tests en `apps/web/tests/security/`, entre ellos los
siete bloqueantes.

El refactor RTS añadió `0012_map_store.sql`: la tabla `game_maps`, su política y un
`start_game` que guarda el mapa una vez. Las zonas, los edificios y los Colosos **no
tocaron el esquema** — viven dentro del `jsonb` del estado, que es donde tienen que estar.
