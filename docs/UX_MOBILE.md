# UX / UI — Mobile first

> **Versión:** 1.0 · Referencia de diseño: **360 × 640 px**
> Regla del proyecto: *si no funciona en 360 px con el pulgar, no existe.*

---

## 1. Principios

### 1.1 El móvil no es una versión reducida: es el diseño

Se diseña a 360 px **primero**. El escritorio recibe la misma interfaz con más aire y
paneles simultáneos. **No son dos juegos.** Ni una sola regla, atajo o información
cambia entre plataformas — solo la densidad.

### 1.2 Zona del pulgar

```
      360 px
  ┌───────────────┐  ─┐
  │   DIFÍCIL     │   │  Información. Nunca controles primarios.
  │  (mapa, HUD)  │   │
  ├───────────────┤   │  640 px
  │    NEUTRA     │   │  Mapa interactivo, listas
  │               │   │
  ├───────────────┤   │
  │  ★ CÓMODA ★   │   │  TODAS las acciones primarias
  │  (acciones)   │   │
  └───────────────┘  ─┘
```

Todo control con el que se interactúa más de una vez por turno vive en el **tercio
inferior**. La barra de acción es siempre lo último de la pantalla.

### 1.3 Un modo, una pantalla

Nunca más de **un** panel modal abierto. Nada de menús dentro de menús: si una acción
necesita tres niveles de navegación, está mal diseñada.

### 1.4 Objetivos táctiles

| Elemento | Mínimo | Real |
|---|:-:|:-:|
| Botón primario | 44 px | **56 px** |
| Región del mapa | 44 px | **48–90 px** (garantizado por el tamaño del grafo) |
| Icono de recurso (tocable) | 44 px | 44 px |
| Elemento de lista | 44 px | 56 px |
| Separación entre táctiles | 8 px | 12 px |

Que el mapa sea un **grafo de 45–96 regiones** y no una rejilla es lo que hace esto
posible ([MAP_GENERATION §1](MAP_GENERATION.md#1-el-problema-y-por-qué-la-solución-habitual-no-sirve)):
la restricción de UX móvil determinó la topología del juego, no al revés.

> **Un mapa de 5 jugadores no cabe entero en 360 px con regiones tocables.** Medido en el
> prototipo v0.1: a escala 1 cada región mide **21 px**, menos de la mitad del mínimo.
> La respuesta no es encoger el mapa (lo volvería trivial) ni fingir que cumple: el mapa
> **entra con el zoom necesario** para que una región mida ~52 px, centrado entre tu
> Bastión y el Núcleo. Ves tu sector y el objetivo; el resto se navega. El zoom inicial
> se calcula del ancho real del viewport, no de una constante, así que en escritorio el
> mapa entra entero y las regiones siguen midiendo ~52 px.

---

## 2. Gestos

| Gesto | Acción | Feedback |
|---|---|---|
| **Tap** en región | Seleccionar / mostrar la hoja de región | Anillo + háptico ligero |
| **Tap** en región resaltada (con fuerza seleccionada) | Ordenar movimiento | Flecha animada + háptico |
| **Long press** (400 ms) | Compendio de ese elemento | Háptico medio + tarjeta |
| **Drag** desde una fuerza | Arrastrar a destino (alternativa al tap-tap) | Línea elástica + destinos válidos iluminados |
| **Pinch** | Zoom 0,6×–2,5× | — |
| **Drag** en vacío | Desplazar el mapa | — |
| **Doble tap** en vacío | Encuadrar todo el mapa | — |
| **Botón «Mi ciudad»** | Llevar la cámara a tu Bastión | Vuelo suave de 320 ms |
| **Swipe ↑** desde el borde inferior | Abrir diplomacia | — |
| **Swipe ←/→** en la barra superior | Cambiar de jugador en el panel de estado | — |

**Cada acción tiene siempre dos caminos**: tap-tap y drag. El drag es rápido para
expertos; el tap-tap es fiable con una mano y no falla con dedos grandes.

**Un arrastre no puede acabar seleccionando.** Entre desplazar el mapa y tocar una región
hay un umbral de 8 px: sin él, navegar abre fichas sin querer y el mapa deja de ser
navegable con el pulgar.

**La cámara también se maneja con botones**, no solo con gestos. Perder de vista tu Bastión
en un mapa de hasta 96 regiones y tener que buscarlo arrastrando es la forma más rápida de
que la partida deje de parecer un juego ([ADR-040](DECISIONS.md#adr-040)).

**Nunca se usa:** swipe para acciones destructivas, triple tap, gestos de dos dedos para
nada que no sea zoom, ni pulsación larga como *única* forma de llegar a algo.

---

## 3. Wireframes — Móvil

### 3.1 Login

```
┌────────────────────────────┐
│                            │
│      GUERRA DE CENIZAS     │
│      ·  ·  ·  ·  ·  ·      │   ← ceniza cayendo, animación sutil
│                            │
│                            │
│  ┌──────────────────────┐  │
│  │ correo@ejemplo.com   │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │      CONTINUAR       │  │   ← 56 px
│  └──────────────────────┘  │
│                            │
│   Te enviaremos un enlace  │
│   de acceso. Sin           │
│   contraseñas.             │
│                            │
│         ES  ·  EN          │   ← selector de idioma siempre visible
└────────────────────────────┘
```

Magic link: sin contraseñas que recordar ni gestionar, un campo, un botón. El idioma se
elige **antes** de entrar.

### 3.2 Ciudad (inicio)

Ver [METAPROGRESSION §5.2](METAPROGRESSION.md#52-qué-hay-en-la-ciudad).
Regla: **entrar en campaña en 1 tap** desde aquí.

### 3.3 Lobby

```
┌────────────────────────────┐
│ ←  CAMPAÑA          KJ7-2M │   ← código, tap para copiar
├────────────────────────────┤
│  5 jugadores · Diaria      │
│  Esperando 2…              │
├────────────────────────────┤
│  ● Vantera      tú         │
│  ● Koldvik      Marta      │
│  ● Saranth      Lu         │
│  ○ ─────────    esperando  │
│  ○ ─────────    esperando  │
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │  COMPARTIR INVITACIÓN│  │
│  └──────────────────────┘  │
│  [ Empezar con bots ]      │   ← tras 10 min
├────────────────────────────┤
│  💬  Chat del lobby        │
└────────────────────────────┘
```

### 3.4 Mapa — la pantalla principal

```
┌────────────────────────────┐
│ ▣18 ⬢24 ◈9 ✦7    T4  2h14m │ ← 44 px. Tap en un recurso = desglose
├────────────────────────────┤
│                            │
│        ╱▔▔╲                │
│    ╱▔▔╲    ╲               │
│   │ ✦  │────│              │   ← regiones como polígonos SVG
│    ╲__╱ ╲  ╱               │      48–90 px de ancho
│      │   ╳                 │
│    ╱▔▔╲ ╱ ╲                │
│   │ ◆◆ │───│  ★ │          │   ← ◆ = tus fuerzas, ★ = Núcleo
│    ╲__╱     ╲__╱           │
│                            │
│                       [⊙]  │   ← centrar en mi Bastión
├────────────────────────────┤
│  ✓ 3 órdenes               │   ← resumen del turno
│ ┌──────────┐┌────────────┐ │
│ │ 🤝 DIPLO ││ ✓ ENVIAR   │ │   ← 56 px, zona cómoda
│ └──────────┘└────────────┘ │
└────────────────────────────┘
```

**El mapa ocupa el 70 % de la pantalla.** Todo lo demás es una barra arriba (información)
y una barra abajo (acción). Sin paneles laterales, sin minimapa (el mapa entero ya cabe),
sin barras de herramientas.

### 3.5 Hoja de región (tap en una región)

```
┌────────────────────────────┐
│         (mapa visible)     │   ← el mapa NO se oculta: la hoja ocupa 55 %
│                            │
├────────────────────────────┤
│ ▁▁▁▁                       │   ← tirador
│ TERRAZA BAJA      Elevación│
│ Koldvik · Fort. 1          │
│                            │
│  ▣2  ⬢1  ◈1                │
│                            │
│  FUERZAS VISIBLES          │
│  🛡 Línea ~20   🎯 Fuego 10 │
│                            │
│  Defensor +20 % · Fuego +10│
│                            │
│ ┌────────────┐┌──────────┐ │
│ │  ATACAR    ││ DETALLES │ │
│ └────────────┘└──────────┘ │
└────────────────────────────┘
```

La hoja **nunca cubre el mapa entero**. El jugador siempre ve el contexto de lo que está
decidiendo. Se cierra con swipe hacia abajo o tocando el mapa.

### 3.6 Previsualización de combate

La pantalla que solo es posible gracias al combate determinista
([GDD §7](GAME_DESIGN.md#7-combate)):

```
┌────────────────────────────┐
│  ATACAR TERRAZA BAJA       │
├────────────────────────────┤
│   TÚ              KOLDVIK  │
│  🛡 20            🛡 ~20    │
│  🎯 10            🎯 10     │
│  ✈  0             ✈  0      │
│                            │
│  Poder 38,5      Poder 33,1│
│  ─────────────────────────  │
│                            │
│      ✓  VENCES             │
│                            │
│   Pierdes ~55 %  →  🛡9 🎯4 │
│   Capturas la región       │
│                            │
│  ⚠ Estimación: la fuerza   │
│    enemiga es aproximada   │
│    (Bosque adyacente)      │
│                            │
│ ┌──────────┐┌────────────┐ │
│ │ CANCELAR ││ CONFIRMAR  │ │
│ └──────────┘└────────────┘ │
└────────────────────────────┘
```

**El aviso sobre la información aproximada es esencial.** El resultado es exacto *dada la
información que tienes*; la incertidumbre está en los datos, no en el sistema. La UI debe
enseñar eso explícitamente, porque es el corazón del juego.

### 3.7 Diplomacia

Ver [DIPLOMACY §3.1](DIPLOMACY.md#31-composición-por-plantillas) para el compositor de
ofertas.

```
┌────────────────────────────┐
│         (mapa visible)     │   ← 40 %
├────────────────────────────┤
│ ▁▁▁▁                       │
│ ┌────┬────┬────┬────┬────┐ │
│ │TODO│ KO │ SA │ ME │ OS │ │   ← pestañas por jugador
│ └────┴────┴────┴────┴────┘ │
│                            │
│  Koldvik  Sellos 4/1       │   ← recuento factual
│  🔗 No agresión · 2 turnos │
│                            │
│  ──────────────────────    │
│  KOLDVIK  «no toques el    │
│  yacimiento del norte»     │
│                            │
│  TÚ  «¿por cuánto?»        │
│  ──────────────────────    │
│                            │
│ ┌──────────────┐┌────────┐ │
│ │  NUEVA OFERTA││ Escribir│ │
│ └──────────────┘└────────┘ │
└────────────────────────────┘
```

**«Nueva oferta» va primero y es más grande que «Escribir».** La jerarquía visual empuja
hacia la negociación estructurada, que es la que funciona en móvil y entre idiomas.

### 3.8 Otras pantallas

| Pantalla | Patrón |
|---|---|
| **Ejército** | Lista de tus ≤ 6 fuerzas; tap para centrar el mapa en ella |
| **Investigación** | 3 tiers, 4 tarjetas cada uno; solo 1 activo a la vez |
| **Objetivo** | Estado del Núcleo, contador de consagración, quién lo tiene |
| **Fin de turno** | Resumen de tus órdenes, confirmación |
| **Resultados** | Las 3 tarjetas de [Reposo](METAPROGRESSION.md#53-el-reposo-post-campaña) |
| **Compendio** | Buscador + categorías; generado desde las tablas de balance |

---

## 4. Escritorio

**La misma interfaz, con más aire.** Nada nuevo, nada oculto.

```
┌──────────────────────────────────────────────────────────────────┐
│ ▣18 ⬢24 ◈9 ✦7                    TURNO 4        2h 14m    ⚙  ES  │
├─────────────┬────────────────────────────────────┬───────────────┤
│  FUERZAS    │                                    │  DIPLOMACIA   │
│  ▸ 1ª  🛡20 │            MAPA                    │  ▸ Koldvik    │
│  ▸ 2ª  🎯10 │      (el mismo SVG,                │  ▸ Saranth    │
│  ▸ 3ª  ✈10  │       más grande)                  │  ▸ Meridia    │
│             │                                    │               │
│  INVESTIG.  │                                    │  Chat         │
│  ▸ Tier I ✓ │                                    │  ─────────    │
│             │                                    │               │
│  NÚCLEO     │                                    │               │
│  ▸ Inerte   │                                    │  [ OFERTA ]   │
├─────────────┴────────────────────────────────────┴───────────────┤
│                    ✓ 3 órdenes      [ ENVIAR TURNO ]             │
└──────────────────────────────────────────────────────────────────┘
```

Los paneles laterales son **exactamente** las hojas deslizables del móvil, ancladas.
Un mismo componente React con dos contenedores. Coste de mantenimiento cercano a cero, y
garantía de que no divergen.

Breakpoints: `< 640` móvil · `640–1024` tablet (un panel anclado) · `> 1024` escritorio
(dos paneles).

---

## 5. Diplomacia en móvil

El problema central: negociar en un teléfono es doloroso, y si duele, no se hace
([DISCOVERY D2](DISCOVERY.md#21-riesgos-de-diseño)). Cuatro respuestas:

1. **Ofertas por plantilla**: 3–4 taps, sin teclado.
2. **Sugerencias contextuales**: el juego propone la oferta pertinente según el estado
   («Koldvik tiene tropas junto a tu yacimiento» → *Ofrecer no agresión*).
3. **Respuestas rápidas**: `Acepto` · `No` · `Sube la oferta` · `Espera un turno`.
4. **La diplomacia no oculta el mapa**: se negocia mirando el terreno.

**Objetivo medible:** enviar una oferta completa en **≤ 4 taps y ≤ 8 segundos**. Es un
test E2E.

---

## 6. Onboarding

Ver [GDD §17](GAME_DESIGN.md#17-tutorial-y-onboarding). Reglas de UI:

- El tutorial **nunca** muestra más de un elemento resaltado a la vez.
- Todo lo demás se atenúa (no se bloquea: se puede explorar).
- Cada tarjeta: **una frase**, un botón, descartable.
- Se puede saltar en cualquier momento; se puede repetir desde el Compendio.
- Nada de vídeos, nada de muros de texto, nada de «acepta para continuar».

---

## 7. Accesibilidad

| Requisito | Implementación |
|---|---|
| **Contraste** | Todo el texto ≥ 4,5:1 (AA). Elementos de UI ≥ 3:1. Verificado en CI con axe. |
| **Daltonismo** | Los jugadores **nunca** se distinguen solo por color: cada uno tiene además un **patrón de trama** (rayas, puntos, cuadrícula, diagonal, liso) y una **inicial**. Modo de alto contraste conmutable. |
| **Tamaño de texto** | `rem`; respeta el ajuste del sistema hasta 200 % sin romper el diseño. |
| **Táctil** | Mínimo 44 px, real 56 px (§1.4). |
| **Movimiento** | `prefers-reduced-motion`: sin ceniza cayendo, sin animaciones de combate, transiciones instantáneas. **El juego es plenamente jugable sin ninguna animación.** |
| **Lector de pantalla** | Cada región del SVG es un `<g role="button" tabindex="0">` con `aria-label` completo: *«Terraza Baja, elevación, controlada por Koldvik, 20 de línea visible, adyacente a tu 1ª fuerza»*. |
| **Teclado** | Tab recorre las regiones en orden de anillo; flechas navegan por adyacencia; Enter selecciona. **El juego es 100 % jugable con teclado.** |
| **Iconos** | **Nunca** un icono solo. Siempre icono + número, o icono + texto. |
| **Idioma** | `lang` correcto en `<html>` por locale. |

La accesibilidad del mapa sale casi gratis por ser SVG en el DOM: si fuera Canvas o
WebGL, cada punto de esta tabla costaría una implementación paralela
([TECHNICAL_DESIGN §10.1](TECHNICAL_DESIGN.md#101-renderizado-del-mapa-svg)).

---

## 8. Estados y feedback

Toda acción debe responder en **< 100 ms**, aunque el resultado tarde.

| Estado | Señal |
|---|---|
| Seleccionable | Contorno tenue |
| Seleccionado | Anillo grueso + brillo + háptico ligero |
| Destino válido | Relleno pulsante suave |
| Destino inválido | Sin resaltar; al tocarlo, sacudida + motivo en un `toast` |
| Orden dada | Flecha persistente + badge en el contador de órdenes |
| Enviando | Botón con spinner, sigue legible |
| Enviado | ✓ + háptico de éxito + el botón cambia a «Modificar» |
| Esperando a otros | Avatares con estado: ✓ enviado · ⋯ pensando · ✕ ausente |
| Turno resuelto | Animación de 1,5 s (saltable) + log |
| Error | `Toast` con causa traducida y acción de reintento |

**El estado «esperando a otros» es una pantalla de producto, no un espinner.** Muestra
quién ha enviado, cuánto queda y permite seguir negociando. Nunca se bloquea la interfaz.

---

## 9. Rendimiento en móvil

Presupuestos en [TECHNICAL_DESIGN §13](TECHNICAL_DESIGN.md#13-rendimiento). Prácticas:

- Zoom y desplazamiento por `transform` sobre el `<g>` raíz (compuesto por GPU).
- `will-change: transform` solo mientras dura el gesto.
- Sin re-render de React durante el gesto: se manipula el `transform` por ref.
- Las hojas usan `content-visibility: auto`.
- Sin fuentes externas: fuente variable propia, subconjunto latino, `font-display: swap`.
- Sin imágenes rasterizadas en la ruta de partida: todo SVG en línea.
- La ruta de partida no carga el código de la Ciudad ni del Compendio (`dynamic import`).

---

## 10. Dirección visual de la interfaz

Coherente con [ASSET_PIPELINE](ASSET_PIPELINE.md).

```
Fondo         #0E0F12   casi negro, frío
Superficie    #191B20   paneles
Borde         #2A2D35
Texto         #E8E6E1   blanco ceniza
Texto tenue   #9A968E
Acento        #C9683A   óxido — solo acciones primarias
Peligro       #B33A3A
Éxito         #4A8B6F
Ceniza (✦)    #D6CFC4   con brillo tenue

Jugadores:  P0 #4A7FB5 azul   ▤ rayas
            P1 #C9683A óxido  ▦ cuadrícula
            P2 #6E9B54 verde  ▨ diagonal
            P3 #9B5FA8 violeta ▩ puntos
            P4 #C4A53C ámbar  ▬ liso
```

- **Tipografía**: una única familia variable, geométrica y condensada, con números
  tabulares (imprescindible: hay muchas cifras alineadas).
- **Esquinas**: 4 px. Nada redondeado: es un juego militar.
- **Sombras**: ninguna. La profundidad se da con bordes y superficies.
- **Animación**: 120–200 ms, `ease-out`. Nada rebota.
- **Ceniza**: una capa de partículas muy sutil, solo en menús, nunca sobre el mapa,
  desactivada con `prefers-reduced-motion`.

---

## 11. Checklist de QA móvil

Antes de cerrar cualquier versión:

```
□ Todo se usa con una mano en 360×640
□ Ningún táctil < 44 px
□ Ningún texto < 14 px
□ Todo el texto ≥ 4,5:1 de contraste
□ Ningún panel oculta el mapa por completo
□ Jugable con lector de pantalla (recorrido completo del mapa)
□ Jugable solo con teclado
□ Jugable con prefers-reduced-motion
□ Jugable al 200 % de tamaño de texto
□ Ningún jugador identificable solo por color
□ Feedback en < 100 ms en toda acción
□ Enviar una oferta diplomática en ≤ 4 taps
□ Sin desbordamiento horizontal en 320 px (iPhone SE)
□ Funciona en horizontal
□ Funciona con el teclado abierto
□ Sin scroll dentro de scroll
```

Automatizado en Playwright donde es posible; el resto es una lista manual firmada por
versión.
