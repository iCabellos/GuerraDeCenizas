# Diseño de multijugador

> **Versión:** 1.0 · Implementación: `apps/web/app/api/` + `packages/core/src/rules/turn.ts`
> Cubre: turnos, cadencias, emparejamiento, ausencias, reconexión, bots y el ciclo de vida
> de una partida.

---

## 1. Modelo de turno: simultáneo

> **Todos los jugadores dan órdenes a la vez. El servidor las resuelve juntas.**

| | Simultáneo | Secuencial |
|---|---|---|
| Espera con 5 jugadores | 0 | 4 turnos ajenos por cada uno tuyo |
| Duración de una campaña de 12 turnos (cadencia diaria) | 6 días | 30 días |
| Apto para asíncrono en móvil | ✅ | ❌ |
| Permite mentir sobre lo que vas a hacer | ✅ **sí** | Menos: el que juega después ya te ha visto |
| Complejidad de resolución | Media (hay que definir empates y cruces) | Baja |

Para un juego cuyo producto es *«te prometí que no atacaría»*, el turno simultáneo no es
solo más rápido: **es el único que hace posible la mecánica**. Si te viera moverte antes
de decidir, la promesa sobraría.

Los empates y colisiones se resuelven de forma determinista y documentada
([GDD §15](GAME_DESIGN.md#15-orden-de-resolución-del-turno)); nunca al azar, siempre por
número de asiento ascendente.

---

## 2. Cadencias

La campaña siempre son **12 turnos**. Lo que cambia es el tiempo real por turno.

| Cadencia | Plazo/turno | Campaña | Perfil | Notificaciones |
|---|:-:|:-:|---|---|
| **Blitz** | 3 min | ~50 min | Una sentada, síncrono | En la propia app |
| **Diaria** | 12 h | ~6 días | **Por defecto.** Asíncrono, dos veces al día | Push |
| **Relajada** | 24 h | ~12 días | Muy casual | Push |

El **Parlamento** (T0) siempre dura **el doble** que un turno normal: es cuando se
negocia de cero y hace falta margen.

> La cadencia por defecto de la beta es una de las tres decisiones bloqueantes
> ([DISCOVERY §5](DISCOVERY.md#5-preguntas-que-sí-son-bloqueantes)).
> **Propuesta: Diaria por defecto**, porque no exige coincidencia horaria —el mayor
> problema de un juego nuevo con pocos jugadores— y porque «una semana de guerra» del
> brief se cumple literalmente.
> **Blitz debe existir desde v0.3** aunque no sea el modo principal: sin él, probar el
> ciclo completo tarda 6 días y el desarrollo se hace insoportable.

**El motor no conoce la cadencia.** Solo recibe `deadline_at`. Cambiar de cadencia no
toca ni una línea del motor.

### 2.1 Resolución anticipada

Si **todos** envían antes del plazo, el turno se resuelve al instante. En Blitz esto
suele reducir un turno de 3 min a 40 s. Un jugador puede marcar **«esperar al plazo»**
si quiere reservarse el derecho a cambiar de opinión tras leer el chat — una decisión
diplomática por sí misma.

---

## 3. Ciclo de vida de una partida

```
   CREADA ──► LOBBY ──► PARLAMENTO ──► GUERRA ──► RESUELTA ──► ARCHIVADA
                │          (T0)       (T1..T12)      │
                │                                    │
           (< n jugadores                      match_results
            tras 10 min)                       + depósito a la Ciudad
                │
                ▼
          rellenar con bots
          o cancelar
```

| Estado | Qué se puede hacer |
|---|---|
| **Lobby** | Entrar, salir, chatear, elegir cadencia (solo el creador) |
| **Parlamento** | Desplegar la 2ª fuerza, negociar, sellar. **Sin combate.** |
| **Guerra** | Todo |
| **Resuelta** | Ver resultados, repetir la campaña, chat 24 h más |
| **Archivada** | Solo `match_results` + `(seed, órdenes)` |

### 3.1 Creación

```
POST /api/games { playerCount: 5, cadence: 'daily', visibility: 'public' | 'private' }
  → genera seed, invite_code, asiento 0 para el creador
```

Partida **privada** ⇒ código de 6 caracteres para compartir. En beta, este es el flujo
principal: es mucho más fácil juntar a cinco conocidos que llenar una cola pública
([DISCOVERY P1](DISCOVERY.md#23-riesgos-de-producto)).

### 3.2 Emparejamiento

> **Actualizado por [ADR-026](DECISIONS.md#adr-026).** El emparejamiento es ahora el
> **camino principal y único de la interfaz**: una vista, un botón, y la partida empieza
> sola en cuanto se llena. El código de invitación sigue existiendo en la base de datos y
> vuelve más adelante dentro de esa misma vista, no como pantalla aparte.

v1.0 no tiene emparejamiento por habilidad. Solo:

1. **Por código** — sin interfaz desde v0.3; ver ADR-026.
2. **Cola pública** — primero en llegar. Si tras **10 minutos** faltan jugadores:
   - `playerCount = 5` con 4 humanos ⇒ se ofrece empezar con 1 Mando Automático;
   - con 3 o menos ⇒ se ofrece convertirla en partida de 3 o de 2.
3. **Contra bots** — práctica en solitario, sin recompensas de metaprogresión salvo la
   primera vez.

Sin ELO, sin ranking: ver [METAPROGRESSION §7](METAPROGRESSION.md#7-lo-que-no-habrá).

---

## 4. Autoridad y estado

Resumen; el detalle está en [TECHNICAL_DESIGN §6–8](TECHNICAL_DESIGN.md#6-niebla-de-guerra-y-rls).

| | Cliente | Servidor |
|---|---|---|
| Órdenes en borrador | ✅ dueño | Las persiste como borrador |
| Previsualización de combate | ✅ calcula | No la usa |
| Preferencias de UI | ✅ | — |
| **Estado de la partida** | ❌ solo recibe su vista | ✅ **única verdad** |
| **Validación de órdenes** | Solo para avisar al usuario | ✅ **decide** |
| **Resolución del turno** | ❌ | ✅ |
| **Niebla de guerra** | ❌ recibe ya filtrado | ✅ la calcula |
| **Victoria** | ❌ | ✅ |

Un cliente completamente manipulado puede, como máximo, **enviar órdenes inválidas**, que
se rechazan. No puede ver lo que no debe ni alterar nada.

---

## 5. Ausencias, abandonos y Mando Automático

Este es el problema que mata a los 4X asíncronos, y la mitigación es escalonada.

### 5.1 Órdenes Permanentes

Cada jugador configura, una vez, un comportamiento por defecto:

```
  Si no envío órdenes a tiempo:
    Postura      ▸ Firme  |  Pantalla
    Producción   ▸ Nada  |  Línea  |  Repetir lo último
    Diplomacia   ▸ Rechazar todo  |  No responder
```

Al vencer el plazo se ejecutan. **Nunca atacan, nunca rompen un Sello, nunca consagran.**
Un jugador ausente se defiende y no perjudica a terceros.

### 5.2 Escalado

| Turnos sin enviar | Qué pasa |
|:-:|---|
| 1 | Órdenes Permanentes. Los demás ven un indicador «ausente» junto a su nombre. |
| 2 | Ídem + aviso push «te van a sustituir». |
| 3 | El asiento pasa a **Mando Automático**. Público. |
| — | El jugador **recupera su asiento** en cualquier momento reconectándose. |

Que la ausencia sea **pública** es importante: cambia el cálculo diplomático de todos. Un
jugador ausente es una oportunidad, y saberlo genera conversación.

### 5.3 Mando Automático

Un bot deliberadamente **conservador y honesto**:

```
- Consolida fuerzas en las regiones que ya controla; no ataca salvo para recuperar
  una región propia perdida el turno anterior.
- Produce Línea si tiene ⬢ de sobra.
- HONRA todos los Sellos vigentes. Nunca los rompe.
- Rechaza toda oferta nueva.
- Nunca declara Consagración ni Coalición.
- No usa anomalías ni Sombra.
```

Diseñado para **no decidir la partida**: no es un rival fuerte ni un regalo. Que honre
los Sellos es esencial — un tratado firmado con un humano no debe evaporarse porque se
haya ido a dormir.

### 5.4 Abandono explícito

Distinto de rendirse ([GDD §14.2](GAME_DESIGN.md#142-rendición)). Abandonar:

- entrega el asiento a Mando Automático de inmediato;
- deposita **0 ✦**;
- registra un evento de abandono en el perfil (el único con etiqueta explícita).

La partida **nunca** se cancela por un abandono. Solo se cancela si **todos** los humanos
abandonan.

---

## 6. Reconexión

El cliente no guarda nada del juego, así que reconectar es simplemente montar de nuevo:

```
1. Sesión (cookie httpOnly de Supabase SSR) → auth.uid()
2. GET última player_view (game_id, seat)
3. GET orders del turno actual → recupera el borrador
4. Suscribir Realtime
5. Renderizar
```

**Objetivo: < 2 s en 4G.** Se puede cerrar la pestaña a mitad de un turno y volver desde
otro dispositivo sin perder nada: el borrador se guarda con *debounce* de 2 s.

### 6.1 Desconexión durante Blitz

En cadencia Blitz una desconexión de 3 minutos cuesta un turno. Mitigaciones:

- Órdenes Permanentes (§5.1) se aplican igual.
- El indicador «desconectado» es visible para todos ⇒ los demás lo saben y pueden
  incorporarlo a su lectura de la partida.
- El plazo **se pausa 60 s** ⚖️ la primera vez que un jugador se desconecta en una
  partida Blitz. Una sola vez por jugador y partida: es un margen para un túnel, no un
  arma para ganar tiempo.

---

## 7. Notificaciones

| Evento | Blitz | Diaria/Relajada |
|---|:-:|:-:|
| Turno resuelto | En la app | Push |
| Quedan 20 % del plazo | En la app | Push |
| Oferta diplomática recibida | En la app | Push |
| Se rompió un Sello contigo | En la app | Push |
| Alguien declara Consagración | En la app | Push |
| Mensaje de chat | Indicador | Agrupado, máx. 1/hora |

Web Push (VAPID) desde v0.9, opt-in explícito. Máximo **4 push/día** por partida: un
juego asíncrono que notifica de más se desinstala.

---

## 8. Rendimiento y escala

| Magnitud | Valor | Límite del free tier |
|---|---|---|
| Peticiones por jugador y turno | ~3 | — |
| Bytes por jugador y turno | ~70 KB | 5 GB/mes ⇒ ~6 000 partidas-jugador |
| Conexiones Realtime por partida | 5 | 200 ⇒ **40 partidas simultáneas** |
| Tiempo de resolución (5 jugadores) | ≤ 15 ms | — |
| Escrituras por resolución | 1 + 5 vistas | — |

**El cuello de botella del free tier son las 200 conexiones Realtime concurrentes.** Con
cadencia Diaria, la ocupación real es mínima (los jugadores entran, juegan 3 minutos y
se van). Con Blitz, 40 partidas simultáneas son el techo. Suficiente para la beta;
documentado como el primer límite que se romperá.

---

## 9. Casos límite

| Caso | Resolución |
|---|---|
| Dos jugadores mueven a la misma región vacía | Combaten allí |
| A va X→Y y B va Y→X | Combaten en la ruta; **ninguno avanza** |
| Empate exacto de poder | Región **Disputada**: no produce para nadie |
| Un jugador envía órdenes dos veces | La segunda sustituye a la primera (mismo turno) |
| Órdenes recibidas justo al vencer el plazo | El `deadline_at` de la BD manda; la carrera la resuelve el advisory lock |
| Se resuelve un turno dos veces | Idempotente por `(game_id, turn)` |
| Todos abandonan | Partida `abandoned`; sin depósito para nadie |
| Todos los humanos son sustituidos por bots | La campaña se resuelve sola hasta el T12 y se archiva |
| Empate final en la Reclamación Menor | **Empate declarado**: ambos vencedores. No se desempata al azar. |
| Un jugador se rinde ante otro en el T12 | Se aplica antes de puntuar la Reclamación Menor |
| Un jugador consagra y se desconecta | La Consagración continúa: solo requiere control y ✦, no presencia |
| Migración del motor a mitad de campaña | La partida conserva su `engine_version`; nunca cambia |

---

## 10. Plan de implementación (v0.3)

| Paso | Entrega | Test |
|:-:|---|---|
| 1 | Supabase Auth (email + magic link) | E2E: registro, login, logout |
| 2 | `profiles` + RLS | Seguridad: no leo el perfil ajeno |
| 3 | Crear / unirse a partida por código | E2E: 5 clientes entran a la misma partida |
| 4 | Envío de órdenes + persistencia del borrador | Integración: cerrar y reabrir conserva el borrador |
| 5 | Resolución con advisory lock | **Concurrencia: 10 peticiones simultáneas ⇒ 1 sola resolución** |
| 6 | `player_views` + RLS | **Seguridad: no leo la vista ajena** ← bloqueante |
| 7 | Realtime | E2E: el cliente B ve la resolución sin recargar |
| 8 | Reconexión | E2E: recargar a mitad de turno no pierde nada |
| 9 | Plazos + `pg_cron` + resolución oportunista | Integración: un turno vencido se resuelve sin cliente conectado |
| 10 | Órdenes Permanentes + Mando Automático | Integración: 3 turnos sin enviar ⇒ bot; el bot honra los Sellos |
| 11 | Cadencia Blitz | Manual: partida completa en < 60 min |

Los pasos 5 y 6 son los **bloqueantes de seguridad**: sin ellos, ni el multijugador es
justo ni la niebla de guerra existe.
