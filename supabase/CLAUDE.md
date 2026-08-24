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

## El mapa no debería viajar en cada vista

Hallazgo del análisis del refactor RTS, y **vale igual si el refactor no se hace**:
`player_views` guarda una fila `(game_id, turn, seat)` con la vista entera, y `PlayerView`
incluye `map: GameMap`. El mismo objeto **inmutable durante toda la partida** se serializa
una vez por asiento y por turno: 60 copias en una campaña de cinco a 12 turnos.

Con 96 regiones se aguanta (~0,9 MB por campaña). Con las 271 que propone el refactor son
⚖️ ~7,4 MB, es decir **~67 campañas archivadas en los 500 MB del free tier** en vez de
~550 — y con ello se cae el objetivo de 0 €/mes durante la beta.

La salida está en [ADR-044](../docs/DECISIONS.md#adr-044): `game_maps` con el mapa una vez
por partida, y `mapId` en la vista. Al hacerlo, cuidado con lo de siempre:

```
□ game_maps es legible por CUALQUIER asiento de esa partida, y por nadie más
□ La topología es pública entre los cinco; lo secreto son las fuerzas. Escríbelo
  como política, no lo des por hecho
□ Un asiento de OTRA partida no puede leer este mapa  ← test de seguridad nuevo
```

Y la regla que no se toca ni con el refactor: **el estado de juego sigue en un solo
`jsonb`**. Partir `buildings`, `stock` o `colossi` en tablas propias las expondría a
PostgREST y tiraría la niebla de guerra por el desagüe ([ADR-007](../docs/DECISIONS.md#adr-007)).

## Estado actual

**v0.3 en curso.** Esquema completo, RLS y funciones de resolución implementadas y
verificadas contra Postgres real: 43 tests en `apps/web/tests/security/`, entre ellos los
siete bloqueantes.

El refactor RTS ([`docs/RTS_ZONES_REFACTOR.md`](../docs/RTS_ZONES_REFACTOR.md)) añadiría
tres migraciones —`game_maps`, zonas y adelgazamiento de la vista— pero **está sin aprobar**
y ninguna se escribe todavía.
