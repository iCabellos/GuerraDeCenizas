# Roadmap — de v0.1 a v1.0

> **Versión:** 1.2 · Estado actual: **v0.2 completada y verificada.** Siguiente: v0.3.
> Cada versión debe ser **jugable**, tener **criterios de aceptación**, **tests**,
> **documentación actualizada** y **entrada en CHANGELOG**.

---

## Definición de hecho

Una tarea, feature o versión está terminada **solo** cuando:

```
□ Código implementado
□ Tests escritos
□ Tests ejecutados y en verde
□ UX comprobada en 360×640
□ Persistencia comprobada (cuando aplique)
□ Errores manejados (nada que lance sin control)
□ Sin TODOs críticos sin registrar en una issue
□ Documentación actualizada
□ CHANGELOG.md actualizado
□ DECISIONS.md actualizado si se cambió una decisión
```

Y para una **versión**, además:

```
□ Sus criterios de aceptación se cumplen y se han verificado uno a uno
□ Las versiones anteriores siguen funcionando
□ CI en verde, incluidos los tres tests bloqueantes
□ Tag creado
```

---

## Regla de secuencia

Cada versión se apoya en la anterior y **ninguna deja deuda para la siguiente**. Si una
versión no cumple sus criterios, **no se pasa a la siguiente**: se termina.

```
v0.1 ─► v0.2 ─► v0.3 ─► v0.4 ─► v0.5 ─► v0.6 ─► v0.7 ─► v0.8 ─► v0.9 ─► v0.95 ─► v1.0
motor   juego   online  diplo   Núcleo   meta   anom.  balance  móvil    beta    release
```

---

## v0.1 — Prototipo ✅ **completada**

**Objetivo:** demostrar que el modelo de mapa y de turno funciona. Sin cuentas, sin red.

**Alcance**
- `packages/core`: tipos de estado, PRNG determinista, `reduce()` con las etapas de
  movimiento, control y cierre.
- `packages/core/mapgen`: esqueleto C<sub>n</sub> + decoración + replicación. **Sin**
  perturbación ni evaluación todavía.
- `apps/web`: una única ruta que renderiza el mapa en SVG y permite jugar **en local**
  (hot seat) con 2, 3 o 5 asientos.
- Mover fuerzas, terminar turno, resolución simultánea.

**Fuera**: auth, base de datos, combate, recursos, diplomacia, assets finales.

**Criterios de aceptación** — todos verificados
```
✅ Generar un mapa para 2, 3 y 5 jugadores desde una semilla
✅ La misma semilla produce siempre el mismo mapa (checksum)
✅ Los 5 invariantes del esqueleto se verifican con test
✅ Mover una fuerza entre regiones adyacentes
✅ 5 asientos dan órdenes y se resuelven simultáneamente
✅ El mapa es legible y tocable en 360×640
✅ reduce() es puro (test de inmutabilidad)
✅ npm test en verde — 114 tests
```

**Entregado además de lo previsto**
- Sistema de **facciones ligado a la cuenta** ([FACTIONS](FACTIONS.md), ADR-021), con el
  invariante del techo verificado por test. Se adelantó porque define el modelo de datos
  de la cuenta, del que dependen v0.3 y v0.6.
- `CLAUDE.md` por directorio con las reglas locales de cada paquete.
- `npm run check:deps`: reglas estructurales del monorepo verificadas en CI.

**Dos hallazgos que cambiaron el diseño**

1. **Fallo del PRNG con impacto en la equidad.** `xoshiro128**` cerraba con
   `& 0xffffffff`, y en JavaScript los operadores de bits son de 32 bits **con signo**:
   devolvía negativos por encima de 2³¹, `shuffle` indexaba en negativo y dejaba huecos,
   y los mapas salían con **2 yacimientos por sector en vez de 3**. Un fallo de una línea
   que rompía la promesa central del proyecto. Lo detectó el test «todos los sectores
   tienen el mismo inventario», no una revisión visual.
2. **Un mapa de 5 jugadores no cabe entero en 360 px con regiones tocables.** Medido: a
   escala 1 cada región mide 21 px. Registrado en
   [UX_MOBILE §1.4](UX_MOBILE.md#14-objetivos-táctiles); el mapa entra con el zoom
   calculado del ancho real del viewport y centrado entre Bastión y Núcleo.

**Deuda consciente que hereda v0.2**
- Sin combate: dos asientos con Línea en la misma región dejan la región **disputada**;
  el combate se resolverá en la etapa 6 del pipeline sin tocar las demás etapas.
- La segunda fuerza se despliega automáticamente; en v0.2 la elige el jugador en el
  Parlamento, que es donde debe estar esa decisión.
- Textos en español dentro de `apps/web/lib/theme.ts`. Centralizados a propósito en un
  único módulo para que el paso a next-intl en v0.9 sea mecánico.

**Tests**: `rng` (10), `mapgen` (41), `factions` (27), `reduce` (36).

---

## v0.2 — Núcleo jugable ✅ **completada**

**Objetivo:** una partida completa de 12 turnos con sustancia, todavía en local.

**Alcance**
- Los 4 recursos, renta con rendimiento decreciente, suministro por distancia.
- Producción (Línea, Fuego, Cielo, fortificación).
- Combate determinista completo: rueda, terreno, posturas, apoyo de Fuego.
- Captura, regiones disputadas, tipos de región.
- **Log de eventos con visibilidad por jugador** ← se adelanta desde v0.4 a propósito:
  sin él, la diplomacia no se puede construir después
  ([DISCOVERY §4](DISCOVERY.md#4-dependencias-y-orden-obligatorio)).
- Previsualización de combate en la UI.

**Criterios de aceptación** — todos verificados
```
✅ Partida de 12 turnos jugable de principio a fin en local
✅ La previsualización coincide exactamente con el resultado (test exhaustivo sobre
   6 terrenos × 3 posturas × 3 niveles de fortificación)
✅ Ninguna composición monoarma vence a todas las demás
✅ Una fuerza sin suministro se degrada como está documentado
✅ El log muestra a cada asiento solo lo que le corresponde
✅ npm test en verde — 163 tests
```

**Hallazgos que cambiaron el diseño**

1. **La constante de rendimiento decreciente estaba mal.** El GDD pedía que doblar el
   territorio diera ~1,55× de renta; con el `0.045` documentado daba **1,08×**, es decir,
   expandirse dejaba de compensar. Corregida a `0.015`. Lo detectó el test que fija la
   *intención* de diseño en vez del número.
2. **Un panel flotante no puede interceptar taps.** Reducir la hoja de región a una barra
   de 76 px no bastó: seguía habiendo regiones alcanzables debajo. La solución real es
   `pointer-events: none` en el panel y `auto` solo en sus controles. Tercera vez que este
   error muerde en el proyecto; ya está en las lecciones de `CLAUDE.md`.
3. **Resaltar un destino que no se puede tocar es peor que no ofrecerlo.** Algunos
   destinos alcanzables quedaban fuera de pantalla. Al seleccionar una fuerza, el mapa
   encuadra ahora su vecindario.
4. **La mayoría de los combates son encuentros simultáneos**, donde la previsualización
   no puede existir porque nadie está allí todavía. Solo aparece al atacar una región
   ocupada y visible. Es coherente con el diseño, pero conviene tenerlo presente al
   escribir el tutorial: el jugador verá su primera previsualización hacia el turno 8.

**Deuda consciente que hereda v0.3**
- Sin alianzas: dos asientos en la misma región siempre combaten. La condición ya está
  aislada en `battle.ts` para que consultar tratados en v0.4 sea un cambio local.
- El apoyo de Fuego solo se puede prestar a fuerzas propias.
- La previsualización supone que el enemigo defiende en postura Firme; no puede saber su
  postura real, que se decide simultáneamente.

---

## v0.3 — Multijugador real

**Objetivo:** cinco personas en cinco dispositivos, con persistencia y seguridad.

**Alcance**
- Supabase: Auth (magic link), esquema, migraciones, RLS.
- Autoridad de servidor: Route Handlers, resolución con advisory lock.
- `player_views` y niebla de guerra real.
- Realtime, reconexión, borradores de órdenes.
- Plazos, cadencias (**Blitz obligatorio** para poder testear), `pg_cron`, resolución
  oportunista.
- Órdenes Permanentes y Mando Automático.
- Lobby, códigos de invitación.
- Deploy en Vercel + Supabase.

**Criterios de aceptación**
```
□ 5 personas juegan una campaña completa en dispositivos distintos
□ ✱ Los 7 tests de RLS pasan                              ← BLOQUEANTE
□ 10 peticiones simultáneas de resolución ⇒ 1 sola resolución
□ Cerrar la pestaña a mitad de turno no pierde el borrador
□ Reconectar desde otro dispositivo restaura el estado en < 2 s
□ Un turno vencido se resuelve sin ningún cliente conectado
□ 3 turnos sin enviar ⇒ Mando Automático; el jugador recupera el asiento
□ Una partida reproducida desde (seed, órdenes) da el mismo checksum
□ Desplegado y accesible públicamente
```

> **Esta es la versión de riesgo del proyecto.** Concentra la seguridad, la concurrencia
> y la infraestructura. Conviene presupuestarla como la más larga.

---

## v0.4 — Diplomacia

**Alcance**
- Las 3 primitivas: Sello (5 tipos), Transferencia con depósito, base de Coalición.
- Compositor de ofertas por plantillas (móvil).
- Coste de ruptura, evento público, reputación de partida.
- Visión compartida, derecho de paso, derecho de Bastión.
- Chat público y privado con RLS.
- Transferencias condicionales (2 condiciones).

**Criterios de aceptación**
```
□ Enviar una oferta completa en ≤ 4 taps y ≤ 8 s (test E2E medido)
□ Romper un Sello cobra ✦ y es visible para los 5 asientos
□ Sin ✦ suficiente, la ruptura se rechaza
□ El depósito se entrega exacto o se devuelve íntegro
□ Un jugador no puede leer un canal privado ajeno (test de seguridad)
□ Las ofertas se muestran traducidas: ES y EN ven la misma oferta
□ La visión compartida llega vía player_views, nunca desde el cliente
```

---

## v0.5 — El Núcleo

**Alcance**
- Región Núcleo, activación en el T3, renta.
- Consagración: coste, contador de 3 turnos, reinicio, escalado por yacimientos perdidos.
- Revelación pública al declarar.
- Coalición completa (5 jugadores).
- Reclamación Menor y desempates.
- Rendición dirigida, Bastión sitiado, sin eliminación.
- Pantalla de resultados.

**Criterios de aceptación**
```
□ Una campaña termina siempre: por Consagración, Coalición o Reclamación Menor
□ Declarar Consagración revela al declarante a todos, en el mismo turno
□ Perder el Núcleo reinicia el contador y no devuelve el ✦
□ Una Coalición que consagra produce DOS vencedores
□ Un empate exacto declara empate; no se desempata al azar
□ Un jugador reducido a su Bastión conserva voz diplomática y renta
□ Consagrar en solitario, sin pactos, falla en > 70 % de las simulaciones
```

Ese último criterio es la primera validación del pilar P1 del juego.

---

## v0.6 — Metaprogresión

**Alcance**
- `match_results`, cálculo del depósito.
- `cities`, `account_unlocks`, RLS.
- Vista Ciudad, selección de equipo, distritos.
- Pantalla de Reposo, «Repetir campaña».

**Criterios de aceptación**
```
□ ✱ El test no-power-creep pasa                            ← BLOQUEANTE
□ Una cuenta al 100 % y una cuenta vacía con el mismo equipo tienen
   winrate 48–52 % en 2 000 simulaciones
□ No se puede llevar a campaña algo no desbloqueado
□ Un jugador no puede modificar su propio ash_bank (test de seguridad)
□ Entrar en campaña desde la Ciudad en ≤ 2 taps
□ «Repetir campaña» reproduce la partida con checksum idéntico
```

---

## v0.7 — Anomalías y Sombra

**Alcance**
- Las 8 anomalías, con las dos fases de resolución.
- Los 3 agentes de Sombra y sus 6 operaciones.
- Contrainteligencia, eventos falsos de *Sembrar*.
- Las 6 doctrinas con pasivo y activo.
- Investigación (3 tiers) y Yermo.

**Criterios de aceptación**
```
□ Las 8 anomalías funcionan y respetan sus límites de uso
□ Fisura no puede desconectar el grafo (test)
□ Sembrar inserta un evento falso indistinguible en el log de la víctima
□ Eco revela que un evento era falso
□ Interceptar revela órdenes; la contrainteligencia lo bloquea y revela al agente
□ Cada anomalía se usa en > 5 % de las partidas simuladas
□ Winrate por doctrina dentro de 18–22 % en 5 000 partidas
```

---

## v0.8 — Procedural y balance

**Alcance**
- Perturbación acotada, las 8 métricas de equidad, las 4 de interés.
- Bucle de aceptación e informe de equidad.
- Rotación de perfiles económicos.
- `packages/sim` completo: 8 perfiles, informe, barridos.
- **Ajuste de todas las constantes de `BALANCE` con barridos documentados.**

**Criterios de aceptación**
```
□ ✱ fairness.sweep: 1 000 semillas × {2,3,5} con F ≤ 1.0    ← BLOQUEANTE
□ ≥ 95 % de las semillas alcanzan I ≥ 0.45 sin fallback
□ Generar + validar un mapa ≤ 250 ms p95
□ 5 000 partidas simuladas en < 30 min
□ Todas las métricas de balance dentro de objetivo
□ Cada constante de BALANCE tiene su barrido guardado en reports/
□ corr(regiones@T6, victoria) < 0,45
```

---

## v0.9 — Pulido móvil, UX y assets

**Alcance**
- Los ~55 assets originales + Galería + comprobaciones automáticas.
- Tutorial «El Simulacro» y descubrimiento progresivo.
- Compendio generado desde las tablas de balance.
- Accesibilidad completa (teclado, lector de pantalla, daltonismo, movimiento reducido).
- Notificaciones push, PWA e instalación.
- Presupuestos de rendimiento cumplidos.

**Criterios de aceptación**
```
□ La checklist completa de QA móvil pasa (UX_MOBILE §11)
□ Bundle de la ruta de partida ≤ 180 KB gzip
□ Assets totales ≤ 150 KB
□ LCP móvil ≤ 2,5 s
□ Una campaña completa jugable solo con teclado
□ Una campaña completa jugable con lector de pantalla
□ Un jugador nuevo completa el tutorial en ≤ 8 min sin ayuda externa
□ Los 55 assets pasan assets:check y la revisión de coherencia
```

---

## v0.95 — Beta cerrada

**Alcance**
- Telemetría anónima, informe de errores, bloqueo y reporte de usuarios.
- Canal de feedback in-game.
- Estabilidad, casos límite, mensajes de error traducidos.
- **Playtesting real con 20–50 personas.**

**Criterios de aceptación**
```
□ ≥ 30 campañas completas jugadas por humanos
□ Tasa de abandono < 20 % de asientos-partida
□ > 70 % de campañas con ≥ 1 tratado activo        ← valida el pilar de diplomacia
□ > 40 % con ≥ 1 ruptura de Sello
□ Cero bugs críticos abiertos
□ Cero incidentes de seguridad
□ Duración media dentro de 9–12 turnos
□ Encuesta: ≥ 70 % «entendí las reglas en la primera partida»
```

La métrica de «> 70 % con tratado activo» es la que decide si el juego **es** lo que dice
ser. Si sale baja, la respuesta no es más marketing: es subir el coste de consagración.

---

## v1.0 — Release

**Alcance**
- ES y EN completos y revisados (UI, tutorial, compendio, lore, errores, diplomacia).
- Documentación al día, PDF generado.
- Página de aterrizaje, política de privacidad, términos.
- Monitorización y plan de respuesta a incidentes.

**Criterios de aceptación** (todos, sin excepción)
```
□ El core loop funciona de principio a fin
□ El multijugador funciona con 2, 3 y 5 jugadores
□ La persistencia y la reconexión funcionan
□ Los mapas están balanceados (fairness.sweep en verde)
□ El móvil funciona (checklist completa)
□ Los assets son coherentes y 100 % originales
□ ES y EN completos: cero claves faltantes, cero literales en componentes
□ Cero bugs críticos
□ Los tres tests bloqueantes en verde
□ Documentación y CHANGELOG al día
□ PDF de documentación generado
□ Coste de operación: 0 €/mes verificado
```

---

## Post-1.0 (registrado, no comprometido)

Por orden de valor esperado:

| # | Feature | Por qué |
|:-:|---|---|
| 1 | **Objetivos ocultos individuales** | Multiplicaría la diplomacia. Se aplazó solo por coste de balance y traducción. |
| 2 | Partidas de 4 y 6 jugadores | El generador ya lo soporta; falta balancear la economía del Núcleo |
| 3 | Gestión de ciudad con decisiones propias | Solo si el playtesting demuestra que se echa en falta |
| 4 | Espectador y repeticiones compartibles | Sale casi gratis del determinismo |
| 5 | Torneos y ligas privadas | Depende de que haya comunidad |
| 6 | Más doctrinas y anomalías | Contenido, no sistemas |
| 7 | Cosméticos y monetización | Requiere salir de Vercel Hobby |
| 8 | Ranking / ELO | Deliberadamente al final: cambia el metajuego |

---

## Riesgos del roadmap

| Riesgo | Mitigación |
|---|---|
| **v0.3 desborda** (auth + RLS + concurrencia + deploy a la vez) | Presupuestarla como la versión más larga; hacer un *spike* de resolución concurrente antes de empezar la UI |
| **El balance no converge en v0.8** | El simulador existe desde v0.8 pero se puede empezar en v0.2 con un motor parcial; adelantarlo si hay dudas |
| **Los assets se comen v0.9** | Herramientas (galería + checks) antes que assets; inventario congelado en 55 |
| **No hay jugadores para la beta** | Partidas privadas por código como flujo principal; empezar a reclutar en v0.7 |
| **Alcance que crece** | Toda feature nueva entra por `DECISIONS.md` con una decisión explícita de qué se corta a cambio |
