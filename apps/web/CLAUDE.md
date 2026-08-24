# CLAUDE.md — `apps/web`

Next.js (App Router). Es a la vez **la autoridad de servidor** y **la interfaz**. No
confundas las dos capas.

---

## Las tres capas

| Capa | Dónde | Puede | No puede |
|---|---|---|---|
| **Autoridad** | `app/api/**/route.ts` | `service_role`, escribir `game_states`, ejecutar `reduce()` | — |
| **Lectura** | Server Components | cliente Supabase de usuario (RLS activa), leer `player_views` | usar `service_role` |
| **Presentación** | Client Components | props, Realtime, `reduce()` **solo para preview** | decidir nada, persistir nada |

**Regla de import verificada por lint:** nada bajo `components/` puede importar
`lib/server/`.

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` **solo** en Route Handlers. Nunca con prefijo
  `NEXT_PUBLIC_`. Hay un test de CI que falla si aparece en el bundle de cliente.
- El resultado de `reduce()` en el cliente **jamás** se envía ni se persiste. Es
  exclusivamente para pintar una previsualización.
- Toda entrada se valida con Zod y `.strict()`: un campo desconocido es **rechazo**, no
  se ignora.
- El cliente manda identificadores; las cantidades y el estado los pone el servidor.

---

## Mobile first, de verdad

Se diseña a **360×640 primero**. El escritorio es la misma interfaz con más aire — nunca
reglas distintas ni información distinta.

```
□ Objetivos táctiles ≥ 44 px (reales: 56 px)
□ Acciones primarias en el tercio inferior de la pantalla
□ Ningún panel oculta el mapa por completo
□ Un solo modal abierto a la vez
□ Sin desbordamiento horizontal a 320 px
□ Texto ≥ 14 px, contraste ≥ 4,5:1
```

Checklist completa en [`docs/UX_MOBILE.md §11`](../../docs/UX_MOBILE.md#11-checklist-de-qa-móvil).

## La interfaz es SVG y DOM. El relieve es aparte

Cada región es un elemento del DOM **enfocable y anunciable por lector de pantalla** — la
accesibilidad sale gratis y no se puede recuperar si la metes en un lienzo.

Zoom y desplazamiento por `transform` sobre el `<g>` raíz, manipulado por ref. **No hagas
re-render de React durante un gesto.**

Desde [ADR-034](../../docs/DECISIONS.md#adr-034) hay además un mundo 2.5D en WebGL
(`components/world/`), y el reparto es **estricto**:

| Capa | Qué es | Reglas |
|---|---|---|
| Mundo | `<gdc-world>`, three.js | `aria-hidden`. Sin foco. **No decide nada** |
| Rótulos | DOM con `data-tile` | Texto real. El motor sólo los coloca |
| Respaldo | La vista plana de siempre | Sin WebGL o con `prefers-reduced-motion` |

Tres cosas que no puedes hacer aquí:

1. **Poner información sólo en el mundo.** Si no está en el DOM, para media clase de
   jugadores no existe. El lienzo es telón.
2. **Importar `./world/engine` de forma estática.** Va con `import()` dentro de un efecto
   o three.js entra en el bundle base y se lleva por delante el presupuesto de 180 KB.
3. **Dejar una vista sin `fallback`.** Un hueco gris no es un respaldo; la vista plana sí.
4. **Escribir en el documento desde el motor.** El original del diseño pintaba la
   escaramuza con `document.querySelectorAll('[data-sk]')`. Aquí el DOM es de React: el
   motor **emite** (`gdc-skirmish`) y lo pinta quien escuche.

`components/world/board.ts` es geometría pura y **sin DOM** justamente para poder testearla:
`engine.ts` hace `extends HTMLElement` y no se puede ni importar fuera de un navegador.

## Estado del cliente

Sin Redux, sin Zustand. Tres piezas y ninguna más:

1. Vista del servidor → Server Component o `useSyncExternalStore` sobre Realtime.
2. Órdenes en borrador → un `useReducer`. Es el único estado mutable real, y su forma es
   **exactamente** la que se envía a la API (sin transformación intermedia).
3. Preferencias de UI → `localStorage`. **Nada del estado de juego va aquí.**

## i18n

- **Cero literales visibles en componentes.** Regla de lint sobre `components/**`.
- Los errores de la API devuelven `code`, no texto; el cliente traduce.
- Las ofertas diplomáticas son **datos**, no frases: un jugador en español y otro en
  inglés ven la misma oferta.
- `es.json` y `en.json` deben tener exactamente el mismo conjunto de claves (test de CI).

## Rendimiento

| Presupuesto | Valor |
|---|---|
| JS de la ruta de partida (gzip) | ≤ 180 KB |
| LCP móvil | ≤ 2,5 s |
| INP al tocar una región | ≤ 100 ms |

**Prohibido el polling.** Realtime empuja; si el canal se cae, retroceso exponencial.

---

## Estado actual

**v0.3 en curso.** Capa de autoridad completa en `lib/server/` + `app/api/`, contra un
Postgres real. Interfaz: Juramento, ciudad con relieve, emparejamiento con rivales
artificiales, campaña que se juega tocando el mapa —ficha de región con sus acciones,
pizarra con una casilla por fuerza, reparto y mandos de cámara— y clasificación final.

**La diplomacia no existe todavía.** El reparto enseña quién controla qué, que es público;
no hay Sellos, ni Rupturas, ni ofertas. Eso es v0.4 y necesita motor, tablas y RLS. No lo
simules en la interfaz.

**Una campaña entera se juega en solitario**, de la búsqueda al resultado. El prototipo
hot-seat de v0.2 sigue en `/prototype`.

Las mallas de `components/world/` son un **v0 jugable**, no arte final: dan la silueta y la
escala correctas y nada más. No construyas encima como si fueran definitivas.

**La resolución recibe el transporte inyectado** (`Rpc`), no construye el cliente de
Supabase. Es lo que permite que los tests ejecuten el código real de autoridad contra una
base real: un test de concurrencia contra un doble no prueba nada, porque lo que se está
probando es la base de datos.

### Una sola vista

`/` es **la** pantalla: tu ciudad en cenital y un botón ([ADR-026](../../docs/DECISIONS.md#adr-026)).
Con campaña en curso, redirige a ella. No añadas pantallas intermedias: cada una es un
peaje entre el jugador y el turno que quiere jugar, y en Blitz cuesta plazo de verdad.

| Ruta | Qué es |
|---|---|
| `/` | La ciudad + buscar campaña |
| `/g/:id` | La campaña. La misma vista con la cámara sobre el campo de batalla. Terminada, enseña la clasificación |
| `/oath` | El Juramento: facción y nombre. **Una vez en la vida de la cuenta** ([ADR-039](../../docs/DECISIONS.md#adr-039)) |
| `/sign-in` | Enlace mágico **o entrar sin cuenta**. Lo único anterior al Juramento |
| `/dev/*` | QA visual. 404 en producción |

`/dev/city` y `/dev/board` montan las dos pantallas **sin base de datos** — la de campaña
con una partida real de `createGame` + `reduce` + `projectViews`, con varios turnos ya
jugados por bots (`?turns=n`). Si tocas una de las dos, mírala ahí antes de darla por
hecha: sin credenciales no hay otra forma de verlas.

Que juegue turnos antes de pintar no es comodidad: en el T0 la fase es Parlamento, la única
en la que no se puede mover, y con ella se revisaba un tablero donde ninguna orden era
posible.

**El mapa de campaña es SVG y se queda en SVG** ([ADR-035](../../docs/DECISIONS.md#adr-035)).
El mundo 2.5D no lo puede representar: su tablero son 37 losas fijas y el mapa real es un
grafo en polares de 45 a 96 regiones. No lo intentes otra vez sin leer el ADR.

**Y se dibuja teselado, no como un grafo** ([ADR-041](../../docs/DECISIONS.md#adr-041)).
Los polígonos salen de `regionCells()` en `@gdc/core`: **no los calcules aquí**. La
teselación define la adyacencia que se ve —dos provincias se tocan si y solo si son
adyacentes— y partirla en dos sitios es la forma de acabar ofreciendo movimientos que el
motor rechaza. Nada de aristas pintadas: la frontera es la arista.

### La campaña se juega tocando el mapa

[ADR-040](../../docs/DECISIONS.md#adr-040). Cuatro reglas, y las cuatro son la misma:

```
□ El mapa se queda con el espacio que sobra; los paneles ocupan sitio de verdad
□ Solo flota lo que NO intercepta un gesto: cabecera, raíl de fases, mandos de cámara
□ Toda orden empieza con un tap en una región y termina con un tap en el mapa
□ Nada que el motor sepa se enseña estimado: si no se ve, no se pinta
```

Un panel que flota sobre el mapa vuelve a traer el fallo de siempre —un destino resaltado
debajo de la hoja— y `pointer-events: none` **no lo arregla**: resuelve los taps, no la
visibilidad. Si necesitas una capa nueva sobre el mapa, pregúntate antes si puede vivir en
la columna.

Las cuentas de la pantalla viven en [`lib/board.ts`](lib/board.ts) y son puras: quién manda
en qué, dónde está el enemigo, qué se puede hacer en una región. No las devuelvas a un
componente — ahí no se pueden probar.

`MapView` expone la cámara como un `MapHandle` imperativo (`focus`, `zoomBy`). **No la
muevas por estado de React**: un botón de cámara no puede costar un render del mapa entero,
y el gesto tampoco.

**No hay estado «con sesión pero sin perfil».** El perfil lo crea un trigger sobre
`auth.users` ([ADR-030](../../docs/DECISIONS.md#adr-030)), no la API. No añadas una ruta de
alta: la que había —ninguna— dejaba la cuenta rebotando entre `/` y `/sign-in` para
siempre, sin un error en ningún log.

Y el invitado no es un caso especial ([ADR-031](../../docs/DECISIONS.md#adr-031)): es una
sesión anónima de Supabase, con rol `authenticated` y su fila en `auth.users`. Si escribes
un `if (isGuest)` en la capa de autorización, algo va mal — RLS ya lo trata igual.

**La interfaz no explica, enseña** ([ADR-027](../../docs/DECISIONS.md#adr-027)) — **pero
nombra** ([ADR-038](../../docs/DECISIONS.md#adr-038)). Los dos, y en ese orden.

Lo prohibido es el **párrafo que explica un control**. Cómo se llama el control no es una
explicación: es su nombre. Llevar ADR-027 hasta el final dejó la pantalla principal sin
una sola palabra —ni nombre de jugador, ni facción, ni qué hacía el botón grande— y eso no
es sobriedad, es esconder.

```
□ Cada control se llama por su nombre, con el glifo AL LADO, no en su lugar
□ La pantalla dice de quién es: nombre y juramento
□ Ningún párrafo explicativo, ningún tutorial, ningún tooltip de ayuda
```

**La prueba que lo caza:** si el `aria-label` es la única forma de saber qué hace un
control, está mal. El lector de pantalla lo anuncia y la pantalla no — o sea que solo
funciona para quien ya no lo necesita.

### El registro visual

«Una carta de situación desplegada sobre una mesa de mando». De ahí sale todo y nada es
estética por sí sola:

| Regla | Motivo |
|---|---|
| Esquinas de 4 px, nada redondeado | Es un juego militar, no una aplicación |
| Sin sombras | La profundidad la dan el borde y la superficie, como en un plano |
| `type-display` / `type-title` / `type-label` / `type-figure` | Una sola familia, tres registros. El contraste lo da el eje de anchura |
| Cifras tabulares en todo lo comparable | Recursos y plazos se leen en columna |
| Ceniza solo en menús | Sobre el mapa competiría con las fuerzas |
| Color **nunca** como único distintivo | Barra de asiento **y** emblema, siempre |

Los iconos salen de `assets/src/` por `npm run assets:build`. **No escribas SVG a mano en
un componente**: el generador es lo que garantiza la cuadrícula, la paleta y la
declaración de autoría. La coherencia se revisa en `/dev/gallery`, no de memoria.

**Regla aprendida a base de repetirla:** un panel flotante sobre el mapa lleva
`pointer-events-none`, y solo sus botones `pointer-events-auto`. Hacerlo más pequeño no
resuelve nada: siempre queda una región tocable debajo.

**La lógica de reglas no vive aquí.** `previewAttack` está en `@gdc/core` porque derivar
bandos de combate desde una `PlayerView` es lógica de reglas: si la duplicara el cliente,
el servidor y el simulador tendrían que reimplementarla.

### La regla de las dos capas de identidad

| Cliente | Rol | Sirve para |
|---|---|---|
| `userClient()` | `authenticated` | saber **quién** pide. RLS activa. |
| `serviceClient()` | `service_role` | hacer lo que la autoridad decide. Omite RLS. |

La identidad se resuelve **siempre** con el primero, aunque la operación la ejecute el
segundo. Con `service_role`, cualquier `profile_id` que llegue en el cuerpo sería
aceptado, y «juega por mí en el asiento 2» dejaría de ser un ataque para pasar a ser una
llamada bien formada.

`check-deps.mjs` verifica que nada fuera de `lib/server/` y `app/api/` importe la capa de
autoridad.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
