# CLAUDE.md — `packages/core`

**Este paquete es la fuente de la verdad del juego.** Servidor, cliente y simulador
ejecutan exactamente este código. Un fallo aquí se manifiesta como desincronización en
producción.

---

## Reglas absolutas

### Cero dependencias de runtime

`package.json` **no puede tener** una sección `dependencies`. Nunca. Ni Zod, ni lodash,
ni nada. Si necesitas algo, escríbelo aquí en TypeScript puro.

`devDependencies` sí (vitest, typescript).

### Cero I/O

Nada de `fs`, `fetch`, `process.env`, `console.log` en la ruta de reglas. El motor recibe
datos y devuelve datos.

### Determinismo estricto

| Prohibido | Sustituto |
|---|---|
| `Math.random()` | `makeRng(seed, cursor)` — xoshiro128\*\* |
| `Date.now()`, `new Date()` | `ctx.now`, inyectado por quien llama |
| `Object.keys(x)` sin ordenar | `Object.keys(x).sort()` |
| `.sort()` sin comparador total | comparador con desempate por `id` |
| `Set` / `Map` en valores de salida | arrays ordenados |
| Comparar floats con `===` | `round4()` antes de comparar |

**El cursor del PRNG forma parte del estado** (`state.rngCursor`). Sin eso, reproducir una
partida desde `(seed, órdenes)` sería imposible.

Los desempates **nunca** son aleatorios: siempre por número de asiento ascendente, y
después por `id`.

### Inmutabilidad

`reduce()` no modifica el estado de entrada. En tests se congela en profundidad para
verificarlo. Devuelve estado nuevo.

### Totalidad

`reduce()` **nunca lanza** por una orden inválida: la descarta y emite un evento
`ORDER_REJECTED`. Una orden mala de un jugador no puede bloquear la partida de los otros
cuatro.

---

## Organización

```
src/
├── types/       GameState, Force, Region, Orders, GameEvent, PlayerView
├── rng/         xoshiro128** determinista
├── balance/     constantes como DATOS (el simulador las barre) — no lógica
├── factions/    catálogo de facciones + reglas de desbloqueo (nivel de cuenta)
├── mapgen/      esqueleto C_n · decoración · disposición · teselación · generación
├── rules/       reduce() = etapas puras encadenadas
└── util/        JSON canónico y checksum
```

### `reduce()` es una tubería de etapas

Cada etapa del [orden de resolución](../../docs/GAME_DESIGN.md#15-orden-de-resolución-del-turno)
es **una función pura**. Añadir una regla es añadir o modificar **una** etapa, nunca tocar
las demás. No metas lógica de una etapa dentro de otra.

### `balance/constants.ts` son datos, no código

El simulador barre esos valores para calibrar. Si escribes un número mágico dentro de
`rules/`, lo has sacado del alcance del simulador. **Todo número que afecte al balance va
en `BALANCE`.**

### `factions/` no puede importar `balance/`

Regla verificada por test. Las facciones y los desbloqueos solo añaden **opciones**; si
pudieran leer las constantes, tarde o temprano alguien las modificaría.

---

## Versionado

- `ENGINE_VERSION` sube cuando cambia una regla que altere `reduce()`.
- `MAPGEN_VERSION` sube cuando la misma semilla deja de dar el mismo mapa.

**Una partida en curso nunca cambia de motor.** Si subes una versión, las partidas
existentes deben seguir resolviéndose igual.

---

## Tests

```bash
npm test -w @gdc/core
npm test -w @gdc/core -- --watch
```

Cobertura exigida en `src/rules/`: ≥ 90 % de ramas.

Al tocar reglas, comprueba siempre:

```
□ Determinismo: misma entrada ⇒ mismo checksum
□ Pureza: el estado de entrada no se modifica
□ Casos límite: 0, vacío, empate exacto, orden imposible
□ Desempates: por asiento, nunca al azar
□ Sin fugas: PlayerView no contiene nada que ese asiento no deba ver
```

El test de fugas de `PlayerView` es el más importante del paquete: recorre la vista
serializada entera buscando valores secretos. Si añades un campo a `PlayerView`, ese test
te dirá si acabas de filtrar información.

---

## Estado actual

**v0.2 cerrada, v0.3 en curso.** Implementado: tipos, RNG, balance, facciones, mapgen
(esqueleto + decoración + disposición), `reduce()` con validación, movimiento, **combate
determinista**, control, **economía**, **producción**, visibilidad, eventos y cierre, y
—desde v0.3— **Órdenes Permanentes y Mando Automático**.

Las órdenes de un asiento ausente se generan **aquí y no en el servidor**: si el servidor
las inventara, una partida con ausencias no se podría reproducir desde (semilla, órdenes)
y el criterio de auditabilidad de v0.3 se caería.

**Todavía no** (ver [ROADMAP](../../docs/ROADMAP.md)): diplomacia, Núcleo y consagración,
anomalías, Sombra, doctrinas activas, investigación, perturbación y evaluación de mapas.

### Dónde va cada cosa

| Módulo | Responsabilidad |
|---|---|
| `rules/combat.ts` | La **fórmula**: pura, sin estado. La comparten resolución y previsualización — por eso no pueden diferir. |
| `rules/battle.ts` | La **integración con el turno**: quién lucha con quién, apoyo de Fuego, retiradas. |
| `rules/economy.ts` | Renta, suministro y producción. |
| `rules/movement.ts` | Validación de todas las órdenes + movimiento simultáneo. |
| `rules/standing.ts` | Órdenes Permanentes y Mando Automático. **La ausencia nunca daña a un tercero.** |
| `rules/views.ts` | Proyección de vistas sin resolver: la necesita el turno 0, que no pasa por `reduce()`. |
| `mapgen/skeleton.ts` | Nodos, radios por anillo y **adyacencia por distancia** ([ADR-046](../../docs/DECISIONS.md#adr-046)). |
| `mapgen/layout.ts` | Las **provincias**: un hexágono regular por región ([ADR-046](../../docs/DECISIONS.md#adr-046)). |

**Cada provincia es un hexágono regular del mismo tamaño**, y eso ata tres cosas que hay
que tocar juntas o no tocar ninguna:

| | Qué es | Dónde |
|---|---|---|
| Recuentos de anillo | Cuántos nodos por anillo y sector | `SECTOR_SPEC` |
| Radios de anillo | A qué distancia va cada anillo, en unidades de paso | `RING_RADII` |
| Alcance de vecindad | Hasta dónde dos provincias son vecinas | `LINK_RANGE` |

Para que hexágonos iguales quepan unos junto a otros, lo uniforme tiene que ser la
**distancia entre vecinos** — no el área de la banda, que era el criterio anterior. Los
recuentos y los radios salen de minimizar la dispersión de esa distancia; hoy está en
×1,16–×1,30. Si cambias uno, recalcula el otro y vuelve a medir.

La escala **se mide, no se supone**: `buildSkeleton` busca el par de vecinos más apretado
del mapa ya construido y estira todo hasta que esos dos hexágonos encajan lado con lado. Por
eso `CELL_RADIUS` se puede cambiar sin retocar nada más.

`layout.ts` parece cosa de la interfaz y no lo es. La adyacencia **es** geométrica: dos
provincias son vecinas si sus centros están a menos de `LINK_RANGE`. De ahí sale la
propiedad que impide que el tablero mienta, y que tiene test:

> el par de provincias NO adyacentes más cercano está más lejos que el par adyacente más
> lejano. **Lo que parece vecino, lo es.**

Si la geometría viviera en `apps/web` y la adyacencia aquí, el día que una de las dos cambie
el mapa ofrecería movimientos que `reduce()` rechaza. Misma razón que `previewAttack`.

Si una regla nueva necesita estado del turno, va en `battle.ts` o en su etapa propia,
**nunca** dentro de `combat.ts`: ahí se rompería la previsualización.
