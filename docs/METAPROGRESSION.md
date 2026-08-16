# Metaprogresión y la Ciudad

> **Versión:** 1.0 · Implementación: `packages/core/src/rules/progression.ts` + `apps/web/app/[locale]/city/`
> Cubre: progresión permanente (cuenta), progresión de campaña (partida) y la vista Ciudad.

---

## 1. Las dos progresiones

El brief exige distinguirlas con claridad. Son dos sistemas separados que nunca se tocan.

| | **Progresión permanente** | **Progresión de campaña** |
|---|---|---|
| Vive en | La cuenta (`cities`, `account_unlocks`) | El estado de la partida (`GameState`) |
| Dura | Para siempre | 12 turnos |
| Moneda | **Ceniza depositada** (✦ que traes a casa) | Recursos de la campaña |
| Qué otorga | **Opciones** (doctrinas, anomalías, cosméticos) | **Poder** (investigación, fuerzas, territorio) |
| Afecta al balance | **Nunca** | Sí, por diseño |
| Se pierde | Nunca | Al terminar la campaña |
| Visible para rivales | Tu doctrina y tu ciudad, sí. Tu progreso, no. | Todo lo público del juego |

Formulado en una frase:

> **La progresión permanente cambia con qué juegas.
> La progresión de campaña cambia cómo va tu partida.**

---

## 2. La regla de oro

> ### Un desbloqueo permanente **jamás** modifica una constante de balance.

Esto no es una intención: es una **restricción verificada por CI**.

```ts
// packages/core/src/balance/constants.ts
export const BALANCE = { /* … congelado … */ } as const;

// packages/core/src/rules/progression.ts
export function applyUnlocks(state: GameState, unlocks: UnlockKey[]): GameState {
  // Este módulo NO importa BALANCE. Comprobado por lint.
  // Solo puede añadir entradas a: availableDoctrines, availableAnomalies, cosmetics.
}
```

```
tests/progression/no-power-creep.test.ts

  ✓ ningún UnlockKey aparece en las claves de BALANCE
  ✓ progression.ts no importa balance/constants
  ✓ para todo par (cuenta vacía, cuenta al 100 %): mismo estado inicial de campaña
    salvo en { doctrine, anomalies, cosmetics }
  ✓ simulación: cuenta al 100 % vs. cuenta vacía con la misma doctrina y anomalías
    ⇒ winrate dentro de 48–52 % en 2 000 partidas
```

Ese último test es la definición operativa de «la metaprogresión no rompe el
competitivo». Si falla, no hay release.

### 2.1 ¿Y entonces por qué progresar?

Porque **la anchura del abanico sí importa**, aunque cada opción sea equipotente.

Un jugador nuevo lleva 1 doctrina y 3 anomalías fijas. Un veterano elige entre 6
doctrinas y 8 anomalías, y **puede adaptar su equipo a la partida** (nº de jugadores,
perfil económico, quiénes son los rivales). Eso es una ventaja real —de conocimiento y
de adaptación— que se gana jugando, no una ventaja numérica que se compra con tiempo.

Comparación honesta: es el modelo de un juego de cartas con mazo construido, no el de un
RPG con niveles.

---

## 3. Moneda: la Ceniza depositada

Al terminar una campaña, un porcentaje de tu ✦ va al **Depósito** de tu Ciudad
([GDD §13.6](GAME_DESIGN.md#136-recompensas)):

| Resultado | Depósito |
|---|---|
| Consagración | 100 % + desbloqueo garantizado del Núcleo |
| Coalición | 70 % + desbloqueo |
| Reclamación Menor | 55 % |
| Superviviente | 35 % |
| Superviviente reducido | 20 % |
| Abandono | 0 % + registro de abandono |

**Ganar acelera la progresión, pero perder no la detiene.** Una campaña perdida con
buena recolección de yacimientos puede depositar más que una victoria pobre. Esto
sostiene el interés de los jugadores que van perdiendo en el turno 8 — que es el momento
en que un 4X asíncrono se muere.

### 3.1 Curva

| Hito | ✦ acumulado | Campañas aprox. |
|---|:-:|:-:|
| 2ª doctrina (afín, 54 ✦) | 54 | 4 |
| 4ª anomalía (afín, 42 ✦) | 96 | 7 |
| 2ª ciudad (55 ✦) | 151 | 11 |
| Toda tu vía de facción | 180 | 13 |
| Todas las doctrinas | ~414 | ~30 |
| Todas las anomalías | ~350 más | ~55 |
| Catálogo completo | ~1 040 | ~75 |

Costes unitarios en [FACTIONS §3](FACTIONS.md#3-economía-de-desbloqueo). Lo afín cuesta
un 40 % menos, así que **la vía de tu facción se completa en la tercera parte del tiempo
que el catálogo entero** — sin que eso cambie el techo.

⚖️ Calibrada para que **a las 5 campañas** el jugador tenga suficientes opciones para que
la elección de equipo sea interesante, y para que el catálogo completo sea un objetivo a
largo plazo sin ser un muro.

---

## 4. Qué se desbloquea

### 4.1 Doctrinas (6)

Ver [GDD §12](GAME_DESIGN.md#12-doctrinas). De inicio: **la doctrina de origen de tu
facción** ([FACTIONS §2](FACTIONS.md#2-las-seis-facciones)) — distinta según a quién
juraste. Las otras 5 se desbloquean, y **todas** son alcanzables desde cualquier facción.

Cada doctrina es un pasivo + un activo de un uso. Ninguna es más fuerte: el test de
balance exige 18–22 % de winrate para todas en partidas de 5.

### 4.2 Anomalías (8)

Ver [GDD §10](GAME_DESIGN.md#10-anomalías-la-capa-sobrenatural). De inicio: **Velo,
Ancla, Eco**. Se llevan 3 a cada campaña.

Se desbloquean en un orden que introduce las mecánicas de forma escalonada:

```
inicio   → Velo, Ancla, Eco    idénticas para TODAS las facciones: el onboarding no
                               puede depender de a quién juraste
después  → el orden lo marca el bolsillo, no el sistema: cada anomalía cuesta 70 ✦,
           o 42 ✦ si es afín a tu facción
```

No hay un orden impuesto de desbloqueo. La afinidad de facción hace que unas salgan
antes que otras de forma natural, y eso basta para escalonar el aprendizaje sin encerrar
a nadie en un carril.

**Fisura es la más difícil de usar bien:** cortar aristas del grafo invalida planes
ajenos y exige entender bien el mapa. Un novato con Fisura suele hacerse daño a sí mismo.
Por eso solo es afín a dos facciones (Saranth y Oshara), las dos cuya identidad es
precisamente conocer el terreno mejor que nadie.

### 4.3 Ciudades y facciones (6)

La ciudad a la que juras es tu **facción**, y es el marco de toda esta progresión: fija
tu doctrina de origen y **abarata** (nunca encarece) tu vía de desbloqueos. El techo es
idéntico para las seis, verificado por test.

Sistema completo, incluidos Renombre, Cisma y Concordia: [FACTIONS](FACTIONS.md).

Como estética, cambia la paleta, los emblemas, los nombres de las regiones de tu Bastión
y la voz de los textos de evento. **Cero efecto mecánico.**

### 4.4 Distritos de la Ciudad (6 × 3 niveles)

Aquí es donde vive la sensación de «mi ciudad crece». **Ninguno da números en campaña.**

| Distrito | Nivel 1 | Nivel 2 | Nivel 3 |
|---|---|---|---|
| **Archivo** | Ver el informe de equidad del mapa antes del T1 | Ver el historial de Sellos de tus rivales | Ver el perfil económico de todos los sectores |
| **Fundición** | +1 opción de producción inicial en el Parlamento | Elegir la composición de tu fuerza inicial | Elegir dónde despliegas la 2ª fuerza |
| **Antena** | Ver quién está conectado | Notificaciones push de plazo | Alertas cuando un rival declara Consagración |
| **Cámara** | 1 plantilla diplomática adicional | Plantillas personalizadas guardadas | Traducción automática del texto libre del chat |
| **Reliquiario** | +1 anomalía en el catálogo llevable (3→4 para elegir) | — | — *(máximo estricto: se llevan 3, siempre)* |
| **Salón** | Emblema | Paleta de facción | Animación de victoria |

> **Lee la columna de la Fundición con atención.** «Elegir la composición de tu fuerza
> inicial» **no da más fuerza**: da la misma cantidad repartida a tu gusto. Es una opción,
> no un número. Esa es la línea que separa este sistema de un pay-to-win, y todos los
> distritos están escritos para no cruzarla.

**Archivo** es el ejemplo más claro de progresión que se siente potente sin serlo: ver el
informe de equidad no cambia el mapa, pero **te enseña a leerlo**. Es progresión de
conocimiento, materializada.

---

## 5. La Ciudad

### 5.1 Alcance en v1.0 — el recorte

El brief describe una vista Ciudad con economía, producción, investigación, diplomacia,
infraestructura, inteligencia, ejército, tecnología y desarrollo sobrenatural. Eso es un
segundo juego completo, duplica todos los sistemas de la guerra y contradice
directamente «sesiones cortas» y «no inventar complejidad»
([DISCOVERY C7](DISCOVERY.md#1-contradicciones-detectadas-en-el-brief)).

> **Decisión: en v1.0 la Ciudad es un hub de progresión y preparación.
> Sin colas de producción, sin temporizadores, sin economía paralela.**

Lo que sí conserva es **la función narrativa completa** que pide el brief: entre guerras
vuelves a casa, ves las consecuencias, gastas lo que trajiste y preparas la siguiente
Convocatoria. El bucle emocional está entero; lo que se elimina es la duplicación
mecánica.

`POST-1.0`: gestión de ciudad con decisiones políticas propias, si el playtesting
demuestra que se echa en falta.

### 5.2 Qué hay en la Ciudad

```
┌─────────────────────────────────────────┐
│  VANTERA                     ✦ 247      │
│  ────────────────────────────────────   │
│                                         │
│    [ silueta de la ciudad, distritos    │
│      iluminados según su nivel ]        │
│                                         │
│  ────────────────────────────────────   │
│  PRÓXIMA CONVOCATORIA                   │
│  ┌───────────────────────────────────┐  │
│  │ Doctrina    ▸  Yunque             │  │
│  │ Anomalías   ▸  Velo · Ancla · Eco │  │
│  │ Ciudad      ▸  Vantera            │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [ ⚔  BUSCAR CAMPAÑA ]                  │
│                                         │
│  Distritos · Historial · Compendio      │
└─────────────────────────────────────────┘
```

Cuatro cosas, y nada más:

1. **Tu ciudad**, que crece visiblemente con los distritos.
2. **Tu equipo** para la próxima campaña (3 elecciones).
3. **Entrar en campaña.**
4. **Distritos / Historial / Compendio.**

Un jugador que no quiera meta puede ignorar todo esto y pulsar «Buscar campaña». Esa es
la prueba de que el recorte es correcto: la Ciudad **nunca es un peaje**.

### 5.3 El Reposo (post-campaña)

La pantalla que cierra el ciclo. Tres tarjetas deslizables, no un muro de datos:

```
  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
  │ 1 · RESULTADO    │  │ 2 · LA CAMPAÑA   │  │ 3 · EL DEPÓSITO  │
  │                  │  │                  │  │                  │
  │ Reclamación      │  │ Yacimientos: 5   │  │ +38 ✦            │
  │ Menor — 2º       │  │ Sellos: 3/4      │  │                  │
  │                  │  │ Traiciones: 1    │  │ ▸ Fulgor         │
  │ Saranth consagró │  │ Mapa: informe →  │  │   desbloqueado   │
  │ en el turno 11.  │  │ Repetir campaña →│  │                  │
  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

**«Repetir campaña»** reproduce la partida entera desde `(seed, órdenes)` como una
línea temporal navegable, con la niebla de guerra **levantada**. Es la mejor herramienta
de aprendizaje posible y sale gratis del diseño determinista: no hay que grabar nada.

---

## 6. Progresión de campaña

Dentro de una partida, la progresión existe y **sí** da poder:

| Sistema | Cuántas decisiones | Ver |
|---|:-:|---|
| Investigación | 3 en toda la campaña | [GDD §11](GAME_DESIGN.md#11-investigación) |
| Territorio y renta | continuo | [GDD §5](GAME_DESIGN.md#5-recursos-y-economía) |
| Fuerzas producidas | continuo | [GDD §8](GAME_DESIGN.md#8-fuerzas-y-producción) |
| Fortificaciones | continuo | [GDD §6.3](GAME_DESIGN.md#63-fortificación) |
| Activo de doctrina | 1 uso | [GDD §12](GAME_DESIGN.md#12-doctrinas) |
| Anomalías | 2 usos cada una | [GDD §10](GAME_DESIGN.md#10-anomalías-la-capa-sobrenatural) |

Todo esto **se pierde al acabar**. Cada campaña empieza en la misma casilla de salida
que la de tus rivales. Es la condición para que el juego sea competitivo.

---

## 7. Lo que NO habrá

| Sistema | Por qué no |
|---|---|
| Niveles de cuenta con bonificaciones | Rompe la regla de oro |
| Equipo con estadísticas | Ídem |
| Energía / vidas / esperas | Contradice «sesiones cortas» y es una mecánica de monetización, no de juego |
| Cajas de botín | No |
| Compras que afecten al juego | No |
| Ranking global / ELO | Empuja al metajuego óptimo y mata la experimentación diplomática. Post-1.0, y como modo aparte si acaso. |
| Temporadas con reinicio | Castiga al jugador ocasional, que es el público del modo asíncrono |

### 7.1 Sobre monetización

Fuera de alcance en v1.0. Si algún día existe, la restricción de diseño ya está fijada:
**solo cosméticos**, y la regla de oro (§2) se aplica igual — con test de CI incluido.
Nótese además que monetizar obliga a salir de Vercel Hobby
([README](../README.md#coste-y-límites)).

---

## 8. Plan de implementación (v0.6)

| Paso | Entrega | Test |
|:-:|---|---|
| 1 | `match_results` + cálculo del depósito | Unitario: la tabla de recompensas |
| 2 | Tablas `cities`, `account_unlocks` + RLS | Seguridad: no puedo modificar mi `ash_bank` |
| 3 | Selección de equipo (doctrina/anomalías/ciudad) | Unitario: no se puede llevar algo no desbloqueado |
| 4 | **Test `no-power-creep`** | ← **bloqueante, antes que la UI** |
| 5 | Vista Ciudad (móvil) | E2E: entrar en campaña en ≤ 2 taps desde la Ciudad |
| 6 | Distritos y sus efectos | Unitario por distrito |
| 7 | Pantalla de Reposo | E2E |
| 8 | «Repetir campaña» desde `(seed, órdenes)` | Integración: checksum idéntico al original |

El paso 4 va **antes** de la interfaz a propósito: la restricción se implementa y se
verifica antes de que exista nada que pueda violarla.
