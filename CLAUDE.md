# CLAUDE.md — Guerra de Cenizas

Instrucciones para cualquier agente que trabaje en este repositorio.
**Léelo entero antes de tocar nada.** Hay `CLAUDE.md` adicionales por directorio con
reglas locales que amplían a estas.

---

## Antes de empezar cualquier tarea

1. Lee [`README.md`](README.md) — concepto, arquitectura y estado actual.
2. Lee los documentos de `docs/` relevantes para lo que vas a tocar.
3. Comprueba en [`docs/ROADMAP.md`](docs/ROADMAP.md) en qué versión estamos y qué entra.
4. **No contradigas una decisión documentada.** Si hay que cambiarla, añade una entrada
   nueva en [`docs/DECISIONS.md`](docs/DECISIONS.md); nunca edites la histórica.

## El juego en cinco líneas

4X por turnos para 2, 3 o 5 jugadores, mobile-first, asíncrono. Ganar exige consagrar el
Núcleo pagando más Ceniza de la que produce el reparto justo de un jugador ⇒ **la
diplomacia es aritmética, no social**. Combate determinista sin dados ⇒ **las promesas
son verificables**. Romper un pacto es legal, público y **cuesta Ceniza** ⇒ traicionar te
aleja de ganar. No hay eliminación.

---

## Las cinco reglas que no se rompen

### 1. `packages/core` es puro y no tiene dependencias

Sin `dependencies` de runtime. Sin I/O. Sin `Math.random()`. Sin `Date.now()`.
Sin iterar objetos sin ordenar. Es una función: `reduce(state, orders, ctx) → result`.

Lo consumen tres sitios (servidor, cliente, simulador) y **debe dar exactamente el mismo
resultado en los tres**. Si añades algo que rompa eso, el juego se desincroniza en
producción de formas imposibles de depurar.

### 2. El cliente nunca decide nada

Toda validación crítica ocurre en servidor **contra el estado autoritativo cargado de la
base de datos**, nunca contra lo que envía el cliente. El cliente solo manda
identificadores; el resto lo pone el servidor.

### 3. `game_states` no se lee jamás desde el cliente

RLS lo niega. Los jugadores leen `player_views`, ya filtradas por asiento. Si escribes
código que exponga estado sin filtrar, has roto la niebla de guerra del juego entero.
Ver [`docs/TECHNICAL_DESIGN.md §6`](docs/TECHNICAL_DESIGN.md#6-niebla-de-guerra-y-rls).

### 4. La metaprogresión solo añade opciones, nunca números

Ningún desbloqueo permanente —ni de cuenta, ni de facción, ni de distrito— puede
modificar una constante de `BALANCE`. Hay un test de CI que lo verifica.
Ver [`docs/METAPROGRESSION.md §2`](docs/METAPROGRESSION.md#2-la-regla-de-oro).

### 5. Todos los assets son originales y viven en el repositorio como SVG

Nada de marketplaces, imágenes de terceros, iconos con licencia incompatible ni
referencias a IP ajena. Un binario en `assets/src/` es un error de build.
Ver [`docs/ASSET_PIPELINE.md`](docs/ASSET_PIPELINE.md).

---

## Cómo se trabaja aquí

### Antes de implementar una feature

El brief del proyecto exige definir **antes** de escribir código: objetivo, reglas,
estado, entradas, salidas, casos límite, tests, UX, persistencia e impacto en balance.
Si no puedes responder a los diez, todavía no toca implementar.

### Definición de hecho

Una tarea **no está terminada** hasta que:

```
□ Código implementado          □ Errores manejados
□ Tests escritos               □ Sin TODOs críticos sin issue
□ Tests ejecutados y verdes    □ Documentación actualizada
□ UX comprobada en 360×640     □ CHANGELOG.md actualizado
□ Persistencia comprobada      □ DECISIONS.md si cambió una decisión
```

**Nunca declares una feature terminada sin haberla verificado ejecutándola.**

### Tamaño del código

Código **pequeño, comprensible, testeable y extensible**. Si 100 líneas resuelven lo que
una arquitectura de 1 000, usa las 100. No introduzcas abstracciones para un solo caso de
uso. No añadas una dependencia sin justificarla en `DECISIONS.md`.

### Antes de añadir un sistema de juego

Responde: **¿qué decisión interesante permite tomar al jugador?** Si no hay respuesta
clara, no se implementa. Esta pregunta ya ha eliminado la veteranía de unidades, las
colas de producción, el árbol tecnológico grande y el arsenal nuclear.

---

## Comandos

```bash
npm run verify              # ⭐ typecheck + estructura + tests + enlaces + BUILD. Antes de commit.

npm test                    # Vitest — motor, mapgen, facciones, reglas
npm run test:watch          # TDD
npm run test:security       # ⛔ RLS y capa de autoridad contra un Postgres real. BLOQUEANTE.
npm run typecheck           # tsc --noEmit en core y web
npm run check:deps          # reglas estructurales del monorepo
npm run db:reset            # recrea el Postgres efímero de los tests (tools/pg)
npm run db:psql             # consola contra esa base
npm run dev                 # prototipo web en http://localhost:3000
npm run build               # build de producción
npm run docs:pdf            # → docs/GuerraDeCenizas.pdf (regenéralo al tocar docs)
npm run docs:check          # enlaces internos de la documentación
```

**`npm run verify` es lo mínimo antes de dar nada por terminado.** Si falla, no está hecho.

## Estructura

| Ruta | Qué es | Regla local |
|---|---|---|
| `packages/core/` | ⭐ El motor. La fuente de la verdad. | `CLAUDE.md` propio |
| `packages/sim/` | Simulador de balance | `CLAUDE.md` propio |
| `apps/web/` | Next.js | `CLAUDE.md` propio |
| `supabase/` | Migraciones SQL y RLS | `CLAUDE.md` propio |
| `assets/` | SVG originales | `CLAUDE.md` propio |
| `docs/` | Diseño y decisiones | `CLAUDE.md` propio |
| `tools/` | Utilidades del repositorio | `CLAUDE.md` propio |

## Estado del proyecto

Consulta siempre [`docs/ROADMAP.md`](docs/ROADMAP.md) antes de empezar: dice en qué
versión estamos, qué entra y qué deuda consciente arrastra.

| | |
|---|---|
| Última versión cerrada | **v0.2** — economía, producción, combate determinista y captura |
| En curso | v0.3 — esquema, RLS, autoridad, resolución, auth, despliegue e interfaz |
| Tests | `npm test` (motor) **y** `npm run test:security` (RLS + autoridad) deben estar en verde |

**Ya se puede jugar una campaña entera en solitario**: buscar partida sienta rivales
artificiales, se juegan los trece turnos y termina en Reclamación Menor con su reparto de
Ceniza. Es lo que hay que usar para probar el juego mientras no haya gente.

**Lo que todavía NO existe** (no lo des por hecho al leer los documentos, que describen
la v1.0): diplomacia, Núcleo y consagración, anomalías, Sombra, doctrinas activas,
investigación y metaprogresión persistente.

### Todo el arte 3D es un v0

Las mallas de `components/world/` son **marcadores de posición jugables**, no arte final.
La biblia de producción del proyecto de diseño describe la cadena real —blockout,
high-poly, retopo, LOD, UV, bake, PBR, rig— y nada de eso está hecho.

Dan la silueta correcta y la escala correcta, y con eso basta para jugar y para medir. **No
los tomes como referencia de acabado y no construyas encima como si fueran definitivos.**
Cuando entre el arte de verdad habrá además que decidir dónde viven los binarios, porque
hoy la regla es que todo asset es SVG escrito a mano y un binario en `assets/src/` es un
error de build.

---

## Vocabulario canónico

Usa **siempre** estos nombres, en código y en textos. El glosario bilingüe completo está
en [`docs/GAME_DESIGN.md §18`](docs/GAME_DESIGN.md#18-glosario-bilingüe).

| Concepto | Código (inglés) | Texto (español) |
|---|---|---|
| Recursos | `supply` `industry` `intel` `ash` | Suministro, Industria, Intel, Ceniza |
| Armas | `line` `fire` `sky` `shade` | Línea, Fuego, Cielo, Sombra |
| Objetivo | `core`, `attunement` | Núcleo, Consagración |
| Diplomacia | `seal` `breach` `coalition` `transfer` | Sello, Ruptura, Coalición, Transferencia |
| Facción | `faction`, `allegiance`, `schism` | Facción, Juramento, Cisma |
| Fases | `parley` `war` `ashfall` | Parlamento, Guerra, Reposo |

**Cuidado con las colisiones**: `Yunque` es una **doctrina**; la capacidad estratégica de
tier III se llama **Yermo**. `Velo` es una **anomalía**; la doctrina de ocultación se
llama **Mortaja**.

## Lecciones que ya han costado caras

No las repitas. Cada una salió de un fallo real de este repositorio:

1. **Los operadores de bits de JavaScript son de 32 bits con signo.** `x & 0xffffffff`
   devuelve negativos por encima de 2³¹. Para cerrar un entero sin signo, `>>> 0`.
   Este fallo hizo que los mapas salieran con 2 yacimientos por sector en vez de 3.
2. **Un panel que tapa el mapa no es un problema estético.** La hoja de región
   interceptaba los taps y hacía imposible mover a un destino situado debajo.
3. **Mide los objetivos táctiles en píxeles reales, no en unidades de `viewBox`.** Las
   regiones parecían grandes y medían 21 px.
4. **Un test que compara cosas idénticas no prueba nada.** El test de fuga de recursos
   pasaba porque todos los asientos empiezan con los mismos valores; hubo que darles
   cifras únicas para que fuera discriminante.
5. **Un panel flotante sobre el mapa no puede interceptar taps.** No basta con hacerlo
   más pequeño: siempre queda algo debajo. `pointer-events: none` en el panel y `auto`
   solo en sus controles.
6. **Fija la intención de diseño en el test, no la constante.** El rendimiento
   decreciente documentado daba 1,08× donde el diseño pedía 1,55×; el test que
   comprobaba *«doblar el territorio compensa pero no el doble»* lo cazó, uno que
   comprobara `k === 0.045` lo habría bendecido.
7. **`revoke ... from public` no revoca los GRANT explícitos.** Supabase concede
   `all on functions` a `anon` y `authenticated` por defecto, así que hay que nombrarlos.
   `begin_resolution`, que devuelve el estado autoritativo entero, era invocable por
   cualquier jugador con sesión.
8. **Un entorno de pruebas infiel prueba lo que no es.** El shim de Supabase reproduce sus
   permisos por defecto justamente para que los tests de RLS puedan fallar; sin eso
   pasarían por falta de permisos y el agujero saldría en producción.
9. **Un `verify` en verde no significa que el despliegue funcione.** `verify` generaba los
   assets por su cuenta y luego **no compilaba nunca**, así que el build de Vercel se caía
   con `Module not found: './art/generated'` — código generado que está en `.gitignore`.
   Ahora `verify` termina ejecutando `npm run build`, el mismo comando que el despliegue.
10. **Todo consumidor de código generado lo genera él mismo.** `dev`, `build` y `typecheck`
   llevan su `pre*` correspondiente. Recordar ejecutar un paso previo no es una solución:
   la solución es que no haga falta acordarse.
11. **Nada que decida el servidor puede venir en la petición.** `startGame` recibía la
   lista de asientos del llamante: con eso, el anfitrión podía empezar una partida de tres
   con un solo jugador dentro. Ahora la lee de la base de datos.
12. **Un icono sin rótulo no enseña: esconde.** «La interfaz no explica, enseña»
   ([ADR-027](docs/DECISIONS.md#adr-027)) se aplicó como si prohibiera *cualquier* texto y
   la pantalla principal acabó sin una sola palabra: ni nombre, ni facción, ni qué hacía el
   botón. Prohibido está el párrafo que explica un control; **cómo se llama** no es una
   explicación ([ADR-038](docs/DECISIONS.md#adr-038)).
13. **Cambiar el `source` de una fila exige mirar su `check`.** Añadir `source: 'bot'` sin
   tocar `orders_source_check` hacía fallar la resolución **entera** de cualquier partida
   con bots, en su primer turno. No lo cazó ningún test porque ninguno tenía un bot
   resolviendo de verdad: el test que faltaba no era unitario, era jugar una partida.
14. **Un valor por defecto no distingue «elegido» de «nunca preguntado».**
   `faction_id not null default 'vantera'` hacía que toda cuenta fuera de Vantera sin
   haberlo decidido. Hizo falta una columna aparte (`sworn_at`) para poder saberlo
   ([ADR-039](docs/DECISIONS.md#adr-039)).

## Idioma

- **Código, identificadores, nombres de archivo y claves i18n**: inglés.
- **Comentarios, documentación, commits y PRs**: español.
- **Textos visibles**: nunca literales en componentes. Siempre por i18n, ES y EN.

## Git

- Rama de desarrollo actual: `claude/4x-multiplayer-turn-based-pxwbcs`.
- Commits en español, con cuerpo que explique **por qué**, no solo qué.
- No hagas push a `main`.
