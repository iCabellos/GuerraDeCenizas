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
npx supabase start          # Postgres local
npx supabase db reset       # reinicia + seed
npx supabase db push        # aplica al proyecto remoto
```

## Extensiones necesarias

`pg_cron` y `pg_net` — el disparador de resolución de turnos vencidos depende de ellas
porque Vercel Hobby solo permite un cron diario. Ver
[ADR-014](../docs/DECISIONS.md#adr-014).

## Estado actual

**Sin implementar.** Llega en v0.3. Hasta entonces el juego corre en memoria.
