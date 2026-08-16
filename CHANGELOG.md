# Changelog

Todos los cambios notables de este proyecto se documentan aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [SemVer](https://semver.org/lang/es/).

`ENGINE_VERSION` y `MAPGEN_VERSION` se versionan por separado
([README](README.md#versionado)).

---

## [Sin publicar] — v0.3 en curso

### Añadido

**Esquema de base de datos y RLS** — `supabase/migrations/`
- Seis migraciones: cuentas y metaprogresión, partidas y asientos, estado y órdenes,
  mensajes y tratados, resultados, y las funciones de lobby y resolución.
- `game_states` con RLS activa y **ninguna política**: nadie lo lee, solo `service_role`
  escribe. Los jugadores leen `player_views`, ya filtradas por asiento.
- Los permisos de columna hacen lo que RLS no puede: `profiles` es editable en nombre e
  idioma, pero no en facción; `game_players` solo en Órdenes Permanentes.
- Canal privado por `smallint[]` con índice GIN en vez del `like` ilustrativo del diseño
  técnico, que dejaba entrar a cualquier asiento cuyo dígito apareciese por casualidad.

**Arnés de Postgres efímero** — `tools/pg/`
- Levanta un clúster con los binarios del sistema, solo en socket unix, le aplica el shim
  de Supabase y las migraciones reales. Sin Docker, sin driver, sin dependencias nuevas.
- `npm run db:up | db:reset | db:down | db:psql`.

**43 tests de seguridad** — `apps/web/tests/security/`
- Incluyen los **siete bloqueantes** del ROADMAP, y un test que enumera todas las
  funciones `security definer` invocables por `authenticated`.

**Órdenes Permanentes y Mando Automático** — `packages/core/src/rules/standing.ts`
- Un asiento ausente **nunca ataca, nunca perjudica a un tercero**. La postura de asalto
  es inalcanzable desde la configuración, se pida como se pida.
- El Mando Automático consolida, recupera lo que le quitaron el turno anterior y produce
  Línea. Está diseñado para no decidir la partida.
- Viven en el motor y no en el servidor: si el servidor inventara órdenes, una partida con
  ausencias no se podría reproducir desde (semilla, órdenes).

**Capa de autoridad** — `apps/web/lib/server/` y `apps/web/app/api/`
- `resolveTurn()`: arrienda, resuelve con el motor y confirma con bloqueo optimista.
  Diez peticiones simultáneas producen **una sola** resolución, verificado.
- Ciclo de vida completo: crear, unirse por código, empezar, enviar órdenes, cron de
  plazos vencidos.
- `POST /api/games`, `/api/games/join`, `/api/games/:id/start`, `/api/games/:id/orders`,
  `/api/cron/resolve-due`. Todos validan con Zod `strictObject`.
- `projectViews()` en el motor: el turno 0 no pasa por `reduce()` y necesitaba las vistas
  iniciales sin duplicar el filtrado de niebla.

**26 tests de la capa de autoridad** contra el Postgres real, entre ellos los criterios de
aceptación de concurrencia, reproducibilidad, ausencias y retención.

**Autenticación e interfaz en red** — `apps/web/app/`
- Enlace mágico por correo, sin contraseñas. Sesión en cookie httpOnly.
- Entrada, lista de partidas, sala de espera con código de invitación y tablero en red.
- Realtime en vez de sondeo: la sala y el tablero se refrescan cuando cambia la base.
- Borrador de órdenes con retardo de 2 s: cerrar la pestaña no cuesta el turno.

**i18n desde el principio** — `apps/web/lib/i18n/`
- Diccionarios `es` / `en` y cero literales visibles en los componentes nuevos.
- Los errores de la API son **códigos**, no frases: el cliente traduce.
- 16 tests: paridad de claves, paridad de parámetros y cobertura del vocabulario.

**Despliegue documentado** — [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Supabase, Vercel, el reloj de `pg_cron` y la checklist de comprobación posterior.
- `0007_schedule.sql` programa el reloj, y se salta solo donde no hay `pg_cron` — el
  arnés local de tests corre sobre un PostgreSQL pelado.

### Corregido

- **`begin_resolution` era invocable por cualquier jugador con sesión**, y devuelve el
  estado autoritativo completo. `revoke all on function ... from public` no anula el
  GRANT explícito que Supabase concede a `anon` y `authenticated` al crear la función:
  hay que nombrar los roles. Lo cazó el shim al reproducir los permisos por defecto de
  Supabase — sin esa fidelidad, el test habría pasado por falta de permisos.
- **`startGame` recibía la lista de asientos del llamante**, así que el anfitrión podía
  empezar una partida de tres con un solo jugador dentro, o asignarles la facción que le
  conviniera. Ahora la lee del estado autoritativo con `lobby_state()`.
- **`startGame` lanzaba una excepción** con los asientos incompletos, devolviendo un 500
  donde el jugador merece «todavía falta gente».

**Identidad visual** — la interfaz pasa de parecer un formulario a parecer un juego
- **Tipografía real**: Archivo Variable (SIL OFL), alojada en el repositorio. Un solo eje
  de anchura da los tres registros —rótulo condensado en versales, texto corrido, cifra
  tabular— sin una segunda familia. [ADR-017](docs/DECISIONS.md#adr-017).
- **24 assets originales** en `assets/src/`: emblema del juego, seis emblemas de facción,
  cuatro recursos, cuatro armas, estados e interfaz. Cuadrícula 24, trazo 2, remates
  cuadrados y uniones en inglete — dibujo técnico, no icon-pack.
- **Pipeline de assets** (`npm run assets:build`): SVG → componentes React tipados +
  manifiesto. **Falla el build** si falta la declaración `original: true`, si el color no
  está en la paleta o si el icono no cabe en la cuadrícula.
- **Galería de assets** en `/dev/gallery` — el requisito §15 del brief. Cuatro paneles:
  escala, silueta, superficies y rejilla.
- **Cromo cartográfico**: retícula de fondo, marcas de registro en las esquinas, reglas
  graduadas y caída de Ceniza en los menús (nunca sobre el mapa).
- **El mapa tiene jerarquía**: el Núcleo domina con su anillo de registro, el Bastión pesa,
  los yacimientos brillan, y el terreno se dibuja con marcas geométricas en vez de glifos
  Unicode que dependían de la fuente del sistema.
- `GameChrome` lo comparten el prototipo local y el tablero en red: la pantalla que se
  puede probar sin base de datos es **la misma** que juega la gente.

### Corregido en el arte

- El emblema de Koldvik parecía una copa de cóctel y la Mortaja de Oshara, una señal de
  peligro. Los cazó la Galería en el panel de escala, que es exactamente para lo que está.
- La caída de Ceniza iba por delante del texto y se leía como suciedad en la pantalla.

**Una sola vista** — [ADR-026](docs/DECISIONS.md#adr-026)
- Al abrir el juego se ve **tu ciudad en cenital** y un botón. Ni portada, ni lista de
  partidas, ni sala de espera, ni formulario. De abrir a jugar: una pulsación.
- Con una campaña en curso se entra directamente en ella.
- `CityView`: planta ortogonal **determinista por cuenta** —la misma cuenta ve siempre la
  misma ciudad—, con los distritos desbloqueados construidos y los demás como cimientos.
  El hub de progresión de ADR-010, hecho imagen.
- Rutas: `/` (la ciudad), `/g/:id` (la campaña) y `/sign-in`. Se retiran la lista de
  partidas, la sala de espera y los endpoints de crear/unirse por código.

**Emparejamiento** — `supabase/migrations/0008_matchmaking.sql`
- Una cola por tamaño y cadencia. Al completarse el grupo la partida **empieza sola**.
- `for update skip locked`: dos búsquedas simultáneas no pueden repartirse al mismo
  jugador ni formar dos partidas de la misma cola.
- Nadie se queda esperando indefinidamente — pasados unos minutos los asientos que falten
  los ocupa el Mando Automático. La mitigación de DISCOVERY P1 pasa a estar en el camino
  principal en vez de ser un plan.
- 17 tests contra el Postgres real, incluidas las dos carreras.

**La interfaz no explica: enseña** — [ADR-027](docs/DECISIONS.md#adr-027)
- El tamaño de partida se elige **dibujando la simetría rotacional real del mapa**: dos
  ciudades enfrentadas, tres en triángulo, cinco en pentágono. La elección enseña la regla.
- La cadencia son marcas de ritmo; la Ceniza, un silo que se llena; un distrito bloqueado,
  unos cimientos; y buscar partida **es ver llegar a las demás ciudades**.
- Cero texto explicativo en la pantalla principal — y cada control con su `aria-label`
  traducido: prescindir de texto es una decisión visual, no una excusa de accesibilidad.

### Pendiente de verificar

La interfaz compila y pasa el typecheck, pero **no se ha ejecutado contra un Supabase
real**: sin credenciales no hay auth, ni Realtime, ni sesión. Queda pasar la checklist de
[DEPLOYMENT §5](docs/DEPLOYMENT.md#5-comprobación-posterior) antes de dar v0.3 por cerrada.

### Decisiones

- [ADR-023](docs/DECISIONS.md#adr-023) — políticas RLS a través de funciones
  `security definer`, para evitar la recursión de `game_players` consigo misma.
- [ADR-024](docs/DECISIONS.md#adr-024) — tests de RLS contra un Postgres efímero real.
- [ADR-025](docs/DECISIONS.md#adr-025) — la resolución se parte en arrendar y confirmar.

---

## [0.2.0] — 2026-08-15 — Núcleo jugable

Una campaña de 12 turnos ya se juega entera con sustancia: economía, producción, combate
determinista y captura. **163 tests en verde.**

### Añadido

**Combate determinista** — `rules/combat.ts` (la fórmula) y `rules/battle.ts` (el turno)
- Rueda Fuego > Línea > Cielo > Fuego, con bonificación **continua**: cada arma rinde en
  proporción a cuánto de lo que tiene enfrente contrarresta, sin escalones.
- Terreno, posturas (Asalto / Firme / Pantalla), fortificación y penalización por falta
  de suministro.
- Resolución generalizada a **2 o más bandos**: gana quien más potencia tenga contra la
  suma de los demás; un empate exacto destruye a todos y deja la región disputada.
  Nunca se desempata al azar.
- **Pantalla** se retira a una región amiga adyacente dejando el 50 % en vez de morir.
- **Apoyo de Fuego**: una fuerza en Firme presta su Fuego a una región adyacente; suma
  potencia y no recibe bajas.
- **`previewAttack()`**: la previsualización se calcula con la MISMA función que resuelve
  el turno, así que no puede diferir. Verificado sobre 6 terrenos × 3 posturas × 3
  niveles de fortificación.

**Economía** — `rules/economy.ts`
- Renta por tipo de región con **rendimiento decreciente** a partir de la parte justa
  (el tamaño de un sector).
- **Suministro proporcional a la distancia** al Bastión. Cuando no alcanza, se abastece
  primero lo más cercano: las expediciones lejanas son las primeras en quedarse sin
  abastecer, y una fuerza sin suministro pierde un 15 % de potencia acumulativo.
- Topes de acumulación para los tres recursos ordinarios; la Ceniza no tiene tope.

**Producción**
- Línea, Fuego, Cielo, fortificación (máx. 2 niveles) y puentes, en Bastión o Urbana
  propia. Sin colas ni temporizadores: una decisión, un resultado, el mismo turno.
- Lo producido se fusiona con la fuerza que ya esté allí, así que el límite de fuerzas
  no se puede burlar acumulando unidades de tamaño 1.

**Agua y puentes**
- Solo Cielo cruza el agua sin Puente. El agua divide el mapa de verdad.

**Interfaz**
- Panel de previsualización de combate con potencias, resultado y bajas previstas.
- Panel de producción y registro del turno anterior, **ya filtrado por el motor**.
- Aviso explícito de incertidumbre cuando hay fuerzas enemigas ocultas: el resultado es
  exacto *dada tu información*, y eso es una enseñanza del juego, no letra pequeña.

### Corregido

- **La constante de rendimiento decreciente estaba mal.** El GDD pedía que doblar el
  territorio diera ~1,55× de renta; con el `0.045` documentado daba **1,08×**, es decir,
  expandirse dejaba de compensar — el error contrario al que la regla pretendía evitar.
  Corregida a `0.015`. Lo detectó el test que fija la **intención** de diseño en vez de
  la constante.
- **Un panel flotante no puede interceptar taps.** Reducir la hoja de región a una barra
  de 76 px no bastó: seguía habiendo regiones alcanzables debajo que no se podían tocar.
  La solución real es `pointer-events: none` en el panel y `auto` solo en sus controles.
- **Destinos alcanzables fuera de pantalla.** Al seleccionar una fuerza, el mapa encuadra
  ahora su vecindario: resaltar una opción que no se puede tocar es peor que no ofrecerla.
- **Validación y aplicación discrepaban en la producción.** Pedir 9 niveles de
  fortificación cobraba 9 y aplicaba 2. Ahora la cantidad se recorta antes de cobrar.

### Cambiado

- `previewAttack` vive en `@gdc/core`, no en el cliente: derivar bandos de combate desde
  una `PlayerView` es lógica de reglas, y duplicarla en el cliente obligaría al servidor
  y al simulador a reimplementarla.
- `Orders.production` es opcional; su ausencia significa «no produzco este turno».
- `ENGINE_VERSION` sube a `0.2.0`.

### Notas

- Sin alianzas todavía: dos asientos en la misma región siempre combaten. La condición
  está aislada en `battle.ts` para que consultar tratados en v0.4 sea un cambio local.
- **La mayoría de los combates son encuentros simultáneos**, donde la previsualización no
  puede existir porque nadie está allí todavía. Solo aparece al atacar una región ocupada
  y visible, lo que en una campaña normal ocurre hacia el turno 8. Conviene tenerlo
  presente al escribir el tutorial.

---

## [0.1.0] — 2026-08-15 — Prototipo

Primer código del proyecto. Motor determinista, generador de mapas, sistema de facciones
y un prototipo web jugable en local. **114 tests en verde.**

### Añadido

**Motor — `@gdc/core`** (TypeScript puro, cero dependencias de runtime)
- Tipos del estado de juego, órdenes, eventos y vista de jugador.
- PRNG **xoshiro128\*\*** determinista con cursor persistido en el estado.
- Serialización canónica y checksum FNV-1a de 64 bits, idénticos en cualquier motor de JS.
- Tabla de balance como **datos**, no código, para que el simulador pueda barrerla.
- `reduce(state, orders, ctx)`: validación contra el estado autoritativo, movimiento
  simultáneo con detección de cruces, división y fusión de fuerzas, control territorial,
  visibilidad por asiento y log de eventos ya filtrado.
- `createGame()`: partidas de 2, 3 y 5 jugadores con reparto inicial idéntico.

**Generación de mapas**
- Esqueleto con simetría rotacional C<sub>n</sub>: 45 · 55 · 96 regiones para 2 · 3 · 5
  jugadores. Todos los Bastiones a 4 saltos del Núcleo, grado 3–5, sin callejones.
- Decoración de un sector con inventario fijo y replicación por rotación: **todos los
  sectores tienen exactamente el mismo contenido**, que es lo que hace la equidad
  demostrable en vez de estimada.
- Restricciones locales: ningún yacimiento junto a un Bastión, sin aguas adyacentes.

**Sistema de facciones ligado a la cuenta** — [FACTIONS.md](docs/FACTIONS.md), ADR-021
- Seis ciudades signatarias con doctrina de origen, doctrinas y anomalías afines.
- Economía de desbloqueo: la afinidad **solo abarata** (×0,6), nunca encarece.
- **Invariante del techo**: dos cuentas al máximo de facciones distintas tienen conjuntos
  de opciones idénticos. Verificado por test, no prometido en un documento.
- Cisma (cambio de facción) que conserva todos los desbloqueos; el primero es gratuito.
- **Concordia**: dos jugadores de la misma facción quedan marcados públicamente, y con
  **cero efecto mecánico** — verificado comparando checksums de partidas con y sin ella.

**Prototipo web — `@gdc/web`** (Next.js 16, React 19, Tailwind v4)
- Mapa en **SVG accesible**: cada región es un elemento enfocable con `aria-label`
  descriptivo; el mapa es navegable con teclado y con lector de pantalla.
- Zoom y desplazamiento por `transform` manipulado por ref: sin re-render durante el gesto.
- Hot seat: cada asiento redacta órdenes, se pasa el dispositivo, y el turno se resuelve
  **simultáneamente** con el mismo `reduce()` que usará el servidor.
- Jugadores distinguibles por **color y trama**, nunca solo por color.

**Infraestructura**
- `CLAUDE.md` en la raíz y en cada directorio con sus reglas locales.
- `npm run check:deps`: verifica que `core` no gane dependencias, que `factions/` no vea
  `balance/` y que ningún componente de cliente toque el servidor.
- `npm run verify`: typecheck + estructura + tests + enlaces de documentación.

### Corregido

- **Fallo del PRNG que rompía la equidad de los mapas.** `nextUint32()` cerraba con
  `& 0xffffffff`; en JavaScript los operadores de bits son de 32 bits **con signo**, así
  que devolvía negativos por encima de 2³¹. `shuffle` indexaba en negativo, dejaba huecos
  en el array y los mapas salían con **2 yacimientos por sector en vez de 3**. Lo detectó
  el test «todos los sectores tienen el mismo inventario».
- **La hoja de región bloqueaba el movimiento en móvil.** Ocupaba el 48 % inferior e
  interceptaba los taps, así que no se podía tocar un destino situado debajo. Al elegir
  destino se muestra ahora una barra compacta que deja el mapa entero utilizable.
- **Zoom inicial insuficiente.** A escala 1, las regiones medían 21 px en 360 px de
  ancho, menos de la mitad del mínimo táctil. El zoom se calcula del ancho real del
  viewport para que una región mida ~52 px.

### Cambiado

- **Renombrados dos elementos que colisionaban.** La doctrina de ocultación pasa de
  *Velo* a **Mortaja** (*Velo* ya era una anomalía), y la capacidad estratégica de tier
  III pasa de *Yunque* a **Yermo** (*Yunque* ya era una doctrina).
- Saranth pierde afinidad con Mortaja y gana afinidad con El Libro, para que cada
  doctrina sea afín a exactamente dos facciones. Lo detectó un test de integridad del
  catálogo.
- Dimensiones de mapa documentadas ajustadas a las implementadas (4 anillos en los tres
  conteos de jugadores).
- `@gdc/core` se consume como **fuente TypeScript sin compilar** (ADR-022): un solo
  artefacto, imposible que el compilado diverja del fuente.

### Notas

- v0.1 **no tiene combate**: dos asientos con Línea en la misma región dejan la región
  disputada. El combate entra en v0.2 como una etapa nueva del pipeline, sin tocar las
  demás.
- Los textos visibles están en español dentro de `apps/web/lib/theme.ts`, centralizados a
  propósito para que el paso a next-intl en v0.9 sea mecánico.

---

## [0.0.0] — 2026-08-15 — Fase 0 y Fase 1: diseño

Primera entrega del proyecto. **Sin código de juego**: la Fase 0 (Discovery) y la Fase 1
(documentación de diseño) completas, conforme al procedimiento de trabajo acordado.

### Añadido

**Fase 0 — Discovery**
- `docs/DISCOVERY.md` — análisis crítico del brief: 7 contradicciones detectadas y
  resueltas, 21 riesgos catalogados con mitigación, 9 sistemas recortados con
  justificación, y las 3 decisiones bloqueantes aisladas.

**Fase 1 — Documentación de diseño**
- `README.md` — documento principal: concepto, pitch, core loop, features, arquitectura,
  stack, instalación, variables de entorno, base de datos, estructura, scripts, testing,
  desarrollo local, deploy, coste, roadmap, versionado, estado y decisiones.
- `docs/GAME_DESIGN.md` — GDD: pilares, lore original, recursos, territorio, combate
  determinista, producción, Sombra, anomalías, investigación, doctrinas, el Núcleo y la
  victoria, derrota, orden de resolución, balance, tutorial y glosario bilingüe.
- `docs/TECHNICAL_DESIGN.md` — TDD: arquitectura, motor, determinismo, esquema de base de
  datos, RLS y niebla de guerra, API, concurrencia, tiempo real, frontend, modelo de
  amenazas, observabilidad, rendimiento, versionado y CI/CD.
- `docs/MAP_GENERATION.md` — generación procedural con simetría C<sub>n</sub>: tubería
  completa, pseudocódigo, 8 métricas de equidad, 4 de interés, sistema de puntuación,
  informe de equidad y tests.
- `docs/DIPLOMACY.md` — las 3 primitivas vinculantes, ofertas estructuradas, el Sello y
  el precio de la traición, depósitos en garantía, información como moneda, reputación y
  Coalición.
- `docs/METAPROGRESSION.md` — progresión permanente vs. de campaña, la regla de oro
  verificada por CI, moneda y curva, desbloqueos y la Ciudad.
- `docs/MULTIPLAYER.md` — turnos simultáneos, cadencias, ciclo de vida, autoridad,
  ausencias y Mando Automático, reconexión, notificaciones, escala y casos límite.
- `docs/UX_MOBILE.md` — principios mobile-first, gestos, wireframes de móvil y
  escritorio, diplomacia en móvil, accesibilidad, estados y feedback, dirección visual y
  checklist de QA.
- `docs/ASSET_PIPELINE.md` — assets como SVG en el repositorio, dirección artística,
  paleta, inventario, convención de nombres, Galería de Assets y criterios de aprobación.
- `docs/TESTING_AND_SIMULATION.md` — pirámide de tests, los 3 tests bloqueantes,
  simulador de balance, perfiles de estrategia, métricas, barrido de constantes y tests
  de emergencia diplomática.
- `docs/ROADMAP.md` — v0.1 → v1.0 con alcance, criterios de aceptación y riesgos por
  versión; definición de hecho.
- `docs/DECISIONS.md` — 20 decisiones arquitectónicas registradas (17 aceptadas,
  3 pendientes o propuestas).
- `tools/docs-pdf/` — generación reproducible del PDF de documentación con portada,
  índice y paginación, sin herramientas de pago.

### Decisiones estructurales

- **ADR-002** — El mapa es un grafo con simetría C<sub>n</sub>, no una rejilla. Es la
  única forma de garantizar equidad exacta con 5 jugadores y de que el juego quepa en un
  teléfono.
- **ADR-003** — Combate determinista, sin dados. Permite prometer resultados verificables,
  que es el mecanismo del que vive la diplomacia.
- **ADR-001** — Un solo motor compartido por servidor, cliente y simulador.
- **ADR-006** — Niebla de guerra real mediante `player_views` prefiltradas.
- **ADR-009** — La metaprogresión solo añade opciones, nunca números.

### Pendiente

- Confirmar las 3 decisiones bloqueantes: cadencia por defecto (ADR-018), alcance de la
  Ciudad (ADR-010, ya propuesto como aceptado) y visibilidad de la reputación (ADR-019).
- ADR-016 (licencia) y ADR-017 (tipografía) siguen abiertas; ninguna bloquea la v0.1.
