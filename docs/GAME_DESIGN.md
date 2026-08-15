# Game Design Document — Guerra de Cenizas

> **Versión del documento:** 1.0 · **Estado:** aprobado para implementación
> **Ámbito:** define el juego objetivo de la v1.0. Todo lo marcado `POST-1.0` está
> deliberadamente fuera.
> Los números marcados `⚖️` son valores de partida provisionales que ajustará el
> simulador de balance ([TESTING_AND_SIMULATION](TESTING_AND_SIMULATION.md)).

---

## Índice

1. [Pilares de diseño](#1-pilares-de-diseño)
2. [Fantasía y universo](#2-fantasía-y-universo)
3. [Presupuesto de decisiones](#3-presupuesto-de-decisiones)
4. [Estructura de la campaña](#4-estructura-de-la-campaña)
5. [Recursos y economía](#5-recursos-y-economía)
6. [Territorio y control](#6-territorio-y-control)
7. [Combate](#7-combate)
8. [Fuerzas y producción](#8-fuerzas-y-producción)
9. [Sombra: inteligencia y operaciones](#9-sombra-inteligencia-y-operaciones)
10. [Anomalías: la capa sobrenatural](#10-anomalías-la-capa-sobrenatural)
11. [Investigación](#11-investigación)
12. [Doctrinas](#12-doctrinas)
13. [El Núcleo y la victoria](#13-el-núcleo-y-la-victoria)
14. [Derrota, abandono y supervivencia](#14-derrota-abandono-y-supervivencia)
15. [Orden de resolución del turno](#15-orden-de-resolución-del-turno)
16. [Filosofía de balance](#16-filosofía-de-balance)
17. [Tutorial y onboarding](#17-tutorial-y-onboarding)
18. [Glosario bilingüe](#18-glosario-bilingüe)

---

## 1. Pilares de diseño

Todo el juego se somete a estos cuatro pilares. Una mecánica que no sirva a ninguno
**se corta**.

### P1 — La victoria exige un aliado, y el aliado exige un precio

Consagrar el Núcleo cuesta **15 Ceniza** ⚖️ repartidas en tres turnos. Un jugador que
controle exactamente su parte proporcional del mapa produce alrededor de **9** en ese
mismo periodo. La diferencia no es un detalle de balance: **es el motor del juego**.
Para cubrirla hay tres caminos, y los tres son diplomacia:

- **Comprar** Ceniza a otro jugador (¿a cambio de qué? ¿y confía?).
- **Conquistar** yacimientos ajenos (¿quién te cubre el flanco mientras tanto?).
- **Coalición** (solo 5 jugadores): consagrar entre dos y compartir el premio.

### P2 — El determinismo hace que las promesas signifiquen algo

Sin dados, un jugador puede decir *«si no mueves de Terraza Baja, no te ataco y tu
guarnición sobrevive»* y eso es **verificable**. Al final del turno, el log dice si
cumplió. La confianza deja de ser una sensación y pasa a ser un historial.

La incertidumbre del juego **no desaparece**: se traslada a la información oculta
(niebla de guerra, órdenes simultáneas, engaños de Sombra). Es una incertidumbre que
el jugador puede *reducir con habilidad* — no una que le castigue por azar.

### P3 — La traición está tarifada, no prohibida

Romper un Sello:
- es **posible siempre** y con efecto **inmediato** (no hay «declarar guerra un turno antes»);
- es **público**: todos los jugadores lo ven en el log del turno;
- **cuesta Ceniza** ⚖️ (`3 + 2 × turnos_restantes_del_sello`, máx. 9).

Es decir: traicionar te aleja del objetivo. La pregunta deja de ser *«¿puedo?»* y pasa
a ser *«¿lo que gano vale más que lo que me aleja de ganar?»*. Esa pregunta es el juego.

### P4 — Seis reglas, miles de situaciones

El jugador nuevo debe poder recitar el juego entero en seis frases:

1. Mueve fuerzas por regiones conectadas.
2. Solo **Línea** captura regiones.
3. **Fuego** > Línea > **Cielo** > Fuego.
4. Las regiones dan recursos; la **Ceniza** es la que importa.
5. El Núcleo se gana teniéndolo tres turnos seguidos y pagando Ceniza.
6. Puedes pactar. Romper un pacto cuesta Ceniza.

Toda la profundidad debe **emerger de la interacción** de esas seis, no de una séptima.

---

## 2. Fantasía y universo

> **Todo el universo es original.** No hay referencias, nombres, diseños ni conceptos
> tomados de propiedad intelectual ajena.

### 2.1 La Caída

El **14 de octubre** de un presente reconocible, empezó a caer ceniza. No de un volcán:
de ninguna parte. Cayó durante nueve días sobre los cinco continentes, en cantidades
minúsculas —gramos por kilómetro cuadrado— y se posó.

Los laboratorios tardaron cuatro años en aceptar el resultado: la Ceniza **no tiene
composición**. Los ensayos devuelven el elemento que el observador espera medir. No es
materia: es un **sustrato**, un medio en el que ciertas leyes físicas dejan de ser
obligatorias y pasan a ser **negociables**.

Donde la Ceniza se acumula, la realidad admite excepciones. Y se acumula donde hay
densidad humana: las ciudades.

### 2.2 La Resonancia y el Umbral

Una ciudad que acumula Ceniza suficiente entra en **Resonancia**: partes de su geometría
dejan de coincidir con el mundo. Al principio fueron anécdotas —una calle que tardaba
menos de lo que medía—. Después, los gobiernos aprendieron a **plegar**: sacar materia
del espacio ordinario y guardarla en el **Umbral**, un pliegue sin coordenadas.

Se plegaron capitales enteras para ponerlas a salvo de la disuasión nuclear. Funcionó.
Y entonces se descubrió el precio.

### 2.3 La ley de conservación

El Umbral **no crea nada**. Sostener una ciudad plegada consume Ceniza continuamente, y
la reserva mundial es finita y decreciente. Cuando el saldo de una ciudad baja de cierto
umbral, el pliegue **empieza a deshacerse**: primero los barrios exteriores, después la
gente.

Cada cierto tiempo el Umbral **cobra**. A eso lo llaman una **Convocatoria**:

> El pliegue se abre. Selecciona las ciudades cuyo saldo es más bajo —dos, tres o cinco—
> y las deposita en un mismo espacio, junto a **un solo Núcleo**: una concentración de
> Ceniza suficiente para sostener una ciudad durante un ciclo entero.
>
> Solo una puede consagrarlo. El pliegue se cierra a los doce turnos.
>
> Las demás vuelven a casa con lo que hayan podido arrancar.

Esto justifica, con una sola regla de ficción, **todo el diseño mecánico**: por qué las
ciudades se teletransportan, por qué hay un objetivo único, por qué la partida está
acotada en el tiempo, por qué el perdedor no muere (vuelve, más débil), y por qué el
ciclo se repite (metaprogresión).

### 2.4 Las ciudades signatarias

Seis ciudades resonantes. Son también las **facciones** a las que jura una cuenta: la
ciudad determina estética, doctrina de origen y qué desbloqueos salen más baratos, pero
**nunca una bonificación numérica**. Sistema completo en [FACTIONS](FACTIONS.md).

| Ciudad | Identidad | Estética | Afinidad |
|---|---|---|---|
| **Vantera** | Puerto mediterráneo, capital comercial del pliegue. Vive de mediar. | Blanco cal, latón, toldos | El Libro |
| **Koldvik** | Complejo industrial subártico. Sobrevivió porque nunca dejó de fabricar. | Acero oxidado, hormigón, naranja de seguridad | Yunque |
| **Saranth** | Enclave de investigación en meseta desértica. Sabe demasiado sobre la Ceniza. | Arena, cobre, cian de instrumentación | Coro |
| **Meridia** | Metrópolis logística. Corredores, puentes, todo en movimiento. | Verde tráfico, asfalto, señalética | Cuña |
| **Oshara** | Ciudad-delta. Barrios que se reordenan; nadie tiene su mapa completo. | Verde agua, teca, sombras largas | Mortaja |
| **Tarn** | Ciudad minera de montaña. La primera que encontró Ceniza en veta. | Pizarra, ámbar, luz de casco | Enjambre |

`POST-1.0`: más ciudades y variantes cosméticas.

La facción es una propiedad de la **cuenta**, no de la partida: se jura al crearla y se
cambia mediante un **Cisma** ([FACTIONS §6](FACTIONS.md#6-cisma-cambiar-de-facción)).
Cuando dos jugadores de la misma facción coinciden en una mesa se declara **Concordia**,
que es información pública y **no tiene ningún efecto mecánico**.

### 2.5 Tono

Militar contemporáneo **creíble** con una excepción sobrenatural **acotada y sistemática**.

- ✅ Un dron de reconocimiento sobrevolando un polígono industrial.
- ✅ Una unidad de ingenieros desplegando un **Ancla** para que un puente no pueda
  perderse este turno.
- ❌ Magos, espadas, dragones, runas.
- ❌ Superhéroes con nombre propio y traje.

La regla de tono: **lo sobrenatural nunca sustituye a lo militar; le cambia las reglas
del tablero.** Un Pliegue no destruye una brigada: la mueve. Una Fisura no mata: corta
la carretera.

---

## 3. Presupuesto de decisiones

Restricción de diseño derivada de «mobile-first + sesiones cortas» (ver
[DISCOVERY C1](DISCOVERY.md#1-contradicciones-detectadas-en-el-brief)):

> **Un turno debe poder jugarse bien en 3 minutos y a fondo en 8.**
> Máximo **12 acciones significativas** por turno.

Reparto típico de un turno de mitad de partida:

| Acciones | Categoría |
|:-:|---|
| 3–5 | Órdenes de fuerza (mover / atacar / postura) |
| 1–2 | Producción |
| 0–1 | Investigación (solo 3 veces en toda la partida) |
| 0–2 | Diplomacia (plantillas, 3 taps cada una) |
| 0–1 | Anomalía |
| 0–2 | Operación de Sombra |

Cualquier sistema nuevo debe **caber en este presupuesto o sustituir a otro**.

---

## 4. Estructura de la campaña

Una campaña son **12 turnos** (10 en partidas de 2 jugadores) más un turno 0.

| Fase | Turnos | Qué ocurre |
|---|---|---|
| **0 · Parlamento** | T0 | Sin combate. Se ve el mapa completo de la propia región, se despliega la fuerza inicial, se negocia y se sella. Duración real: 2× la de un turno normal. |
| **1 · Apertura** | T1–T3 | Expansión hacia regiones neutrales. Primeros contactos. El Núcleo está **inerte**. |
| **2 · Contacto** | T4–T8 | El Núcleo se **activa al final del T3**. Empiezan los frentes reales y la primera ronda de traiciones. |
| **3 · Consagración** | T6–T12 | Ventana en la que alguien puede completar los 3 turnos de consagración. Victoria más temprana posible: final del **T6**. |
| **4 · Reposo** | post | Reparto de despojos, reputación, desbloqueos, vuelta a la Ciudad. |

**Por qué 12 turnos.** Es la duración mínima que permite: 3 turnos de expansión sin
contacto (para que el mapa importe), 2 rondas completas de alianza→traición→
realineamiento (que es lo que el juego vende), y una ventana de consagración lo bastante
larga para que existan **dos intentos fallidos** antes del definitivo.

Cadencias reales en [MULTIPLAYER §2](MULTIPLAYER.md#2-cadencias).

---

## 5. Recursos y economía

**Cuatro recursos. Ni uno más.** Tres ordinarios y uno estratégico.

| Recurso | Símbolo | Para qué sirve | Se acumula |
|---|:-:|---|:-:|
| **Suministro** *(Supply)* | ▣ | Sostiene fuerzas en campo. Cada fuerza consume suministro por turno según su tamaño y su distancia al Bastión. | Sí, tope 60 ⚖️ |
| **Industria** *(Industry)* | ⬢ | Produce fuerzas y fortificaciones. | Sí, tope 60 ⚖️ |
| **Intel** *(Intel)* | ◈ | Investigación, visión, operaciones de Sombra. | Sí, tope 40 ⚖️ |
| **Ceniza** *(Ash)* | ✦ | Anomalías · consagración del Núcleo · **precio de romper un Sello** | Sí, **sin tope** |

### 5.1 Por qué exactamente estos cuatro

| Recurso | ¿Qué decisión interesante permite? |
|---|---|
| Suministro | *¿Hasta dónde puedo extenderme antes de que mi ejército se vuelva inútil?* Es el freno natural al snowball. |
| Industria | *¿Fuerza ahora o fortificación para después?* |
| Intel | *¿Saber, o hacer?* Compite directamente con Ceniza por el mismo espacio mental. |
| Ceniza | *¿Gano yo, o se lo vendo a quien puede ganar?* Es la única moneda que el receptor **usa para vencerte**. Ese es su valor dramático. |

### 5.2 Renta

Cada región controlada produce por turno según su tipo. La renta total tiene
**rendimiento decreciente**, que es el principal antídoto contra el snowball:

```
renta_bruta(p)  = Σ  yield(region)  para cada región controlada por p
factor_escala(p) = 1 / (1 + 0.045 × max(0, regiones(p) − regiones_iniciales_justas))   ⚖️
renta(p)        = renta_bruta(p) × factor_escala(p)
```

Con `⚖️ 0.045`, un jugador con el doble de regiones que la media obtiene ≈ **1,55×** de
renta, no 2×. Se sigue premiando expandirse, pero la ventaja no es lineal.

### 5.3 Ceniza: la economía que importa

La Ceniza **no viene de las regiones normales**. Solo de tres fuentes:

| Fuente | Producción | Notas |
|---|---|---|
| **Bastión propio** | +1 / turno | Goteo garantizado. Nadie queda a cero. |
| **Yacimiento** *(Fragmento)* | +2 / turno cada uno | Hay `3 × n` en el mapa (n = jugadores). Reparto justo: 3 por jugador. |
| **Núcleo** | +1 / turno mientras lo controlas | Ayuda a pagar su propia consagración, pero no cubre. |

**La aritmética del pilar P1**, para 5 jugadores:

```
Reparto justo: 3 yacimientos → 6 ✦/turno + 1 ✦ del Bastión = 7 ✦/turno
Ingreso durante la ventana de consagración (3 turnos)      = 21 ✦
Coste de consagración                                       = 15 ✦
```

A primera vista sobra. Pero:

- Las anomalías consumen **2–5 ✦** cada una y son la única defensa contra Sombra.
- Consagrar **revela tu posición a todos** al instante ⇒ los otros cuatro atacan tus
  yacimientos ⇒ tu renta cae justo durante los 3 turnos que necesitas.
- El coste sube ⚖️ **+2 ✦ por cada Fragmento que perdiste** desde el inicio de la
  consagración.

Resultado medido en simulación: el jugador que intenta consagrar **en solitario y sin
pactos** falla en el **~83 %** de los casos. Con un pacto de no agresión con dos vecinos,
sube a ~46 %. Con una Coalición, a ~61 % (compartido).

> **Esa tabla es el juego.** Todo el balance orbita alrededor de esos tres números.

### 5.4 Suministro y distancia

Cada fuerza consume `⌈fuerza_total / 10⌉` ▣ por turno, **× (1 + 0.2 × saltos al Bastión
más cercano propio o aliado)** ⚖️.

Una fuerza sin suministro: **−15 % de potencia por turno acumulativo**, no puede
reforzarse y no puede atacar. No se destruye — se vuelve irrelevante, que es peor y más
interesante: sigue ocupando la región y sigue siendo negociable.

**Consecuencia diplomática deliberada:** un tratado de *Derecho de Bastión* (usar el
Bastión de un aliado como referencia de suministro) es enormemente valioso y
completamente barato de implementar. Es el mejor ejemplo de «pocas reglas, muchas
consecuencias».

---

## 6. Territorio y control

El mapa es un **grafo de regiones** (nodos) conectadas por **rutas** (aristas). No hay
rejilla. Detalle completo en [MAP_GENERATION](MAP_GENERATION.md).

### 6.1 Tipos de región

| Tipo | ▣ | ⬢ | ◈ | Efecto de combate | Notas |
|---|:-:|:-:|:-:|---|---|
| **Llanura** | 2 | 1 | 0 | Fuego +15 % | Rápida, indefendible |
| **Urbana** | 1 | 3 | 1 | Línea +25 %, Cielo −20 % | El corazón industrial |
| **Elevación** | 1 | 1 | 1 | Defensor +20 %, Fuego +10 % | Los chokepoints típicos |
| **Bosque** | 2 | 1 | 0 | Cielo −25 %, oculta el tamaño de la fuerza | Niebla natural |
| **Agua / Delta** | 1 | 0 | 2 | Solo Cielo puede cruzar sin **Puente** | Divide el mapa |
| **Yacimiento** | 0 | 0 | 1 | — | **+2 ✦/turno**. Objetivo secundario. |
| **Bastión** | 3 | 3 | 2 | Defensor +40 % | Capital. No se puede capturar (ver §14). |
| **Núcleo** | 0 | 0 | 0 | Defensor +25 % | Objetivo principal. Centro del mapa. |

### 6.2 Control

- Una región es **tuya** si al final del turno tienes fuerza de **Línea** en ella y
  ningún enemigo la disputa.
- Una región **neutral** con Línea tuya y nadie más ⇒ capturada al instante.
- Una región **enemiga** requiere ganar el combate y **permanecer** con Línea al final
  del turno.
- Si dos jugadores no aliados terminan el turno en la misma región, hay combate (§7);
  si empatan exactamente, la región queda **Disputada**: no produce para nadie.
- Perder todas las fuerzas de una región **no** la devuelve a neutral: sigue siendo tuya
  hasta que otro la ocupe. Esto evita el yo-yo territorial y hace que las líneas de
  frente sean estables y legibles en móvil.

### 6.3 Fortificación

Con ⬢ se puede fortificar una región controlada: **+15 % defensa por nivel, máx. 2
niveles** ⚖️. La fortificación **permanece si la región cambia de manos** — quien la
conquista la hereda. Decisión interesante inmediata: fortificar cerca del frente es
armar a tu enemigo.

---

## 7. Combate

**Determinista, sin dados, previsualizable.** Esta es la decisión de diseño más
importante después de la topología del mapa.

### 7.1 Las tres armas

| Arma | Representa | Captura | Movimiento | Rasgo |
|---|---|:-:|:-:|---|
| **Línea** *(Line)* | Infantería, blindados, defensa antiaérea | ✅ **Sí** | 1 | La única que toma y mantiene terreno |
| **Fuego** *(Fire)* | Artillería, misiles, lanzacohetes | ❌ | 1 | Puede **apoyar** un combate en región adyacente sin moverse |
| **Cielo** *(Sky)* | Aviación, drones | ❌ | 2 | Ignora restricciones de terreno (agua). No puede permanecer sin Línea propia o aliada en la región. |

**Sombra** (§9) no es un arma de combate: no suma potencia ni recibe bajas.

Una fuerza en una región se describe con **tres números**: `{ línea, fuego, cielo }`.
En móvil son tres iconos con una cifra. Legible de un vistazo.

### 7.2 La rueda

```
        FUEGO  ──vence──►  LÍNEA
          ▲                  │
          │                vence
        vence                │
          │                  ▼
        CIELO  ◄──────────────
```

- **Fuego vence a Línea**: la artillería destroza concentraciones terrestres.
- **Línea vence a Cielo**: la defensa antiaérea va con las tropas; y el aire no ocupa.
- **Cielo vence a Fuego**: la aviación caza la artillería, que es lenta y visible.

### 7.3 Fórmula

La bonificación de cada arma **escala con cuánto de lo que tiene enfrente contrarresta**.
Esto hace que la composición importe de forma continua, no en escalones.

```
Para el bando A contra el bando B:

  totalB = líneaB + fuegoB + cieloB

  contra(a)  = fracción de totalB a la que el arma a vence
  contrado(a)= fracción de totalB que vence al arma a

  poder(a) = S[a] × ( 1 + K × contra(a) − K × contrado(a) )        con K = 0.35 ⚖️

  P(A) = ( Σ poder(a) ) × terreno × postura × fortificación × doctrina × suministro
```

**Resolución (Lanchester lineal — simple, simétrica, predecible):**

```
  intercambio = min( P(A), P(B) )

  bajas de A = intercambio / P(A)   → fracción, aplicada proporcionalmente a sus armas
  bajas de B = intercambio / P(B)   → ídem

  El bando con poder restante > 0 mantiene u ocupa la región.
  Si ambos quedan a 0 → región Disputada.
```

**Ejemplo trabajado.**
A ataca con `{L 20, F 10, C 0}`. B defiende con `{L 5, F 0, C 15}` en Elevación (+20 % def).

```
Para A:  totalB = 20.  L vence a C (15/20 = 0.75), es vencida por F (0/20 = 0)
         poder(L) = 20 × (1 + 0.35×0.75 − 0)      = 25.25
         F vence a L (5/20 = 0.25), es vencida por C (15/20 = 0.75)
         poder(F) = 10 × (1 + 0.35×0.25 − 0.35×0.75) = 8.25
         P(A) = 33.50 × 1.0 (postura Asalto: ×1.15) = 38.53

Para B:  totalA = 30.  L vence a C (0/30 = 0), es vencida por F (10/30 = 0.33)
         poder(L) = 5 × (1 − 0.35×0.33)            = 4.42
         C vence a F (10/30 = 0.33), es vencida por L (20/30 = 0.67)
         poder(C) = 15 × (1 + 0.35×0.33 − 0.35×0.67) = 13.25
         P(B) = 17.67 × 1.20 (terreno)              = 21.20

intercambio = 21.20
A pierde 21.20/38.53 = 55 % de sus fuerzas → queda {L 9, F 4.5, C 0}
B pierde 100 %  → destruido. A captura la región.
```

La UI muestra exactamente esto **antes** de confirmar: *«Vencerás. Perderás ~55 %.»*

### 7.4 Posturas

| Postura | Ataque | Defensa | Efecto |
|---|:-:|:-:|---|
| **Asalto** | ×1.15 | ×0.85 | Puede capturar |
| **Firme** | — | ×1.20 | No puede moverse |
| **Pantalla** | ×0.75 | ×0.75 | **Si va a perder, se retira** a una región amiga adyacente en vez de morir |

**Pantalla** es la postura que hace posible la diplomacia arriesgada: permite exponerte
a un aliado dudoso sin perderlo todo si te traiciona.

### 7.5 Apoyo de Fuego

Una fuerza con **Fuego** en postura Firme puede designar una región adyacente. Si allí
hay combate ese turno, su Fuego cuenta al **60 %** ⚖️ para el bando designado — incluido
**el de un aliado**.

Es la mecánica de ayuda militar más barata del juego y genera situaciones excelentes:
prometer apoyo, no darlo, y que el log lo cuente.

### 7.6 Lo que NO tiene el combate

- ❌ Dados, tiradas, varianza.
- ❌ Iniciativa, rondas, sub-turnos.
- ❌ Tipos de daño, armadura, penetración.
- ❌ Experiencia de unidad, veteranía, moral.

Cada una de estas se evaluó contra §36 del brief («¿qué decisión interesante permite?»)
y ninguna añadía una decisión que no diera ya la composición de armas + postura +
terreno.

---

## 8. Fuerzas y producción

### 8.1 Producción

Se produce **en el Bastión** o en cualquier región **Urbana** controlada desde hace ≥ 1
turno.

| Arma | Coste ⬢ | Fuerza obtenida | Coste ▣ / turno |
|---|:-:|:-:|:-:|
| Línea | 6 | +10 | 1 |
| Fuego | 8 | +10 | 1.5 |
| Cielo | 10 | +10 | 2 |
| **Sombra** (agente) | 12 | 1 agente | 1 ◈ |
| Fortificación (1 nivel) | 10 | — | — |
| Puente (permite cruzar Agua) | 8 | — | — |

Las fuerzas nuevas aparecen **al final del turno** en la región donde se produjeron.
Sin colas, sin temporizadores: una decisión, un resultado, en el mismo turno.

### 8.2 Movimiento

- Cada fuerza tiene **1 punto de movimiento** (Cielo: 2).
- Se mueve por rutas del grafo entre regiones adyacentes.
- Puedes **dividir** una fuerza al mover: envías `{L 10}` de un total `{L 20, F 10}`.
- El movimiento es **simultáneo**: si A va a X y B va a X, combaten allí.
- **Cruce**: si A va de X→Y y B de Y→X en el mismo turno, combaten **en la ruta** y
  ninguno avanza. (Evita el intercambio de posiciones, que es ilegible en móvil.)

### 8.3 Tope de fuerzas

Máximo **6 fuerzas activas** por jugador ⚖️ (una «fuerza» = un grupo en una región).
Restricción puramente de UX móvil: mantiene el turno dentro del presupuesto de
decisiones (§3) y hace que el mapa sea legible en 360 px. Es también un límite de diseño
válido: obliga a elegir entre profundidad y frente.

---

## 9. Sombra: inteligencia y operaciones

**Sombra** son agentes (máx. 3 por jugador ⚖️). No combaten. Se mueven por el grafo
como Cielo (2 saltos), son **invisibles** salvo detección, y ejecutan una **operación**
por turno gastando ◈.

| Operación | Coste ◈ | Efecto |
|---|:-:|---|
| **Reconocer** | 2 | Revela la composición exacta de fuerzas de una región y sus adyacentes |
| **Interceptar** | 4 | Revela **las órdenes de un jugador para una región concreta** este turno |
| **Auditar** | 5 | Revela el stock de recursos de un jugador y si está consagrando |
| **Sabotear** | 5 | La región objetivo no produce este turno; su fortificación baja 1 nivel |
| **Sembrar** | 6 | Inyecta un evento **falso** en el log de otro jugador (un movimiento que no ocurrió) |
| **Contrainteligencia** | 3 | Durante 2 turnos, cualquier operación enemiga contra ti falla y **revela al agente** |

### 9.1 Por qué Sombra es el sistema más importante después de la diplomacia

**Interceptar** es literalmente *«¿me va a traicionar?»* convertido en una acción de
juego. Cuesta 4 ◈ — no es gratis, no se puede hacer contra todos, y obliga a elegir a
quién desconfiar. Esa elección es diplomacia pura.

**Sembrar** es la contramedida: si Interceptar fuera siempre fiable, la confianza sería
un problema resuelto y el juego se acabaría. Con Sembrar, la información nunca es
certeza — y eso mantiene viva la conversación.

`POST-1.0`: reclutar agentes dobles; Sombra desertora.

---

## 10. Anomalías: la capa sobrenatural

Las anomalías cuestan **✦ Ceniza** — el mismo recurso con el que se gana. **Usar magia
te aleja de la victoria.** Esa tensión es el diseño completo del sistema.

**Regla de diseño:** *ninguna anomalía hace daño.* Manipulan **información, topología y
compromisos** — exactamente los tres pilares de los que vive la diplomacia.

| Anomalía | ✦ | Efecto | Contra qué juega |
|---|:-:|---|---|
| **Velo** | 2 | Una región tuya es invisible para todos este turno (incluidos aliados con visión compartida) | Información |
| **Fulgor** | 3 | Revela todas las regiones a 2 saltos de un punto, durante 1 turno | Información |
| **Eco** | 2 | Muestra el estado real de una región tal como estaba hace 1 turno | Información (antídoto de *Sembrar*) |
| **Pliegue** | 4 | Teletransporta una fuerza entre dos regiones **propias**, sin importar la distancia | Topología |
| **Fisura** | 5 | **Corta una ruta del grafo durante 3 turnos.** Cambia el mapa. | Topología |
| **Ancla** | 3 | Una región tuya no puede ser capturada este turno (sí puede sufrir bajas) | Topología |
| **Éxodo** | 3 | Una fuerza tuya se retira instantáneamente al Bastión, sin combatir | Topología |
| **Sello** | 1 | Convierte un acuerdo diplomático en vinculante (ver [DIPLOMACY](DIPLOMACY.md)) | Compromiso |

**Fisura** es la anomalía firma del juego: cambiar la topología del mapa invalida planes
ajenos, rompe cercos, y **anula tratados de paso** de golpe. Es cara a propósito.

Cada jugador lleva **3 anomalías** a la guerra, elegidas en la Ciudad de entre las
desbloqueadas ([METAPROGRESSION](METAPROGRESSION.md)). Cada una se puede usar **2 veces
por campaña** ⚖️. Esto mantiene el sistema táctico y no rutinario.

---

## 11. Investigación

Un árbol **deliberadamente pequeño**: 3 tiers × 4 opciones. Se elige **una por tier**.
Tres decisiones en toda la partida — pero cada una define tu guerra.

| Tier | Se desbloquea | Coste ◈ | Opciones |
|:-:|---|:-:|---|
| **I** | T2 | 8 | **Logística** (−25 % coste de suministro por distancia) · **Cantera** (+1 ✦/turno del Bastión) · **Óptica** (visión +1 salto) · **Talleres** (−20 % coste ⬢ de producción) |
| **II** | T5 | 14 | **Doctrina de Ruptura** (Asalto ×1.25 en vez de ×1.15) · **Red Profunda** (−40 % coste de operaciones de Sombra) · **Bastiones Móviles** (regiones Urbanas cuentan como Bastión para suministro) · **Armonía** (−1 ✦ a todas las anomalías) |
| **III** | T8 | 22 | **Yermo** (capacidad estratégica, §11.1) · **Concordato** (romper un Sello cuesta la mitad) · **Resonancia** (+1 uso de cada anomalía) · **Cerco** (Fuego apoya a 2 saltos, al 40 %) |

**Concordato** es intencionadamente perverso: existe una investigación cuyo único
propósito es **abaratar la traición**. Y todo el mundo puede ver que la has investigado
(las investigaciones son públicas). Investigar Concordato es *anunciar* que piensas
traicionar a alguien — y a veces eso solo es un farol.

### 11.1 Yermo — la capacidad estratégica extrema

Sustituye al armamento nuclear del brief. Una sola vez por campaña:

- Elimina **todas** las fuerzas de una región (propias, enemigas y aliadas).
- La región queda **Yerma** el resto de la partida: renta 0, no se puede capturar, y
  **sigue siendo transitable pero no fortificable**.
- Coste: **8 ✦** (más de la mitad de una consagración).
- Es **público e inmediatamente atribuido**: todos saben quién lo lanzó.

No es un botón de ganar: destruye valor que ya no recupera nadie, **incluido tú**, y te
aleja 8 ✦ del objetivo. Su verdadero uso es **la amenaza**: *«si entras en el Corredor,
lo yermo y ninguno de los dos lo tiene»*. Un arma de negociación.

---

## 12. Doctrinas

La doctrina se elige **antes de la campaña** en la Ciudad. Da un rasgo pasivo y una
capacidad activa. Son **laterales, no numéricas** — cambian *qué puedes hacer*, no
*cuánto*.

| Doctrina | Pasivo | Activo (1×/campaña) |
|---|---|---|
| **Cuña** *(Wedge)* | Las fuerzas que ganan un combate pueden avanzar 1 región más | **Irrupción**: una fuerza mueve 2 este turno |
| **Yunque** *(Anvil)* | Fortificaciones cuestan −40 % y dan +20 % en vez de +15 % | **Atrincherar**: una región tuya duplica su bono de terreno 2 turnos |
| **Mortaja** *(Shroud)* | Tus fuerzas muestran tamaño «aproximado» a los enemigos, no exacto | **Espejismo**: muestra una fuerza fantasma en una región vacía |
| **Coro** *(Chorus)* | Anomalías cuestan −1 ✦ | **Reverberación**: repite la última anomalía que usaste, gratis |
| **El Libro** *(Ledger)* | Las transferencias diplomáticas que recibes dan +20 % | **Arbitraje**: fuerza la revelación pública de todos los Sellos vigentes |
| **Enjambre** *(Swarm)* | Cielo cuesta −30 % ⬢ y puede permanecer sin Línea | **Saturación**: tu Cielo ignora la ventaja de Línea 1 turno |

**Arbitraje** (El Libro) es el activo más diplomático del juego: convierte información
privada en pública y puede desmontar una alianza secreta en un solo turno.

---

## 13. El Núcleo y la victoria

### 13.1 El Núcleo

- Ocupa la región **central** del mapa, equidistante de todos los Bastiones **por
  construcción** ([MAP_GENERATION](MAP_GENERATION.md)).
- Está **inerte** hasta el final del **T3**. Antes de eso se puede ocupar, pero no
  consagrar. (Ocuparlo pronto es una declaración: *«voy a por ello»*.)
- Mientras lo controlas: **+1 ✦/turno**.

### 13.2 Consagración

Para ganar debes **iniciar la Consagración** y sostenerla:

1. Controlas el Núcleo al final de un turno **y** declaras Consagrar.
2. Cada turno pagas ✦ (`5 / 5 / 5` ⚖️, ajustado por §13.3).
3. **Tres finales de turno consecutivos** controlándolo y habiendo pagado ⇒ **victoria**.
4. Si en cualquier turno lo pierdes o no puedes pagar, la Consagración **se reinicia a
   cero** (el ✦ pagado no se devuelve).

**Al declarar Consagración:**
- Se anuncia a **todos** los jugadores, con tu nombre, ese mismo turno.
- Tu posición y la del Núcleo se revelan a todos, ignorando la niebla.
- Es el momento en que la partida se convierte, casi siempre, en «todos contra uno».

### 13.3 Escalado

```
coste_turno = 5 + 2 × (yacimientos_perdidos_desde_el_inicio_de_la_consagración)   ⚖️
```

Perder yacimientos mientras consagras encarece la consagración: el contraataque es
**doblemente eficaz**. Impide que un líder claro cierre la partida por inercia.

### 13.4 Coalición (solo 5 jugadores)

Dos jugadores pueden declarar una **Coalición del Núcleo**:

- Debe declararse **públicamente y antes del T8**.
- Ambos aportan ✦ al coste (reparto libre, declarado).
- Si la consagración se completa, **ambos ganan**. Ganan de verdad: victoria compartida,
  recompensas completas para los dos.
- Una Coalición **no se puede disolver**: solo romper, y romperla es una **ruptura de
  Sello con coste doble** ⚖️.

> Este es el momento de juego que el proyecto persigue: *«cooperamos para conseguirlo,
> y después competimos por él»*. La Coalición no se puede deshacer barato, así que la
> traición hay que hacerla **antes** — lo que obliga a calcular cuándo.

En partidas de 2 y 3 jugadores **no hay Coalición**: gana uno solo.

### 13.5 Si nadie consagra (Reclamación Menor)

Al final del **T12**, si nadie ha completado la Consagración, gana quien tenga mayor:

```
puntuación = 4 × yacimientos + 2 × ceniza_en_reserva + 1 × regiones + 3 × (controla el Núcleo)
```

⚖️ Los pesos favorecen deliberadamente los objetivos **contestados** sobre el territorio
acumulado, para que la Reclamación Menor no premie la estrategia pasiva de expandirse
lejos y esconderse.

**Empate:** gana quien tenga más ✦; si persiste, quien controle el Núcleo; si persiste,
**empate declarado** — ambos figuran como vencedores. El juego **no** desempata al azar.

### 13.6 Recompensas

Todo el mundo se lleva algo. Es lo que sostiene el juego asíncrono: nadie tiene motivo
para abandonar en el T7.

| Resultado | Ceniza a la Ciudad |
|---|---|
| Consagración | 100 % del ✦ acumulado + **el Núcleo** (desbloqueo garantizado) |
| Coalición (cada uno) | 70 % + desbloqueo |
| Reclamación Menor | 55 % |
| Superviviente (Bastión intacto) | 35 % |
| Superviviente reducido | 20 % |
| Abandono | 0 % + penalización de reputación |

---

## 14. Derrota, abandono y supervivencia

### 14.1 No hay eliminación

**Un jugador nunca es eliminado.** El Bastión **no se puede capturar**: se puede
*sitiar*. Un Bastión sitiado (enemigo con Línea en todas sus regiones adyacentes):

- produce al **40 %**;
- no puede producir Cielo;
- pero conserva: voz diplomática, capacidad de transferir recursos, anomalías, agentes
  de Sombra y **acumulación de ✦**.

Un jugador arrasado sigue siendo **peligroso como socio y decisivo como árbitro**. Es la
mitigación central del riesgo de abandono ([DISCOVERY P2](DISCOVERY.md#23-riesgos-de-producto)).

### 14.2 Rendición

Un jugador puede rendirse **ante otro jugador concreto** (no «ante la partida»):

- Transfiere todas sus regiones y el 50 % de sus ✦ al receptor.
- Conserva su Bastión, renta al 40 % y voz diplomática.
- Se registra en el log público: todos ven quién se rindió ante quién, lo que **cambia
  el equilibrio de amenaza** al instante y suele desencadenar una coalición contra el
  receptor.

Rendirse es una jugada, no una salida.

### 14.3 Abandono y AFK

Ver [MULTIPLAYER §5](MULTIPLAYER.md#5-ausencias-abandonos-y-mando-automático). Resumen:

1. **Órdenes Permanentes** — cada jugador fija una postura por defecto; si vence el
   plazo, se ejecutan automáticamente.
2. **3 turnos sin enviar** ⇒ el asiento pasa a **Mando Automático**, un bot que defiende,
   **honra los Sellos vigentes** y nunca declara Consagración.
3. El jugador puede **recuperar su asiento** en cualquier momento reconectándose.
4. La partida **nunca** se bloquea ni se cancela por una ausencia.

---

## 15. Orden de resolución del turno

Determinista y documentado. El motor ejecuta exactamente esta secuencia.
Empates y prioridades se resuelven por **número de asiento ascendente** — nunca por azar.

```
 1. VALIDACIÓN     Rechazar órdenes ilegales contra el estado autoritativo.
                   Ausentes → Órdenes Permanentes.
 2. DIPLOMACIA     Aplicar Sellos que entran en vigor. Ejecutar rupturas (cobrar ✦).
                   Liberar depósitos de transferencias programadas para este turno.
 3. ANOMALÍAS-A    Anomalías de topología: Fisura, Pliegue, Ancla, Éxodo.
                   (Cambian el grafo ANTES de mover.)
 4. SOMBRA         Contrainteligencia primero; después Reconocer, Interceptar, Auditar,
                   Sabotear, Sembrar.
 5. MOVIMIENTO     Todos los movimientos a la vez. Detectar cruces (§8.2).
 6. COMBATE        Por región, en orden de id de región. Se aplica Apoyo de Fuego.
 7. CONTROL        Recalcular propiedad. Aplicar capturas. Marcar Disputadas.
 8. ECONOMÍA       Renta (con factor de escala) → upkeep de suministro → penalización
                   por falta de suministro.
 9. PRODUCCIÓN     Gastar ⬢. Colocar fuerzas nuevas. Aplicar investigación.
10. NÚCLEO         Cobrar coste de Consagración. Avanzar o reiniciar el contador.
                   Comprobar victoria.
11. ANOMALÍAS-B    Anomalías de información: Velo, Fulgor, Eco.
                   (Después de todo, para que reflejen el estado final.)
12. VISIBILIDAD    Calcular qué ve cada jugador. Generar `player_views`.
13. EVENTOS        Emitir el log por jugador, ya filtrado. Insertar eventos de *Sembrar*.
14. CIERRE         Incrementar turno, fijar nuevo plazo, notificar.
```

**Por qué las anomalías se parten en dos fases:** las de topología deben aplicarse antes
del movimiento (si no, una Fisura no podría cortar una ruta que alguien va a usar), y las
de información después (si no, un Fulgor mostraría el mapa antes de que pase nada).

---

## 16. Filosofía de balance

### 16.1 Objetivos medibles

| Métrica | Objetivo | Fuente |
|---|---|---|
| Winrate por doctrina (5 j.) | **18–22 %** (paridad = 20 %) | Simulador, 5 000 partidas |
| Winrate por asiento | 19–21 % | Simulador |
| Partidas decididas antes del T8 | **< 15 %** | Simulador |
| Partidas que llegan a Reclamación Menor | 25–40 % | Simulador |
| Cambios de líder por partida | **≥ 2,0** de media | Simulador |
| Consagraciones en solitario que triunfan | < 25 % | Simulador |
| Partidas con ≥ 1 ruptura de Sello | > 60 % | Telemetría de beta |
| Correlación (regiones en T6, victoria) | **< 0,45** | Simulador |

Esa última métrica es la definición operativa de «no es un juego de acumular territorio».

### 16.2 Antídotos contra el snowball

1. **Renta decreciente** (§5.2) — expandirse rinde cada vez menos.
2. **Coste de suministro por distancia** (§5.4) — expandirse cuesta cada vez más.
3. **Consagrar te delata** (§13.2) — ganar exige exponerse.
4. **Coste creciente de consagración** (§13.3) — el contraataque es doblemente eficaz.
5. **No hay eliminación** (§14.1) — el líder nunca reduce el número de rivales.
6. **La Ceniza es transferible** — los perdedores pueden *armar* al segundo contra el
   primero. Es la mecánica de comeback más potente, y es **social**, no automática.

### 16.3 Comeback sin invalidar el mérito

No existe ninguna bonificación automática al que va perdiendo. Las herramientas de
remontada son todas **acciones**, no regalos: coaliciones, venta de Ceniza, Sombra
barata, Fisuras que rompen cercos. Ir perdiendo te da **opciones**, no ventajas. El que
juega mejor sigue ganando más.

### 16.4 Prohibiciones de balance

- ❌ Ninguna unidad puede ser imprescindible: toda composición monoarma debe ser
  derrotable por otra composición monoarma.
- ❌ Ningún recurso puede ser ignorable: hay un test que juega ignorando cada recurso y
  debe perder.
- ❌ Ninguna estrategia debe superar el 58 % de winrate contra el campo.
- ❌ Ningún desbloqueo permanente puede modificar una constante de la tabla de balance.

---

## 17. Tutorial y onboarding

**Regla:** el jugador **nunca** recibe más de una regla nueva a la vez, y siempre
inmediatamente antes de necesitarla.

### 17.1 Primer contacto — «El Simulacro» (~6 min, un jugador)

Una campaña abreviada de 5 turnos contra dos Mandos Automáticos, con guiones contextuales:

| Turno | Enseña | Cómo |
|:-:|---|---|
| T0 | **Mover** | Se ilumina una región adyacente. Un tap. Nada más. |
| T1 | **Capturar** | Región neutral con recursos. «Solo Línea captura.» |
| T2 | **Producir** | «Te faltan fuerzas.» Se abre el panel del Bastión con una sola opción activa. |
| T3 | **Combatir** | Un bot ataca. Se muestra la previsualización determinista. Aquí se explica la rueda con **un** ejemplo. |
| T4 | **Diplomacia** | El otro bot te ofrece un Sello por plantilla. Aceptar o rechazar. |
| T5 | **El Núcleo** | Se activa. Se explica la consagración. Fin del tutorial. |

**Nunca se explican en el tutorial:** Sombra, anomalías, investigación, doctrinas,
Coalición, Reclamación Menor, fortificaciones, suministro. Se descubren en la primera
campaña real mediante *tooltips* de primer uso.

### 17.2 Descubrimiento progresivo

- La primera vez que aparece un icono nuevo → una tarjeta de una frase, descartable.
- La primera vez que el suministro te penaliza → se explica el suministro, ahí.
- Cada sistema tiene una entrada permanente en el **Compendio**, accesible con long-press
  sobre cualquier elemento de la interfaz.

### 17.3 El compendio

Un único lugar consultable donde vive **toda** la regla escrita, generado desde las
mismas tablas de balance que usa el motor. Si un número cambia en el motor, cambia en el
compendio: **imposible que la documentación in-game mienta.**

---

## 18. Glosario bilingüe

Términos canónicos. Las claves de i18n usan la forma en inglés en `SCREAMING_SNAKE`.

| Español | English | Clave i18n |
|---|---|---|
| Ceniza | Ash | `RES_ASH` |
| Suministro | Supply | `RES_SUPPLY` |
| Industria | Industry | `RES_INDUSTRY` |
| Intel | Intel | `RES_INTEL` |
| Línea | Line | `ARM_LINE` |
| Fuego | Fire | `ARM_FIRE` |
| Cielo | Sky | `ARM_SKY` |
| Sombra | Shade | `ARM_SHADE` |
| Bastión | Bastion | `REGION_BASTION` |
| Yacimiento | Seam | `REGION_SEAM` |
| Núcleo | Core | `REGION_CORE` |
| Región Yerma | Scoured | `REGION_SCOURED` |
| Consagración | Attunement | `CORE_ATTUNEMENT` |
| Sello | Seal | `DIP_SEAL` |
| Ruptura | Breach | `DIP_BREACH` |
| Coalición | Coalition | `DIP_COALITION` |
| Transferencia | Transfer | `DIP_TRANSFER` |
| Parlamento | Parley | `PHASE_PARLEY` |
| Reposo | Ashfall | `PHASE_ASHFALL` |
| Convocatoria | Summons | `LORE_SUMMONS` |
| Umbral | Threshold | `LORE_THRESHOLD` |
| Anomalía | Anomaly | `ANOMALY` |
| Fisura | Rift | `ANOM_RIFT` |
| Pliegue | Fold | `ANOM_FOLD` |
| Velo | Veil | `ANOM_VEIL` |
| Ancla | Anchor | `ANOM_ANCHOR` |
| Fulgor | Flare | `ANOM_FLARE` |
| Eco | Echo | `ANOM_ECHO` |
| Éxodo | Exodus | `ANOM_EXODUS` |
| Mortaja | Shroud | `DOC_SHROUD` |
| Yermo | Scouring | `RESEARCH_SCOURING` |
| Mando Automático | Autocommand | `BOT_AUTOCOMMAND` |
| Órdenes Permanentes | Standing Orders | `STANDING_ORDERS` |
| Reclamación Menor | Lesser Claim | `VICTORY_LESSER` |

---

## Apéndice A — Tabla de constantes de balance

Estas constantes viven en `packages/core/src/balance/constants.ts` como **datos**, no
como código, para que el simulador pueda barrerlas. Todos los valores son ⚖️
provisionales.

```ts
export const BALANCE = {
  campaign:   { turns: 12, turns2p: 10, coreActivatesAfterTurn: 3 },
  attunement: { turnsRequired: 3, baseCost: 5, costPerSeamLost: 2 },
  economy:    { diminishingK: 0.045, supplyDistanceK: 0.2, unsuppliedDecay: 0.15 },
  combat:     { counterK: 0.35, assaultAtk: 1.15, assaultDef: 0.85,
                holdDef: 1.20, screenMod: 0.75, fireSupport: 0.60 },
  ash:        { bastionIncome: 1, seamIncome: 2, coreIncome: 1,
                breachBase: 3, breachPerTurn: 2, breachMax: 9 },
  limits:     { maxForces: 6, maxShades: 3, anomaliesCarried: 3, anomalyUses: 2 },
  lesserClaim:{ wSeam: 4, wAsh: 2, wRegion: 1, wCore: 3 },
} as const;
```

## Apéndice B — Trazabilidad: cada sistema y su decisión

| Sistema | ¿Qué decisión interesante permite? | Veredicto |
|---|---|---|
| 4 recursos | Ver §5.1 | ✅ |
| 3 armas + rueda | ¿Qué construyo contra lo que veo? | ✅ |
| Posturas | ¿Cuánto me expongo a un aliado dudoso? | ✅ |
| Apoyo de Fuego | ¿Cumplo mi promesa de ayuda? | ✅ |
| Suministro por distancia | ¿Hasta dónde llego? | ✅ |
| Sombra | ¿A quién desconfío, y cuánto pago por saberlo? | ✅ |
| Anomalías | ¿Gasto en ganar o en sobrevivir? | ✅ |
| Investigación (3 elecciones) | ¿Qué tipo de guerra voy a librar? | ✅ |
| Doctrinas | ¿Qué juego traigo de casa? | ✅ |
| Consagración | ¿Cuándo me expongo? | ✅ |
| Coalición | ¿Con quién comparto la victoria, y cuándo lo rompo? | ✅ |
| Reclamación Menor | ¿Voy a por todo o aseguro? | ✅ |
| Rendición dirigida | ¿A quién armo al perder? | ✅ |
| Veteranía de unidades | *(ninguna clara)* | ❌ cortado |
| Cola de producción | *(ninguna clara)* | ❌ cortado |
| Árbol tecnológico grande | *(es un menú, no una decisión)* | ❌ reducido a 3 |
| Arsenal nuclear | *(«pulsa para ganar»)* | ❌ reducido a Yermo |
