# `tools/pg` — Postgres efímero para los tests de RLS

## Por qué existe

Los siete tests de RLS son **bloqueantes**: si uno falla, no hay release
([ROADMAP v0.3](../../docs/ROADMAP.md)). Un test bloqueante no puede depender de que
alguien tenga Docker instalado, ni de una cuenta en la nube, ni de una conexión.

Este arnés levanta un clúster de PostgreSQL de usar y tirar con los binarios que ya trae
el sistema, le aplica el shim de Supabase y las migraciones, y deja los datos de conexión
en `.pgtest/connection.json`.

## El pipeline

```
supabase/tests/shim.sql        emula auth.users, auth.uid() y los roles anon /
        │                      authenticated / service_role
        ▼
supabase/migrations/*.sql      en orden alfabético, tal cual se aplicarán en Supabase
        │
        ▼
supabase/tests/seed.sql        partida de 3 asientos con marcas únicas por asiento
        │
        ▼
apps/web/tests/security/*.ts   consultas con `set local role` + JWT, vía psql
```

La pieza que hace que todo esto signifique algo es el bloque de `alter default privileges`
del shim. Supabase concede `all on tables` a `anon` y `authenticated` por defecto; sin
reproducirlo, los tests pasarían **por falta de permisos**, no porque las políticas
funcionen, y el agujero aparecería en el despliegue real.

Ese detalle ya cazó un fallo: `begin_resolution` devuelve el estado autoritativo entero y
era invocable por cualquier jugador con sesión, porque `revoke ... from public` no anula
el `grant` explícito que Supabase hace a `authenticated` al crear una función.

## Comandos

```bash
npm run db:up        # levanta y aplica esquema (idempotente)
npm run db:reset     # recrea la base desde cero
npm run db:down      # para el clúster y borra .pgtest/
npm run db:psql      # consola interactiva
npm run test:security  # los tests de RLS (levanta la base por su cuenta)
```

El clúster **sobrevive entre ejecuciones** a propósito: `initdb` tarda unos segundos y
repetirlo en cada `npm test` haría insoportable el ciclo de TDD. Se borra con `db:down`,
o poniendo `GDC_PG_KEEP=0`.

## Decisiones que conviene no deshacer

| Decisión | Motivo |
|---|---|
| Solo socket unix, `-h ''` | Un Postgres con autenticación `trust` escuchando en TCP es un agujero, aunque sea local y aunque sea un rato |
| `psql` en vez de un driver | Cero dependencias nuevas ([ADR-024](../../docs/DECISIONS.md#adr-024)) |
| `set local role` + JWT | Es lo que hace PostgREST. Probar como superusuario no evaluaría RLS: el test pasaría siempre |
| Cada consulta en `begin … rollback` | Los tests que escriben no ensucian el seed, así que su orden no importa |
| Ejecuta como el usuario `postgres` si va como root | Postgres se niega a arrancar como root, y en contenedores el proceso suele serlo |

## Si no hay PostgreSQL en la máquina

El arnés falla con un mensaje explícito en vez de saltarse los tests. Es deliberado:
un test de seguridad que se salta solo es peor que no tenerlo, porque el CI se pone en
verde igual.

```bash
# Debian / Ubuntu
apt-get install postgresql

# macOS
brew install postgresql@16
```
