# Changelog

Todos los cambios notables de este proyecto se documentan aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [SemVer](https://semver.org/lang/es/).

`ENGINE_VERSION` y `MAPGEN_VERSION` se versionan por separado
([README](README.md#versionado)).

---

## [Sin publicar]

Nada pendiente. Siguiente: v0.2 — recursos, producción, combate y captura.

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
