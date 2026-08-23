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
| [023](#adr-023) | Políticas RLS a través de funciones `security definer` | aceptada |
| [024](#adr-024) | Tests de RLS contra un Postgres efímero real | aceptada |
| [025](#adr-025) | La resolución de turno se parte en arrendar y confirmar | aceptada |
| [026](#adr-026) | Una sola vista: la ciudad, y un botón | aceptada |
| [027](#adr-027) | La interfaz no explica: enseña | aceptada |
| [028](#adr-028) | Se evalúa Turso y se descarta | aceptada |
| [029](#adr-029) | Las claves de Supabase se aceptan por sus dos nombres | aceptada |
| [030](#adr-030) | El perfil lo crea la base de datos, no la API | aceptada |
| [031](#adr-031) | Invitado = sesión anónima de Supabase, no una cuenta aparte | aceptada |
| [032](#adr-032) | La configuración del proyecto Supabase se versiona y se despliega | aceptada |
| [033](#adr-033) | La comprobación previa del despliegue valida forma, no presencia | aceptada |

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

<a id="adr-026"></a>

## ADR-026 — Una sola vista: la ciudad, y un botón
**Estado:** aceptada · 2026-08-16 · sustituye el flujo de [ADR-015](#adr-015) para entrar en partida

**Contexto.** El recorrido para empezar a jugar eran cuatro pantallas: portada, entrada,
lista de partidas y sala de espera con código de invitación. Cada una es un peaje entre el
jugador y el turno que quiere jugar, y en cadencia Blitz —tres minutos por turno— ese
peaje se come un pedazo real del plazo. [MULTIPLAYER §3.2](MULTIPLAYER.md#32-emparejamiento)
daba el código por flujo principal porque juntar a cinco conocidos parecía más fácil que
llenar una cola; el coste de esa elección es que **la primera vez que alguien abre el
juego solo, no puede jugar**.

**Decisión.** Una vista. Al abrir el juego se ve **tu ciudad en cenital** y un botón.
Pulsarlo busca campaña; si hay gente esperando, la partida se crea y **empieza sola**, sin
sala intermedia. Si no la hay, se ve llegar a las demás ciudades, y pasados unos minutos
los asientos que falten los ocupa el Mando Automático.

**Consecuencias.**
- ✅ De abrir la aplicación a jugar: **una pulsación**.
- ✅ La ciudad deja de ser una pantalla que visitar y pasa a ser el marco de todo, que es
  lo que [ADR-010](#adr-010) quería decir con «hub».
- ✅ La espera cuenta la ficción del juego: las ciudades **son** teletransportadas al campo
  de batalla, y buscar partida es verlas aparecer, cada una en su posición rotacional.
- ✅ Un jugador solo nunca se queda sin partida — la mitigación de
  [DISCOVERY P1](DISCOVERY.md#23-riesgos-de-producto) deja de ser un plan y pasa a estar
  en el camino principal.
- ⚠️ Se pierde el flujo de «juego privado con estos cinco conocidos». Las funciones SQL
  (`join_game`, `invite_code`) siguen ahí; lo que desaparece es la interfaz. Vuelve más
  adelante **dentro de la misma vista**, no como una pantalla aparte.
- ⚠️ Una cola vacía degrada a partida contra bots. Es preferible a no poder jugar, pero
  exige vigilar la proporción de partidas con bot en la beta.

**Descartado.** Mantener las dos vías con un selector (vuelve a ser una pantalla de menú);
emparejamiento por habilidad (no hay ELO en v1.0 — ver
[METAPROGRESSION §7](METAPROGRESSION.md#7-lo-que-no-habrá)); sala de espera con «empezar»
manual (el anfitrión decide cuándo juegan los demás, que es exactamente el peaje que se
quería quitar).

---

<a id="adr-027"></a>

## ADR-027 — La interfaz no explica: enseña
**Estado:** aceptada · 2026-08-16

**Contexto.** «Simple de aprender, difícil de dominar» no se consigue escribiendo mejores
descripciones. Un juego que necesita un párrafo para explicar un botón ya perdió, y
además cada frase visible es una cadena que traducir, revisar y mantener en dos idiomas.

**Decisión.** Fuera el texto explicativo de la interfaz. Lo que hay que comunicar se
comunica con **forma, posición, cantidad y movimiento**. Concretamente:

| En vez de | Se dibuja |
|---|---|
| «2, 3 o 5 jugadores» | La disposición rotacional real del mapa: dos enfrentadas, tres en triángulo, cinco en pentágono |
| «Blitz / Diaria / Relajada» | Marcas de ritmo: una, dos, tres. Más marcas, más lento |
| «Distrito bloqueado» | El distrito dibujado como **cimientos** en vez de como edificios |
| «Ceniza acumulada: 312» | Un silo que se llena, con la cifra al lado |
| «Buscando partida… 3 de 5» | Las ciudades rivales llegando, cada una a su posición |

**Consecuencias.**
- ✅ La elección **enseña la regla**: quien elige «5» ya ha visto la simetría del mapa que
  va a jugar. Eso es tutorial sin tutorial.
- ✅ Menos cadenas que traducir, y ninguna que se quede desincronizada entre ES y EN.
- ✅ Sirve igual a alguien que no lea el idioma de la interfaz.
- ⚠️ **No exime de accesibilidad.** Cada control lleva `aria-label` traducido y cada
  gráfico su descripción: prescindir de texto es una decisión visual, jamás una excusa
  para dejar fuera a quien no ve la pantalla. Los rótulos siguen en `es.json`/`en.json` y
  el test de paridad los cubre igual.
- ⚠️ Un símbolo mal elegido es peor que una frase mala, porque no se puede leer. La
  Galería (`/dev/gallery`) existe para cazarlos antes de que lleguen a nadie.

**Descartado.** Tooltips (no existen en táctil); un tutorial de bienvenida (se salta y no
resuelve el problema de fondo); iconos con etiqueta debajo (es texto explicativo con un
adorno encima).

---

<a id="adr-028"></a>

## ADR-028 — Se evalúa Turso y se descarta: la niebla de guerra vive en el esquema
**Estado:** aceptada · 2026-08-16

**Contexto.** Turso (libSQL) ofrece réplicas embebidas, lectura en el borde y bases de
datos por inquilino a coste casi nulo. Sobre el papel encaja con un juego por turnos
asíncrono, y «una partida es un inquilino» es un modelo atractivo. Se evalúa antes de
seguir invirtiendo en el esquema actual.

**Decisión.** **Se descarta.** El proyecto sigue sobre Postgres en Supabase.

**Por qué, medido sobre lo que ya existe.**

| Rasgo en uso | Veces | En libSQL |
|---|---:|---|
| Políticas RLS | 17 | no existe RLS |
| `auth.uid()` | 14 | no hay servicio de auth |
| Funciones `security definer` | 18 | no hay procedimientos almacenados |
| `jsonb` | 108 | hay JSON1, pero no el tipo, ni `jsonb_array_elements`, ni GIN |
| `for update` / `skip locked` | 13 | escritor único, bloqueo a nivel de base |
| `smallint[]` + GIN | 6 | no hay tipos array |
| `pg_cron` + `pg_net` | el reloj | no hay planificador |

Lo decisivo no es el recuento: es **dónde vive la niebla de guerra**.
`game_states` tiene RLS activa y **cero políticas**, así que es ilegible por construcción
y no por convención — con 43 tests bloqueantes que lo verifican contra un Postgres real
([ADR-024](#adr-024)). Sin RLS, ese filtrado pasa a ser código de aplicación: la niebla
dependería de que ningún manejador tenga un fallo, y un fallo ahí **no da error**, da un
jugador viendo lo que no debe sin que nadie se entere. Es el riesgo técnico nº 1 del
proyecto ([DISCOVERY T1](DISCOVERY.md#22-riesgos-técnicos)), y moverlo al código es
exactamente la decisión contraria a la que se tomó.

Y no habría qué testear: `npm run test:security` existe **porque la seguridad está en la
base**. Movida al código se convierte en tests de manejadores, que cubren lo que uno se
acuerda de cubrir.

**Consecuencias.**
- ✅ Se conserva la garantía estructural: lo que un jugador no debe ver no sale del
  servidor porque la base no lo entrega, no porque el código se acuerde de filtrarlo.
- ✅ Se conservan las dos piezas con más carreras probadas: el `for update skip locked`
  del emparejamiento y el arrendamiento + `state_version` de la resolución
  ([ADR-025](#adr-025)). Sobre un motor de escritor único habría que rediseñarlas, no
  portarlas.
- ⚠️ Se renuncia a la lectura en el borde y a las réplicas embebidas. Con cadencia Diaria
  —la propuesta por defecto— la latencia de lectura no es el cuello de botella.
- ⚠️ Se mantiene la dependencia del free tier de Supabase, cuyo punto de ruptura conocido
  son las **200 conexiones concurrentes** de Realtime. La salida documentada es agrupar
  canales por partida, no cambiar de base.

**Descartado.** Turso con una base por partida: el aislamiento que importa **no es entre
partidas, sino entre asientos dentro de una misma partida**, así que una base por partida
deja a los cinco jugadores viendo lo mismo — que es el problema entero. Turso con el
filtrado en la API: es la opción anterior con más pasos y la misma pérdida. Un híbrido
Postgres + Turso para lecturas públicas —archivo de partidas terminadas, por ejemplo—
**no se descarta para después de v1.0**: ahí sí tendría sentido y convive con Supabase.

**Nota.** Esta evaluación surgió tras una jornada peleando con el despliegue. Conviene
dejar dicho que aquello **no fue culpa de Supabase**: fueron tres problemas encadenados
de configuración de Vercel —el `prebuild`, el Root Directory y el Framework Preset—,
todos documentados en [DEPLOYMENT §6](DEPLOYMENT.md#6-lo-que-puede-salir-mal). Cambiar de
base de datos por eso habría sido arreglar el tejado porque gotea la puerta.

---

<a id="adr-029"></a>

## ADR-029 — Las claves de Supabase se aceptan por sus dos nombres
**Estado:** aceptada · 2026-08-16

**Contexto.** Supabase ha cambiado su sistema de claves de API. Donde antes había dos JWT
(`eyJ…`) llamados `anon` y `service_role`, ahora hay `sb_publishable_…` y `sb_secret_…`, y
el panel del proyecto sugiere copiarlas en variables llamadas
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`. El código leía únicamente
los nombres antiguos, así que **seguir la sugerencia del panel dejaba el despliegue con un
«Internal Server Error» sin más pista**. Es un fallo de configuración silencioso, que es
justo la clase que ya costó una tarde.

**Decisión.** Cada clave admite **los dos nombres**, con el nuevo primero.
`apps/web/lib/server/env.ts` resuelve el primero que esté definido; `.env.example`, el
README y `DEPLOYMENT.md` documentan el nuevo; los antiguos siguen valiendo sin aviso de
obsolescencia.

**Por qué no basta con renombrar y ya.** Cambiar los nombres a secas rompería cualquier
despliegue existente en el instante del `git pull` — incluido el de producción, y sin
error de compilación que lo cace. Aceptar los dos hace que actualizar sea inocuo y que
empezar de cero funcione copiando lo que dice el panel.

**Lo que no cambia: el rol de Postgres.** La clave publicable sigue autenticando como
`anon` y la secreta como `service_role`. Ni una política de RLS, ni el shim de Supabase de
`tools/pg/`, ni uno solo de los 43 tests de seguridad se ven afectados. Es un cambio de
nombre, no de modelo de permisos — y conviene dejarlo escrito, porque «Supabase cambió las
claves» suena a algo que debería obligar a revisar la seguridad, y no lo es.

**Consecuencias.**
- ✅ Copiar lo que sugiere el panel de Supabase funciona.
- ✅ Un despliegue con los nombres antiguos sigue arrancando tras actualizar.
- ✅ La regla estructural de `check-deps.mjs` vigila los **dos** nombres de la clave
  secreta: si solo mirara el antiguo, bastaría con usar el nuevo para colarla al cliente.
- ✅ Un test comprueba que ningún alias de la clave secreta lleva prefijo `NEXT_PUBLIC_`.
  Es la invariante que de verdad importa: ese prefijo la publicaría en el navegador.
- ⚠️ Dos nombres por clave es más superficie que uno. Se acota a una tabla de cuatro
  entradas en un único archivo, y `/api/health` informa siempre del nombre nuevo, así que
  el antiguo no se propaga a documentación ni a mensajes de error.

**Descartado.**
- **Renombrar sin compatibilidad.** Rompe los despliegues existentes en silencio.
- **Quedarse solo con los nombres antiguos.** Condena a cada persona que cree un proyecto
  nuevo a repetir el mismo diagnóstico de diez minutos.
- **Deducir el nombre por el prefijo del valor** (`sb_` frente a `eyJ`). Adivinar la
  variable a partir de su contenido es exactamente el tipo de magia que falla el día que
  Supabase estrene un tercer formato.

---

<a id="adr-030"></a>

## ADR-030 — El perfil lo crea la base de datos, no la API
**Estado:** aceptada · 2026-08-16

**Contexto.** Entrar por enlace mágico creaba la fila en `auth.users`, pero nadie creaba
la de `profiles`. Y `currentViewer()` devuelve `null` sin perfil, así que `/` redirigía a
`/sign-in`, que mostraba el formulario otra vez: una cuenta recién confirmada quedaba en
un bucle. Sin error en ningún log — desde fuera, todo «funcionaba».

Al mismo tiempo hacía falta que el modo invitado ([ADR-031](#adr-031)) llegase a la base
**por el mismo camino** que una cuenta con correo.

**Decisión.** Un trigger sobre `auth.users` crea el perfil, con un nombre generado
determinista. No hay ruta de alta en la API que se pueda olvidar de crearlo porque no hay
ruta de alta: hay un `insert` en `auth.users`, y de eso se encarga Supabase.

Es la misma forma que ya tenía `on_profile_created` para la Ciudad, con el motivo que ya
estaba escrito en la migración 0001: «el trigger evita que la API tenga que acordarse de
crearla, que es justo la clase de olvido que se descubre en producción».

**Por qué un nombre generado y no un formulario.** Una pantalla de «¿cómo te llamamos?»
es exactamente la pantalla intermedia que [ADR-026](#adr-026) prohíbe, y para un invitado
—que entra precisamente para no rellenar nada— sería absurda. El nombre se puede cambiar
después; existe para no pedir uno al entrar, no para imponerlo.

**Consecuencias.**
- ✅ Desaparece el bucle, y desaparece la clase entera: no hay estado «usuario sin perfil».
- ✅ Las cuentas creadas antes del trigger salen del bucle con el backfill de la migración.
- ✅ Invitado y cuenta con correo comparten camino de alta, así que no hay dos rutas que
  mantener sincronizadas.
- ⚠️ La facción sigue siendo la de por defecto (`vantera`) para todo el mundo, porque
  [ADR-021](#adr-021) la trata como una elección con consecuencias y no hay dónde
  elegirla sin añadir la pantalla que ADR-026 prohíbe. **Queda abierto**: asignarla al
  azar sería quitar una decisión, y ponerla en un formulario sería añadir un peaje.
- ⚠️ El nombre generado sale de 16 palabras × 1000 números. Dos jugadores de la misma mesa
  compartiéndolo es improbable (~0,06 % en una partida de cinco) y no rompe nada: la
  interfaz nunca distingue solo por nombre, siempre hay barra de asiento y emblema.

**Descartado.**
- **Crearlo en el callback de `/auth/callback`.** Solo cubre el camino del correo; el
  invitado necesitaría el suyo, y volvemos a dos rutas.
- **Crearlo perezosamente en `currentViewer()`.** Una lectura que escribe. Además obliga a
  usar `service_role` en la capa de lectura, que es justo lo que la regla de las dos capas
  de identidad prohíbe.
- **Una pantalla de alta.** Contradice ADR-026, y en cadencia Blitz cada pantalla previa
  cuesta plazo de verdad.

---

<a id="adr-031"></a>

## ADR-031 — Invitado = sesión anónima de Supabase, no una cuenta aparte
**Estado:** aceptada · 2026-08-16

**Contexto.** Pedir un correo antes de dejar probar el juego es un peaje en el peor sitio
posible: antes de que nadie sepa si le interesa. Hace falta una forma de entrar sin
registrarse que **llegue a la base de datos igual** que una cuenta normal, y que no sirva
para iniciar sesión desde otro dispositivo.

**Decisión.** El invitado es una **sesión anónima de Supabase**
(`auth.signInAnonymously()`). No es una cuenta de mentira ni un modo aparte: crea una fila
real en `auth.users`, el trigger de alta ([ADR-030](#adr-030)) le hace perfil y Ciudad
como a cualquiera, y su rol de Postgres es `authenticated`, así que **RLS lo trata
exactamente igual**.

**La propiedad que se pedía sale sola.** Sin correo no hay enlace mágico, así que no hay
forma de identificarse: la sesión vive en la cookie de ese navegador y en ninguno más. No
hay que implementar la limitación — es lo que queda cuando no hay credencial.

**Consecuencias.**
- ✅ Cero código de autorización nuevo. Ni una política de RLS cambia, y por tanto ninguno
  de los tests bloqueantes cubre menos que antes.
- ✅ `profiles.is_guest` deja saber a la interfaz a quién ofrecerle vincular un correo
  antes de que pierda el dispositivo. No es escribible desde el cliente: si lo fuera, la
  marca no significaría nada.
- ⚠️ Un alta anónima no cuesta nada de hacer, así que sin límite es una forma cómoda de
  llenar `auth.users` desde una sola IP. Mitigado con `anonymous_users = 30` por hora en
  `config.toml`. Si hiciera falta más, la respuesta es un captcha, no subir el número.
- ⚠️ Quien pierda el dispositivo pierde la cuenta. Es inherente y no se puede esconder:
  se avisa **antes** de entrar, debajo del botón, no después.

**Descartado.**
- **Un usuario «invitado» en `profiles` sin fila en `auth.users`.** Deja a `auth.uid()`
  sin valor, y con eso las 17 políticas de RLS dejan de aplicar. Sería reimplementar la
  autorización para un caso.
- **Una cuenta con correo falso generado.** Ocupa el espacio de direcciones reales y
  hace que «vincular tu correo de verdad» sea un cambio de correo con confirmación doble.
- **`localStorage` sin sesión de servidor.** El cliente no decide nada (regla 2): una
  identidad que solo existe en el navegador no puede sostener una partida.

---

<a id="adr-032"></a>

## ADR-032 — La configuración del proyecto Supabase se versiona y se despliega
**Estado:** aceptada · 2026-08-16

**Contexto.** El enlace de confirmación llegaba con `redirect_to=http://localhost:3000`.
La causa no estaba en el código: Supabase **solo acepta un `redirect_to` que esté en su
lista blanca**, y cuando no lo está lo sustituye **en silencio** por su Site URL, que de
fábrica es `http://localhost:3000`. Un ajuste del panel que nadie había tocado, invisible
desde el repositorio, imposible de cazar con un test y sin rastro en ningún log.

No era el único de su especie. Las migraciones y los dos secretos del reloj también eran
pasos manuales documentados en DEPLOYMENT.md, y los tres comparten lo peor: **no fallan
ruidosamente**. Sin migraciones la aplicación arranca y se cae al primer `select`; sin los
secretos del vault `pg_cron` late, llama con un `Authorization` vacío, recibe 401 y las
partidas con ausencias se quedan quietas.

**Decisión.** `supabase/config.toml` entra en el repositorio y **es la fuente de la
verdad**; el panel es el resultado. Un workflow lo empuja junto con las migraciones y los
secretos del vault cuando llega a `main` un cambio bajo `supabase/`, y **comprueba después
el resultado** — incluido que `game_states` sigue con RLS activa y cero políticas, que
para el despliegue si falla.

**Consecuencias.**
- ✅ Los tres fallos silenciosos pasan a ser imposibles en lugar de invisibles.
- ✅ Un proyecto de Supabase nuevo se configura solo. Antes había que releer DEPLOYMENT.md
  y hacer siete cosas a mano en el orden correcto.
- ✅ El despliegue comprueba la invariante de la niebla de guerra contra la base **real**,
  no contra el arnés de pruebas. Es la única comprobación del proyecto que mira producción.
- ⚠️ Un cambio hecho a mano en el panel se pierde en el siguiente despliegue. Es el precio
  de tener una fuente de la verdad, y está escrito en la cabecera del archivo y en
  DEPLOYMENT §2.2.
- ⚠️ `config push` empuja el bloque entero: lo que no esté declarado se manda con el valor
  por defecto del CLI, **no** se deja como está. Mitigado escribiendo los valores de forma
  explícita aunque coincidan con el defecto.
- ⚠️ El pipeline necesita un token de acceso y la contraseña de la base en los secretos
  del repositorio. Acotado a un entorno de GitHub, que además permite exigir aprobación
  manual antes de tocar producción.

**Descartado.**
- **Dejarlo documentado.** Es lo que había. Un paso manual documentado es un paso que se
  hace una vez y se olvida en el proyecto siguiente.
- **Arreglarlo solo desde el cliente**, calculando bien `emailRedirectTo`. No basta: si la
  URL no está en la lista blanca de Supabase, se sustituye igual. Hacen falta las dos
  mitades, y esa es justo la parte que hace el fallo tan desconcertante.
- **`psql` contra la base para los secretos del vault.** La conexión directa obliga a
  acertar con la región del pooler o a depender de IPv6. `supabase db query --linked` va
  por la Management API y no tiene ese problema.

---

<a id="adr-033"></a>

## ADR-033 — La comprobación previa del despliegue valida forma, no presencia
**Estado:** aceptada · 2026-08-16

**Contexto.** El primer despliegue con la configuración ya puesta falló así:

```
✓ configuración completa
…
Invalid project ref format. Must be like `abcdefghijklmnopqrst`.
```

La causa era un `\r\n` al final de dos variables, colado al pegarlas en el panel de
GitHub. **No se ve en ningún sitio**: ni en la caja de texto al escribirlas, ni en la
lista de variables después. Solo aparece en el log del runner, y ahí como una URL partida
en dos líneas — que es justo el sitio donde nadie mira porque el paso anterior dijo que
todo estaba bien.

Dos errores propios se sumaron. La comprobación previa preguntaba `[ -n "$valor" ]`, es
decir **presencia**, y con eso bendijo un valor inservible. Y las URL derivadas
—`GDC_CALLBACK_URL`, `GDC_RESOLVE_URL`— se componían en el bloque `env` del job, o sea
**antes de que hubiera ningún sitio donde limpiarlas**: `SITE_URL\n` + `/auth/callback`
produce una dirección con un salto de línea dentro.

**Decisión.** La comprobación previa **normaliza y valida forma**. Recorta espacios y
saltos en los extremos, exige que la referencia del proyecto sean 20 letras minúsculas y
que la URL empiece por `https://`, **compone las URL derivadas después de limpiar**, y
deja los valores efectivos impresos en el log.

**Los secretos se detectan, no se recortan.** Reescribir un valor enmascarado produce una
cadena que GitHub ya no reconoce y deja de tapar en los logs. Si un secreto trae espacios
en los extremos se corta el despliegue con un mensaje que lo nombra y **nunca lo imprime**.

**Por qué es un ADR y no un parche.** Lo caro aquí no fue el `\r\n`, fue que la
comprobación **mintió**. Un paso que anuncia «✓ configuración completa» y luego rompe dos
pasos más adelante es peor que no tener comprobación: convence de que la causa está en
otra parte. Es la misma lección que la nº 4 del `CLAUDE.md` raíz —un test que no puede
fallar no prueba nada— aplicada a un guardarraíl en vez de a un test.

**Consecuencias.**
- ✅ El error se da en el paso que corresponde, con el nombre de la variable y qué forma
  se esperaba.
- ✅ Un valor pegado con espacios de sobra **funciona**, en vez de fallar en otro sitio.
- ✅ El log deja escrito el valor efectivo del proyecto, el sitio y el callback, así que
  comprobar qué se usó de verdad no exige adivinar.
- ⚠️ La validación de forma puede rechazar un valor legítimo si Supabase cambia el
  formato de las referencias de proyecto. Asumido: el mensaje dice exactamente qué se
  esperaba, así que arreglarlo es leer una línea.
- ⚠️ Más shell en el workflow. Acotado a un solo paso y probado contra los valores reales
  que lo rompieron, incluidos los que llevaban `\r\n`.

**Descartado.**
- **Recortar también los secretos.** Rompe el enmascarado y arriesga imprimir un token en
  un log público. Un aviso claro cuesta un reintento; una fuga cuesta rotar la clave.
- **Confiar en que se peguen bien.** Es exactamente lo que ya se hacía. El valor lo teclea
  una persona en una caja de texto de otra empresa: es una entrada externa y se trata
  como tal.
- **Componer las URL en el bloque `env`.** Es lo que había, y es la razón de que un salto
  de línea acabara en mitad de una dirección.

---

<a id="adr-034"></a>

## ADR-034 — El relieve es WebGL; lo que se lee y se toca sigue siendo DOM
**Estado:** aceptada · 2026-08-18

**Contexto.** El diseño de las once vistas llega con un motor 2.5D propio: losas
hexagonales extruidas, cámara isométrica, niebla de guerra y Ashfall. Contradice de frente
una regla escrita de `apps/web`: **«El mapa es SVG. No Canvas, no WebGL»**, cuyo motivo no
era estético sino concreto — cada región es un elemento del DOM enfocable y anunciable, y
eso *no se recupera* migrando a un lienzo.

Las dos cosas que la regla protegía son reales y no se negocian: que se pueda jugar con
lector de pantalla y con teclado, y el presupuesto de 180 KB gzip de la ruta de partida
(three.js pesa 132 KB gzip él solo, más que todo lo demás junto).

**Decisión.** Entra WebGL **como telón, nunca como interfaz**. El reparto es estricto:

| Capa | Qué es | Reglas |
|---|---|---|
| Mundo | `<gdc-world>` sobre three.js | `aria-hidden`. No recibe foco. No decide nada |
| Rótulos | Elementos DOM con `data-tile` | Texto real, anunciable. El motor sólo los **coloca**, proyectando el mundo |
| Respaldo | La vista plana de siempre | Lo que se ve sin WebGL o con `prefers-reduced-motion` |

Es decir: el relieve se **añade** a la interfaz, no la sustituye. Si el mundo no se monta,
no queda un hueco gris — queda `CityPlan`, con exactamente la misma información.

**Cómo se sostiene el presupuesto.** El motor se carga con `import()` dentro de un efecto,
así que sale en su propio *chunk* y no entra ni en el bundle base ni en el servidor. Se
descarga cuando se monta el mundo y sólo entonces. La ruta de partida no lo paga.

**Consecuencias.**
- ✅ La accesibilidad no depende de una GPU. Sin WebGL, con movimiento reducido o con la
  batería en las últimas, la interfaz sigue **completa**, no degradada.
- ✅ Los rótulos son mejores que el `aria-label` que había: dicen qué distrito es y por qué
  nivel va, en vez de «tu ciudad».
- ✅ El motor es geometría procedural propia. Ni un binario de terceros — no toca la regla
  de assets originales.
- ⚠️ **Una dependencia nueva de verdad** (`three`, 132 KB gzip). Se justifica aquí porque
  no hay forma de dar relieve sin ella y porque no la paga quien no la usa; si algún día
  entra en el bundle base, esta decisión hay que revisarla, no ampliarla.
- ⚠️ Hay dos representaciones de la ciudad que mantener en paralelo. Es el precio del
  respaldo y se acepta a sabiendas: la alternativa era dejar sin jugar a quien no tiene
  WebGL.

**Un fallo que se cazó al portarlo.** El generador del campo repartía los sectores por
ángulo (`atan2`), y las casillas justo sobre la línea de corte caían todas del mismo lado:
**15 / 12 / 9** en vez de 12 / 12 / 12. Sobre un tablero decorativo parece inofensivo,
pero dibujaba un mapa desigual cuando la premisa del juego es que el reparto es justo. Se
cambió a repartir por **rotación**: cada casilla pertenece a una órbita de tres bajo giros
de 120°, y su sector es cuántos giros la separan de su representante canónico. Ahora los
tres territorios son idénticos por construcción, y hay un test que lo exige.

**Descartado.**
- *Mantener SVG y renunciar al relieve.* Habría sido decidir por el diseño sin coste real:
  el conflicto se resuelve separando capas, no eligiendo bando.
- *Sustituir el SVG por el mundo y poner `aria-label` al lienzo.* Es exactamente lo que la
  regla original advertía que no se puede recuperar: un rótulo sobre un lienzo no da ni
  foco, ni navegación por teclado, ni orden de lectura.
- *Cargar three.js desde un CDN,* como hacía el mockup. Rompe el despliegue reproducible y
  mete un tercero en la ruta crítica.

---

<a id="adr-035"></a>

## ADR-035 — El mapa de campaña se queda en SVG; el relieve es para la Ciudad
**Estado:** aceptada · 2026-08-18

**Contexto.** El proyecto de diseño trae una vista «Mapa · Guerra» montada sobre el mismo
motor 2.5D que la Ciudad (`<gdc-world scene="map">`). Al ir a implementarla aparecieron
dos hechos que el mockup no podía ver:

1. **El tablero del mockup no es el mapa del juego.** El motor teje 37 losas hexagonales
   con el terreno fijado por anillo. El mapa real lo genera `mapgen` en **polares**
   (`x = cos(θ)·r`), la adyacencia son **aristas explícitas** y no dos losas que se tocan,
   y el reparto de terreno sale de la bolsa del sector. Pintar el tablero decorativo bajo
   una partida real sería enseñar un mapa que no es el que se está jugando.
2. **El tamaño.** `SECTOR_SPEC` da **45 regiones** a 2 jugadores, **55** a 3 y **96** a 5.
   La vista del mockup flota tres rótulos sobre el mundo; la pantalla real necesita que
   *cada* región sea un objetivo tocable y enfocable. 96 objetivos de 44 px no caben en
   360 px de ancho — no es una cuestión de ajustar tamaños, no hay superficie.

**Decisión.** El mapa de campaña sigue siendo **SVG**, con cada región como
`<g role="button" tabindex="0">`, tal y como fijó [ADR-012](#adr-012). El relieve de
[ADR-034](#adr-034) se queda donde sí representa lo que dibuja y donde el número de
elementos es fijo y pequeño: **la Ciudad** (seis distritos).

Del diseño de la vista 05 se implementa lo que **sí** es compatible: la composición. Mapa
a sangre, cabecera translúcida encima, raíl de fases y hoja de órdenes inferior con el
borrador real y el botón de confirmar.

**Consecuencias.**
- ✅ El mapa nunca miente sobre el estado: lo que se ve son las regiones que hay, con la
  adyacencia que hay.
- ✅ La pantalla de campaña gana la composición del diseño sin perder ni la navegación por
  teclado, ni el zoom y desplazamiento por gesto, ni los objetivos táctiles.
- ⚠️ La partida no tiene relieve. Es deliberado, no una tarea pendiente: para tenerlo
  habría que construir un mundo **derivado de `PlayerView`** —losa por región en su `x/y`,
  aristas dibujadas— y resolver antes cómo se toca una región de 96 sin una capa de
  botones. Mientras eso no exista, el SVG es mejor mapa.

**Descartado.**
- *Poner el tablero decorativo de fondo, detrás del SVG.* Se verían hexágonos que no
  corresponden a los nodos de delante. Ruido que además contradice el mapa.
- *Sustituir los botones por selección con raycasting sobre el lienzo.* Devuelve el
  problema que [ADR-034](#adr-034) evita: sin foco, sin teclado y sin orden de lectura.
- *Nombrar las regiones como el mockup («Vado de Ceniza»).* El motor no da nombres; se
  usa el terreno y el identificador, que es lo que existe de verdad.

---

<a id="adr-036"></a>

## ADR-036 — Un bot no es un humano ausente, y por eso no comparten código
**Estado:** aceptada · 2026-08-20

**Contexto.** Hacen falta rivales para poder probar el juego sin reunir a cinco personas.
Ya existía algo que rellenaba asientos vacíos —el **Mando Automático**— y la tentación
evidente era subirle el nivel y llamarlo bot.

Es exactamente lo que **no** se puede hacer. El Mando Automático cubre a un humano que se
ha ido, y su regla de diseño es *la ausencia nunca daña a un tercero*: no ataca por
iniciativa propia, no rompe Sellos y no consagra. Si se le enseñara a jugar para ganar,
quien se desconecta se convertiría en una ficha que mover en las negociaciones de los
demás, y eso no lo ha elegido.

**Decisión.** Dos módulos, dos reglas:

| | `rules/standing.ts` | `rules/bot.ts` |
|---|---|---|
| Cubre | un humano **ausente** | un asiento que nunca tuvo humano |
| Regla | la ausencia no daña a un tercero | juega para ganar |
| Ataca | solo para recuperar lo suyo | cuando le sale la cuenta |

`standing.ts` no se toca. La resolución elige por `is_bot` **antes** de mirar los turnos
perdidos, así que un humano ausente nunca cae en el código del bot.

**Tres propiedades que el bot no puede perder.**

1. **Decide con la misma información que un humano.** La entrada es una `PlayerView`, no
   el `GameState`, y evalúa los combates con `previewAttack` — la misma función que pinta
   la previsualización del jugador. Un rival que viera a través de la niebla no sería un
   rival sino un tramposo, y las pruebas de juego contra él no valdrían nada.
2. **Es determinista.** El azar sale de la semilla de la partida, nunca de
   `Math.random()`. Si el bot tirara un dado propio, «la partida rejugada desde (semilla,
   órdenes) da el mismo checksum» dejaría de ser cierto y el simulador quedaría inútil.
   El perfil de cada asiento también se **deriva** de la semilla: la misma campaña tiene
   siempre los mismos rivales.
3. **Se equivoca como una persona, no como un dado.** Un rival flojo no juega al azar:
   baja un escalón en su propia lista de jugadas. Jugar al azar se detecta en dos turnos
   y no enseña nada sobre las mecánicas.

**Lo que costó entender la dificultad.** El primer modelo daba a los rivales buenos un
umbral de combate **alto** (atacar solo con mucho margen) y salió al revés: el temerario
terminaba con 375 regiones y el implacable con 237. Ser prudente no es jugar mejor —
rechazar un combate que ganarías es tan malo como entrar en uno que pierdes. El umbral se
recolocó alrededor de 1,0, que es *exactamente empatar*: el malo entra por debajo, el
bueno no rechaza por encima.

Y la métrica del test pasó a ser la **Ceniza**, no el territorio. Se gana consagrando el
Núcleo y eso se paga en Ceniza; medido en regiones la escalera no sale ordenada, porque el
perfil más codicioso toma menos regiones pero más ricas — que es justo lo que se le pide.
Un test contra el territorio habría declarado peor al que convierte mejor.

**Consecuencias.**
- ✅ Se puede jugar y medir el equilibrio en solitario, que era el objetivo.
- ✅ El bot es código del motor, así que el simulador puede reproducir una partida con
  bots dentro.
- ⚠️ `is_bot` **sigue siendo público**. Los rivales tienen nombre y facción para que la
  mesa parezca una mesa, pero no se oculta que son artificiales: que haya un bot cambia el
  cálculo diplomático de todos, y esconderlo contradiría esa decisión. Si algún día se
  quiere ocultar, es otro ADR, no un ajuste.
- ⚠️ `BOT_FILL_SECONDS=0` sienta bots al instante, y con eso **dos humanos no se emparejan
  nunca**. Es la configuración de antes del despliegue y va en una variable de entorno
  justamente para poder quitarla sin migrar nada.

---

<a id="adr-037"></a>

## ADR-037 — El mapa se dibuja en hexágonos, pero no teje un panal
**Estado:** aceptada · 2026-08-21

**Contexto.** El diseño quiere un mapa hexagonal, y con razón: es lo que dibujan los
mockups y lo que permite que el mundo 2.5D represente el mapa de verdad en vez de un
tablero decorativo ([ADR-035](#adr-035)).

Al ir a tejer una retícula hexagonal apareció un impedimento que no es de implementación
sino de geometría. El mapa es «1 Núcleo + n sectores **idénticos por rotación C_n**», y de
ahí sale la premisa del juego entero: *ganar exige pagar más Ceniza de la que da el reparto
justo de un jugador*. Si el reparto no es exacto, la frase no significa nada.

Girando cada nodo de una retícula hexagonal y comprobando si cae sobre otro nodo:

```
orden 2: 60/60 nodos caen sobre la retícula   ← posible
orden 3: 60/60                                ← posible
orden 4:  0/60                                ← imposible
orden 5:  0/60                                ← IMPOSIBLE
orden 6: 60/60                                ← posible
```

Una retícula periódica solo admite simetrías de orden 1, 2, 3, 4 y 6 — la restricción
cristalográfica. **El orden 5 no existe en ninguna.** El juego se juega a 2, 3 y 5, así que
tejer el panal costaría la equidad exacta de todas las mesas de cinco.

Hoy esa simetría sale gratis porque `mapgen` **no** usa una retícula: coloca las regiones
en polares (`x = cos(θ)·r`), y con ángulos continuos C₅ es tan fácil como C₃.

**Decisión.** Las regiones se **dibujan** como hexágonos de punta arriba —la misma
orientación que el mundo 2.5D— sobre las posiciones polares de siempre. La adyacencia
sigue siendo la lista de aristas, no dos losas que se tocan.

Es decir: **fichas hexagonales sobre un tablero, con junta entre ellas**, no un panal
continuo. La junta es visible y es el precio consciente de conservar C₅.

**Consecuencias.**
- ✅ El mapa se ve como el diseño y la equidad de las mesas de cinco no se toca.
- ✅ Cada región sigue siendo un `<path>` enfocable y anunciable: [ADR-012](#adr-012) y
  [ADR-034](#adr-034) siguen en pie, y la conversión no costó ni un objetivo táctil.
- ✅ Abre la puerta a que el mundo 2.5D pinte el mapa **real** —una losa por región en su
  `x/y`— que es lo que [ADR-035](#adr-035) daba por imposible con el tablero decorativo.
  Eso es trabajo aparte y ese ADR sigue vigente hasta que se haga.
- ⚠️ No hay vecindad implícita: dos hexágonos pueden verse próximos y no ser adyacentes.
  El mapa dibuja las aristas precisamente por eso, y hay que seguir dibujándolas.

**Descartado.**
- *Retícula real, y las mesas de cinco se quedan radiales.* Dos sistemas de mapa que
  mantener y una partida de cinco que se ve distinta a las demás.
- *Retícula real para todos, cambiando qué significa «equitativo» en cinco.* Pasar de «la
  misma forma girada» a «el mismo reparto» degrada una garantía **por construcción** a una
  comprobada por test, y encima en el modo con más jugadores.

---

<a id="adr-038"></a>

## ADR-038 — La interfaz enseña **y** nombra. Un icono sin rótulo no enseña: esconde
**Estado:** aceptada · 2026-08-23 · matiza a [ADR-027](#adr-027)

**Contexto.** [ADR-027](#adr-027) dice que la interfaz no explica sino que enseña, y la
idea es buena: la disposición rotacional del mapa comunica «2, 3 o 5» mejor que esas
cuatro palabras. Pero se llevó hasta el final y la pantalla principal acabó **sin una sola
palabra**: tres glifos de simetría, tres de ritmo y un botón naranja con el emblema
dentro. Sin nombre de jugador, sin facción y sin decir qué hace el botón.

El veredicto del dueño del proyecto, mirándola desplegada: *«el menú principal no tiene ni
una palabra y no se entiende nada»*.

Lo que falló no es la idea, es una confusión: ADR-027 prohíbe el **texto explicativo** —el
párrafo que describe un botón— y se aplicó como si prohibiera **cualquier texto**,
incluidos los nombres de las cosas. Un rótulo no explica; identifica. «Blitz» no es una
descripción de Blitz, es cómo se llama.

Un segundo efecto, más caro: sin texto no hay nada que traducir, así que la pantalla
parecía cumplir la regla de i18n cuando en realidad la esquivaba. Cero literales no es lo
mismo que cero cadenas.

**Decisión.** Se mantiene ADR-027 para lo que decía y se le añade el límite que le
faltaba:

| Sigue prohibido | Sigue obligatorio | **Ahora también obligatorio** |
|---|---|---|
| El párrafo que explica un control | Que la forma comunique la regla | Que cada control **se llame** por su nombre |
| Los tutoriales y los tooltips de ayuda | El glifo junto a la cifra | Que la pantalla diga **de quién** es |

El glifo se queda: acompaña al rótulo en vez de sustituirlo. Quien ya conoce el juego lee
la forma; quien llega por primera vez lee la palabra. Las dos lecturas caben en el mismo
control y ninguna estorba a la otra.

**La prueba que lo caza.** Un control cuyo `aria-label` es la única forma de saber qué
hace está mal. El lector de pantalla lo anuncia y la pantalla no: eso no es una interfaz
sobria, es una interfaz que solo funciona para quien ya no la necesita.

**Consecuencias.**
- ✅ La pantalla principal dice quién eres, con qué juramento, cuánta Ceniza tienes y qué
  hace el botón grande.
- ✅ La i18n vuelve a tener algo que cubrir, y los tests de paridad ES/EN vuelven a servir
  para algo en esta pantalla.
- ⚠️ Más cadenas que mantener en dos idiomas, que era justo lo que ADR-027 quería evitar.
  Se acepta: una pantalla que no se entiende no ahorra trabajo, lo aplaza.

**Descartado.** *Dejarlo en iconos y añadir un tutorial.* Es cambiar un problema por otro
peor y contradice ADR-027 de verdad, no en la interpretación estrecha.

---

<a id="adr-039"></a>

## ADR-039 — Se jura una vez, y hasta entonces la facción no significa nada
**Estado:** aceptada · 2026-08-23

**Contexto.** `profiles.faction_id` nace con `not null default 'vantera'` y no es
escribible desde el cliente. Las dos cosas son correctas por separado y juntas dejaban un
agujero: **nadie elegía facción nunca**. Toda cuenta era de Vantera sin haberlo decidido,
el emblema de la Ciudad no significaba nada, y la vista de Juramento del diseño no tenía
dónde escribir.

Con un `not null default` tampoco se puede distinguir «juré Vantera» de «nadie me ha
preguntado»: son la misma fila.

**Decisión.** Entra `profiles.sworn_at`, y con él la pantalla de Juramento
([vista 02 del diseño](../README.md)) en `/oath`. Dos pasos: juramento y nombre — el
nombre es la otra cosa que no se podía configurar, y es lo que ven los demás en la mesa.

El primer juramento es **gratis y único**. Cambiar después es un Cisma, que cuesta Ceniza
y renombre ([FACTIONS §5](FACTIONS.md)), y no pasa por aquí: `swear_oath()` se niega si
`sworn_at` no es nulo. La condición vive en la base de datos y no en la ruta de API, para
que no dependa de que la API sea el único camino.

**Sobre [ADR-026](#adr-026).** Prohíbe pantallas intermedias entre el jugador y su turno,
y esto es una pantalla intermedia. No la contradice porque **no está en el camino de
jugar**: está en el camino de existir, se pasa una vez en la vida de la cuenta y quien ya
juró no vuelve a verla. Si algún día se pasa dos veces, es que se ha roto.

**Consecuencias.**
- ✅ El emblema de la Ciudad significa algo que el jugador eligió.
- ✅ El Cisma sigue costando lo que cuesta: esta puerta solo se abre una vez.
- ⚠️ Una cuenta creada antes de esta migración tiene `sworn_at` nulo, así que pasará por el
  Juramento la próxima vez que entre. Es lo correcto: nunca eligió.

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
