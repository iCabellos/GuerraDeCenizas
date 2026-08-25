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
├── mapgen/      esqueleto C_n · decoración · disposición · generación
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

### El refactor RTS está dentro, y toca este paquete más que a ningún otro

Cinco módulos nuevos (`zones`, `colossus`, `extraction`, `buildings`, `research`), seis
etapas más en el pipeline, dos recursos más y 7 anillos por sector en vez de 4.

**Antes de tocar `rules/`, lee
[RTS_ZONES_REFACTOR §19](../../docs/RTS_ZONES_REFACTOR.md#19-lo-que-cambió-al-construirlo).**
Y tres cosas que hay que saber sí o sí:

1. **Los Colosos van en su propio array, no en `Force`.** Hacer `Force.seat` anulable para
   meter neutrales obliga a revisar `control.ts`, `economy.ts`, `views.ts` y todos los
   desempates por asiento del paquete. Un array aparte con su etapa cuesta 40 líneas y no
   toca nada. Si algún día metes otro actor no-jugador, hazlo igual.
2. **`combat.ts` sigue sin ver el turno.** El multiplicador de grado puede entrar ahí
   porque es un dato del asiento; cualquier cosa que dependa del turno rompe que el
   pronóstico coincida exactamente con el resultado. Eso va en `battle.ts`.
3. **La zona es una función del anillo**, y por eso la equidad C_n sale gratis
   ([ADR-041](../../docs/DECISIONS.md#adr-041)). Si alguna vez alguien propone derivar las
   zonas de la distancia al centro, es que no ha leído por qué la rotación conserva el
   anillo.

Y tres reglas que parecen detalles y sostienen el sistema entero ([ADR-047](../../docs/DECISIONS.md#adr-047)):

```
□ El Coloso vive en gate.OUTER. En gate.inner nadie puede llegar a él, la Puerta no se
  abre nunca y la partida es imposible de ganar. Pasó, y lo cazó jugar 24 turnos
□ Ante un Coloso vivo NO hay combate entre asientos (battle.ts). Sin la tregua, dos
  asientos que se juntan para matarlo se aniquilan entre ellos primero
□ Todo Bastión nace con Mena y Extractora. El material solo sale de Extractoras y las
  Extractoras cuestan material: sin ese suelo, la economía se pierde y no vuelve
```

**El Grado vive en la producción, no en el combate.** Multiplica lo que nace y solo lo que
nace: si se aplicara al pelear, subir de grado mejoraría también a las tropas ya
desplegadas. Como efecto secundario, la rueda de armas conserva su signo para todo par de
grados **por construcción** — el grado nunca llega a `combat.ts`.

**El checksum de un estado se calcula con `stateChecksum`, no con `checksum`.** El mapa
entra por su propio checksum en vez de volver a serializarse entero cada turno: era el
80 % del coste de `reduce()`. Mezclar las dos funciones no detecta una divergencia,
inventa una — y ya rompió el test de reproducibilidad una vez.

### Dónde va cada cosa

| Módulo | Responsabilidad |
|---|---|
| `rules/combat.ts` | La **fórmula**: pura, sin estado. La comparten resolución y previsualización — por eso no pueden diferir. |
| `rules/battle.ts` | La **integración con el turno**: quién lucha con quién, apoyo de Fuego, retiradas. |
| `rules/economy.ts` | Renta, suministro y producción. |
| `rules/movement.ts` | Validación de todas las órdenes + movimiento simultáneo. |
| `rules/standing.ts` | Órdenes Permanentes y Mando Automático. **La ausencia nunca daña a un tercero.** |
| `rules/views.ts` | Proyección de vistas sin resolver: la necesita el turno 0, que no pasa por `reduce()`. |
| `rules/zones.ts` | Zonas, Cercos y Puertas. La zona es **función del anillo**, y de ahí sale que la equidad C_n no cueste nada. |
| `rules/colossus.ts` | Los guardianes. Array propio, **nunca** dentro de `Force`. |
| `rules/extraction.ts` | Menas, Extractoras, almacén por región, logística y Botín. |
| `rules/buildings.ts` | Cinco edificios, tres niveles, obras que tardan y captura con un nivel menos. |
| `rules/research.ts` | Grados y Políticas. **No puede importar `factions/`**: el techo no depende de quién juega. |

Si una regla nueva necesita estado del turno, va en `battle.ts` o en su etapa propia,
**nunca** dentro de `combat.ts`: ahí se rompería la previsualización.
