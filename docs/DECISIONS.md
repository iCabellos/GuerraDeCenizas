# Registro de decisiones (ADR)

> Toda decisión que condicione el proyecto se registra aquí. **Si una decisión cambia, se
> añade una entrada nueva que sustituya a la anterior — nunca se edita la histórica.**
> Formato: contexto → decisión → consecuencias → alternativas descartadas.

**Estados:** `aceptada` · `propuesta` (pendiente de confirmar) · `sustituida` · `revertida`

| # | Decisión | Estado |
|---|---|---|
| [001](#adr-001) | Un solo motor determinista compartido | aceptada |
| [002](#adr-002) | El mapa es un grafo con simetría C<sub>n</sub>, no una rejilla | aceptada |
| [003](#adr-003) | Combate determinista, sin dados | aceptada |
| [004](#adr-004) | Turnos simultáneos | aceptada |
| [005](#adr-005) | Autoridad en Route Handlers, no en funciones de Postgres | aceptada |
| [006](#adr-006) | Niebla de guerra por `player_views` prefiltradas | aceptada |
| [007](#adr-007) | Estado de partida en `jsonb`, no normalizado | aceptada |
| [008](#adr-008) | Traición tarifada, no prohibida | aceptada |
| [009](#adr-009) | La metaprogresión solo añade opciones | aceptada |
| [010](#adr-010) | La Ciudad es un hub, no un gestor | aceptada |
| [011](#adr-011) | Assets como SVG escritos a mano en el repositorio | aceptada |
| [012](#adr-012) | Mapa en SVG, no Canvas ni WebGL | aceptada |
| [013](#adr-013) | Sin eliminación de jugadores | aceptada |
| [014](#adr-014) | Tres disparadores de resolución de turno | aceptada |
| [015](#adr-015) | Diplomacia por plantillas antes que texto libre | aceptada |
| [016](#adr-016) | Licencia del proyecto | **pendiente** |
| [017](#adr-017) | Tipografía | **pendiente** |
| [018](#adr-018) | Cadencia por defecto | **propuesta** |
| [019](#adr-019) | Visibilidad de la reputación | **propuesta** |
| [020](#adr-020) | Sin sistema de armamento nuclear | aceptada |
| [021](#adr-021) | Las facciones se ligan a la cuenta y solo cambian el camino | aceptada |
| [022](#adr-022) | `packages/core` se consume como fuente TypeScript, sin compilar | aceptada |

---

<a id="adr-001"></a>

## ADR-001 — Un solo motor determinista compartido
**Estado:** aceptada · 2026-08-15

**Contexto.** El juego necesita reglas en tres sitios: el servidor (autoridad), el cliente
(previsualizar) y el simulador (balance). La opción habitual —reimplementar en cada uno—
produce divergencias sutiles que aparecen como bugs de sincronización imposibles de
depurar.

**Decisión.** Un único paquete `packages/core`, TypeScript puro, **cero dependencias de
runtime**, sin I/O, sin `Date.now()`, sin `Math.random()`. Lo consumen los tres.

**Consecuencias.**
- ✅ Imposible que las reglas diverjan.
- ✅ El simulador prueba el juego real, no una aproximación.
- ✅ Los tests unitarios del motor son tests del juego.
- ⚠️ Disciplina permanente: hay una regla de lint que impide dependencias e I/O en `core`.
- ⚠️ El cliente carga la lógica del juego (es visible). Aceptable: no contiene secretos —
  los secretos son los *datos* del estado, que nunca salen del servidor.

**Descartado.** Motor en el servidor + heurística en el cliente (diverge); motor en SQL
(intestable, no reutilizable por el simulador).

---

<a id="adr-002"></a>

## ADR-002 — El mapa es un grafo con simetría C<sub>n</sub>, no una rejilla
**Estado:** aceptada · 2026-08-15

**Contexto.** El brief exige partidas de **2, 3 y 5** jugadores con mapas
«matemáticamente equilibrados», y móvil como plataforma de referencia. Ninguna teselación
regular del plano admite simetría rotacional de orden 5 (resultado cristalográfico). Y una
rejilla con suficientes casillas para ser interesante da objetivos táctiles de 4 px en
360 px de ancho.

**Decisión.** El mapa es un **grafo de 45–95 regiones**, construido como **un sector
generado y replicado n veces por rotación**.

**Consecuencias.**
- ✅ Equidad **exacta por construcción** para cualquier número de jugadores.
- ✅ El evaluador no busca equidad: solo acota el daño de la perturbación. Problema
  tratable.
- ✅ Regiones de 48–90 px: móvil resuelto.
- ✅ Métricas como chokepoints o accesibilidad son propiedades de grafo **computables
  exactamente**, no estimaciones.
- ✅ Sin tilesets ni atlas: menos assets.
- ⚠️ Menos «sensación de mapa continuo» que un 4X clásico. Se compensa con arte de
  cartografía militar, que encaja con la ambientación.
- ⚠️ Riesgo de sensación de espejo, sobre todo con 2 jugadores. Mitigado con perturbación
  acotada y rotación de perfiles económicos.

**Descartado.** Hexágonos (imposible C₅); cuadrados (ídem, y peor); ruido Perlin con
reequilibrado a posteriori (no ofrece ninguna garantía demostrable).

---

<a id="adr-003"></a>

## ADR-003 — Combate determinista, sin dados
**Estado:** aceptada · 2026-08-15

**Contexto.** El producto del juego es la negociación. Una promesa como *«si mantienes la
posición, tu guarnición sobrevive»* solo tiene sentido si es comprobable. Con dados, toda
promesa lleva un asterisco.

**Decisión.** El combate es una función determinista de las fuerzas, el terreno, las
posturas y las bonificaciones. **Sin varianza.**

**Consecuencias.**
- ✅ Se pueden hacer promesas verificables ⇒ la confianza pasa a ser un historial.
- ✅ La UI puede previsualizar el resultado exacto: enorme ganancia de UX en móvil.
- ✅ El simulador converge con muchas menos partidas.
- ✅ Ninguna derrota se atribuye a la mala suerte.
- ⚠️ Menos momentos de «épica improbable». Se sustituyen por sorpresas de **información**
  (fuerzas ocultas, órdenes simultáneas, engaños de Sombra), que son sorpresas que el
  jugador puede aprender a anticipar.
- ⚠️ Riesgo de que la partida se vuelva calculable. Mitigado por la niebla de guerra y la
  simultaneidad: sabes la fórmula, pero no todas las variables.

**Descartado.** Dados con varianza baja (mantiene el asterisco sin aportar nada);
aleatoriedad determinada por semilla y revelada tras ordenar (confuso de explicar).

---

<a id="adr-004"></a>

## ADR-004 — Turnos simultáneos
**Estado:** aceptada · 2026-08-15

**Contexto.** Con turnos secuenciales, 5 jugadores × 12 turnos en cadencia diaria = 30
días de campaña, y cada jugador esperando 4 turnos ajenos por cada uno propio.

**Decisión.** Todos los jugadores dan órdenes a la vez; el servidor resuelve juntas.

**Consecuencias.**
- ✅ Campaña de 6 días en vez de 30. Viable en móvil.
- ✅ **Habilita la mecánica central**: si vieras moverse a los demás antes de decidir, las
  promesas no harían falta.
- ⚠️ Hay que definir empates, cruces y prioridades. Resuelto con orden documentado y
  desempate por número de asiento — nunca al azar
  ([GDD §15](GAME_DESIGN.md#15-orden-de-resolución-del-turno)).

---

<a id="adr-005"></a>

## ADR-005 — Autoridad en Route Handlers, no en funciones de Postgres
**Estado:** aceptada · 2026-08-15

**Contexto.** La resolución de turnos debe ser autoritativa y atómica. Dos opciones:
plpgsql en Supabase, o TypeScript en Vercel con `service_role`.

**Decisión.** La resolución corre en **Route Handlers de Next.js**, ejecutando
`packages/core`. La atomicidad la aporta Postgres (advisory locks + bloqueo optimista),
no la lógica.

**Consecuencias.**
- ✅ El mismo motor sirve a servidor, cliente y simulador (ADR-001). En SQL, esto sería
  imposible.
- ✅ Reglas testeables con Vitest, sin base de datos.
- ⚠️ La atomicidad hay que construirla explícitamente (§8 del TDD). Aceptado: son ~20
  líneas bien testeadas.
- ⚠️ Arranque en frío de la función serverless. Irrelevante con turnos de 3 min o 12 h.

**Descartado.** plpgsql (motor intestable y no compartible); Edge Functions de Supabase
(mismo resultado que Vercel, pero parte el despliegue en dos sitios).

---

<a id="adr-006"></a>

## ADR-006 — Niebla de guerra por `player_views` prefiltradas
**Estado:** aceptada · 2026-08-15

**Contexto.** Supabase expone PostgREST. Si la tabla del estado fuera legible, cualquiera
haría una petición HTTP y vería el estado completo: la niebla de guerra sería cosmética.
Es el riesgo técnico nº 1 del proyecto.

**Decisión.** `game_states` **niega todo `SELECT`**. El resolutor escribe además
`player_views`, una proyección **por asiento y ya filtrada**, con RLS `seat = mi asiento`.
Los datos ocultos no salen nunca del servidor.

**Consecuencias.**
- ✅ La niebla es real, no confiada al cliente.
- ✅ Realtime funciona directamente sobre `player_views` respetando RLS.
- ✅ El cliente descarga menos datos.
- ⚠️ Escribir 5 filas por turno en vez de 1. Coste irrelevante.
- ⚠️ Hay que mantener la proyección correcta ⇒ test de fuga de información
  ([TESTING §3.1](TESTING_AND_SIMULATION.md#31-el-test-de-fuga-de-información)), que
  recorre la vista entera buscando secretos.

---

<a id="adr-007"></a>

## ADR-007 — Estado de partida en `jsonb`, no normalizado
**Estado:** aceptada · 2026-08-15

**Contexto.** ¿Guardar el estado como un documento o como tablas relacionales?

**Decisión.** `jsonb`. Las tablas normalizadas (`match_results`, `treaties`, `messages`)
existen solo para lo que **sí** se consulta relacionalmente.

**Consecuencias.**
- ✅ Escribir un turno es una fila, no 200 en 8 tablas.
- ✅ Atomicidad trivial.
- ✅ El motor ya trabaja con ese objeto: cero traducción entre representaciones.
- ⚠️ Consultas analíticas pobres sobre el estado. Resuelto: la analítica sale de
  `match_results` y de la telemetría.
- ⚠️ Sin validación de esquema en la BD. Resuelto: Zod en el servidor, y el estado solo
  lo escribe el motor.

---

<a id="adr-008"></a>

## ADR-008 — Traición tarifada, no prohibida
**Estado:** aceptada · 2026-08-15

**Contexto.** El brief pide acuerdos vinculantes validados en servidor **y** que la
traición sea posible. Son incompatibles si «vinculante» significa «imposible de romper».

**Decisión.** Romper un Sello es **siempre posible, inmediato y público**, y **cuesta
Ceniza** — el recurso con el que se gana. Lore: el Umbral registra los juramentos.

**Consecuencias.**
- ✅ La traición existe, luego la confianza significa algo.
- ✅ Traicionar te aleja de ganar ⇒ la decisión es un cálculo, no un impulso.
- ✅ Coherente con el mundo: la Ceniza es la ley de conservación del juego.
- ✅ Un solo número (`coste_ruptura`) ajusta cuánta traición hay en el metajuego.
- ⚠️ Si el coste está mal calibrado, o nadie traiciona o traiciona todo el mundo.
  Vigilado por el simulador (`betrayal-is-priced`).

---

<a id="adr-009"></a>

## ADR-009 — La metaprogresión solo añade opciones
**Estado:** aceptada · 2026-08-15

**Contexto.** Cualquier desbloqueo numérico rompe un PvP competitivo. Ninguno no motiva.

**Decisión.** Los desbloqueos permanentes **solo pueden añadir doctrinas, anomalías,
ciudades y cosméticos**. **Jamás** modifican una constante de `BALANCE`. Verificado por
CI (`no-power-creep`), que además simula cuenta completa vs. cuenta vacía y exige winrate
48–52 %.

**Consecuencias.**
- ✅ El competitivo se mantiene íntegro.
- ✅ La progresión es de conocimiento y adaptación, no de números.
- ⚠️ Motiva menos que subir de nivel. Se compensa con desbloqueos que abren **formas de
  jugar** visiblemente distintas.
- ⚠️ Limita para siempre la monetización a cosméticos. **Aceptado explícitamente.**

---

<a id="adr-010"></a>

## ADR-010 — La Ciudad es un hub, no un gestor
**Estado:** aceptada · 2026-08-15

**Contexto.** El brief describe una vista Ciudad con economía, producción, investigación,
diplomacia, infraestructura, inteligencia, ejército, tecnología y desarrollo
sobrenatural. Es un segundo juego completo que duplica todos los sistemas de la guerra.

**Decisión.** En v1.0 la Ciudad es un **hub de progresión y preparación**: tu ciudad
crece visiblemente, eliges equipo, ves resultados y entras en campaña. Sin colas, sin
temporizadores, sin economía paralela.

**Consecuencias.**
- ✅ El alcance de v1.0 se vuelve alcanzable.
- ✅ Se elimina la duplicación de sistemas y de curva de aprendizaje.
- ✅ Se conserva **entero** el bucle emocional que pedía el brief (volver, ver
  consecuencias, prepararse).
- ⚠️ Menos «gestión» de la pedida. Registrado como post-1.0 nº 3, condicionado a que el
  playtesting demuestre que se echa en falta.

---

<a id="adr-011"></a>

## ADR-011 — Assets como SVG escritos a mano en el repositorio
**Estado:** aceptada · 2026-08-15

**Contexto.** El brief exige assets 100 % originales y trazables hasta su origen dentro
del proyecto, y prohíbe expresamente marketplaces y material de terceros.

**Decisión.** Todo asset se autora como **SVG escrito a mano** en `assets/src/`, con
cabecera de autoría obligatoria. Ningún binario. Un generador produce componentes React.

**Consecuencias.**
- ✅ Procedencia trivial: git es el registro.
- ✅ Imposible incorporar assets ajenos por accidente: un binario falla el lint.
- ✅ Coherencia impuesta por herramienta (paleta, cuadrícula, trazo).
- ✅ Sin peticiones de red, sin CLS, escala perfecta, theming gratis.
- ⚠️ Limita el estilo visual a lo plano y geométrico. **Convertido en decisión artística
  deliberada** («cartografía militar contaminada»), no en una carencia.
- ⚠️ Ilustración compleja (portada, arte de ciudad) queda fuera. Aceptado en v1.0.

---

<a id="adr-012"></a>

## ADR-012 — Mapa en SVG, no Canvas ni WebGL
**Estado:** aceptada · 2026-08-15

**Contexto.** ~95 regiones que hay que dibujar, tocar, enfocar y anunciar.

**Decisión.** SVG en el DOM.

**Consecuencias.**
- ✅ **Accesibilidad nativa**: cada región es enfocable y anunciable. Con Canvas o WebGL,
  cada punto de la tabla de accesibilidad costaría una implementación paralela.
- ✅ 0 KB de librería; nítido en pantallas 3×.
- ✅ Zoom y desplazamiento por `transform` (compuesto por GPU).
- ⚠️ No escalaría a miles de elementos. Irrelevante: el mapa tiene ≤ 96 regiones por
  diseño (ADR-002).
- ⚠️ Efectos visuales limitados a CSS/SVG. Coherente con la dirección artística.

---

<a id="adr-013"></a>

## ADR-013 — Sin eliminación de jugadores
**Estado:** aceptada · 2026-08-15

**Contexto.** En un juego asíncrono de 6 días, un jugador eliminado en el turno 5 tiene
que esperar una semana sin jugar. Además, eliminar rivales acelera el snowball del líder.

**Decisión.** El Bastión **no se puede capturar**, solo sitiar. Un jugador arrasado
conserva renta reducida, voz diplomática, capacidad de transferir y de puntuar.

**Consecuencias.**
- ✅ Nadie queda fuera de la partida.
- ✅ El líder nunca reduce el número de rivales: antídoto estructural contra el snowball.
- ✅ Un jugador arrasado sigue siendo **decisivo como árbitro y valioso como socio**.
- ⚠️ Riesgo de kingmaking por rencor. Mitigado: los supervivientes siguen puntuando para
  la metaprogresión, así que siempre tienen un objetivo propio además de la venganza.
- ⚠️ Se pierde la satisfacción de eliminar a alguien. Se sustituye por la **rendición
  dirigida**, que es más interesante: eliges a quién armar al perder.

---

<a id="adr-014"></a>

## ADR-014 — Tres disparadores de resolución de turno
**Estado:** aceptada · 2026-08-15

**Contexto.** Vercel Hobby permite **un cron diario**. Los turnos vencen cada 3 min (Blitz)
o cada 12 h.

**Decisión.** Tres caminos independientes hacia la misma función idempotente:
(1) inmediato cuando todos envían; (2) `pg_cron` en Supabase cada minuto vía `pg_net`;
(3) oportunista, cuando cualquier petición de cliente detecta un plazo vencido.

**Consecuencias.**
- ✅ No dependemos de Vercel Cron ⇒ el free tier sigue siendo suficiente.
- ✅ Tolerante a fallos: tres caminos, y basta con uno.
- ✅ El caso normal (~85 %) se resuelve al instante, sin esperar a ningún cron.
- ⚠️ Exige idempotencia estricta. Ya es necesaria por concurrencia, así que no añade
  complejidad nueva.
- ⚠️ `pg_cron` y `pg_net` son extensiones que hay que activar en Supabase. Documentado en
  el README.

---

<a id="adr-015"></a>

## ADR-015 — Diplomacia por plantillas antes que texto libre
**Estado:** aceptada · 2026-08-15

**Contexto.** El sistema principal del juego es negociar, y la plataforma de referencia
es un teléfono, donde escribir duele. Además el juego es bilingüe: dos jugadores pueden
no compartir idioma.

**Decisión.** La unidad de interacción diplomática es una **Oferta estructurada**, no un
mensaje. Se compone con 3–4 taps. El texto libre existe, pero es opcional y secundario.

**Consecuencias.**
- ✅ Negociar en móvil es viable ⇒ el sistema principal se usa de verdad.
- ✅ **Dos jugadores sin idioma común pueden cerrar un trato**: la oferta es un dato que
  se renderiza traducido.
- ✅ Las ofertas son analizables ⇒ telemetría real sobre la diplomacia.
- ⚠️ Menos expresividad que el texto libre. Mitigado: el texto libre sigue ahí, y el
  Distrito Cámara nivel 3 añade traducción automática del chat.
- ⚠️ Hay que diseñar el catálogo de plantillas con cuidado: si falta una, ese trato no
  existe.

---

<a id="adr-016"></a>

## ADR-016 — Licencia del proyecto
**Estado:** ⏳ **pendiente** — decisión del propietario del repositorio

Opciones: código propietario (todos los derechos reservados) · MIT/Apache-2.0 para el
código con assets y lore reservados · dual.

Recomendación: **código propietario durante la beta**, decidir en v1.0. No bloquea el
desarrollo, pero debe resolverse antes de que el repositorio sea público.

---

<a id="adr-017"></a>

## ADR-017 — Tipografía
**Estado:** aceptada · 2026-08-16

**Contexto.** Los requisitos eran: familia variable, geométrica, condensada, **números
tabulares**, cobertura de ES + EN, licencia **SIL OFL** o equivalente y subseteable. Con
la fuente del sistema, la interfaz se leía como un formulario web — y ese era, de lejos,
el detalle que más impedía que el juego pareciera un juego.

**Decisión.** **Archivo Variable** (Omnibus-Type, SIL OFL 1.1), alojada en el propio
repositorio, solo el subconjunto `latin`.

**Consecuencias.**
- ✅ Un único eje `wdth` (62–125 %) da los tres registros —rótulo condensado en versales,
  texto corrido, cifra tabular— sin una segunda descarga. El contraste tipográfico lo da
  la anchura, no cambiar de familia.
- ✅ `tnum` de serie: las cifras de recursos y plazos se alinean en columna, que es lo que
  permite compararlas de un vistazo.
- ✅ Servida desde el repositorio: ni una petición a un dominio de terceros, y por tanto
  ningún salto de maquetación en el primer segundo de partida.
- ✅ 90 KB. Solo `latin`: cubre ES y EN enteros —ñ, tildes, ¿, ¡— y ahorra los 86 KB de
  `latin-ext`, que solo sirven para idiomas que este juego no tiene.
- ⚠️ Si algún día se añade un idioma con latín extendido —polaco, turco, checo—, hay que
  volver a añadir ese subconjunto. Está anotado aquí para que no se descubra en producción.

**Descartado.** Inter y similares (excelentes, pero sin eje de anchura: harían falta dos
familias); Oswald y las condensadas puras (ilegibles en texto corrido); una fuente de
sistema (distinta en cada dispositivo, que en un juego donde leer el mapa es media
decisión no vale).

---

<a id="adr-018"></a>

## ADR-018 — Cadencia por defecto
**Estado:** 🔵 **propuesta** — decisión bloqueante nº 1

**Propuesta:** **Diaria (12 h/turno, ~6 días)** por defecto, con **Blitz disponible desde
v0.3** para poder testear.

**Razones.** No exige coincidencia horaria, que es el mayor problema de un juego nuevo
con pocos jugadores; cumple literalmente la «semana de guerra» del brief; y es el patrón
nativo del móvil. Blitz debe existir desde v0.3 aunque no sea el modo principal: sin él,
probar un ciclo completo tarda 6 días y el desarrollo se vuelve insoportable.

**Si se elige Blitz por defecto**, cambian: el diseño de notificaciones (menos push, más
presencia), el peso de la reconexión, la pausa de desconexión, y el foco del playtesting.

---

<a id="adr-019"></a>

## ADR-019 — Visibilidad de la reputación
**Estado:** 🔵 **propuesta** — decisión bloqueante nº 3

**Propuesta:** dentro de la partida, **recuento factual público** («Sellos: 4 honrados ·
1 roto»), sin etiquetas ni puntuación. Entre partidas, agregado en el perfil, **sin
ranking**, con decaimiento a 50 campañas.

**Razones.** Una reputación con etiquetas morales («Traidor») empujaría el metajuego
hacia «nunca traiciones», y la traición es el producto. Un recuento factual informa sin
juzgar: el juicio lo hacen los jugadores.

**Riesgo.** Si el playtesting muestra que aun así mata la traición, se reduce a
solo-dentro-de-partida. Métrica de decisión: **> 40 % de campañas con ≥ 1 ruptura**.

---

<a id="adr-020"></a>

## ADR-020 — Sin sistema de armamento nuclear
**Estado:** aceptada · 2026-08-15

**Contexto.** El brief menciona armamento nuclear y advierte a la vez de que no debe ser
un botón de «ganar».

**Decisión.** No hay arsenal nuclear. Existe **una** capacidad estratégica extrema
(*Yermo*, investigación de tier III): destruye todas las fuerzas de una región y la deja
inutilizable **para todos, incluido quien la lanza**, cuesta 8 ✦ y es públicamente
atribuida.

**Consecuencias.**
- ✅ Existe la escalada estratégica sin existir un botón de ganar.
- ✅ Su valor real es **la amenaza**, no el uso: es un arma de negociación.
- ✅ Destruye valor que no recupera nadie ⇒ usarla es casi siempre un error, y todos lo
  saben.
- ✅ Evita representar armamento real con detalle, que no aporta nada al juego.
- ⚠️ Menos espectáculo del que sugiere la ambientación. Compensado por las anomalías.

---

<a id="adr-021"></a>

## ADR-021 — Las facciones se ligan a la cuenta y solo cambian el camino
**Estado:** aceptada · 2026-08-15

**Contexto.** El proyecto necesita una identidad persistente por cuenta —algo a lo que
pertenecer entre campañas— pero ADR-009 prohíbe que cualquier desbloqueo permanente
modifique una constante de balance. Un sistema de facciones mal diseñado es la vía más
rápida de saltarse esa regla: basta con «mi facción tiene +10 % de industria» para haber
roto el PvP.

**Decisión.** La cuenta **jura** a una de las 6 ciudades signatarias. La facción fija la
doctrina de origen y **abarata** (×0,6) los desbloqueos afines. **Nunca encarece nada, y
el conjunto de opciones alcanzable es idéntico para las seis.** Dentro de la partida, dos
jugadores de la misma facción quedan marcados con **Concordia**, que es información
pública y **no tiene ningún efecto mecánico**.

**Consecuencias.**
- ✅ Identidad y sentido de pertenencia sin tocar el balance.
- ✅ El invariante «mismo techo» es verificable: `factions/no-ceiling-difference` compara
  dos cuentas al máximo de facciones distintas y exige conjuntos idénticos.
- ✅ La Concordia aporta al pilar diplomático **gratis**: reconfigura las expectativas de
  toda la mesa sin mover una constante. Los otros tres tienen que decidir si asumen que
  los concordes se aliarán, y los concordes si aprovechan esa suposición.
- ✅ `factions/` no importa `balance/`, y hay un test que lee el fuente para comprobarlo:
  la regla de oro deja de depender de la disciplina de quien programa.
- ⚠️ La afinidad crea una diferencia de **ritmo** entre facciones durante las primeras
  ~13 campañas. Aceptado: es la misma clase de diferencia que ya existe entre una cuenta
  nueva y una veterana, y converge.
- ⚠️ El Cisma podría usarse para «reoptimizar» descuentos. Mitigado: cuesta 60 ✦ y exige
  3 campañas de espera; y como los desbloqueos se conservan, no hay nada que reoptimizar
  salvo compras futuras.

**Descartado.** Facciones con bonificaciones estadísticas (rompe ADR-009); doctrinas
exclusivas por facción (rompe el invariante del techo); Concordia con ventaja mecánica
—visión compartida inicial o Sellos más baratos— porque convertiría toda partida de 5 en
un 2v3 desde el turno 0 **y** mataría la duda que la hace interesante; guerra de
facciones con territorio global persistente (sistema enorme, ajeno al core loop, y
castiga a la facción con menos jugadores).

---

<a id="adr-022"></a>

## ADR-022 — `packages/core` se consume como fuente TypeScript, sin compilar
**Estado:** aceptada · 2026-08-15

**Contexto.** El motor lo ejecutan tres consumidores (servidor, cliente, simulador).
Publicarlo como JavaScript compilado añadiría un artefacto intermedio que puede quedar
desincronizado con el fuente, justo en el paquete donde una divergencia es más cara.

**Decisión.** `@gdc/core` exporta `./src/index.ts` directamente. Next lo transpila con
`transpilePackages`, y Vitest lo carga tal cual. **No hay paso de build.** Los imports
relativos van sin extensión (`from './rng'`), que es lo que entienden tanto `bundler` de
TypeScript como el bundler de Next.

**Consecuencias.**
- ✅ Imposible que el motor compilado y el fuente diverjan: solo hay uno.
- ✅ Un solo `npm test` cubre exactamente el código que corre en producción.
- ✅ Sin paso de build, sin caché que invalidar, sin sourcemaps que cuadrar.
- ⚠️ Cualquier consumidor futuro debe poder transpilar TypeScript. Aceptado: los tres que
  hay lo hacen, y un cuarto que no pudiera sería señal de un problema mayor.
- ⚠️ Los imports con extensión `.js` (estilo NodeNext) **no** funcionan aquí. Está
  documentado en `packages/core/CLAUDE.md`.

**Descartado.** Compilar a `dist/` con `tsc` (artefacto que puede diverger, y obliga a
recordar reconstruir antes de cada test); publicar dual ESM/CJS (complejidad sin ninguna
ganancia para un paquete privado de monorepo).

---

<a id="adr-023"></a>

## ADR-023 — Las políticas RLS consultan a través de funciones `security definer`
**Estado:** aceptada · 2026-08-15

**Contexto.** Casi todas las políticas del juego necesitan la misma pregunta: *¿está este
usuario sentado en esta partida, y en qué asiento?* La respuesta vive en `game_players`,
que a su vez tiene RLS. Una política sobre `game_players` que consulte `game_players`
entra en bucle y Postgres la corta con «infinite recursion detected in policy». El
esquema ilustrativo de [TECHNICAL_DESIGN §6.3](TECHNICAL_DESIGN.md#63-políticas) escribe
esa consulta en línea, y así escrita no arranca.

**Decisión.** Tres funciones `security definer` y `stable` —`is_player(game)`,
`is_seat(game, seat)` y `my_seat(game)`— resuelven la pregunta leyendo la tabla sin RLS.
Las políticas las invocan en vez de repetir el `exists`.

**Consecuencias.**
- ✅ Sin recursión, y una sola definición de «estar sentado en una partida».
- ✅ `stable` permite al planificador evaluarlas una vez por consulta, no una por fila.
- ⚠️ `security definer` significa que la función ve todo: si se concediera a quien no
  debe, serviría para sondear cualquier partida del sistema. Se mitiga con `revoke` y con
  un test que enumera **todas** las funciones `security definer` invocables por
  `authenticated` y exige que sean exactamente esas tres.
- ⚠️ Llevan `set search_path = public, pg_temp` obligatoriamente: sin eso, una función
  `security definer` es un vector de escalada de privilegios de manual.

**Descartado.** Desactivar RLS en `game_players` (la haría legible entera desde
PostgREST: quién juega a qué y con quién, en todo el sistema); duplicar el `exists` en
cada política (nueve copias de la misma regla de seguridad, que es como se acaban
divergiendo).

---

<a id="adr-024"></a>

## ADR-024 — Los tests de RLS corren contra un Postgres efímero, sin Docker ni driver
**Estado:** aceptada · 2026-08-15

**Contexto.** Los siete tests de RLS son bloqueantes ([ROADMAP](ROADMAP.md#v03--multijugador-real)):
si uno falla, no hay release. Un test bloqueante que dependa de Docker, de una cuenta en
la nube o de una conexión se acaba saltando, y un test de seguridad que se salta solo es
peor que no tenerlo, porque el CI se pone verde igual.

**Decisión.** `tools/pg/harness.mjs` levanta un clúster con los binarios de PostgreSQL
del sistema, escuchando **solo en socket unix**, le aplica un shim que emula `auth.uid()`
y los roles de Supabase, y encima las migraciones reales. Los tests hablan con él por
`psql`, con `set local role` y las claims del JWT — exactamente lo que hace PostgREST.

**Consecuencias.**
- ✅ Cero dependencias nuevas: ni Docker, ni un driver de Postgres, ni la CLI de Supabase.
- ✅ Se prueban las migraciones **reales**, no una réplica del esquema.
- ✅ Sin TCP: un Postgres de pruebas con autenticación `trust` escuchando en un puerto es
  un agujero, aunque sea local y aunque sea un rato.
- ⚠️ El shim puede desviarse de lo que hace Supabase de verdad. Se mitiga reproduciendo
  el `alter default privileges` de Supabase: sin él los tests pasarían por falta de
  permisos en vez de por las políticas. Ese detalle ya cazó un fallo real —
  `begin_resolution` era invocable por cualquier jugador.
- ⚠️ Hace falta PostgreSQL instalado. El arnés falla con un mensaje explícito en vez de
  saltarse los tests, que es justo lo que no debe hacer.

**Descartado.** `supabase start` (Docker obligatorio, arranque de minutos, imposible en
muchos CI); `pg-mem` y otras emulaciones en JavaScript (no implementan RLS, que es
literalmente lo único que hay que probar); probar contra el proyecto remoto (lento,
compartido y con datos reales).

---

<a id="adr-025"></a>

## ADR-025 — La resolución de turno se parte en arrendar y confirmar
**Estado:** aceptada · 2026-08-15

**Contexto.** [TECHNICAL_DESIGN §8.2](TECHNICAL_DESIGN.md#82-idempotencia-y-bloqueo)
describe la resolución dentro de una transacción con `pg_advisory_xact_lock`. Ese lock se
libera al terminar la transacción, y el motor es TypeScript: la transacción tendría que
seguir abierta mientras `reduce()` corre en Node. Con PostgREST eso no es posible —cada
llamada RPC es su propia transacción— y mantener una conexión directa abierta desde una
función serverless mientras se computa es exactamente el patrón que agota el pool.

**Decisión.** Dos llamadas, cada una atómica:
`begin_resolution()` cierra la fila con `for update`, comprueba que toca resolver,
arrienda la partida 30 s y devuelve estado y órdenes; `reduce()` corre en Node; y
`commit_resolution()` escribe todo condicionado a que `state_version` no haya cambiado.

**Consecuencias.**
- ✅ Se conservan las tres defensas superpuestas del diseño: `for update` serializa, el
  turno esperado da idempotencia y el bloqueo optimista es la última red.
- ✅ Ninguna transacción queda abierta durante un cómputo: la conexión se devuelve al
  pool de inmediato.
- ✅ El arrendamiento vence solo. Un resolutor que muera a media faena no deja la partida
  colgada para siempre; otro lo reintenta en treinta segundos.
- ⚠️ El arrendamiento **no** es el mecanismo de exclusión: es solo un ahorro de trabajo.
  La corrección la garantiza el `state_version`. Confundirlo llevaría a alargar el
  arrendamiento «por seguridad», que es lo contrario de lo que hace falta.
- ⚠️ Dos resolutores simultáneos pueden computar lo mismo dos veces. Es barato y, como
  `reduce()` es determinista, el resultado es idéntico: solo uno escribe.

**Descartado.** Mantener la transacción abierta desde Node (agota el pool y ata el diseño
a una conexión directa); mover `reduce()` a plpgsql (reimplementar el motor en un segundo
lenguaje es exactamente lo que la regla de «un solo motor» prohíbe); confiar solo en el
bloqueo optimista sin arrendamiento (correcto, pero con cinco clientes disparando la
resolución a la vez se computan cinco turnos para tirar cuatro).

---

## Plantilla para nuevas decisiones

```markdown
## ADR-0XX — Título
**Estado:** aceptada | propuesta | sustituida por ADR-0YY · AAAA-MM-DD

**Contexto.** Qué problema obliga a decidir.

**Decisión.** Qué se decide, en una frase.

**Consecuencias.**
- ✅ lo que ganamos
- ⚠️ lo que cuesta, y cómo se mitiga

**Descartado.** Qué alternativas se consideraron y por qué no.
```
