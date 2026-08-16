# Diseño de diplomacia

> **Versión:** 1.0 · Implementación: `packages/core/src/rules/diplomacy.ts`
> Este es el sistema principal del juego. Todo lo demás existe para darle apuestas.

---

## 1. La tesis

La mayoría de los 4X tienen diplomacia y casi nadie la usa, porque **conquistar siempre
es una alternativa completa**. Si puedes ganar solo, negociar es un rodeo.

Guerra de Cenizas parte de la premisa opuesta:

> **Ganar en solitario es aritméticamente improbable.**
> Consagrar el Núcleo cuesta más Ceniza de la que produce tu parte justa del mapa
> ([GDD §5.3](GAME_DESIGN.md#53-ceniza-la-economía-que-importa)), y el mapa te reparte
> un perfil económico incompleto a propósito
> ([MAP_GENERATION §5.2](MAP_GENERATION.md#52-rotación-de-perfiles--el-motor-del-comercio)).

La diplomacia no se incentiva con bonificaciones ni se fuerza con reglas. **Se hace
necesaria por aritmética.** Esa es toda la ingeniería del sistema.

### 1.1 Objetivo de diseño explícito

El sistema debe producir, sin guionizarlas, estas situaciones:

| Situación buscada | Qué la produce |
|---|---|
| Dos jugadores se alían contra un tercero | Consagrar revela al consagrante (GDD §13.2) |
| El tercero paga por romper la alianza | La Ceniza es transferible y el coste de ruptura es finito |
| Prometer ayuda y preparar la traición | Órdenes simultáneas + Apoyo de Fuego opcional |
| Cooperar por el Núcleo y después competir | Coalición, indisoluble salvo pagando |
| El dominante pierde por coordinación ajena | Sin eliminación + coste creciente de consagración |
| El débil gana por información y posición | Sombra barata + combate determinista |
| Una anomalía revierte una situación militar | Fisura / Pliegue / Ancla |

Cada fila de esta tabla es un test de la simulación de balance
([TESTING §6.7](TESTING_AND_SIMULATION.md#67-tests-de-emergencia-diplomática)).

---

## 2. El núcleo mínimo

> **Tres primitivas vinculantes. Todo lo demás es conversación.**

El brief advierte contra crear 50 sistemas diplomáticos. La respuesta es la disciplina
opuesta: **tres** verbos que el servidor entiende y ejecuta.

| # | Primitiva | Qué garantiza el servidor | Qué NO garantiza |
|:-:|---|---|---|
| **1** | **Sello** *(Seal)* | Que romperlo cueste Ceniza y sea público al instante | Que no se rompa |
| **2** | **Transferencia** *(Transfer)* | Que lo prometido se entregue exactamente cuando se dijo (depósito en garantía) | Que la contrapartida social se cumpla |
| **3** | **Coalición** *(Coalition)* | Que si se consagra el Núcleo, ganan los dos | Que sigan siendo amigos |

Todo lo demás —planes, amenazas, mentiras, reparto de objetivos, «ataca tú por el norte»—
es **texto y plantillas**: socialmente real, mecánicamente inexistente.

### 2.1 Por qué exactamente estas tres

| Primitiva | ¿Qué decisión interesante permite? |
|---|---|
| Sello | *¿Cuánto vale mi palabra hoy, y cuánto me la pagarían mañana?* |
| Transferencia | *¿Le doy ahora, o le hago dar primero?* — resuelve el problema del primer movimiento sin resolverlo del todo |
| Coalición | *¿Comparto la victoria o me arriesgo a no tener ninguna?* |

Se evaluaron y **rechazaron** para v1.0: tratado de defensa mutua automática (quita la
decisión de si ayudar), voto de expulsión (kingmaking puro), embargo comercial
(inaplicable con 5 jugadores), mercado abierto de recursos (elimina la negociación
persona a persona, que es el producto).

---

## 3. Ofertas: la unidad de interacción

Toda diplomacia sucede a través de una **Oferta**: una estructura de datos, no una frase.

```ts
interface Offer {
  id: string;
  from: Seat;
  to: Seat[];                      // 1 destinatario, o varios (oferta pública)
  give: Consideration[];           // lo que yo pongo
  want: Consideration[];           // lo que pido
  duration?: number;               // turnos, para Sellos
  note?: string;                   // texto libre, máx. 200 car. — OPCIONAL
  expiresAtTurn: number;
}

type Consideration =
  | { kind: 'resource'; res: 'supply'|'industry'|'intel'|'ash'; amount: number }
  | { kind: 'region';   regionId: number }
  | { kind: 'vision';   scope: 'all'|'region'; regionId?: number; turns: number }
  | { kind: 'seal';     seal: SealKind; turns: number }
  | { kind: 'passage';  turns: number }        // derecho de paso por mis regiones
  | { kind: 'bastion';  turns: number }        // derecho de suministro desde mi Bastión
  | { kind: 'coalition' }
  | { kind: 'nothing' };                       // regalo unilateral, o extorsión
```

**Que la oferta sea una estructura y no texto es lo que hace posible el juego en móvil y
en dos idiomas.** Un jugador escribe en español y otro la lee en inglés: es la misma
oferta, renderizada por el sistema de i18n.

### 3.1 Composición por plantillas

Componer una oferta son **3–4 taps**, nunca escribir:

```
┌──────────────────────────────────────┐
│  NUEVA OFERTA          para: Koldvik │
├──────────────────────────────────────┤
│  DOY                                 │
│  ┌────────┬────────┬────────┬──────┐ │
│  │ ✦ 8    │ Región │ Visión │ Nada │ │  ← tap
│  └────────┴────────┴────────┴──────┘ │
│                                      │
│  QUIERO                              │
│  ┌────────┬────────┬────────┬──────┐ │
│  │  Sello │  ⬢ 20  │ Paso   │ Nada │ │  ← tap
│  └────────┴────────┴────────┴──────┘ │
│                                      │
│  DURACIÓN   ◄  4 turnos  ►           │  ← tap
│                                      │
│  «Ocho de Ceniza por no agresión     │  ← generado, traducido
│   durante cuatro turnos.»            │
│                                      │
│  [ Añadir nota ]        [ ENVIAR ]   │
└──────────────────────────────────────┘
```

El sistema propone además **3 plantillas contextuales** según el estado del juego
(*«Koldvik tiene tropas junto a tu yacimiento»* → *«Ofrecer no agresión»*). Esto reduce
drásticamente la fricción de iniciar una negociación, que es el mayor riesgo del sistema
([DISCOVERY D2](DISCOVERY.md#21-riesgos-de-diseño)).

### 3.2 Ciclo de vida

```
  PROPUESTA ──aceptar──► ACTIVA ──cumplir──► CUMPLIDA
      │                     │
   rechazar             romper (coste ✦, público)
      │                     │
      ▼                     ▼
   CADUCADA              ROTA ──► evento público + registro de reputación
```

Una oferta caduca al final del turno siguiente si no se responde. Nadie queda esperando.

---

## 4. El Sello

### 4.1 Concepto

En la ficción, el Umbral **registra** los compromisos: sellarlos consume una traza de
Ceniza, y romperlos **le cuesta al infractor**. No es magia moral: es la ley de
conservación del mundo aplicada a las promesas.

Mecánicamente esto resuelve la contradicción C4 del brief
([DISCOVERY](DISCOVERY.md#1-contradicciones-detectadas-en-el-brief)): un acuerdo puede ser
vinculante **sin** volver imposible la traición.

### 4.2 Tipos de Sello

| Sello | Qué prohíbe | Coste de sellar |
|---|---|:-:|
| **No agresión** | Atacar sus fuerzas o sus regiones | 1 ✦ cada parte |
| **Paso** | Impedir que sus fuerzas atraviesen tus regiones sin capturarlas | 1 ✦ |
| **Bastión** | Impedir que use tu Bastión como referencia de suministro (GDD §5.4) | 1 ✦ |
| **Visión** | Retirar la visión compartida antes de tiempo | 1 ✦ |
| **Contención** | Entrar en una región concreta declarada («zona neutral») | 1 ✦ cada parte |

**Contención** es el sello más interesante: crea zonas desmilitarizadas negociadas. Dos
jugadores pueden neutralizar un frente entero para dedicarse a un tercero — y todos ven
que lo han hecho.

### 4.3 Romper un Sello

```
coste_ruptura = min( 3 + 2 × turnos_restantes , 9 )        ⚖️
                × 2  si es una Coalición
                × 0.5 si has investigado «Concordato» (GDD §11)
```

Al romperse, en el mismo turno:

1. Se cobra la Ceniza. **Si no tienes suficiente, la ruptura no se ejecuta** y tu orden
   se rechaza — el Sello te protege también de tu propia impulsividad.
2. Se emite un evento **público** `SEAL_BREACHED` visible para **todos**, no solo para el
   agraviado. Aquí está la clave: la traición no es un asunto entre dos, es información
   de mercado para los otros tres.
3. Se registra en la reputación de partida.
4. El agraviado recibe **una acción de Sombra gratuita** contra el infractor durante el
   turno siguiente ⚖️ — «se te cayó la máscara»: pequeña compensación que además genera
   una respuesta interesante en vez de solo resentimiento.

### 4.4 Lo que un Sello NO hace

- No impide moverse cerca. Concentrar fuerzas en la frontera es legal y es un mensaje.
- No impide atacar a un aliado **de** tu socio.
- No expira antes de tiempo salvo rompiéndolo.
- No obliga a ayudar. **No existe la defensa mutua automática**: si tu aliado es atacado,
  ayudarle es una decisión que tomas cada turno. Ese es el punto.

---

## 5. Transferencias y el problema del primer movimiento

*«Yo te doy 8 de Ceniza y tú me das la región»* — ¿quién va primero?

El servidor resuelve la mitad del problema con un **depósito en garantía**:

```ts
type TransferSchedule =
  | { when: 'now' }                          // simultáneo en la resolución del turno
  | { when: 'turn'; turn: number }           // programado, retenido en depósito
  | { when: 'onCondition'; cond: Condition } // v1.0: solo dos condiciones (§5.1)
```

Con `when: 'now'`, ambas partes entregan **en la misma etapa de la resolución del turno**
(etapa 2 del [orden de resolución](GAME_DESIGN.md#15-orden-de-resolución-del-turno)).
Nadie va primero. Se elimina el riesgo de la entrega.

Con `when: 'turn'`, los recursos salen de tu reserva **ahora** y quedan retenidos: no
puedes gastarlos ni «arrepentirte». Prometer a futuro **cuesta liquidez inmediata**, lo
que hace que la promesa sea creíble sin ser irrompible.

### 5.1 Condiciones (solo dos, a propósito)

| Condición | Se cumple si… |
|---|---|
| `iControl(regionId)` | Al final del turno controlo esa región |
| `theyDontAttackMe` | No sufrí ataque de esa persona este turno |

Se limitó a dos deliberadamente. Un motor de condiciones general se convierte en un
lenguaje de programación dentro del juego: imposible de explicar en móvil, imposible de
traducir con claridad, e infinito de testear. Estas dos cubren el 90 % de los tratos
reales que aparecen en playtesting de juegos del género.

**Lo que el depósito NO garantiza:** que la contrapartida *social* se cumpla («te doy 8
de Ceniza si atacas a Oshara»). Eso es —y debe seguir siendo— una cuestión de confianza.
El sistema resuelve la logística de los tratos, no su moralidad.

---

## 6. Información como moneda

La información es el bien diplomático más barato de producir y el más valioso de
recibir. Es el sistema que hace que un jugador débil siga siendo relevante.

| Bien | Cómo se comparte | Coste real |
|---|---|---|
| **Visión compartida** | Sello de Visión, total o de una región | Casi nada — pero le enseña tus movimientos |
| **Órdenes interceptadas** | Compartir un resultado de Sombra | El ◈ que ya gastaste |
| **Alerta de traición** | Contarle a alguien que van a atacarle | Nada — salvo que mientas |
| **Inventario** | Auditar y compartir | 5 ◈ |

**Compartir visión es el arma de doble filo del juego.** Te ve a ti tanto como tú a él.
La decisión de aceptar visión compartida es siempre una apuesta sobre qué información
vale más.

### 6.1 Verificabilidad

Como el combate es determinista ([GDD §7](GAME_DESIGN.md#7-combate)), un jugador puede
hacer afirmaciones **comprobables**:

> «Si mantienes 20 de Línea en Terraza Baja y yo apoyo con Fuego, rechazáis el asalto.»

Al final del turno, el log dice si el apoyo llegó. La reputación deja de ser un
sentimiento y pasa a ser un **historial de hechos**. Esa es la razón técnica por la que
el combate no lleva dados.

---

## 7. Reputación

### 7.1 Dentro de la partida

Un recuento **factual**, sin puntuación ni valoración, visible para todos:

```
  KOLDVIK      Sellos:  4 honrados · 1 roto        Coaliciones: 0
  OSHARA       Sellos:  2 honrados · 0 rotos       Coaliciones: 1
  SARANTH      Sellos:  6 honrados · 3 rotos       Coaliciones: 0
```

Sin estrellas, sin «Traidor», sin karma. El juicio lo hacen los jugadores; el sistema
solo cuenta. Es una decisión de diseño deliberada: cualquier etiqueta moral sesgaría el
metajuego hacia «nunca traiciones», y la traición es el producto.

### 7.2 Entre partidas

Un historial **agregado y opcional** en el perfil:

```
  132 campañas · 71 % Sellos honrados · 8 consagraciones · 3 coaliciones
```

Reglas:

- **No hay ranking, ni ELO, ni emparejamiento por reputación.** Un jugador con mala
  reputación no es castigado por el sistema; simplemente se le conoce.
- Es **público pero no destacado**: se ve en el perfil, no sobre el mapa.
- Los datos **decaen**: solo cuentan las últimas 50 campañas.
- Abandonar (no rendirse) es el único acto que se registra con una etiqueta explícita.

> Esta es la decisión bloqueante nº 3 de [DISCOVERY §5](DISCOVERY.md#5-preguntas-que-sí-son-bloqueantes).
> Propuesta actual: **recuento factual, dentro de la partida siempre; agregado entre
> partidas, sin ranking.** Si el playtesting muestra que mata la traición, se reduce a
> solo-dentro-de-partida.

---

## 8. La Coalición

Regulada en [GDD §13.4](GAME_DESIGN.md#134-coalición-solo-5-jugadores). Desde la
perspectiva diplomática, sus tres propiedades importantes:

1. **Es pública y obligatoriamente temprana** (antes del T8). No se puede pactar en
   secreto en el último momento: hay que comprometerse cuando aún no sabes si te conviene.
2. **Es indisoluble salvo ruptura**, y romperla cuesta el doble. El coste de salir es
   conocido de antemano.
3. **Ambos ganan de verdad.** No es una victoria de segunda: los dos figuran como
   vencedores y ambos reciben el desbloqueo del Núcleo.

**El cálculo que genera:** una vez declarada la Coalición, los otros tres jugadores saben
exactamente quiénes son sus enemigos, y los coaligados saben que serán el objetivo de
todos. Declararla es **elegir tener un aliado a cambio de tener tres enemigos seguros**.

Es la decisión más difícil del juego, y ocurre alrededor del T6–T7, justo cuando la
partida necesita un pico dramático.

---

## 9. Chat

| Canal | Quién lo ve | Uso |
|---|---|---|
| **Público** | Todos | Anuncios, amenazas, acusaciones, propaganda |
| **Privado** | 2 jugadores | Negociación real |
| **Coalición** | Los coaligados | Coordinación |
| **Log** | Solo tú | Eventos del sistema, ya filtrados por niebla |

Diseño móvil: el chat **no es una pantalla aparte**. Es una hoja deslizable desde el
borde inferior que **no oculta el mapa** ([UX_MOBILE §5](UX_MOBILE.md#5-diplomacia-en-móvil)).
Negociar y mirar el mapa son la misma actividad.

Reglas: 500 caracteres, 20 mensajes/min por asiento, sin edición ni borrado (una promesa
escrita queda escrita). Bloqueo de usuario a nivel de cuenta desde v0.95.

---

## 10. Estructuras de datos

```ts
interface Treaty {
  id: string;
  kind: 'seal' | 'transfer' | 'coalition';
  parties: [Seat, Seat];
  terms: SealTerms | TransferTerms | CoalitionTerms;
  status: 'proposed' | 'active' | 'fulfilled' | 'breached' | 'expired';
  createdTurn: number;
  expiresTurn?: number;
}

interface SealTerms   { seal: SealKind; regionId?: number; }
interface TransferTerms {
  give: Consideration[]; want: Consideration[];
  schedule: TransferSchedule; escrowed: boolean;
}
interface CoalitionTerms { ashSplit: [number, number]; }
```

Los tratados viven **dentro de `GameState`** (no solo en la tabla `treaties`), porque el
motor los necesita en la etapa 2 de la resolución. La tabla es la proyección consultable;
el estado es la verdad.

---

## 11. Visibilidad de la diplomacia

| Hecho | Quién lo ve |
|---|---|
| Existe un Sello entre A y B | **Todos** |
| Los términos exactos del Sello | Solo A y B |
| Se ha roto un Sello | **Todos**, con nombres |
| Ha habido una transferencia entre A y B | **Todos** |
| Qué se transfirió | Solo A y B — salvo `Auditar` o `Arbitraje` |
| Existe una Coalición | **Todos** |
| Contenido del chat privado | Solo los participantes |

**La existencia de los pactos es pública; su contenido, privado.** Es el equilibrio que
mantiene vivo el juego social: todos saben quién habla con quién, nadie sabe qué se
dijeron. Y hay dos herramientas de pago para averiguarlo (`Auditar`, `Arbitraje`), lo que
convierte el secreto en un recurso defendible.

---

## 12. Riesgos del sistema

| Riesgo | Mitigación |
|---|---|
| **Nadie negocia** (juegan a conquistar) | Aritmética del Núcleo + perfiles económicos incompletos. Métrica de beta: **> 70 %** de partidas con ≥ 1 tratado activo. |
| **Fricción de escritura en móvil** | Ofertas por plantilla, 3–4 taps, sin teclado |
| **Barrera de idioma** | Las ofertas son datos, no texto: se renderizan traducidas |
| **La reputación mata la traición** | Recuento factual sin etiquetas; sin ranking; con decaimiento |
| **Se forma una alianza de 4 contra 1 y la partida muere** | Solo pueden ganar 1 o 2. Una alianza de 4 tiene que romperse por definición, y todos lo saben desde el turno 1. |
| **Acoso o abuso en el chat** | Límites de longitud y frecuencia; bloqueo de usuario y reporte (v0.95); el juego es plenamente jugable sin usar el chat de texto (solo con ofertas) |
| **Colusión externa** | Aceptada como parte del género ([DISCOVERY T10](DISCOVERY.md#22-riesgos-técnicos)) |

---

## 13. Plan de implementación (v0.4)

| Paso | Entrega | Test |
|:-:|---|---|
| 1 | Modelo `Treaty` + estado + persistencia | Unitario: ciclo de vida completo |
| 2 | Ofertas por plantilla (UI móvil) | E2E: componer y enviar en ≤ 4 taps |
| 3 | Sello de No agresión + coste de ruptura | Unitario: no se puede romper sin ✦ |
| 4 | Evento público de ruptura + reputación de partida | Integración: los 5 asientos ven el evento |
| 5 | Transferencia simultánea con depósito | Unitario: el depósito se libera exacto o se devuelve |
| 6 | Visión compartida | Seguridad: la visión llega vía `player_views`, nunca por el cliente |
| 7 | Los 5 tipos de Sello + Contención | Unitario por tipo |
| 8 | Chat (público / privado) con RLS | Seguridad: no se lee un canal ajeno |
| 9 | Transferencias condicionales (2 condiciones) | Unitario: se cumple y no se cumple |

La **Coalición** llega en v0.5 junto al Núcleo, porque sin objetivo no significa nada.
