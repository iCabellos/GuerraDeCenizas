# Technical Design Document — Guerra de Cenizas

> **Versión:** 1.0 · **Estado:** aprobado para implementación
> Complementa a [GAME_DESIGN](GAME_DESIGN.md) (qué hace el juego) explicando **cómo se
> construye**. Toda decisión relevante está registrada en [DECISIONS](DECISIONS.md).

---

## Índice

1. [Principio rector](#1-principio-rector)
2. [Arquitectura](#2-arquitectura)
3. [El motor](#3-el-motor)
4. [Determinismo y aleatoriedad](#4-determinismo-y-aleatoriedad)
5. [Base de datos](#5-base-de-datos)
6. [Niebla de guerra y RLS](#6-niebla-de-guerra-y-rls)
7. [API](#7-api)
8. [Resolución de turnos y concurrencia](#8-resolución-de-turnos-y-concurrencia)
9. [Tiempo real, reconexión y persistencia](#9-tiempo-real-reconexión-y-persistencia)
10. [Frontend](#10-frontend)
11. [Modelo de amenazas](#11-modelo-de-amenazas)
12. [Observabilidad y errores](#12-observabilidad-y-errores)
13. [Rendimiento](#13-rendimiento)
14. [Versionado y migraciones](#14-versionado-y-migraciones)
15. [CI/CD](#15-cicd)

---

## 1. Principio rector

> **Un solo motor. Tres consumidores. Cero confianza en el cliente.**

```
                packages/core   ← TypeScript puro · 0 deps · sin I/O · sin Date.now()
                ┌────────────────────────────────────────────┐
                │  reduce(state, orders, ctx) → { state,      │
                │                                 events,     │
                │                                 views }     │
                └───────────────────┬────────────────────────┘
                                    │
      ┌─────────────────────────────┼─────────────────────────────┐
      ▼                             ▼                             ▼
┌───────────────┐          ┌──────────────────┐        ┌──────────────────┐
│  AUTORIDAD    │          │     CLIENTE      │        │    SIMULADOR     │
│  Route        │          │  React / SVG     │        │  packages/sim    │
│  Handlers     │          │  reduce() solo   │        │  N partidas,     │
│  service_role │          │  para PREVIEW    │        │  sin red, sin BD │
└───────┬───────┘          └──────────────────┘        └──────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────┐
│              Supabase (Postgres + Auth + Realtime)     │
│  game_states  ── RLS: DENY ALL ──► nadie lo lee         │
│  player_views ── RLS: seat = mío ──► el cliente lee esto│
└────────────────────────────────────────────────────────┘
```

**Consecuencias no negociables:**

- `packages/core` **no importa nada** (ni Supabase, ni React, ni Node). Es una función.
- El cliente ejecuta `reduce()` **exclusivamente** para mostrar previsualizaciones. Su
  resultado nunca se envía ni se persiste.
- El servidor **jamás** confía en el estado que envía el cliente: carga el estado
  autoritativo de la base de datos y valida las órdenes contra él.

---

## 2. Arquitectura

### 2.1 Monorepo

npm workspaces. Sin Turborepo, Nx ni Lerna: tres paquetes no justifican un orquestador.

```
packages/core   → @gdc/core   (motor + mapgen + balance)   0 dependencias de runtime
packages/sim    → @gdc/sim    (simulador + bots)           depende de core
apps/web        → @gdc/web    (Next.js)                    depende de core
```

**Dirección de dependencias — estrictamente unidireccional:**

```
web ──► core ◄── sim
```

`core` no depende de nada. Test de CI: `npm run check:deps` falla si `core/package.json`
gana una `dependency`.

### 2.2 Capas de `apps/web`

| Capa | Ubicación | Puede |
|---|---|---|
| **Autoridad** | `app/api/**/route.ts` | `service_role`, escribir `game_states`, ejecutar `reduce()` |
| **Lectura** | Server Components | Cliente Supabase de usuario (RLS activa), leer `player_views` |
| **Presentación** | Client Components | Solo props + Realtime; `reduce()` en modo preview |

Regla de import verificada por lint: nada bajo `components/` puede importar
`lib/server/`.

---

## 3. El motor

### 3.1 Firma

```ts
// packages/core/src/rules/reduce.ts
export function reduce(
  state:  GameState,          // congelado, nunca se muta
  orders: OrdersBySeat,       // ya validadas
  ctx:    ResolveContext,     // { rngSeed, engineVersion, now }
): ResolveResult;

export interface ResolveResult {
  state:    GameState;             // estado del turno siguiente
  events:   GameEvent[];           // log con visibilidad por evento
  views:    Record<Seat, PlayerView>;  // proyecciones ya filtradas
  checksum: string;                // hash canónico del estado
}
```

Propiedades garantizadas por test:

- **Pura** — misma entrada, misma salida, siempre, en cualquier runtime.
- **Inmutable** — `state` de entrada nunca se modifica (verificado con `Object.freeze`
  profundo en modo test).
- **Total** — nunca lanza por órdenes inválidas: las descarta y emite un evento
  `ORDER_REJECTED`.

### 3.2 Estructura del estado

```ts
interface GameState {
  meta: {
    gameId: string; engineVersion: string; mapgenVersion: string;
    seed: number; turn: number; phase: Phase; playerCount: 2 | 3 | 5;
  };
  map: {
    regions: Region[];           // índice = regionId
    edges:  Edge[];              // { a, b, severedUntilTurn? }
    coreId: RegionId;
  };
  seats: SeatState[];            // recursos, investigación, doctrina, anomalías, flags
  forces: Force[];               // { id, seat, regionId, line, fire, sky, posture }
  shades: Shade[];               // { id, seat, regionId, cooldown }
  control: Record<RegionId, Seat | null>;
  treaties: Treaty[];
  attunement: { seat: Seat | null; coalitionWith: Seat | null;
                progress: 0|1|2|3; paidThisTurn: boolean } | null;
  rngCursor: number;             // posición del PRNG — parte del estado
}
```

**`rngCursor` forma parte del estado.** Sin eso, reproducir una partida desde
`(seed, órdenes)` sería imposible tras una interrupción.

### 3.3 Organización de `reduce()`

Las 14 etapas del [orden de resolución](GAME_DESIGN.md#15-orden-de-resolución-del-turno)
son **14 funciones puras encadenadas**:

```ts
const PIPELINE = [
  validateOrders, applyDiplomacy, applyTopologyAnomalies, applyShadeOps,
  applyMovement, resolveCombat, recomputeControl, applyEconomy,
  applyProduction, applyCore, applyInfoAnomalies, computeVisibility,
  emitEvents, closeTurn,
] as const;

export function reduce(state, orders, ctx) {
  return PIPELINE.reduce((acc, stage) => stage(acc), initial(state, orders, ctx));
}
```

Cada etapa se testea aisladamente. Añadir una regla nueva es añadir o modificar **una**
función, nunca tocar las otras trece. Es la garantía de «código pequeño, comprensible,
testeable y extensible» del brief §26.

---

## 4. Determinismo y aleatoriedad

### 4.1 Reglas duras

| Prohibido en `packages/core` | Sustituto |
|---|---|
| `Math.random()` | `rng(state)` — xoshiro128** sembrado |
| `Date.now()`, `new Date()` | `ctx.now`, inyectado |
| Iterar objetos sin ordenar | `Object.keys(x).sort()` siempre |
| `Array.sort()` sin comparador total | comparador con desempate por `id` |
| `Set`/`Map` en salidas | arrays ordenados |
| Punto flotante en comparaciones de igualdad | redondeo a 4 decimales antes de comparar |

Un test de ESLint personalizado (`no-nondeterminism`) falla el build si aparecen.

### 4.2 PRNG

**xoshiro128\*\*** — 16 bytes de estado, sin dependencias, misma salida en cualquier
motor de JS.

```ts
export function makeRng(seed: number, cursor: number): Rng;
// avanzar el rng avanza state.rngCursor → el estado siempre sabe dónde está
```

### 4.3 Dónde hay aleatoriedad

Muy poca, a propósito:

| Sistema | ¿Aleatorio? |
|---|---|
| Generación del mapa | **Sí** — sembrada por `mapSeed` |
| Combate | **No** — determinista (decisión de diseño, ver GDD §7) |
| Economía, producción, captura | **No** |
| Eventos falsos de *Sembrar* | Sí — elige entre plantillas plausibles |
| Desempates | **No** — siempre por número de asiento |

### 4.4 Checksum canónico

```ts
canonicalJson(state)  // claves ordenadas, floats a 4 decimales, sin undefined
  → sha256 → hex(16)
```

Se guarda en cada turno. Permite:
- detectar divergencia cliente/servidor;
- verificar que una partida reproducida desde `(seed, órdenes)` es idéntica;
- detectar migraciones de motor que rompen partidas antiguas.

---

## 5. Base de datos

### 5.1 Esquema

```sql
-- ─────────────── Cuentas y metaprogresión ───────────────
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null check (char_length(display_name) between 3 and 20),
  locale        text not null default 'es' check (locale in ('es','en')),
  created_at    timestamptz not null default now()
);

create table cities (
  profile_id    uuid primary key references profiles on delete cascade,
  ash_bank      integer not null default 0 check (ash_bank >= 0),
  districts     jsonb   not null default '{}'::jsonb,   -- { archivo: 2, foundry: 1, ... }
  loadout       jsonb   not null default '{}'::jsonb,   -- { doctrine, anomalies[3], city }
  updated_at    timestamptz not null default now()
);

create table account_unlocks (
  profile_id    uuid references profiles on delete cascade,
  unlock_key    text not null,
  unlocked_at   timestamptz not null default now(),
  primary key (profile_id, unlock_key)
);

create table reputation_events (
  id            bigserial primary key,
  profile_id    uuid references profiles on delete cascade,
  game_id       uuid,
  kind          text not null,      -- seal_honoured | seal_breached | abandoned | ...
  created_at    timestamptz not null default now()
);

-- ─────────────── Partidas ───────────────
create type game_status as enum ('lobby','active','finished','abandoned');
create type game_phase  as enum ('parley','war','resolved');

create table games (
  id             uuid primary key default gen_random_uuid(),
  status         game_status not null default 'lobby',
  phase          game_phase  not null default 'parley',
  player_count   smallint not null check (player_count in (2,3,5)),
  cadence        text not null check (cadence in ('blitz','daily','relaxed')),
  turn           smallint not null default 0,
  state_version  integer  not null default 0,          -- bloqueo optimista
  map_seed       bigint   not null,
  mapgen_version text     not null,
  engine_version text     not null,
  deadline_at    timestamptz,
  invite_code    text unique,
  created_by     uuid references profiles,
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index on games (status, deadline_at) where status = 'active';

create table game_players (
  game_id     uuid references games on delete cascade,
  seat        smallint not null check (seat between 0 and 4),
  profile_id  uuid references profiles,                -- null si es bot
  doctrine    text,
  city        text,
  is_bot      boolean not null default false,
  missed_turns smallint not null default 0,
  standing_orders jsonb not null default '{}'::jsonb,
  primary key (game_id, seat),
  unique (game_id, profile_id)
);

-- Estado autoritativo. NADIE lo lee vía la API pública.
create table game_states (
  game_id   uuid references games on delete cascade,
  turn      smallint not null,
  state     jsonb not null,
  checksum  text not null,
  created_at timestamptz not null default now(),
  primary key (game_id, turn)
);

-- Proyección por asiento, YA FILTRADA por niebla de guerra.
create table player_views (
  game_id   uuid references games on delete cascade,
  turn      smallint not null,
  seat      smallint not null,
  view      jsonb not null,
  events    jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (game_id, turn, seat)
);

create table orders (
  game_id      uuid references games on delete cascade,
  turn         smallint not null,
  seat         smallint not null,
  payload      jsonb not null,
  submitted_at timestamptz not null default now(),
  primary key (game_id, turn, seat)
);

create table treaties (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid references games on delete cascade,
  kind          text not null,      -- seal | transfer | coalition
  proposer_seat smallint not null,
  target_seat   smallint not null,
  terms         jsonb not null,
  status        text not null,      -- proposed | active | fulfilled | breached | expired
  created_turn  smallint not null,
  expires_turn  smallint,
  created_at    timestamptz not null default now()
);
create index on treaties (game_id, status);

create table messages (
  id         bigserial primary key,
  game_id    uuid references games on delete cascade,
  channel    text not null,          -- 'public' | 'seat:0,3'
  sender_seat smallint not null,
  body       text check (char_length(body) <= 500),
  template   jsonb,                  -- oferta por plantilla (i18n-safe)
  created_at timestamptz not null default now()
);
create index on messages (game_id, channel, created_at desc);

create table match_results (
  game_id   uuid references games on delete cascade,
  seat      smallint not null,
  profile_id uuid references profiles,
  outcome   text not null,     -- attuned | coalition | lesser | survivor | reduced | abandoned
  seams     smallint, ash integer, regions smallint,
  ash_awarded integer not null default 0,
  unlocks   jsonb not null default '[]'::jsonb,
  primary key (game_id, seat)
);
```

### 5.2 Por qué `jsonb` para el estado y no tablas relacionales

Se evaluó normalizar (`forces`, `control`, `regions` como tablas):

| | jsonb | Relacional |
|---|---|---|
| Escritura de un turno | 1 fila | ~200 filas, 8 tablas |
| Atomicidad | trivial | transacción larga |
| Coste en free tier | bajo | alto (índices) |
| Consulta analítica | pobre | buena |
| Acoplamiento con el motor | ninguno — el motor ya trabaja con ese objeto | alto: dos representaciones que mantener sincronizadas |

El estado **solo lo lee y escribe el motor, entero, de una vez**. No hay ninguna consulta
de negocio que necesite filtrar dentro de él. `jsonb` es la elección correcta.
Las consultas analíticas salen de `match_results` y `turn_events`, que **sí** están
normalizados. → [ADR-007](DECISIONS.md).

### 5.3 Retención

| Dato | Retención | Motivo |
|---|---|---|
| `game_states` | snapshot cada 4 turnos + último | Los intermedios se reconstruyen desde `seed + orders` |
| `player_views` | últimos 3 turnos | El historial se reconstruye a demanda |
| `orders` | **siempre** (partida activa y terminada) | Es la fuente de verdad reproducible |
| `messages` | 30 días tras finalizar | Coste |
| `match_results` | siempre | Metaprogresión |

Coste medido: **≈ 80 KB por partida terminada**. Con 500 MB del free tier ⇒ ~6 000
partidas archivadas sin tocar nada.

---

## 6. Niebla de guerra y RLS

### 6.1 El problema

Supabase expone PostgREST. Si `game_states` fuera legible por el jugador, cualquiera
haría `GET /rest/v1/game_states?game_id=eq.X` y vería el estado completo: posiciones
ocultas, órdenes, stocks ajenos. **La niebla de guerra sería puramente cosmética.**

Este es el riesgo técnico nº 1 del proyecto ([DISCOVERY T1](DISCOVERY.md#22-riesgos-técnicos)).

### 6.2 La solución

```
                    reduce()
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
  game_states                    player_views (uno por asiento)
  ┌───────────────┐              ┌────────────────────────────┐
  │ estado COMPLETO│             │ solo lo que ese asiento ve  │
  │ RLS: DENY ALL  │             │ RLS: seat = mi asiento      │
  │ solo service_  │             │ el cliente lee AQUÍ         │
  │ role escribe   │             └────────────────────────────┘
  └───────────────┘
```

La proyección se calcula **en el servidor, dentro de `reduce()`**, en la etapa
`computeVisibility`. Los datos que un jugador no debe ver **no salen nunca del servidor**.

### 6.3 Políticas

```sql
alter table game_states  enable row level security;
alter table player_views enable row level security;
alter table orders       enable row level security;
alter table messages     enable row level security;
alter table treaties     enable row level security;

-- game_states: ninguna política ⇒ ningún acceso para anon/authenticated.
-- (service_role omite RLS por definición.)

create policy "ver mi propia vista" on player_views for select
  using (exists (
    select 1 from game_players gp
    where gp.game_id = player_views.game_id
      and gp.seat    = player_views.seat
      and gp.profile_id = auth.uid()
  ));

-- Las órdenes: escribo las mías, del turno actual, solo si la partida está activa.
create policy "enviar mis órdenes" on orders for insert
  with check (
    exists (select 1 from game_players gp
             where gp.game_id = orders.game_id and gp.seat = orders.seat
               and gp.profile_id = auth.uid())
    and exists (select 1 from games g
                 where g.id = orders.game_id and g.status = 'active'
                   and g.turn = orders.turn)
  );

create policy "reenviar mis órdenes" on orders for update
  using (exists (select 1 from game_players gp
                  where gp.game_id = orders.game_id and gp.seat = orders.seat
                    and gp.profile_id = auth.uid()))
  with check (exists (select 1 from games g
                       where g.id = orders.game_id and g.turn = orders.turn
                         and g.status = 'active'));

create policy "leer mis órdenes" on orders for select
  using (exists (select 1 from game_players gp
                  where gp.game_id = orders.game_id and gp.seat = orders.seat
                    and gp.profile_id = auth.uid()));

-- Mensajes: canal público de mi partida, o canal privado que me incluye.
create policy "leer mensajes visibles" on messages for select
  using (
    exists (select 1 from game_players gp
             where gp.game_id = messages.game_id and gp.profile_id = auth.uid()
               and (messages.channel = 'public'
                    or messages.channel like '%' || gp.seat::text || '%'))
  );
```

> **Nota sobre el canal privado.** El `like` de arriba es ilustrativo; la implementación
> real usa `channel_seats smallint[]` con `gp.seat = any(m.channel_seats)`, que es exacto
> e indexable con GIN. Ver migración `0004_messages.sql`.

### 6.4 Test de seguridad obligatorio

En `apps/web/tests/security/rls.test.ts`, contra Supabase local:

```
✗ un jugador NO puede leer game_states de su propia partida
✗ un jugador NO puede leer el player_view del asiento 2 siendo el asiento 0
✗ un jugador NO puede insertar órdenes en el asiento de otro
✗ un jugador NO puede insertar órdenes de un turno pasado o futuro
✗ un jugador NO puede leer el canal privado de otros dos
✗ un jugador NO puede modificar games.turn, games.state_version ni cities.ash_bank
✓ un jugador SÍ puede leer su propio player_view
```

**Estos tests son bloqueantes: si uno falla, no hay release.**

---

## 7. API

Route Handlers en `apps/web/app/api/`. Todos validan con Zod, todos devuelven
`{ ok: true, ... }` o `{ ok: false, code, message }` con `code` traducible.

| Método | Ruta | Autoridad | Descripción |
|---|---|:-:|---|
| `POST` | `/api/games` | ✅ | Crear partida (genera semilla, código de invitación) |
| `POST` | `/api/games/:id/join` | ✅ | Unirse; asigna asiento libre |
| `POST` | `/api/games/:id/start` | ✅ | Genera el mapa, valida equidad, escribe el turno 0 |
| `POST` | `/api/games/:id/orders` | ✅ | Enviar órdenes del turno actual. Puede disparar resolución. |
| `POST` | `/api/games/:id/preview` | ❌ | Previsualización de combate. Solo lectura, sin efectos. |
| `POST` | `/api/games/:id/treaties` | ✅ | Proponer / aceptar / romper |
| `POST` | `/api/games/:id/messages` | ❌ | Chat (validación de canal + rate limit) |
| `POST` | `/api/games/:id/surrender` | ✅ | Rendición dirigida |
| `GET`  | `/api/games/:id/state` | ❌ | Vista del jugador (fallback si Realtime falla) |
| `POST` | `/api/cron/resolve-due` | ✅ | Resolver turnos vencidos. HMAC obligatorio. |

### 7.1 Contrato de órdenes

```ts
const OrdersSchema = z.object({
  turn: z.number().int().nonnegative(),
  moves: z.array(z.object({
    forceId: z.string(),
    to: z.number().int().optional(),                 // null = quedarse
    detach: z.object({ line: z.number(), fire: z.number(), sky: z.number() }).optional(),
    posture: z.enum(['assault','hold','screen']),
    fireSupport: z.number().int().optional(),
  })).max(6),
  production: z.array(z.object({
    regionId: z.number().int(),
    item: z.enum(['line','fire','sky','shade','fort','bridge']),
    qty: z.number().int().min(1).max(3),
  })).max(4),
  research: z.enum([...RESEARCH_KEYS]).optional(),
  anomaly:  z.object({ key: z.enum([...ANOMALY_KEYS]), target: z.unknown() }).optional(),
  shadeOps: z.array(z.object({
    shadeId: z.string(), op: z.enum([...SHADE_OPS]), target: z.unknown(),
  })).max(3),
  attune: z.boolean().optional(),
}).strict();
```

`.strict()` es deliberado: un campo desconocido es **rechazo**, no ignorado. Cierra la
puerta a que un cliente manipulado cuele campos que una futura versión interprete.

### 7.2 Validación en dos niveles

1. **Sintáctica** (Zod) — forma, rangos, tamaños. Barata, primero.
2. **Semántica** (motor, contra el estado autoritativo) — ¿esa fuerza es tuya? ¿esa
   región es adyacente? ¿tienes ese recurso? ¿ya usaste esa anomalía?

La validación semántica **nunca** usa datos enviados por el cliente que no sean
identificadores. El cliente dice *«mueve la fuerza f3 a la región 17»*; todo lo demás lo
pone el servidor.

---

## 8. Resolución de turnos y concurrencia

### 8.1 Los tres disparadores

Vercel Hobby solo permite **un cron diario**, lo que es inservible para turnos de 3
minutos ([DISCOVERY T3](DISCOVERY.md#22-riesgos-técnicos)). Solución: tres caminos
independientes que convergen en la misma función idempotente.

| # | Disparador | Cuándo | Cubre |
|:-:|---|---|---|
| 1 | **Inmediato** | El último jugador envía órdenes | El caso normal (~85 %) |
| 2 | **pg_cron** (Supabase, cada minuto) → `pg_net` → `/api/cron/resolve-due` | Plazo vencido | Ausencias |
| 3 | **Oportunista** | Cualquier petición de cliente detecta un plazo vencido y lo resuelve | Red de seguridad si 1 y 2 fallan |

### 8.2 Idempotencia y bloqueo

```ts
async function resolveTurn(gameId: string, expectedTurn: number) {
  return db.transaction(async (tx) => {
    // 1. Serializar por partida (se libera solo al terminar la transacción)
    await tx.raw('select pg_advisory_xact_lock(hashtextextended($1, 0))', [gameId]);

    // 2. Releer bajo el lock
    const game = await tx.one('select * from games where id = $1 for update', [gameId]);
    if (game.turn !== expectedTurn) return { skipped: 'already_resolved' };
    if (game.status !== 'active')   return { skipped: 'not_active' };

    const ready = await allSubmittedOrDeadlinePassed(tx, game);
    if (!ready) return { skipped: 'not_ready' };

    // 3. Cargar estado autoritativo + órdenes (los ausentes → Órdenes Permanentes)
    const state  = await loadState(tx, gameId, game.turn);
    const orders = await loadOrdersWithFallback(tx, gameId, game.turn);

    // 4. Motor puro
    const result = reduce(state, orders, {
      rngSeed: game.map_seed, engineVersion: ENGINE_VERSION, now: game.deadline_at,
    });

    // 5. Escribir con bloqueo optimista
    const upd = await tx.result(
      `update games
          set turn = turn + 1, state_version = state_version + 1,
              deadline_at = $2, phase = $3, status = $4
        where id = $1 and state_version = $5`,
      [gameId, nextDeadline(game), result.state.meta.phase,
       result.finished ? 'finished' : 'active', game.state_version],
    );
    if (upd.rowCount !== 1) throw new ConcurrencyError();   // rollback

    await persistSnapshotIfNeeded(tx, result);
    await tx.insertMany('player_views', toViewRows(result));
    return { resolved: true, turn: game.turn + 1 };
  });
}
```

**Tres defensas superpuestas:**
1. `pg_advisory_xact_lock` — solo un resolutor por partida a la vez.
2. `game.turn !== expectedTurn` — idempotencia por turno.
3. `where state_version = $5` — bloqueo optimista como última red.

`ctx.now = game.deadline_at`, **no** `Date.now()`: reejecutar la resolución produce el
mismo resultado exacto.

### 8.3 Órdenes Permanentes

Si un asiento no envió órdenes al vencer el plazo:

```ts
function standingOrdersFor(seat, state) {
  return {
    moves: state.forces.filter(f => f.seat === seat)
      .map(f => ({ forceId: f.id, posture: seat.standingPosture ?? 'hold' })),
    production: seat.standingProduction ?? [],   // configurado por el jugador
    shadeOps: [], anomaly: undefined, attune: false,
  };
}
```

Nunca ataca, nunca rompe un Sello, nunca consagra. La ausencia jamás **daña a un
tercero**: el jugador ausente se defiende, y ya.

---

## 9. Tiempo real, reconexión y persistencia

### 9.1 Realtime

Supabase Realtime sobre Postgres Changes. Cada cliente se suscribe a exactamente **dos**
canales de su partida:

```ts
supabase.channel(`game:${gameId}:${mySeat}`)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'player_views',
        filter: `game_id=eq.${gameId}` },      // RLS filtra el asiento
      onNewTurn)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages',
        filter: `game_id=eq.${gameId}` },
      onMessage)
  .subscribe();
```

Realtime **respeta RLS**: aunque el filtro sea por partida, un jugador solo recibe la
fila de su propio asiento. La seguridad no depende del filtro del cliente.

**No hay polling.** Fallback: si el canal se cae, un `GET /api/games/:id/state` cada 60 s
mientras esté desconectado, con retroceso exponencial.

### 9.2 Reconexión

El cliente es **stateless respecto a la partida**. Al montar:

```
1. GET player_views WHERE game_id = X AND seat = mío ORDER BY turn DESC LIMIT 1
2. GET orders WHERE game_id = X AND turn = actual  (recupera un borrador enviado)
3. Suscribir Realtime
4. Reconstruir la interfaz desde la vista
```

Cerrar la pestaña a mitad de turno no pierde nada: las órdenes se guardan como borrador
(`orders` con `submitted_at = null`) en cada cambio, con *debounce* de 2 s.

### 9.3 Lo que persiste dónde

| Dato | Dónde | Por qué |
|---|---|---|
| Estado autoritativo | Postgres `game_states` | Fuente de verdad |
| Órdenes (incl. borradores) | Postgres `orders` | Reproducibilidad + reconexión |
| Vista del jugador | Postgres `player_views` | Lectura barata con RLS |
| Preferencias UI (zoom, panel abierto) | `localStorage` | Irrelevante para el juego |
| Sesión | Cookie httpOnly (Supabase SSR) | Seguridad |
| **Nada del estado de juego** | **`localStorage`** | El cliente no es autoridad |

---

## 10. Frontend

### 10.1 Renderizado del mapa: SVG

| | SVG | Canvas 2D | WebGL |
|---|:-:|:-:|:-:|
| ~95 regiones | ✅ sobrado | ✅ | ✅ excesivo |
| Nitidez en pantallas 3× | ✅ vectorial | ⚠️ | ✅ |
| Accesibilidad (foco, lector de pantalla) | ✅ **nativa** | ❌ | ❌ |
| Peso del bundle | **0 KB** | 0 KB | +80 KB |
| Assets | El mismo SVG que la galería | rasterizar | atlas |
| Zoom/pan | transform CSS | manual | manual |

**SVG gana claramente.** Cada región es un `<path>` que además es un elemento
**enfocable con teclado** y anunciable por lector de pantalla — accesibilidad gratis
(brief §32).

Rendimiento: transform en el `<g>` raíz (compuesta por GPU), `will-change: transform`,
y `content-visibility` en los paneles. Objetivo 60 fps en un móvil de gama media de 2021.

### 10.2 Estado del cliente

Sin Redux, sin Zustand. Tres piezas:

1. **Vista del servidor** → React Server Component (o `useSyncExternalStore` sobre el
   canal Realtime).
2. **Órdenes en borrador** → un `useReducer` local. Es el único estado mutable real.
3. **Preferencias UI** → `localStorage`.

`useReducer` sobre las órdenes en borrador tiene una ventaja concreta: es el mismo
formato que se envía a la API, así que **no hay transformación** entre lo que el usuario
manipula y lo que se persiste.

### 10.3 i18n

`next-intl`, rutas `/[locale]/…`, catálogos `messages/es.json` y `messages/en.json`.

Reglas duras:
- **Cero literales visibles en componentes.** Regla de lint `no-literal-strings` sobre
  `apps/web/components/**`.
- Las claves se derivan del [glosario](GAME_DESIGN.md#18-glosario-bilingüe).
- Los mensajes de error de la API devuelven `code`, no texto: el cliente traduce.
- Las **plantillas diplomáticas** son estructuras de datos, no frases: un jugador en
  español y otro en inglés ven la **misma oferta** en su idioma.
- Test de CI: `es.json` y `en.json` tienen exactamente el mismo conjunto de claves.

---

## 11. Modelo de amenazas

| # | Amenaza | Vector | Mitigación |
|:-:|---|---|---|
| A1 | Modificar recursos/tropas | `PATCH` directo a PostgREST | RLS: sin política de `update` sobre `game_states`, `games`, `cities`. Toda mutación pasa por Route Handler. |
| A2 | Leer el estado completo (ver la niebla) | `GET game_states` | `DENY ALL` + `player_views` prefiltradas (§6) |
| A3 | Leer la vista de otro jugador | `GET player_views?seat=eq.2` | RLS por `seat` ↔ `auth.uid()` |
| A4 | Enviar órdenes por otro asiento | `POST orders` con `seat` ajeno | RLS `with check` |
| A5 | Reenviar órdenes de un turno pasado/futuro | `turn` manipulado | RLS compara con `games.turn` + validación en servidor |
| A6 | Órdenes imposibles (mover 999 tropas) | payload manipulado | Validación semántica contra estado autoritativo |
| A7 | Resolver el turno antes de tiempo | llamar `/api/cron/resolve-due` | HMAC + comprobación de plazo/todos-enviaron |
| A8 | Doble resolución (condición de carrera) | dos peticiones simultáneas | Advisory lock + idempotencia + bloqueo optimista (§8.2) |
| A9 | Spam de chat / DoS de mensajes | bucle de `POST` | Rate limit 20 msg/min/asiento; 500 caracteres; validación de canal |
| A10 | Enumerar partidas ajenas | `GET games` | RLS: solo partidas donde soy jugador o `status='lobby'` público |
| A11 | Fuga del `service_role` | variable mal nombrada | Test de CI: falla si `SUPABASE_SERVICE_ROLE_KEY` aparece bajo `components/` o con prefijo `NEXT_PUBLIC_` |
| A12 | Multicuenta (un humano, dos asientos) | registrar 2 cuentas | **No se resuelve en v1.0.** Telemetría en beta (IP + tiempos de envío correlacionados). Documentado como riesgo aceptado. |
| A13 | Colusión externa (WhatsApp) | fuera del sistema | **No se mitiga: es el género.** La colusión *es* diplomacia. |
| A14 | Inferir información por *timing* de la API | medir latencias | Las respuestas de `orders` no varían según el estado del rival; la resolución es simultánea. |

### 11.1 Superficie de confianza

```
CONFIABLE            : Route Handlers con service_role · funciones de Postgres · packages/core en el servidor
NO CONFIABLE (jamás) : todo lo que venga del navegador, incluidos ids, cantidades y checksums
```

---

## 12. Observabilidad y errores

### 12.1 Errores

```ts
class GameError extends Error {
  constructor(
    public code: ErrorCode,          // 'ORDER_INVALID_TARGET' — clave i18n
    public status: number,           // HTTP
    public context?: Record<string, unknown>,  // se registra, NO se devuelve
  ) { super(code); }
}
```

- El cliente recibe `code` (traducible) y nunca detalles internos.
- Los errores del motor **no lanzan**: emiten `ORDER_REJECTED` con motivo, para que el
  turno se resuelva igualmente. Una orden mala de un jugador **jamás** bloquea la partida
  de los otros cuatro.

### 12.2 Logging

Salida JSON estructurada a stdout (Vercel la recoge). Campos fijos: `gameId`, `turn`,
`seat`, `event`, `durationMs`, `checksum`.

**Nunca se registra:** claves, tokens, cuerpos de mensajes privados, ni el estado
completo (solo su checksum).

### 12.3 Telemetría (desde v0.95)

Tabla `telemetry_events` con eventos anónimos y agregables: duración de partida,
resultado, doctrina, rupturas de Sello, uso de anomalías, turno de la primera traición.
Alimenta directamente las métricas de balance del [GDD §16.1](GAME_DESIGN.md#161-objetivos-medibles).

Sin proveedor externo de analítica en v1.0: una tabla y una consulta SQL bastan, y no
introduce ni coste ni cuestiones de privacidad.

---

## 13. Rendimiento

### 13.1 Presupuestos (verificados en CI)

| Métrica | Presupuesto | Cómo se mide |
|---|---|---|
| JS de la ruta de partida (gzip) | **≤ 180 KB** | `@next/bundle-analyzer` en CI |
| JS de la ruta de login (gzip) | ≤ 60 KB | ídem |
| LCP en móvil (Moto G Power, 4G) | ≤ 2,5 s | Lighthouse CI |
| INP al tocar una región | ≤ 100 ms | Lighthouse CI |
| Peso total de assets SVG | ≤ 150 KB | script de build |
| Memoria en partida | ≤ 60 MB | perfil manual |
| `reduce()` de un turno de 5 jugadores | ≤ 15 ms | benchmark en Vitest |
| Generar + validar un mapa | ≤ 250 ms p95 | benchmark |

### 13.2 Presupuesto de red

| Acción | Peticiones | Bytes |
|---|:-:|---|
| Abrir una partida | 2 | ~40 KB (vista + mensajes) |
| Redactar órdenes | 0 | 0 — todo local |
| Guardar borrador | 1 cada 2 s (debounce) | ~2 KB |
| Enviar turno | 1 | ~3 KB |
| Recibir resolución | 0 (Realtime push) | ~25 KB |

**Un turno completo ≈ 70 KB.** Una partida de 12 turnos ≈ 850 KB por jugador. Con 5 GB de
egreso mensual del free tier ⇒ ~6 000 partidas-jugador/mes.

**Prohibido el polling.** Regla de lint contra `setInterval` con peticiones de red.

---

## 14. Versionado y migraciones

Tres versiones independientes:

| Versión | Dónde | Cambia cuando |
|---|---|---|
| `package.json` | proyecto | Cualquier release (SemVer) |
| `ENGINE_VERSION` | `packages/core` | Cambia una regla que altere `reduce()` |
| `MAPGEN_VERSION` | `packages/core/mapgen` | Cambia la generación (misma semilla, otro mapa) |

**Regla de compatibilidad:** una partida en curso **nunca cambia de motor**. `games`
guarda `engine_version`; si el despliegue trae un motor nuevo, las partidas existentes
siguen resolviéndose con el suyo (`packages/core` exporta versiones anteriores del
pipeline mientras haya partidas vivas) o se marcan `finished` con aviso previo.

Migraciones SQL: numeradas, incrementales, nunca editadas después de aplicarse.

---

## 15. CI/CD

```yaml
# Pipeline conceptual (.github/workflows/ci.yml)
jobs:
  quality:   typecheck · lint · check:deps (core sin dependencias) · check:i18n (claves ES=EN)
  unit:      vitest packages/core  (cobertura de rules/ ≥ 90 %)
  determin.: mismo estado+órdenes ⇒ mismo checksum en Node y en Chromium
  mapgen:    1000 semillas × {2,3,5} superan los umbrales de equidad
  security:  tests de RLS contra Supabase local  ← BLOQUEANTE
  e2e:       Playwright, 360×640 y 1440×900
  budget:    tamaño de bundle y de assets
  balance:   (nocturno) 5000 partidas simuladas; alerta si un winrate sale de rango
  docs:      npm run docs:pdf debe completar sin error
```

`main` protegida. Todo entra por PR con CI verde. Cada release: entrada en
`CHANGELOG.md` + tag + documentación actualizada
([definición de hecho](ROADMAP.md#definición-de-hecho)).
