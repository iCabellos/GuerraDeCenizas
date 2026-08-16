<div align="center">

# Guerra de Cenizas

**War of Ashes** — 4X multijugador por turnos, mobile-first, donde la guerra es el
idioma en el que se negocia.

`v0.2.0 · Campaña jugable de 12 turnos · 163 tests en verde`

[Concepto](#concepto) · [Core loop](#core-loop) · [Arquitectura](#arquitectura) ·
[Instalación](#instalación) · [Documentación](#documentación) · [Roadmap](#roadmap) ·
[Estado](#estado-actual)

</div>

---

## Concepto

> Cinco ciudades son arrancadas del mundo y depositadas en el Umbral, un pliegue del
> espacio donde solo hay un Núcleo de Ceniza y no alcanza para todas.
> Tenéis doce turnos. Ninguna puede consagrarlo sola.

**Guerra de Cenizas** es un 4X por turnos para **2, 3 o 5 jugadores** en el que ganar
en solitario es *aritméticamente imposible*: consagrar el objetivo cuesta más Ceniza de
la que produce el reparto justo de un solo jugador. Necesitas aliados. Y solo uno
—o dos— pueden ganar.

Esa única regla convierte cada partida en una cadena de pactos, precios, promesas y
traiciones. La diplomacia no es un menú lateral: es el sistema principal, y el ejército
es el argumento con el que se negocia.

### Pitch

| | |
|---|---|
| **Género** | 4X por turnos, multijugador asíncrono, fuertemente diplomático |
| **Plataforma** | Web mobile-first (PWA). Funciona en desktop sin cambiar reglas. |
| **Jugadores** | 2, 3 o 5. El modo de referencia es **5**. |
| **Duración** | 12 turnos. Blitz ≈ 50 min · Diaria ≈ 6 días · Relajada ≈ 12 días |
| **Ambientación** | Militar moderno + fantasía contemporánea. Universo 100 % original. |
| **Idiomas** | Español e inglés desde la v1.0 |
| **Filosofía** | Simple de aprender, difícil de dominar. 6 reglas, miles de situaciones. |

### Los tres pilares

1. **La victoria exige un aliado, y el aliado exige un precio.**
   El Núcleo se consagra pagando Ceniza durante 3 turnos consecutivos. Nadie produce
   suficiente. Comprar, conquistar o convencer: elige.
2. **El combate es determinista.** No hay dados. Antes de confirmar un ataque ves el
   resultado exacto. Puedes por tanto **prometer resultados** — y que se compruebe si
   cumpliste. La incertidumbre viene de lo que no sabes, no de la suerte.
3. **La traición no está prohibida: está tarifada.** Romper un Sello es legal,
   inmediato, público, y cuesta Ceniza. Es decir: traicionar te aleja de ganar.
   La pregunta nunca es *«¿puedo?»* sino *«¿me sale a cuenta?»*.

---

## Core loop

Una **campaña** (una partida) es un ciclo de cuatro fases:

```
   ┌──────────────────────────────────────────────────────────────────────────┐
   │                                                                          │
   ▼                                                                          │
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│ 1. PARLAMENTO│──►│ 2. GUERRA    │──►│ 3. NÚCLEO    │──►│ 4. REPOSO        │──┘
│  (turno 0)   │   │ (turnos 1-12)│   │ (consagración)│  │ (post-partida)   │
├─────────────┤   ├──────────────┤   ├──────────────┤   ├──────────────────┤
│ Sin combate │   │ Expandir     │   │ Se activa al │   │ Reparto de       │
│ Ver el mapa │   │ Capturar     │   │ final del T3 │   │ despojos         │
│ Negociar    │   │ Combatir     │   │ 3 turnos     │   │ Ceniza → Ciudad  │
│ Sellar      │   │ Investigar   │   │ consecutivos │   │ Desbloqueos      │
│ Desplegar   │   │ Anomalías    │   │ pagando      │   │ Reputación       │
│ Mentir      │   │ Traicionar   │   │ Ceniza       │   │ Siguiente guerra │
└─────────────┘   └──────────────┘   └──────────────┘   └──────────────────┘
```

**Dentro de un turno** (el bucle que el jugador repite 12 veces):

```
  ver el mapa ──► leer el log del turno anterior ──► negociar ──►
  dar órdenes (mover · atacar · construir · investigar · anomalía) ──►
  enviar turno ──► [todos envían o vence el plazo] ──► resolución simultánea ──►
  ver qué mintió cada uno ──► repetir
```

Todos los jugadores dan órdenes **a la vez**; el servidor las resuelve de forma
simultánea y determinista. Nadie espera a nadie.

Detalle completo: **[docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)**.

---

## Features

### En la v1.0

- 🌍 **Mapas procedurales verificablemente justos** — grafo de regiones generado como
  un sector replicado por rotación C<sub>n</sub>: la equidad es exacta *por
  construcción*, no por heurística. Con validación posterior de 8 métricas.
- 🤝 **Diplomacia con 3 primitivas vinculantes** (Sello, Transferencia con depósito,
  Coalición) + negociación por plantillas traducidas: dos jugadores sin idioma común
  pueden cerrar un trato.
- ⚔️ **Combate determinista** con 3 armas en piedra-papel-tijera y previsualización
  exacta del resultado.
- 🜃 **Anomalías** — 8 capacidades sobrenaturales que no hacen daño: manipulan
  información, topología y compromisos.
- 🕵️ **Sombra** — operaciones de inteligencia, sabotaje y engaño; incluye detectar una
  traición *antes* de que ocurra.
- 🏙️ **La Ciudad** — hub de metaprogresión entre guerras. Desbloquea **opciones**,
  nunca números.
- ⟡ **Facciones ligadas a la cuenta** — seis ciudades signatarias. Cambian tu doctrina de
  origen y **abaratan** tu vía de desbloqueos, pero el techo es idéntico para todas
  (verificado por test). Dos jugadores de la misma facción quedan marcados con
  **Concordia**: público, y sin ningún efecto mecánico.
- 📱 **Mobile-first real** — diseñado a 360 px primero; objetivos táctiles ≥ 44 px;
  jugable con una mano.
- 🌐 **Español e inglés completos**, incluido el sistema diplomático.
- 🔐 **Servidor autoritativo** con Supabase RLS y niebla de guerra criptográficamente
  real (el cliente nunca recibe lo que no debe ver).
- 🤖 **Simulador headless** de miles de partidas para balance automático.

### Explícitamente fuera de la v1.0

Gestión profunda de ciudad · objetivos ocultos individuales · más de 5 jugadores ·
ranking global · monetización · modo campaña PvE · tecnología orbital.
Razones en **[docs/DISCOVERY.md](docs/DISCOVERY.md#3-sistemas-que-el-brief-pide-y-que-no-superan-el-filtro)**.

---

## Arquitectura

### Principio rector

> **Un solo motor. Tres consumidores.**

```
                     packages/core  (TypeScript puro · 0 dependencias · sin I/O)
                     ┌──────────────────────────────────────────┐
                     │  tipos · esquemas · reglas · mapgen       │
                     │  reduce(state, orders) → state'           │
                     └───────────────┬──────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          ▼                          ▼                          ▼
   ┌─────────────┐          ┌────────────────┐         ┌────────────────┐
   │  SERVIDOR   │          │    CLIENTE     │         │   SIMULADOR    │
   │  autoridad  │          │  solo preview  │         │    balance     │
   │ Next.js     │          │  React/SVG     │         │ packages/sim   │
   │ Route       │          │  nunca decide  │         │ N partidas sin │
   │ Handlers    │          │  nada crítico  │         │ interfaz       │
   └──────┬──────┘          └────────────────┘         └────────────────┘
          │
          ▼
   ┌──────────────────────────────────────────────┐
   │  Supabase — Postgres · Auth · RLS · Realtime │
   │  game_states (deny all)  →  player_views     │
   │                              (RLS: mi asiento)│
   └──────────────────────────────────────────────┘
```

El mismo `reduce()` corre en los tres sitios. Un test de determinismo comprueba que
`checksum(reduce(s, o))` coincide en servidor, cliente y simulador.

### Stack

| Capa | Elección | Por qué esta y no otra |
|---|---|---|
| Framework | **Next.js 16 (App Router)** + React 19 | Único stack de primera clase en Vercel con Route Handlers para la autoridad de servidor y RSC para reducir JS en móvil. |
| Lenguaje | **TypeScript** `strict` | El motor es lógica pura: los tipos son la primera línea de tests. |
| Estilos | **Tailwind CSS v4** | Sin librería de componentes. Los `design tokens` viven en CSS variables y los consumen a la vez la UI y los assets SVG. |
| Backend | **Supabase** (Postgres + Auth + RLS + Realtime) | Auth, base de datos, seguridad por filas y websockets en un solo free tier. |
| Validación | **Zod** | Un solo esquema sirve para validar la petición HTTP y para tipar el motor. |
| i18n | **next-intl** | Mensajes ICU (plurales/género), rutas `/es` `/en`, funciona en RSC. |
| Render del mapa | **SVG + React** | Un grafo de ~50–95 regiones no necesita WebGL. Gana en nitidez, accesibilidad (cada región es un elemento enfocable), peso y pipeline de assets. |
| Tests | **Vitest** (motor) + **Playwright** (E2E y viewport móvil) | |
| PDF de docs | **markdown-it + Chromium** (Playwright) | Reproducible dentro del repo, sin herramientas de pago. |

**Regla de dependencias:** toda dependencia nueva necesita una entrada justificada en
[docs/DECISIONS.md](docs/DECISIONS.md). `packages/core` debe permanecer en **cero
dependencias de runtime**, para siempre.

Detalle completo: **[docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md)**.

---

## Estructura del proyecto

```
guerra-de-cenizas/
├── README.md                    ← este documento; léelo antes de trabajar
├── CHANGELOG.md
├── docs/                        ← toda la documentación de diseño
│   ├── DISCOVERY.md             ← Fase 0: contradicciones y riesgos
│   ├── GAME_DESIGN.md           ← GDD
│   ├── TECHNICAL_DESIGN.md      ← TDD
│   ├── MAP_GENERATION.md        ← generación procedural + scoring
│   ├── DIPLOMACY.md
│   ├── METAPROGRESSION.md
│   ├── MULTIPLAYER.md
│   ├── UX_MOBILE.md
│   ├── ASSET_PIPELINE.md
│   ├── TESTING_AND_SIMULATION.md
│   ├── ROADMAP.md
│   └── DECISIONS.md             ← registro de decisiones (ADR)
│
├── packages/
│   ├── core/                    ← ⭐ motor puro. 0 deps. La fuente de la verdad.
│   │   ├── CLAUDE.md            ← reglas locales del paquete
│   │   ├── src/
│   │   │   ├── types/           ← estado, órdenes, eventos
│   │   │   ├── rules/           ← reduce(), movimiento, control, visibilidad
│   │   │   ├── mapgen/          ← esqueleto C_n, decoración, generación
│   │   │   ├── factions/        ← catálogo de facciones y desbloqueos de cuenta
│   │   │   ├── balance/         ← tablas de constantes (datos, no código)
│   │   │   ├── rng/             ← xoshiro128** determinista
│   │   │   └── util/            ← JSON canónico y checksum
│   │   └── tests/
│   └── sim/                     ← simulador headless + perfiles de bot + estadísticas
│
├── apps/
│   └── web/                     ← Next.js
│       ├── app/[locale]/        ← rutas localizadas
│       ├── app/api/             ← Route Handlers = autoridad de servidor
│       ├── components/
│       ├── messages/            ← es.json · en.json
│       └── e2e/                 ← Playwright
│
├── supabase/
│   ├── migrations/              ← SQL versionado
│   └── seed.sql
│
├── assets/                      ← fuentes SVG originales + tokens
│   └── src/{units,terrain,icons,ui,effects}/
│
└── tools/
    └── docs-pdf/                ← generación del PDF de documentación
```

---

## Instalación

### Requisitos

- Node.js **≥ 22**
- npm **≥ 10**
- Una cuenta de [Supabase](https://supabase.com) (free tier) — solo desde v0.3
- Opcional: [Supabase CLI](https://supabase.com/docs/guides/cli) para Postgres local

### Puesta en marcha

```bash
git clone https://github.com/iCabellos/GuerraDeCenizas.git
cd GuerraDeCenizas
npm install

cp .env.example .env.local     # y rellena las variables (ver abajo)

npm run dev                    # http://localhost:3000
```

### Variables de entorno

| Variable | Ámbito | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | público | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | público | Clave publicable (`sb_publishable_…`). Solo puede lo que permita la RLS. |
| `SUPABASE_SECRET_KEY` | **secreto — solo servidor** | Clave secreta (`sb_secret_…`). Usada exclusivamente en Route Handlers para la resolución de turnos. **Nunca** en código de cliente. |
| `CRON_SECRET` | **secreto** | Compartido con `pg_cron` para autenticar el disparador de resolución. |

Los nombres antiguos —`NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`, con
claves JWT `eyJ…`— siguen funcionando: es la misma clave con otro nombre y el mismo rol de
Postgres detrás. Si defines las dos de un par, gana la nueva. `GET /api/health` responde
qué falta, por nombre y nunca por valor.

> ⚠️ Cualquier variable con prefijo `NEXT_PUBLIC_` acaba en el navegador. La clave secreta
> **nunca** lleva ese prefijo. Hay un test de CI que falla si aparece.

### Base de datos

Desde v0.3, el esquema vive en `supabase/migrations/` como SQL versionado:

```bash
npx supabase link --project-ref <tu-ref>
npx supabase db push          # aplica migraciones
npx supabase db reset         # reinicia local + seed
```

Tablas principales: `profiles`, `cities`, `account_unlocks`, `games`, `game_players`,
`game_states`, `player_views`, `orders`, `turn_events`, `treaties`, `messages`,
`match_results`. Esquema y políticas RLS completas en
[docs/TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md#5-base-de-datos).

---

## Scripts

| Script | Qué hace |
|---|---|
| `npm run dev` | Next.js en modo desarrollo |
| `npm run build` | Build de producción |
| `npm test` | Vitest — motor, mapgen, facciones, combate, economía (163 tests) |
| `npm run verify` | Todo lo anterior + typecheck + estructura + enlaces de docs |
| `npm run check:deps` | Reglas estructurales del monorepo |
| `npm run test:e2e` | Playwright — incluye viewports móviles |
| `npm run sim -- --games 5000 --players 5` | Simulador de balance |
| `npm run mapgen -- --seed 1234 --players 5 --report` | Genera un mapa y su informe de equidad |
| `npm run gallery` | Abre la Galería de Assets (QA visual) |
| `npm run docs:pdf` | Genera `docs/GuerraDeCenizas.pdf` desde los Markdown |
| `npm run docs:check` | Verifica los enlaces internos de la documentación |
| `npm run lint` / `npm run typecheck` | Calidad estática |

---

## Testing

El testing no es una fase: es una condición para que una versión exista.

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitario | Vitest | Reglas del motor, combate, economía, captura, RNG |
| Determinismo | Vitest | `reduce()` da el mismo checksum en servidor, cliente y simulador |
| Mapgen | Vitest | 1 000 semillas × {2,3,5} jugadores deben superar los umbrales de equidad |
| Balance | `packages/sim` | 5 000 partidas; winrate por doctrina dentro de 42–58 % |
| Integración | Vitest + Supabase local | RLS, órdenes, resolución, reconexión |
| Seguridad | Vitest | Un cliente no puede leer `game_states` ni el `player_view` ajeno |
| E2E | Playwright | Flujo completo login → partida → fin, en 360×640 y 1440×900 |
| Visual | Galería de Assets | Escala, contraste, legibilidad sobre cada terreno |

Detalle: **[docs/TESTING_AND_SIMULATION.md](docs/TESTING_AND_SIMULATION.md)**.

---

## Desarrollo local

Sin Supabase (hasta v0.3 y para trabajar en el motor):

```bash
npm test -- --watch                                 # TDD sobre el motor
npm run mapgen -- --seed 42 --players 5 --report    # inspeccionar un mapa
npm run sim -- --games 200 --seed 1 --verbose       # ver una partida simulada
```

Con Supabase local:

```bash
npx supabase start
npm run dev
```

Para probar multijugador en solitario: abre la partida en una ventana normal y otra de
incógnito, o usa `npm run sim -- --seat-takeover` para que un bot ocupe los asientos
restantes.

---

## Deploy

**Frontend → Vercel**

1. Importa el repositorio en Vercel.
2. Configura las variables de entorno (marca `SUPABASE_SERVICE_ROLE_KEY` y
   `TURN_RESOLVER_SECRET` como *Sensitive*).
3. Deploy. `main` → producción; cualquier PR → preview.

**Backend → Supabase**

1. Crea el proyecto y aplica `supabase/migrations/`.
2. Activa `pg_cron` y `pg_net`.
3. Programa el disparador de resolución (cada minuto):

```sql
select cron.schedule('resolve-due-turns', '* * * * *', $$
  select net.http_post(
    url     := 'https://<tu-app>.vercel.app/api/cron/resolve-due',
    headers := jsonb_build_object('x-resolver-secret', current_setting('app.resolver_secret'))
  );
$$);
```

### Coste y límites

Objetivo: **0 €/mes** durante toda la beta.

| Servicio | Plan | Límite relevante | Cuándo lo rompemos | Alternativa |
|---|---|---|---|---|
| Vercel | Hobby | 100 GB banda; **prohibido uso comercial** | Al monetizar, o ~50 k partidas/mes | Vercel Pro 20 $/mes |
| Supabase | Free | 500 MB BD · 5 GB egreso · 50 k MAU · 200 conexiones Realtime | ~200 partidas simultáneas | Supabase Pro 25 $/mes |
| Almacenamiento | — | ~80 KB por partida terminada | ~6 000 partidas archivadas | Poda + archivo en Storage |

Una partida terminada se guarda como **semilla + órdenes**, no como estado: se puede
reconstruir entera reproduciéndola. Ese es el truco que mantiene el coste plano.

---

## Documentación

| Documento | Contenido |
|---|---|
| [DISCOVERY.md](docs/DISCOVERY.md) | Fase 0: contradicciones del brief, riesgos, recortes |
| [GAME_DESIGN.md](docs/GAME_DESIGN.md) | Lore, facciones, recursos, combate, victoria, tutorial |
| [TECHNICAL_DESIGN.md](docs/TECHNICAL_DESIGN.md) | Arquitectura, BD, RLS, API, concurrencia, seguridad |
| [MAP_GENERATION.md](docs/MAP_GENERATION.md) | Generador procedural, métricas, scoring, pseudocódigo |
| [DIPLOMACY.md](docs/DIPLOMACY.md) | Las 3 primitivas vinculantes, reputación, traición |
| [METAPROGRESSION.md](docs/METAPROGRESSION.md) | Progresión permanente vs. de partida, la Ciudad |
| [FACTIONS.md](docs/FACTIONS.md) | Facciones ligadas a la cuenta, desbloqueos, Cisma, Concordia |
| [MULTIPLAYER.md](docs/MULTIPLAYER.md) | Turnos, cadencias, abandonos, reconexión, bots |
| [UX_MOBILE.md](docs/UX_MOBILE.md) | Wireframes, gestos, accesibilidad, rendimiento |
| [ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md) | Dirección artística, naming, QA visual |
| [TESTING_AND_SIMULATION.md](docs/TESTING_AND_SIMULATION.md) | Estrategia de test y simulador de balance |
| [ROADMAP.md](docs/ROADMAP.md) | v0.1 → v1.0 con criterios de aceptación |
| [DECISIONS.md](docs/DECISIONS.md) | Registro de decisiones arquitectónicas (ADR) |

**PDF:** [`docs/GuerraDeCenizas.pdf`](docs/GuerraDeCenizas.pdf) — 129 páginas con portada,
índice y paginación. Se regenera con `npm run docs:pdf` usando solo herramientas del
repositorio (markdown-it + el Chromium de Playwright). Pipeline documentado en
[tools/docs-pdf/](tools/docs-pdf/README.md).

---

## Roadmap

| Versión | Nombre | Entrega |
|---|---|---|
| **v0.1** ✅ | Prototipo | Mapa, jugadores, movimiento, turnos. Local, sin cuentas. |
| **v0.2** ✅ | Núcleo jugable | Recursos, producción, combate, captura, log de eventos |
| **v0.3** | Multijugador real | Auth, Supabase, persistencia, RLS, reconexión, cadencias |
| **v0.4** | Diplomacia | Sellos, transferencias con depósito, visión compartida, reputación |
| **v0.5** | El Núcleo | Objetivo especial, consagración, coaliciones, condiciones de victoria |
| **v0.6** | Metaprogresión | La Ciudad, desbloqueos, resultados de partida |
| **v0.7** | Anomalías | Sistema sobrenatural + operaciones de Sombra |
| **v0.8** | Procedural + balance | Generador completo, simulador, ajuste de constantes |
| **v0.9** | Pulido móvil | UX, onboarding, assets, accesibilidad, rendimiento |
| **v0.95** | Beta cerrada | Telemetría, feedback, estabilidad |
| **v1.0** | Release | ES+EN completos, sin bugs críticos, documentación al día |

Criterios de aceptación por versión: **[docs/ROADMAP.md](docs/ROADMAP.md)**.

---

## Versionado

- **SemVer** para el proyecto (`0.x` = pre-release).
- **`ENGINE_VERSION`** independiente en `packages/core`. Toda partida guarda la versión
  de motor con la que se creó; una partida en curso nunca cambia de motor.
- **`MAPGEN_VERSION`** independiente. Un mapa se reproduce con `(seed, MAPGEN_VERSION)`.
- Cada versión: rama → PR → tests verdes → entrada en `CHANGELOG.md` → tag.

---

## Estado actual

**v0.2 — Núcleo jugable completado y verificado.**

- ✅ Fase 0 (Discovery): 7 contradicciones resueltas, 21 riesgos catalogados.
- ✅ Documentación de diseño completa (13 documentos + PDF de 130 páginas).
- ✅ **Motor** (`@gdc/core`): estado, PRNG determinista, `reduce()` con validación,
  movimiento simultáneo, control territorial, visibilidad y eventos filtrados por asiento.
- ✅ **Generador de mapas**: esqueleto C<sub>n</sub>, decoración y replicación por
  rotación, para 2, 3 y 5 jugadores.
- ✅ **Sistema de facciones** ligado a la cuenta, con el invariante del techo verificado.
- ✅ **Combate determinista**: rueda de armas, terreno, posturas, fortificación, apoyo de
  Fuego y previsualización que **coincide exactamente** con el resultado.
- ✅ **Economía**: renta con rendimiento decreciente, suministro por distancia, producción.
- ✅ **Prototipo web**: mapa SVG accesible, hot seat, previsualización de combate,
  producción y registro del turno filtrado por asiento.
- ✅ **163 tests** en verde · typecheck limpio · reglas estructurales verificadas.
- ⏳ **Pendiente:** confirmar las 3 decisiones bloqueantes de
  [DISCOVERY §5](docs/DISCOVERY.md#5-preguntas-que-sí-son-bloqueantes).
- ⏭️ **Siguiente:** v0.3 — multijugador real (auth, Supabase, RLS, autoridad de servidor).

### Cómo verlo funcionando

```bash
npm install && npm run dev     # http://localhost:3000
npm test                       # 163 tests
npm run verify                 # typecheck + estructura + tests + enlaces
```

---

## Decisiones importantes

Las cinco que definen el proyecto (el resto, en [DECISIONS.md](docs/DECISIONS.md)):

1. **El mapa es un grafo, no una rejilla.** Un sector generado y replicado n veces por
   rotación ⇒ equidad exacta por construcción para 2, 3 y 5 jugadores. Ninguna rejilla
   admite simetría de orden 5.
2. **El combate es determinista.** Sin dados. Permite prometer resultados, previsualizar
   batallas y que el simulador converja barato.
3. **Un solo motor de reglas**, TypeScript puro y sin dependencias, compartido por
   servidor, cliente y simulador.
4. **La niebla de guerra es real:** `game_states` niega todo `SELECT`; los jugadores solo
   leen `player_views`, proyecciones ya filtradas por asiento.
5. **La metaprogresión solo añade opciones**, jamás números. Un test de CI falla si un
   desbloqueo toca la tabla de balance, y la propia estructura lo impide: el módulo de
   facciones **no puede importar** el de balance.

---

## Assets y propiedad intelectual

Todos los assets son **originales y creados dentro de este repositorio**. Se prohíbe
incorporar assets de marketplaces, imágenes de terceros, iconografía con copyright
incompatible o cualquier referencia a propiedad intelectual ajena. El universo —lore,
facciones, nombres, poderes— es original.

Los assets se autoran como **SVG en `assets/src/`**, lo que hace que su procedencia sea
trivialmente rastreable: están en el historial de git como código. Criterios de
aprobación y QA visual: [ASSET_PIPELINE.md](docs/ASSET_PIPELINE.md).

---

## Licencia

Pendiente de definir por el propietario del repositorio (ver
[DECISIONS.md](docs/DECISIONS.md) · ADR-016).
