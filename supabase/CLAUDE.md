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
npx supabase db push        # aplica al proyecto remoto
```

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

## Estado actual

**v0.3 en curso.** Esquema completo, RLS y funciones de resolución implementadas y
verificadas contra Postgres real: 43 tests en `apps/web/tests/security/`, entre ellos los
siete bloqueantes.
