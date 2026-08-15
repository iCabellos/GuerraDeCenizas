# Changelog

Todos los cambios notables de este proyecto se documentan aquí.

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).
Este proyecto sigue [SemVer](https://semver.org/lang/es/).

`ENGINE_VERSION` y `MAPGEN_VERSION` se versionan por separado
([README](README.md#versionado)).

---

## [Sin publicar]

### Añadido
- Nada todavía. El desarrollo de la v0.1 aún no ha comenzado.

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
