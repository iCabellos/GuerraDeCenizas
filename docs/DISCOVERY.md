# Discovery — Análisis crítico del brief (Fase 0)

> **Estado:** completado · **Fecha:** 2026-08-15 · **Autor:** dirección de proyecto
> Este documento es el resultado de la Fase 0. Registra **contradicciones, riesgos y
> recortes** detectados en el brief original antes de escribir una sola línea de juego.
> No oculta problemas: los nombra y propone solución.

---

## 0. Resumen de la Fase 0

El brief es sólido y coherente en su intención (**diplomacia como núcleo, móvil como
plataforma de referencia, coste cercano a cero**), pero contiene **7 contradicciones
reales** y **~15 riesgos** que, sin resolver, harían el proyecto inviable o lo llevarían
a un 4X mediocre más.

La conclusión principal de la Fase 0 es esta:

> **El brief pide dos juegos: un gestor de ciudad y un 4X de guerra.
> Construir los dos a nivel comercial para la v1.0 es inviable.
> La decisión de proyecto es: el juego ES la guerra; la ciudad es el meta-hub.**

La segunda conclusión, igual de importante:

> **Un 4X clásico de casillas no cabe en un teléfono ni se puede validar
> matemáticamente para 5 jugadores.** Cambiamos la topología del mapa de *rejilla*
> a *grafo de regiones con simetría rotacional C<sub>n</sub>*. Esto resuelve
> simultáneamente equidad, móvil, rendimiento y pipeline de assets.

---

## 1. Contradicciones detectadas en el brief

| # | Contradicción | Por qué es un problema | Resolución adoptada |
|---|---|---|---|
| **C1** | «Mobile-first, sesiones cortas» **vs.** «4X con economía, producción, investigación, ejército, espionaje, poderes, ciudad, metaprogresión» | Un 4X completo exige 20–60 min por turno. Un móvil exige 2–5 min. Los dos no caben. | **Presupuesto de decisiones por turno: ≤ 12 acciones significativas.** Todo sistema que no quepa en ese presupuesto se corta o se mueve a la vista Ciudad (fuera del turno). Ver [GAME_DESIGN](GAME_DESIGN.md#3-presupuesto-de-decisiones). |
| **C2** | «Partidas de 2, 3 **o 5** jugadores» **vs.** «mapas matemáticamente equilibrados» | Ninguna rejilla hexagonal o cuadrada admite simetría rotacional de orden 5. Con rejilla, la equidad para 5 jugadores es *imposible por construcción* y solo aproximable con heurísticas frágiles. | **Mapa = grafo de regiones**, generado como 1 sector replicado n veces por rotación. La equidad es exacta por construcción para cualquier n. Ver [MAP_GENERATION](MAP_GENERATION.md). |
| **C3** | «Semana de guerra» **vs.** «multijugador por turnos» **vs.** «sesiones cortas» | «Una semana» puede leerse como 7 días reales (asíncrono) o como duración narrativa de una sesión de 45 min. Son dos productos distintos. | **Ambas, con la misma regla:** la guerra dura **12 turnos** fijos. Lo que cambia es la *cadencia real*: Blitz (3 min/turno, ~50 min), Diaria (12 h/turno, ~6 días), Relajada (24 h/turno). El motor no sabe qué cadencia es. Ver [MULTIPLAYER](MULTIPLAYER.md#2-cadencias). |
| **C4** | «Diplomacia central, traición posible» **vs.** «acuerdos vinculantes validados en servidor» | Si el servidor impide traicionar, no hay traición y la diplomacia muere. Si no valida nada, los acuerdos no valen nada y la diplomacia también muere. | **La traición no se prohíbe: se tarifa.** Los pactos son *Sellos* registrados por el Umbral; romperlos es legal, público, instantáneo y **cuesta Ceniza** — el recurso que necesitas para ganar. Ver [DIPLOMACY](DIPLOMACY.md#4-el-sello). |
| **C5** | «Metaprogresión» **vs.** «no romper el equilibrio competitivo» | Cualquier desbloqueo que dé números rompe el PvP; cualquier desbloqueo que no dé nada no motiva. | **Regla dura, verificada por test:** los desbloqueos permanentes **solo añaden opciones laterales**, nunca modifican una constante de balance. Existe un test automático que falla si un unlock toca la tabla de balance. Ver [METAPROGRESSION](METAPROGRESSION.md#2-la-regla-de-oro). |
| **C6** | «Simulador de miles de partidas» **vs.** «combate con aleatoriedad» **vs.** «el jugador debe poder prometer cosas» | Con dados, ni el simulador converge barato ni un jugador puede prometer «no perderás esa región». | **Combate 100 % determinista.** La incertidumbre viene de la *información oculta*, no del azar. Efecto secundario: la UI puede mostrar el resultado exacto de una batalla antes de confirmarla — enorme ganancia de UX móvil. Ver [GAME_DESIGN](GAME_DESIGN.md#7-combate). |
| **C7** | «Vista A: ciudad principal con economía, producción, investigación, diplomacia, infraestructura, inteligencia, ejército, tecnología, desarrollo sobrenatural…» **vs.** «no inventar complejidad» y «si una feature no aporta a 1.0, elimínala» | La vista Ciudad descrita es, por sí sola, un juego completo (tipo *Travian*). Duplica todos los sistemas de la guerra. | **Recorte explícito.** Para v1.0 la Ciudad es un **hub de progresión y loadout** (6 distritos, 3 niveles, elección de doctrina y cartas). Sin cola de producción, sin timers, sin economía paralela. Un gestor de ciudad profundo es post-1.0. Ver [METAPROGRESSION](METAPROGRESSION.md#5-la-ciudad). |

---

## 2. Riesgos

Escala: **P** = probabilidad (1–5), **I** = impacto (1–5), **R** = P×I.

### 2.1 Riesgos de diseño

| ID | Riesgo | P | I | R | Mitigación |
|---|---|:-:|:-:|:-:|---|
| **D1** | **La diplomacia no ocurre.** Los jugadores ignoran el chat y juegan a conquistar, como en todo 4X. | 4 | 5 | **20** | La victoria es *económicamente imposible en solitario*: consagrar el Núcleo cuesta más Ceniza de la que produce el reparto justo de un jugador. Comerciar o conquistar Fragmentos ajenos son las únicas salidas. La diplomacia deja de ser social y pasa a ser **aritmética**. |
| **D2** | **Rueda de fricción social.** Escribir en un móvil es doloroso ⇒ nadie negocia. | 5 | 4 | **20** | **Diplomacia por plantillas:** ofertas compuestas con 3–4 taps (`[Doy] [8 Ceniza] [por] [No agresión 4 turnos]`). El texto libre es opcional. Todas las plantillas están traducidas ⇒ un español y un inglés pueden negociar sin idioma común. |
| **D3** | **Kingmaking tóxico.** Un jugador eliminado o sin opciones decide quién gana por rencor. | 4 | 3 | 12 | **No hay eliminación.** Un jugador arrasado conserva su Bastión, renta reducida y voz diplomática, y **sigue puntuando** vía Fragmentos para la metaprogresión: siempre tiene algo propio que perseguir además de vengarse. |
| **D4** | **Snowball.** Quien gana la primera batalla gana la partida. | 4 | 4 | 16 | Renta **decreciente por región** (log), coste de suministro creciente con la distancia al Bastión, y **el Núcleo penaliza al líder**: consagrarlo revela tu posición a todos y aumenta el coste por cada Fragmento que ya controlas. Verificado por el simulador (métrica `lead_change_rate`). |
| **D5** | **Estrategia dominante** (una composición o una apertura resuelve el juego). | 4 | 4 | 16 | Simulador con perfiles de bot; test de balance que falla si una doctrina supera el **58 %** de winrate o baja del **42 %** en 5 000 partidas. |
| **D6** | **La capa sobrenatural es un pegote.** Poderes que se sienten ajenos al resto. | 3 | 4 | 12 | Las anomalías **no hacen daño**: alteran *información, topología y compromisos* (ocultar, plegar, cortar aristas, sellar juramentos). Es decir, atacan justo las tres cosas de las que vive la diplomacia. |
| **D7** | **La guerra nuclear como botón de ganar.** | 3 | 4 | 12 | Recortado de v1.0 como arma. Existe **una** capacidad estratégica extrema (`Yermo`) que destruye la renta de una región *y* la vuelve inutilizable para todos, incluido quien la lanza, y **quema Ceniza** — es decir, aleja de la victoria. Es un arma de negociación, no de conquista. |
| **D8** | Partidas de **2 jugadores** degeneran en duelo sin diplomacia. | 5 | 2 | 10 | El modo 2p se declara explícitamente como *modo de aprendizaje / duelo*, con la guerra acortada a 10 turnos y sin Coalición. No es el modo de referencia; el modo de referencia es **5 jugadores**. |

### 2.2 Riesgos técnicos

| ID | Riesgo | P | I | R | Mitigación |
|---|---|:-:|:-:|:-:|---|
| **T1** | **Niebla de guerra vs. RLS.** Si el estado completo vive en una tabla que el jugador puede `SELECT`, la niebla de guerra es decorativa: cualquiera lee el estado real con la API pública de Supabase. | 5 | 5 | **25** | El estado autoritativo (`game_states`) **niega todo `SELECT`** por RLS. El resolutor escribe además `player_views`, una proyección **por asiento y ya filtrada**, con RLS `seat = mi asiento`. El cliente jamás ve datos que no debería. Ver [TECHNICAL_DESIGN](TECHNICAL_DESIGN.md#6-niebla-de-guerra-y-rls). |
| **T2** | **Resolución de turno concurrente.** Dos peticiones resuelven el mismo turno ⇒ estado corrupto o duplicado. | 4 | 5 | **20** | `pg_advisory_xact_lock(game_id)` + `UPDATE … WHERE state_version = $V` (bloqueo optimista) dentro de una transacción. La resolución es **idempotente por (game_id, turn)**. |
| **T3** | **No hay cron gratuito de un minuto.** Vercel Hobby permite **1 cron diario**. Los turnos vencen cada 3 min o 12 h. | 5 | 4 | **20** | Triple disparador: (a) resolución inmediata cuando **todos** han enviado órdenes; (b) `pg_cron` en Supabase cada minuto → `pg_net` a `/api/cron/resolve-due`; (c) resolución **oportunista**: cualquier petición de cliente comprueba si hay turnos vencidos. Ninguno depende de Vercel Cron. |
| **T4** | **Vercel Hobby prohíbe el uso comercial.** Si el juego monetiza o se percibe como producto, el plan Hobby se incumple. | 3 | 4 | 12 | Documentado. Mientras sea beta gratuita y sin monetización, Hobby es válido. Monetizar ⇒ Vercel Pro (20 $/mes). Ver [README](../README.md#coste-y-límites). |
| **T5** | **Cuota de Supabase Free (500 MB).** Guardar el estado de cada turno de cada partida la agota. | 4 | 3 | 12 | Snapshot completo solo cada 4 turnos + log de eventos; poda de `player_views` a los 3 últimos turnos; partidas terminadas → resumen + semilla (**la partida se puede reconstruir desde `seed + órdenes`**, no hace falta guardar el estado). Coste real ~**80 KB/partida**. |
| **T6** | **Motor duplicado** cliente/servidor que diverge. | 4 | 4 | 16 | **Un solo motor** en `packages/core`, TypeScript puro, sin dependencias, sin I/O. Lo consumen los tres: servidor (autoridad), cliente (solo *preview*), simulador (balance). Test de determinismo: mismo estado + mismas órdenes ⇒ mismo *checksum* en los tres. |
| **T7** | **Realtime**: 200 conexiones concurrentes en el free tier. | 2 | 3 | 6 | Suficiente para beta cerrada (≈40 partidas simultáneas de 5). Con cadencia Diaria casi nadie está conectado a la vez. Documentado el punto de ruptura. |
| **T8** | **Bundle móvil** demasiado grande ⇒ carga lenta en 4G. | 3 | 3 | 9 | Presupuesto duro: **≤ 180 KB** JS comprimido en la ruta de partida, verificado en CI. Mapa en SVG (no WebGL, no tilesets). Sin librería de UI. |
| **T9** | **Cheating por cliente.** | 4 | 5 | **20** | Ninguna decisión crítica en cliente. Toda orden se valida en servidor contra el estado autoritativo (no contra el que envía el cliente). Ver [TECHNICAL_DESIGN](TECHNICAL_DESIGN.md#11-modelo-de-amenazas). |
| **T10** | **Colusión externa** (dos jugadores hablando por WhatsApp). | 5 | 2 | 10 | **No se mitiga: se acepta como parte del género.** La colusión *es* diplomacia. Lo que sí se limita es la colusión de *cuentas múltiples* (mismo humano con 2 asientos): detección por telemetría en beta, no en v1.0. |

### 2.3 Riesgos de producto

| ID | Riesgo | P | I | R | Mitigación |
|---|---|:-:|:-:|:-:|---|
| **P1** | **No hay jugadores suficientes** para llenar partidas de 5. | 5 | 4 | **20** | Prioridad al modo asíncrono (no exige coincidencia horaria) + relleno con **Mando Automático** (bot) tras 3 min de lobby + partidas privadas por código de invitación como caso de uso principal en beta. |
| **P2** | **Abandono a mitad de partida** (el asesino de todo 4X asíncrono). | 5 | 5 | **25** | **Órdenes Permanentes**: cada jugador fija una postura por defecto; si vence el plazo, se ejecutan. A los 3 turnos sin enviar, el asiento pasa a Mando Automático, que **honra los pactos vigentes**. La partida nunca se bloquea. |
| **P3** | Alcance de v1.0 demasiado grande ⇒ nunca se termina. | 4 | 5 | **20** | Roadmap con criterios de aceptación por versión y **lista explícita de recortes** (ver §4). Cada versión debe ser jugable de forma aislada. |

---

## 3. Sistemas que el brief pide y que **no** superan el filtro

El brief (§36) exige que todo sistema responda: *¿qué decisión interesante permite?*
Estos no la responden con claridad suficiente para v1.0:

| Sistema pedido | Veredicto | Razón |
|---|---|---|
| Cola de producción en la Ciudad con temporizadores | **Cortado** | Decisión trivial («construir lo siguiente») + patrón *free-to-wait* que contradice «sesiones cortas». |
| Economía paralela ciudad/guerra | **Cortado** | Duplica sistemas y obliga al jugador a aprender dos economías. La renta de la guerra alimenta la Ciudad; no al revés. |
| Árbol tecnológico grande (40+ nodos) | **Reducido** | 12 nodos, se eligen 3 por guerra. Un árbol grande en móvil es un menú, no una decisión. |
| Satélites como sistema propio | **Fusionado** | Absorbido por el arma **Cielo** y por operaciones de **Sombra** (inteligencia). |
| Guerra electrónica como sistema propio | **Fusionado** | Es una operación de **Sombra**. |
| Armamento nuclear como arsenal | **Reducido a 1 capacidad** | Ver riesgo D7. |
| Tecnología espacial / orbital | **Post-1.0** | No aporta una decisión que no dé ya **Cielo**. |
| Objetivos ocultos individuales | **Post-1.0 (v1.1)** | Excelente para la diplomacia, pero multiplica el trabajo de balance y de traducción. Anotado como la primera feature post-1.0. |
| Cesión territorial por tratado | **v0.4** | Se mantiene: es barato y genera muchísimas situaciones. |
| Visión compartida por tratado | **v0.4** | Se mantiene: es *la* moneda diplomática barata. |

---

## 4. Dependencias y orden obligatorio

```
core/engine (determinismo, estado, turnos)
        │
        ├──► mapgen ──► simulador ──► balance
        │
        ├──► API autoritativa ──► RLS + player_views ──► cliente
        │
        └──► diplomacia (necesita: estado + log de eventos + visibilidad)
                    │
                    └──► objetivo especial (necesita: Ceniza + diplomacia)
                                │
                                └──► metaprogresión (necesita: resultados)
```

Consecuencia práctica: **la diplomacia no se puede implementar antes que el log de
eventos con visibilidad por jugador**, porque «te prometí no atacarte» solo significa
algo si el sistema puede probar después qué pasó. Por eso el log de eventos con
`visibility` entra ya en **v0.2**, no en v0.4.

---

## 5. Preguntas que sí son bloqueantes

Solo tres decisiones cambian materialmente el trabajo. El resto se ha decidido por
defecto y está registrado en [DECISIONS.md](DECISIONS.md).

1. **Cadencia por defecto de la beta** — ¿Blitz (una sentada de ~50 min) o Diaria
   (12 h/turno, ~6 días)? Cambia el foco de UX, de notificaciones y de pruebas.
   *Propuesta: Diaria por defecto, Blitz disponible desde v0.3 para poder testear.*
2. **Ámbito de la Ciudad en v1.0** — ¿se acepta el recorte a hub de loadout (C7)?
   *Propuesta: sí.*
3. **Anonimato de la reputación** — ¿la reputación entre partidas es pública?
   Pública castiga la traición y puede matar la mecánica; privada la vuelve inútil.
   *Propuesta: pública pero **solo dentro de la partida** y como recuento factual
   («Sellos honrados 8/11»), sin puntuación ni ranking global.*

---

## 6. Salida de la Fase 0

- ✅ Contradicciones identificadas y resueltas: 7/7.
- ✅ Riesgos catalogados con mitigación: 21.
- ✅ Recortes explícitos aprobados: 9 sistemas.
- ✅ Decisión estructural clave: **mapa como grafo con simetría C<sub>n</sub>**.
- ✅ Decisión estructural clave: **un solo motor determinista compartido**.
- ➡️ Fase 1 (documentación) puede comenzar.
