# Testing y simulador de balance

> **Versión:** 1.0 · Implementación: `packages/core/tests/`, `packages/sim/`, `apps/web/e2e/`
> Cubre los apartados §27 (testing) y §28 (simulador) del brief.

---

## 1. Principio

> **El testing no es una fase. Es la condición para que una versión exista.**

Ninguna versión se declara terminada sin sus tests
([definición de hecho](ROADMAP.md#definición-de-hecho)). Y hay tres tests que son
**bloqueantes absolutos**: si fallan, no hay release, sin excepción.

| Test bloqueante | Qué protege |
|---|---|
| `security/rls` | Que la niebla de guerra sea real y nadie lea lo que no debe |
| `progression/no-power-creep` | Que la metaprogresión no rompa el competitivo |
| `mapgen/fairness-sweep` | Que la promesa de «mapas equilibrados» sea cierta |

Cada uno convierte una **afirmación de producto** en una **aserción ejecutable**. Esa es
la idea que organiza todo este documento.

---

## 2. Pirámide

```
                      ╱─────────╲
                     ╱  E2E (12) ╲          Playwright · flujos completos
                    ╱─────────────╲
                   ╱ Integración   ╲        Supabase local · RLS · concurrencia
                  ╱     (~40)       ╲
                 ╱───────────────────╲
                ╱  Simulación (~15)   ╲     miles de partidas · balance
               ╱───────────────────────╲
              ╱      Unitarios (~350)   ╲   motor puro · rápido · determinista
             ╱───────────────────────────╲
```

El grueso está abajo a propósito: **el motor es lógica pura sin I/O**, así que un test
unitario del motor es un test real del juego, no un test de andamiaje. 350 tests
unitarios corren en menos de 3 segundos.

---

## 3. Tests unitarios (`packages/core`)

Cobertura exigida en `src/rules/`: **≥ 90 %** de ramas.

| Módulo | Qué se prueba | Ejemplos de casos límite |
|---|---|---|
| `rng` | Reproducibilidad, distribución | Misma semilla en Node y en Chromium |
| `combat` | Fórmula, rueda, terreno, posturas | Poder 0 vs 0 · empate exacto · composición monoarma · Pantalla que se retira sin destino válido |
| `movement` | Adyacencia, división, cruces | Cruce mutuo · mover a región cortada por Fisura ese mismo turno · dividir dejando 0 |
| `economy` | Renta decreciente, suministro | 0 regiones · 40 regiones · fuerza a 6 saltos sin Bastión · desbordamiento del tope |
| `control` | Captura, disputa | Empate ⇒ Disputada · Línea destruida pero región conservada · captura con Cielo (prohibida) |
| `diplomacy` | Ciclo de vida, ruptura, depósito | Romper sin ✦ suficiente ⇒ rechazo · doble aceptación · caducidad el mismo turno de la ruptura |
| `core` (Núcleo) | Consagración, reinicio, coste | Perder el Núcleo en el 3.er turno · no poder pagar · Coalición cuyo socio abandona |
| `anomalies` | Los 8 efectos, usos | Fisura que desconectaría el grafo ⇒ prohibida · Pliegue a región perdida ese turno |
| `shade` | 6 operaciones, contrainteligencia | Interceptar a quien tiene contrainteligencia · Sembrar contra quien tiene Eco |
| `visibility` | Proyección por asiento | **Ningún dato oculto aparece en `PlayerView`** ← ver §3.1 |
| `progression` | Depósito, desbloqueos | Regla de oro (§5) |

### 3.1 El test de fuga de información

El más importante de los unitarios, y el que hace que la niebla de guerra sea confiable:

```ts
test('PlayerView no filtra nada oculto', () => {
  const { state, views } = reduce(fixture, orders, ctx);

  for (const [seat, view] of Object.entries(views)) {
    const leaked = deepFindValues(view, v => isSecretOf(state, v, Number(seat)));
    expect(leaked).toEqual([]);      // recursos ajenos, órdenes ajenas, fuerzas en niebla,
                                    // términos de tratados de terceros, catálogo de anomalías ajeno
  }
});
```

Recorre la vista serializada entera y comprueba que **ningún valor secreto aparece en
ningún sitio** — incluidos campos que alguien pudiera añadir en el futuro sin pensar. Es
un test que protege contra errores que aún no se han cometido.

---

## 4. Tests de integración

Contra Supabase local (`npx supabase start`).

| Grupo | Casos |
|---|---|
| **Auth** | Registro, login, magic link, logout, sesión expirada, cambio de idioma |
| **RLS** ← bloqueante | Los 7 casos de [TECHNICAL_DESIGN §6.4](TECHNICAL_DESIGN.md#64-test-de-seguridad-obligatorio) |
| **Persistencia** | Guardar/cargar estado, borrador de órdenes, reconexión desde otro dispositivo |
| **Concurrencia** | **10 peticiones de resolución simultáneas ⇒ exactamente 1 resolución** · dos jugadores enviando en el mismo milisegundo · resolución justo al vencer el plazo |
| **Ciclo de partida** | Crear → 5 se unen → parlamento → 12 turnos → resultados → archivado |
| **Ausencias** | 3 turnos sin enviar ⇒ Mando Automático · recuperar el asiento · el bot honra los Sellos |
| **Reproducibilidad** | Reproducir una partida desde `(seed, órdenes)` ⇒ **checksum idéntico** |

---

## 5. Tests E2E (Playwright)

12 escenarios, cada uno en **360×640** y **1440×900**:

```
1. Registro → Ciudad → campaña
2. Crear partida privada → compartir código → 5 clientes entran
3. Parlamento: desplegar y sellar
4. Turno completo: mover, producir, enviar
5. Combate: previsualizar y confirmar
6. Diplomacia: componer y enviar una oferta en ≤ 4 taps   ← medido
7. Aceptar una oferta y verificar el efecto tras la resolución
8. Romper un Sello y verificar que los 5 asientos ven el evento
9. Consagración: declarar, 3 turnos, victoria
10. Reconexión: recargar a mitad de turno sin perder el borrador
11. Cambio de idioma ES↔EN sin perder el estado
12. Accesibilidad: recorrer y jugar un turno completo solo con teclado
```

El escenario 6 tiene una **aserción de esfuerzo**, no solo de funcionamiento: falla si la
oferta requiere más de 4 interacciones. Es la forma de impedir que el riesgo D2 (fricción
diplomática en móvil) reaparezca por acumulación de cambios.

---

## 6. El simulador de balance

### 6.1 Qué es

`packages/sim` juega partidas completas **sin interfaz, sin red y sin base de datos**,
usando el mismo `reduce()` que el servidor. Miles de partidas por minuto.

```bash
npm run sim -- --games 5000 --players 5 --seed 1 --out reports/balance.json
npm run sim -- --games 500 --players 5 --profiles aggressive,turtle,trader,opportunist,bot
npm run sim -- --replay <gameId>        # reproduce una partida real y la analiza
```

```ts
simulateGames({
  games: 5000,
  players: 5,
  seed: 1,
  strategyProfiles: ['aggressive','turtle','trader','opportunist','diplomat'],
  doctrines: 'random',          // o fijas, para comparar
  collect: ['winrate','duration','leadChanges','betrayals','attunements','resourceUse'],
});
```

### 6.2 Perfiles de estrategia

Cada perfil es una política que decide órdenes a partir de una `PlayerView` — es decir,
**juega con la misma información que un humano**, no con el estado completo. Un bot que
hiciera trampa invalidaría todas las conclusiones de balance.

| Perfil | Comportamiento |
|---|---|
| `aggressive` | Ataca al vecino más débil, expande sin parar, ignora la diplomacia |
| `turtle` | Fortifica, no ataca, acumula, va a Reclamación Menor |
| `trader` | Maximiza ✦ comerciando; acepta casi toda oferta razonable |
| `opportunist` | Acepta Sellos y los rompe cuando el beneficio > coste |
| `diplomat` | Busca Coalición pronto, honra todo, comparte visión |
| `rusher` | Va al Núcleo desde el T1 |
| `random` | Órdenes legales al azar — **el control**: debe perder siempre |
| `autocommand` | El bot del juego real |

`random` es el test de cordura del sistema: si un jugador aleatorio gana más del 6 % en
partidas de 5, hay algo profundamente roto.

### 6.3 Modelo de diplomacia de los bots

El problema difícil: no se puede simular una negociación humana. La aproximación:

- Cada bot valora una oferta con una función de utilidad simple (¿me acerca al ✦ que
  necesito? ¿me protege un flanco?).
- Los perfiles difieren en **umbral de aceptación** y **umbral de traición**.
- `opportunist` rompe si `beneficio_estimado > coste_ruptura × factor_riesgo`.

**Limitación reconocida honestamente:** esto mide si la *aritmética* de la diplomacia
funciona (¿está bien tarifada la traición? ¿es alcanzable la consagración?), **no** si la
diplomacia es *divertida*. Eso solo lo dice el playtesting con humanos (v0.95). El
simulador detecta que un sistema está roto; no detecta que está muerto.

### 6.4 Métricas

| Métrica | Objetivo | Qué revela si falla |
|---|:-:|---|
| Winrate por doctrina | 18–22 % | Doctrina dominante o inútil |
| Winrate por asiento | 19–21 % | El mapa no es justo |
| Winrate por perfil económico | 19–21 % | Un perfil de recursos es superior |
| Winrate de `random` | < 6 % | Las decisiones no importan |
| Duración media | 9–12 turnos | Partidas que se deciden pronto |
| Victorias antes del T8 | < 15 % | Snowball |
| Reclamación Menor | 25–40 % | El Núcleo es inalcanzable o trivial |
| Cambios de líder | ≥ 2,0 | Partidas sin tensión |
| Corr(regiones@T6, victoria) | **< 0,45** | Se ha convertido en un juego de acumular territorio |
| Consagraciones en solitario que triunfan | < 25 % | El pilar P1 está roto |
| Partidas con ≥ 1 ruptura | > 40 % (con `opportunist`) | La traición está mal tarifada |
| Uso de cada anomalía | > 5 % cada una | Anomalías muertas |
| Uso de cada nodo de investigación | > 10 % cada uno | Nodos muertos |

### 6.5 Informe

```
$ npm run sim -- --games 5000 --players 5

  BALANCE — 5000 partidas · 5 jugadores · motor 0.8.0 · mapgen 1.0.0

  WINRATE POR DOCTRINA
    Cuña        20.4 %  ████████████████████
    Yunque      19.1 %  ███████████████████
    Velo        21.2 %  █████████████████████
    Coro        18.8 %  ██████████████████
    El Libro    22.6 %  ██████████████████████  ⚠ límite
    Enjambre    17.9 %  █████████████████       ⚠ bajo

  RESULTADOS            DIAGNÓSTICO
    Consagración  58 %    ✓ duración media 10.4
    Coalición     11 %    ✓ cambios de líder 2.3
    Recl. Menor   29 %    ✓ corr(regiones@T6, victoria) 0.38
    Sin decidir    2 %    ⚠ El Libro y Enjambre fuera de rango

  ANOMALÍAS (uso por partida)
    Velo 1.8 · Ancla 1.4 · Eco 0.9 · Fisura 0.7 · Pliegue 0.6
    Fulgor 0.4 · Éxodo 0.3 · Sello 0.2 ⚠ infrautilizado
```

Los avisos son **automáticos**. El informe no es un volcado de datos: es un diagnóstico.

### 6.6 Barrido de constantes

Como las constantes de balance son **datos** y no código
([GDD Apéndice A](GAME_DESIGN.md#apéndice-a--tabla-de-constantes-de-balance)), se pueden
barrer:

```bash
npm run sim:sweep -- --param combat.counterK --range 0.20:0.50:0.05 --games 1000
```

```
  counterK   winrate máx-mín   corr(territorio,victoria)   duración
  0.20         6.1 pp                  0.51                 11.2
  0.25         4.8 pp                  0.47                 10.9
  0.30         3.9 pp                  0.42                 10.6
  0.35         3.1 pp                  0.38                 10.4   ← elegido
  0.40         3.4 pp                  0.35                  9.8
  0.45         5.2 pp                  0.31                  9.1
  0.50         7.7 pp                  0.28                  8.4

  Recomendación: 0.35 — minimiza la dispersión de winrate manteniendo
  corr(territorio,victoria) por debajo del umbral de 0.45.
```

**El balance deja de ser una opinión.** Cada constante de `BALANCE` debe tener un barrido
que justifique su valor, y ese barrido se guarda en `reports/`.

### 6.7 Tests de emergencia diplomática

Los más difíciles y los más importantes: comprueban que el juego **produce las
situaciones que promete** ([DIPLOMACY §1.1](DIPLOMACY.md#11-objetivo-de-diseño-explícito)).

| Test | Aserción |
|---|---|
| `alliance-forms-against-leader` | Cuando alguien declara Consagración, ≥ 60 % de las partidas registran ≥ 2 tratados nuevos contra él en los 2 turnos siguientes |
| `betrayal-is-priced` | `opportunist` traiciona más que `diplomat`, pero su winrate no es superior |
| `trade-is-necessary` | Un bot que **nunca** comercia consagra en < 20 % de sus partidas |
| `weak-player-relevance` | El jugador con menos territorio en el T6 gana ≥ 8 % de las veces |
| `coalition-is-a-real-choice` | La Coalición se declara en 20–45 % de las partidas de 5 |
| `no-runaway` | El líder del T6 gana < 45 % de las veces |

`trade-is-necessary` es la validación directa del pilar P1: si un bot autárquico ganase
con frecuencia, la premisa entera del juego sería falsa y habría que subir el coste de
consagración.

---

## 7. Tests de mapas

Ver [MAP_GENERATION §11](MAP_GENERATION.md#11-tests). Destacado: `fairness.sweep` corre
1 000 semillas × 3 conteos de jugadores en cada CI y exige **F ≤ 1.0 siempre**.

---

## 8. Tests de rendimiento

| Test | Presupuesto |
|---|---|
| `reduce()` de un turno de 5 jugadores | ≤ 15 ms |
| Generar + validar un mapa | ≤ 250 ms p95 |
| Bundle de la ruta de partida | ≤ 180 KB gzip |
| Assets totales | ≤ 150 KB |
| LCP móvil (Lighthouse CI) | ≤ 2,5 s |
| INP al tocar una región | ≤ 100 ms |

Fallan el build. Un presupuesto que no se verifica automáticamente no es un presupuesto.

---

## 9. Tests de viewport móvil

```ts
const VIEWPORTS = [
  { name: 'iPhone SE',   width: 320, height: 568 },   // el más estrecho soportado
  { name: 'Android S',   width: 360, height: 640 },   // referencia de diseño
  { name: 'iPhone 14',   width: 390, height: 844 },
  { name: 'iPad',        width: 768, height: 1024 },
  { name: 'Desktop',     width: 1440, height: 900 },
];
```

En cada uno, automáticamente:

```
✓ sin desbordamiento horizontal
✓ ningún táctil < 44 px          (medido con getBoundingClientRect)
✓ ningún texto < 14 px           (medido con getComputedStyle)
✓ el mapa ocupa ≥ 55 % de la altura
✓ el botón de enviar turno está en el tercio inferior
✓ contraste AA (axe-core)
```

---

## 10. CI

| Momento | Qué corre | Duración |
|---|---|---|
| Cada push | typecheck · lint · unitarios · determinismo | ~2 min |
| Cada PR | + integración · RLS · E2E · presupuestos · mapgen (200 semillas) | ~9 min |
| Nocturno | + 5 000 partidas simuladas · mapgen (5 000 semillas) · Lighthouse | ~35 min |
| Pre-release | Todo + checklist manual de QA móvil | ~1 h |

El nocturno **abre una issue automáticamente** si una métrica de balance sale de rango,
con el informe adjunto. El balance se vigila solo.

---

## 11. Datos de prueba

- **Fixtures de estado**: 12 situaciones canónicas (apertura, contacto, cerco, consagración
  en curso, jugador reducido, etc.) en `packages/core/tests/fixtures/`.
- **Semillas de oro**: 20 semillas con informe de equidad congelado. Si el generador
  cambia su salida para una de ellas sin subir `MAPGEN_VERSION`, el test falla.
- **Partidas grabadas**: partidas reales de la beta guardadas como `(seed, órdenes)`, que
  se reproducen en CI para detectar regresiones del motor contra el juego real.

Ese último punto es una consecuencia gratuita del determinismo: **cada partida jugada por
un humano se convierte, sin coste, en un test de regresión.**

---

## 12. Qué NO se testea

Honestidad sobre los límites:

| No se testea | Por qué |
|---|---|
| Que el juego sea divertido | No es automatizable. Playtesting en v0.95. |
| Que la diplomacia sea interesante | Los bots negocian con aritmética, no con psicología (§6.3) |
| Estética de los assets | Revisión humana en la Galería |
| Colusión externa | Fuera del sistema |
| Carga real con miles de usuarios | Fuera de alcance en beta; se documentan los límites del free tier |
| Compatibilidad con navegadores antiguos | Objetivo: navegadores de las últimas 2 versiones |
