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
npm run verify              # ⭐ typecheck + estructura + tests + enlaces. Antes de commit.

npm test                    # Vitest — motor, mapgen, facciones, reglas
npm run test:watch          # TDD
npm run typecheck           # tsc --noEmit en core y web
npm run check:deps          # reglas estructurales del monorepo
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
| En curso | v0.3 — multijugador real (Supabase, RLS, autoridad de servidor) |
| Tests | `npm test` debe seguir en verde: es la definición de que nada se ha roto |

**Lo que todavía NO existe** (no lo des por hecho al leer los documentos, que describen
la v1.0): diplomacia, Núcleo y consagración, anomalías, Sombra, doctrinas activas,
investigación, metaprogresión persistente, i18n, autenticación y base de datos.

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

## Idioma

- **Código, identificadores, nombres de archivo y claves i18n**: inglés.
- **Comentarios, documentación, commits y PRs**: español.
- **Textos visibles**: nunca literales en componentes. Siempre por i18n, ES y EN.

## Git

- Rama de desarrollo actual: `claude/4x-multiplayer-turn-based-pxwbcs`.
- Commits en español, con cuerpo que explique **por qué**, no solo qué.
- No hagas push a `main`.
