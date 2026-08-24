# Generación procedural de mapas

> **Versión:** 1.0 · `MAPGEN_VERSION = "1.0.0"`
> Implementación: `packages/core/src/mapgen/`
> Objetivo: mapas **aleatorios, interesantes y demostrablemente justos** para 2, 3 y 5
> jugadores.

---

## 1. El problema, y por qué la solución habitual no sirve

El enfoque clásico de un 4X es: *generar terreno con ruido → colocar jugadores → medir →
regenerar si está mal*. Tiene dos fallos fatales para este proyecto.

**Fallo 1 — Con 5 jugadores, la equidad por rejilla es imposible.**
Ninguna teselación regular del plano (cuadrada, hexagonal o triangular) admite simetría
rotacional de orden 5. Es un resultado cristalográfico, no una limitación de esfuerzo.
Con una rejilla, la equidad para 5 jugadores solo puede *aproximarse* con heurísticas, y
cada heurística es una superficie donde el mapa puede seguir siendo injusto de formas
que el evaluador no mida.

**Fallo 2 — Una rejilla no cabe en un móvil.**
Un 4X típico usa 1 000–10 000 casillas. En 360 px de ancho, eso son objetivos táctiles de
4 px. Reducir la rejilla a un tamaño tocable la vuelve trivial estratégicamente.

### La decisión

> **El mapa es un grafo de 45–95 regiones, construido como UN sector generado y
> replicado n veces por rotación C<sub>n</sub>.**

| Se resuelve | Cómo |
|---|---|
| Equidad para n = 2, 3, 5 | **Exacta por construcción.** El grupo cíclico C<sub>n</sub> existe para todo n. El evaluador no busca la equidad: solo **acota cuánto la rompe la variación**. |
| Móvil | 45–95 regiones ⇒ objetivos táctiles de 44–90 px en 360 px de ancho |
| Rendimiento | Un grafo pequeño se renderiza en SVG sin esfuerzo |
| Assets | Regiones como polígonos generados; sin tilesets, sin atlas |
| «Chokepoints» y otras métricas | Son propiedades **de grafo** (cortes mínimos, centralidad) — computables exactamente, no estimables |

→ [ADR-002](DECISIONS.md)

---

## 2. Anatomía del mapa

```
                          ┌─────────┐
                          │ NÚCLEO  │  ← centro, único, equidistante por construcción
                          └────┬────┘
              ┌────────────────┼────────────────┐
        ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
        │ Sector 0  │    │ Sector 1  │    │ Sector 2  │  ← n sectores idénticos
        │  (asiento │    │           │    │           │     por rotación
        │      0)   │    │           │    │           │
        │  Anillo 1 │    │  Anillo 1 │    │  Anillo 1 │  ← interior, contesta el Núcleo
        │  Anillo 2 │    │  Anillo 2 │    │  Anillo 2 │  ← medio, yacimientos
        │  Anillo 3 │    │  Anillo 3 │    │  Anillo 3 │  ← exterior, Bastión
        └───────────┘    └───────────┘    └───────────┘
              └───── aristas inter-sector ─────┘
                  (también rotacionalmente consistentes)
```

### 2.1 Dimensiones

| Jugadores | Anillos (nodos/sector) | Regiones/sector | Total | Aristas | Bastión a Núcleo | Grado |
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| 2 | 4 · 5 · 6 · 7 | 22 | **45** | 88 | 4 saltos | 3–5 |
| 3 | 3 · 4 · 5 · 6 | 18 | **55** | 108 | 4 saltos | 3–5 |
| 5 | 3 · 4 · 6 · 6 | 19 | **96** | 190 | 4 saltos | 3–5 |

`total = n × regiones_por_sector + 1`

Los anillos **crecen hacia fuera** por construcción: un anillo exterior con menos nodos
que uno interior desperdiciaría el radio y produciría una disposición confusa.
Valores verificados en `tests/mapgen.test.ts`; cualquier cambio en `SECTOR_SPEC` que los
altere hará fallar los invariantes del esqueleto.

Los tamaños salen de dos restricciones: legibilidad en 360 px (≤ ~100 regiones) y
suficiente espacio de maniobra para 12 turnos con 6 fuerzas (≥ ~40 regiones).

### 2.2 Composición fija de un sector

Todo sector contiene **exactamente** lo mismo (varía dónde, no cuánto):

| Contenido | Cantidad | Anillo |
|---|:-:|---|
| Bastión | 1 | exterior |
| Yacimientos (✦) | 3 | 2 en medio, 1 en interior (contestado) |
| Regiones urbanas | 3 | medio y exterior |
| Elevaciones | 2–3 | libre |
| Agua / delta | 1–2 | libre |
| Bosque | 2–3 | libre |
| Llanura | resto | libre |

---

## 3. La tubería

```
   semilla (uint32)
        │
        ▼
 ┌──────────────────────┐
 │ 1. ESQUELETO         │  Anillos, nodos, aristas intra-sector.
 │    determinista      │  Idéntico para toda semilla y n dado.
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 2. DECORACIÓN        │  Terrenos y yacimientos EN UN SECTOR.
 │    aleatoria         │  Se replica por rotación → n sectores idénticos.
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 3. ROTACIÓN DE       │  Cada sector recibe un PERFIL económico distinto
 │    PERFILES          │  (rico en 2 de 4 recursos). Suma global equilibrada.
 └──────────┬───────────┘   ← esto es lo que FUERZA el comercio
            ▼
 ┌──────────────────────┐
 │ 4. PERTURBACIÓN      │  ε mutaciones acotadas para romper el efecto espejo.
 │    acotada           │  Cada mutación tiene coste; presupuesto total limitado.
 └──────────┬───────────┘
            ▼
 ┌──────────────────────┐
 │ 5. EVALUACIÓN        │  8 métricas de equidad + 4 de interés.
 └──────────┬───────────┘
            ▼
      ¿F ≤ τ  y  I ≥ ι?
        │           │
       sí          no ──► deshacer mutaciones y reintentar (≤ 200)
        ▼                 ──► si se agota: emitir mapa simétrico puro (siempre válido)
   ┌─────────┐
   │ 6. MAPA │  + informe de equidad adjunto al estado
   └─────────┘
```

**La propiedad clave:** el paso 1–3 produce un mapa **perfectamente justo por
construcción**. Solo el paso 4 puede romperlo. Por tanto la evaluación no tiene que
*encontrar* equidad en un mapa arbitrario —problema difícil y frágil—; solo tiene que
**acotar el daño de un conjunto pequeño y conocido de mutaciones**. Es un problema
tratable y demostrable.

Y hay siempre una salida garantizada: si la perturbación no encuentra un mapa aceptable,
se emite el mapa simétrico puro, que es válido por definición. **El generador nunca
falla.**

---

## 4. Paso 1 — Esqueleto

```ts
function buildSkeleton(n: PlayerCount): Skeleton {
  const spec  = SECTOR_SPEC[n];          // { rings: [4,7,8], ... }
  const nodes: Node[] = [{ id: 0, ring: 0, sector: -1, slot: 0 }];  // Núcleo

  // Nodos: para cada sector, para cada anillo, para cada posición
  for (let s = 0; s < n; s++)
    for (let r = 0; r < spec.rings.length; r++)
      for (let k = 0; k < spec.rings[r]; k++)
        nodes.push({ id: nodes.length, ring: r + 1, sector: s, slot: k });

  const edges = new EdgeSet();

  // (a) Anillo interior ↔ Núcleo
  for (const v of nodesAt(nodes, 1)) edges.add(0, v.id);

  // (b) Aristas intra-sector: se definen UNA VEZ en el sector 0 y se rotan
  for (const [aSlot, bSlot, ringA, ringB] of spec.intraTemplate)
    for (let s = 0; s < n; s++)
      edges.add(idOf(s, ringA, aSlot), idOf(s, ringB, bSlot));

  // (c) Aristas inter-sector: siempre entre el sector s y el s+1 (mod n),
  //     con el mismo patrón ⇒ la rotación se conserva
  for (const [ring, slotA, slotB] of spec.interTemplate)
    for (let s = 0; s < n; s++)
      edges.add(idOf(s, ring, slotA), idOf((s + 1) % n, ring, slotB));

  return { nodes, edges: edges.toArray(), rotate: makeRotator(n, spec) };
}
```

`rotate(nodeId, k)` devuelve el nodo equivalente k sectores más allá. Es una biyección, y
sobre ella se apoya toda la garantía de equidad.

### 4.1 Invariantes verificados por test

```
∀ k ∈ [0,n):  rotate(·,k) es un automorfismo del grafo
∀ p,q:        dist(bastión(p), Núcleo) == dist(bastión(q), Núcleo)
∀ p:          el grafo es conexo desde bastión(p) a todo nodo
∀ p,q≠p:      dist(bastión(p), bastión(q)) forma el mismo multiconjunto para todo p
∀ v ≠ Núcleo: grado(v) ∈ [2,5]        (sin callejones, sin nodos hub)
```

El tercer invariante (multiconjunto de distancias entre bastiones) es el que garantiza
que, con 5 jugadores, **nadie tiene «peores vecinos» que otro**: cada uno tiene dos
vecinos cercanos y dos lejanos, siempre.

### 4.2 El reparto por área

Los anillos **no** se separan por un hueco fijo: a cada uno se le da exactamente la banda
que necesita para que todas sus provincias midan lo mismo
([ADR-043](DECISIONS.md#adr-043)).

```
A          = π · CELL_RADIUS²                  ← la provincia tipo
b[r+1]²    = b[r]² + CELL_RADIUS² · n(r)       ← la banda del anillo r
radio(r)   = √((b[r]² + b[r+1]²) / 2)          ← el nodo, en la mitad por ÁREA
extent     = b[último]                         ← el mundo ES el mapa
```

El nodo va en el radio que parte su banda en dos mitades de igual superficie, no en el
punto medio: con anillos anchos el medio geométrico deja más área fuera que dentro. Y
`extent` es la frontera exterior del último anillo — con margen, las provincias de la costa
salían un 45 % más grandes.

Con el hueco fijo la dispersión de superficie llegaba a **×2,8**; así baja a **×1,7**, y el
Núcleo tiene su cuota propia (`CORE_SHARE`) en vez de depender del número de jugadores.
Hay test, y fija la intención —dispersión < ×2—, no las constantes.

### 4.3 De grafo a territorio: la teselación

El esqueleto es un grafo, pero **dibujarlo como un grafo fue un error de tres versiones**:
nodos sueltos unidos por líneas se lee como un árbol de investigación, no como el tablero
de un 4X. `mapgen/layout.ts` lo convierte en provincias.

```
regionCells(map) → un polígono por región
```

El esqueleto es **plano** —cero cruces de aristas, comprobado a 2, 3 y 5— así que admite su
**dual baricéntrico**: se trazan las caras del grafo, cada cara aporta un vértice, y la
celda de una región es el polígono de las caras que la rodean. De ahí sale la propiedad que
lo hace honesto:

```
∀ u,v:  las celdas de u y v comparten frontera  ⟺  (u,v) ∈ aristas
```

Y con ella desaparece el motivo por el que había que pintar las aristas: **la frontera es
la arista**. Un Voronoi sobre los mismos centros quedaría más orgánico y **mentiría**: a 3
jugadores, 27 pares de provincias compartirían frontera sin tener arista entre ellas.

El vértice de cada cara es una media **ponderada por grado**. Sin ponderar, el Núcleo —que
toca el anillo interior entero— se quedaba con un cuarto de la superficie del mapa.

La teselación **conserva la simetría C_n**, porque el dual de un grafo C_n-simétrico lo es:
hay test que lo comprueba celda a celda. Ver
[ADR-041](DECISIONS.md#adr-041), que sustituye a [ADR-037](DECISIONS.md#adr-037).

### 4.4 El caso de 2 jugadores

Con n = 2, C₂ es una rotación de 180°, que en la práctica se percibe como un espejo. Para
que no se sienta plano se aplica una excepción:

- Se admite un **presupuesto de perturbación doble** (§6).
- Se añade un **anillo periférico asimétrico** de 3 regiones por lado, colocadas en
  posiciones rotadas pero conectadas de forma distinta, dentro de la tolerancia.

Y aun así, el modo 2 jugadores se declara *modo de duelo/aprendizaje*, no el modo de
referencia ([DISCOVERY D8](DISCOVERY.md#21-riesgos-de-diseño)).

---

## 5. Pasos 2–3 — Decoración y perfiles económicos

### 5.1 Decoración

Se decora **un solo sector** con el PRNG sembrado y se replica por rotación. Todos los
sectores son entonces idénticos en contenido y en forma.

```ts
function decorateSector(rng: Rng, spec: SectorSpec): TerrainAssignment {
  const slots = spec.decorableSlots;              // todo menos el Bastión
  const bag   = shuffle(rng, buildTerrainBag(spec));   // multiconjunto FIJO (§2.2)
  const out = new Map<Slot, Terrain>();

  for (const slot of slots) {
    // restricciones locales: sin 2 aguas adyacentes, yacimiento nunca junto al Bastión,
    // al menos 1 elevación en el camino Bastión→Núcleo (crea un chokepoint real)
    out.set(slot, drawCompatible(bag, slot, out, spec));
  }
  return enforceConstraints(out, spec);
}
```

El multiconjunto de terrenos es **fijo**: lo que varía entre semillas es la disposición,
nunca el inventario. Dos mapas distintos son igual de ricos.

### 5.2 Rotación de perfiles — el motor del comercio

Aquí está la aportación más importante del generador al diseño del juego.

Todos los sectores tienen el **mismo valor total**, pero **distinta composición**. A cada
asiento se le asigna un perfil:

| Perfil | Abundante | Escaso |
|---|---|---|
| **P0 — Arsenal** | Industria, Suministro | Intel, Ceniza |
| **P1 — Observatorio** | Intel, Industria | Suministro, Ceniza |
| **P2 — Veta** | Ceniza, Intel | Industria, Suministro |
| **P3 — Granero** | Suministro, Ceniza | Industria, Intel |
| **P4 — Encrucijada** | Suministro, Intel | Industria, Ceniza |

Implementación: **no se cambia la cantidad de nodos**, se cambia el *tipo* de algunos.
Un perfil «Arsenal» convierte 2 llanuras en urbanas y 1 yacimiento en un nodo de
elevación con renta de suministro — manteniendo el valor total dentro del ±4 %.

```ts
// El offset depende de la semilla ⇒ no siempre juegas el mismo perfil en el mismo asiento
const profileOf = (seat: number) => PROFILES[(seat + seedOffset) % PROFILES.length];
```

**Consecuencias de diseño (todas deseadas):**

1. Ningún jugador puede producir libremente todo lo que necesita ⇒ **comerciar deja de
   ser opcional**. La diplomacia se vuelve aritmética, no social ([GDD P1](GAME_DESIGN.md#p1--la-victoria-exige-un-aliado-y-el-aliado-exige-un-precio)).
2. Los perfiles crean **socios naturales** (complementarios) y **rivales naturales**
   (mismo déficit compitiendo por la misma fuente). El mapa reparte alianzas antes del
   primer turno.
3. Cada partida se siente distinta aunque la geometría sea simétrica: **juegas un rol
   económico diferente**.
4. Es rigurosamente justo: la suma es idéntica; solo cambia la forma.

Restricción: **dos sectores adyacentes nunca comparten perfil**, para que siempre haya
un socio comercial al lado.

---

## 6. Paso 4 — Perturbación acotada

La simetría perfecta es justa pero se siente mecánica. Se rompe **con presupuesto**.

```ts
const MUTATIONS = [
  { key: 'swapTerrain',  cost: 1, apply: swapTwoTerrainsWithinOneSector },
  { key: 'moveSeam',     cost: 3, apply: moveOneSeamOneHopWithinSector },
  { key: 'addEdge',      cost: 2, apply: addOneEdgeBetweenExistingNodes },
  { key: 'removeEdge',   cost: 3, apply: removeOneNonBridgeEdge },
  { key: 'promoteRegion',cost: 2, apply: upgradePlainToUrbanOrHigh },
];

const BUDGET = { 2: 12, 3: 8, 5: 7 };   // ⚖️ el modo 2p admite más asimetría (§4.2)
```

Reglas de la perturbación:

- Nunca se aplica a un **Bastión** ni al **Núcleo**.
- `removeEdge` nunca elimina un puente del grafo (comprobado con Tarjan): **el mapa
  siempre queda conexo**.
- Cada mutación afecta a **un solo sector** — así el evaluador puede atribuir exactamente
  a quién beneficia o perjudica.
- El presupuesto se reparte de forma que **cada sector reciba entre 1 y 3 mutaciones**:
  no puede haber un jugador «tocado» y otro «intacto».

---

## 7. Paso 5 — Evaluación

### 7.1 Las ocho métricas de equidad

Para cada asiento p:

| # | Métrica | Definición | Cómo se calcula |
|:-:|---|---|---|
| **M1** | `dist_core` | Saltos del Bastión al Núcleo | BFS |
| **M2** | `territory_value` | Σ del valor de las regiones cuyo dueño natural es p | Voronoi por distancia de grafo; empate = fraccionado |
| **M3** | `income_vector` | Renta proyectada de ▣⬢◈✦ en los turnos 1–5 con expansión codiciosa | Simulación de expansión voraz |
| **M4** | `expansion_room` | Nº de regiones neutrales exclusivamente más cercanas a p | Voronoi |
| **M5** | `seam_access` | Σ 1/(1+dist) a cada yacimiento | BFS multiorigen |
| **M6** | `chokepoint_quality` | Corte mínimo de aristas entre el Bastión de p y la unión de bastiones ajenos | Max-flow / min-cut (Edmonds–Karp; el grafo es diminuto) |
| **M7** | `exposure` | Σ<sub>q≠p</sub> 1/dist(bastión p, bastión q) | BFS |
| **M8** | `core_contest` | Nº de regiones desde las que p puede alcanzar el Núcleo en ≤ 2 saltos | BFS |

### 7.2 Puntuación de equidad

```
Para cada métrica m:
    v_m = [ m(p) para cada asiento p ]
    spread_m = ( max(v_m) − min(v_m) ) / max( mean(v_m), ε )

F = max sobre m de ( spread_m / tolerancia_m )

ACEPTAR si F ≤ 1.0
```

| Métrica | Tolerancia | Por qué |
|---|:-:|---|
| M1 `dist_core` | **0.00** | Cero. La distancia al objetivo es idéntica o el mapa se rechaza. |
| M2 `territory_value` | 0.06 | 6 % de diferencia de valor natural es imperceptible en 12 turnos |
| M3 `income_vector` | 0.08 (por recurso) | Los perfiles hacen que la composición difiera; el **total** no |
| M4 `expansion_room` | 0.10 | |
| M5 `seam_access` | 0.07 | La Ceniza es el recurso de victoria: tolerancia estrecha |
| M6 `chokepoint_quality` | 0.15 | Es defensivo; algo de variación crea identidad de posición |
| M7 `exposure` | 0.10 | |
| M8 `core_contest` | 0.08 | |

M1 con tolerancia **cero** es intencionado y es la garantía más fuerte del sistema:
**nadie está más cerca del premio que otro, nunca.**

### 7.3 Puntuación de interés

Un mapa justo pero aburrido también se rechaza.

```
I = 0.30 · normVarianzaValorIntraSector      // no todas las regiones valen lo mismo
  + 0.25 · densidadChokepoints               // aristas puente / total
  + 0.25 · diversidadCaminos                 // nº de caminos casi-óptimos Bastión→Núcleo
  + 0.20 · asimetríaDisposición              // distancia de Hamming entre disposiciones de sectores

ACEPTAR si I ≥ 0.45     ⚖️
```

`diversidadCaminos` es la métrica más importante para la jugabilidad: si solo hay una
ruta razonable al Núcleo, la partida es un embudo y la diplomacia se reduce a un frente.
Se exige que existan **≥ 2 rutas** cuya longitud no exceda en más de 1 salto a la óptima.

### 7.4 Bucle de aceptación

```ts
function generateMap(seed: number, n: PlayerCount): GeneratedMap {
  const rng = makeRng(seed, 0);
  const skeleton = buildSkeleton(n);
  const base = applyProfiles(replicate(decorateSector(rng, SECTOR_SPEC[n]), skeleton), rng);

  let best: Candidate | null = null;

  for (let attempt = 0; attempt < 200; attempt++) {
    const cand = perturb(base, rng, BUDGET[n]);
    const fair = evaluateFairness(cand);      // F
    const inter = evaluateInterest(cand);     // I

    if (fair.F <= 1.0 && inter.I >= 0.45)
      return finalize(cand, { seed, attempt, fairness: fair, interest: inter });

    if (fair.F <= 1.0 && (!best || inter.I > best.I)) best = { cand, I: inter.I, F: fair.F };
  }

  // Nunca falla: el mejor justo aunque sea poco interesante; si no, el simétrico puro.
  return finalize(best?.cand ?? base, { seed, attempt: -1, fallback: true });
}
```

Medición: con `BUDGET = 7` y las tolerancias de §7.2, el **91 %** de las semillas acepta
en ≤ 8 intentos, y el **99,4 %** en ≤ 40. La rama de *fallback* se activa en menos del
0,1 % — y aun así produce un mapa jugable y justo.

---

## 8. Colocación inicial

Deriva del esqueleto; no es aleatoria:

- **Bastión**: nodo fijo del anillo exterior de cada sector.
- **Fuerza inicial**: `{ Línea 20, Fuego 10, Cielo 0 }` en el Bastión, más
  `{ Línea 10 }` en una región adyacente elegida **por el jugador durante el Parlamento**
  (T0). La única asimetría inicial la introduce el propio jugador.
- **Recursos iniciales**: idénticos para todos ⚖️ `▣ 20 · ⬢ 20 · ◈ 10 · ✦ 2`.
- **Un agente de Sombra** en el Bastión.

---

## 9. Informe de equidad

Todo mapa generado adjunta su informe, que se persiste con la partida y es **visible para
los jugadores** al final de la campaña:

```json
{
  "mapgenVersion": "1.0.0",
  "seed": 8471263,
  "players": 5,
  "attempt": 3,
  "fairness": {
    "F": 0.71,
    "metrics": {
      "dist_core":          { "values": [5,5,5,5,5],               "spread": 0.000, "ok": true },
      "territory_value":    { "values": [41.0,40.5,41.5,40.8,41.2], "spread": 0.024, "ok": true },
      "income_vector.ash":  { "values": [7,7,7,7,7],               "spread": 0.000, "ok": true },
      "seam_access":        { "values": [1.82,1.79,1.85,1.80,1.83], "spread": 0.033, "ok": true },
      "chokepoint_quality": { "values": [3,3,4,3,3],               "spread": 0.313, "ok": false, "note": "dentro de tolerancia 0.15? NO → ver nota" }
    }
  },
  "interest": { "I": 0.58, "pathDiversity": 3, "chokepointDensity": 0.19 },
  "profiles": { "0": "arsenal", "1": "veta", "2": "granero", "3": "observatorio", "4": "encrucijada" }
}
```

> El ejemplo muestra deliberadamente una métrica fuera de tolerancia: ese candidato
> **se habría rechazado** y el generador habría reintentado. El informe existe
> precisamente para que estos casos sean auditables y no invisibles.

Publicar el informe tiene un efecto de producto real: cuando un jugador pierde, **no
puede culpar al mapa** — y puede comprobarlo.

---

## 10. Reproducibilidad

```
mapa = f(seed, playerCount, MAPGEN_VERSION)
```

Una partida guarda los tres. Reproducir un mapa exacto meses después es:

```bash
npm run mapgen -- --seed 8471263 --players 5 --version 1.0.0 --report --svg out.svg
```

Cambiar el generador **obliga** a subir `MAPGEN_VERSION`. Las partidas antiguas guardan
la suya, así que **nunca cambian de mapa a mitad de campaña**. `packages/core` mantiene
los generadores antiguos mientras haya partidas vivas que los usen.

---

## 11. Tests

En `packages/core/tests/mapgen/`:

| Test | Criterio |
|---|---|
| `skeleton.invariants` | Los 5 invariantes de §4.1, para n ∈ {2,3,5} |
| `rotation.automorphism` | `rotate(·,k)` preserva la adyacencia, ∀k |
| `connectivity.fuzz` | 5 000 semillas: el grafo siempre conexo tras perturbar |
| `fairness.sweep` | 1 000 semillas × 3 conteos: **F ≤ 1.0 siempre** |
| `interest.sweep` | ≥ 95 % de las semillas alcanzan I ≥ 0.45 sin fallback |
| `determinism` | Misma semilla ⇒ mismo checksum de mapa, en Node y en Chromium |
| `perf` | p95 de generación + evaluación ≤ 250 ms |
| `no-seam-adjacency` | Ningún yacimiento adyacente a un Bastión |
| `profile-adjacency` | Ningún par de sectores adyacentes con el mismo perfil |
| `visual` | Renderiza 12 semillas a SVG para inspección en la Galería |

`fairness.sweep` es el test más importante del repositorio: es la afirmación de producto
(«mapas equilibrados») convertida en una aserción ejecutable.

---

## 12. Fuera de alcance en v1.0

| Idea | Por qué se aplaza |
|---|---|
| Mapas asimétricos «de autor» | Contradicen la garantía de equidad; podrían llegar como modo casual `POST-1.0`. |
| Terreno dinámico (inundaciones, clima) | No aporta una decisión que no dé ya **Fisura**. |
| Mapas de 4 o 6 jugadores | El diseño soporta cualquier n; falta balancear la economía del Núcleo. Trivial de añadir después. |
| Elevación con línea de visión real | Complejidad de UI en móvil desproporcionada respecto a lo que aporta. |
