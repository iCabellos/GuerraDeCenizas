# Pipeline de assets

> **Versión:** 1.0 · Fuentes: `assets/src/` · Salida: `apps/web/components/art/`
> **Todos los assets son originales y creados dentro de este repositorio.**

---

## 1. La decisión que lo define todo: los assets son código

> **Todo asset se autora como SVG escrito a mano en el repositorio.**

| Consecuencia | Por qué importa |
|---|---|
| **Procedencia trivial** | Cada asset está en el historial de git, con autor y fecha. La exigencia del brief («todo asset debe poder rastrearse hasta su origen dentro del proyecto») se cumple por construcción, no por proceso. |
| **Imposible incorporar assets ajenos por accidente** | Un `.png` en `assets/` falla el lint. No hay ruta por la que un archivo descargado entre en producción. |
| **Coherencia** | Todos los assets comparten los mismos tokens de color y la misma cuadrícula. La coherencia deja de depender de la disciplina del autor. |
| **Diff legible** | Un cambio de asset es un diff de texto, revisable en un PR. |
| **Sin peso extra** | Los SVG en línea son parte del bundle: sin peticiones, sin CLS, sin atlas. |
| **Theming gratis** | `currentColor` y variables CSS: el mismo asset sirve para los 5 jugadores y para el modo de alto contraste. |
| **Escala perfecta** | El mismo archivo a 16 px y a 96 px, nítido en pantallas 3×. |

Ninguna herramienta externa, ningún formato binario, ninguna licencia que auditar.
→ [ADR-011](DECISIONS.md)

**Prohibido**, y verificado en CI: assets de marketplaces, imágenes de terceros, iconos
con licencia incompatible, tipografías con licencia restrictiva, referencias a IP ajena,
y cualquier binario en `assets/src/`.

---

## 2. Dirección artística

### 2.1 Concepto

> **Cartografía militar contemporánea, contaminada.**

La estética del juego es la de un **mapa de situación** —el que se despliega sobre una
mesa en un centro de mando— sobre el que la Ceniza ha empezado a dejar marcas que la
cartografía no sabe representar.

- **Base:** geometría plana, líneas técnicas, símbolos legibles, tipografía condensada.
- **Contaminación:** las anomalías se dibujan **fuera del sistema**: trazos que rompen la
  cuadrícula, sin relleno, con un blanco ceniza que ningún otro elemento usa. No parecen
  parte del mapa porque **no lo son**.

Esa es toda la fantasía moderna del juego, resuelta visualmente: el mundo militar es
ordenado y la Ceniza no obedece.

### 2.2 Reglas de estilo

| Regla | Valor |
|---|---|
| **Geometría** | Solo formas construidas: rectas, arcos de radio constante, ángulos de 15° |
| **Trazo** | 2 unidades sobre una cuadrícula de 24. Nunca varía dentro de un asset |
| **Relleno** | Plano. **Sin degradados** (salvo el brillo de Ceniza, único caso) |
| **Detalle** | Máximo 12 trazos por icono. Si necesita más, es un icono equivocado |
| **Silueta** | Reconocible en negro sólido a 16 px. Test obligatorio |
| **Perspectiva** | Ninguna. Todo cenital u ortográfico frontal |
| **Sombra** | Ninguna |
| **Texto dentro del asset** | Nunca (rompería la i18n) |

### 2.3 Paleta

Fuente única: `assets/tokens/palette.json` → genera CSS variables y constantes TS.
**Ningún color literal en ningún SVG ni componente.** Regla de lint.

```json
{
  "surface": { "void":"#0E0F12", "panel":"#191B20", "raised":"#22252C", "line":"#2A2D35" },
  "ink":     { "primary":"#E8E6E1", "muted":"#9A968E", "faint":"#5C5952" },
  "accent":  { "rust":"#C9683A", "danger":"#B33A3A", "success":"#4A8B6F", "warn":"#C4A53C" },
  "ash":     { "core":"#D6CFC4", "glow":"#F2EDE4", "dim":"#7E796F" },
  "terrain": { "plain":"#3A4038", "urban":"#41434A", "high":"#4A4640",
               "forest":"#2F3A31", "water":"#28353D", "seam":"#4A4238", "scoured":"#1A1A1A" },
  "player":  { "p0":"#4A7FB5", "p1":"#C9683A", "p2":"#6E9B54", "p3":"#9B5FA8", "p4":"#C4A53C" }
}
```

Los colores de terreno son **deliberadamente apagados y de luminancia similar**: el mapa
es el fondo, y lo que debe destacar son las fuerzas, los yacimientos y el Núcleo. Un mapa
vistoso sería un mapa ilegible.

### 2.4 Tipografía

Una sola familia variable, geométrica, condensada, con **números tabulares**
(imprescindible: hay muchas cifras que deben alinearse en columna).

Debe cubrir el latín extendido completo para ES + EN, y estar bajo licencia **SIL OFL** o
equivalente, con la licencia incluida en `assets/fonts/LICENSE`. Se subsetea a los
glifos usados. *(La elección concreta de familia está pendiente — ver
[DECISIONS ADR-017](DECISIONS.md).)*

---

## 3. Inventario

### 3.1 Fuerzas (3 + 1)

Solo se dibujan **cuatro** siluetas en toda la campaña. Su fuerza se comunica con un
número, no con más arte.

| Asset | Silueta |
|---|---|
| `line` | Rectángulo con una diagonal — la marca cartográfica clásica de infantería |
| `fire` | Triángulo apuntando hacia arriba con base abierta |
| `sky` | Cuña / delta |
| `shade` | Rombo hueco de línea discontinua |

### 3.2 Regiones (8)

No son iconos: son **rellenos y tramas** aplicados a los polígonos generados.
`plain`, `urban`, `high`, `forest`, `water`, `seam`, `bastion`, `core`, `scoured`.

### 3.3 Recursos (4)

| Asset | Forma |
|---|---|
| `supply` ▣ | Cuadrado con banda horizontal |
| `industry` ⬢ | Hexágono con muesca |
| `intel` ◈ | Rombo con punto central |
| `ash` ✦ | Estrella de cuatro puntas con brillo (**único asset con degradado**) |

### 3.4 Anomalías (8)

`veil`, `flare`, `echo`, `fold`, `rift`, `anchor`, `exodus`, `seal`.
Todas dibujadas con la regla de «contaminación»: sin relleno, trazo que **sale del
recuadro** de 24×24, en `ash.core`.

### 3.5 Diplomacia (6), Estados (10), UI (14)

`seal`, `breach`, `transfer`, `coalition`, `vision`, `offer` ·
`selected`, `valid-target`, `invalid`, `contested`, `unsupplied`, `fortified`,
`attuning`, `absent`, `submitted`, `thinking` ·
navegación, cierre, ayuda, ajustes, idioma, etc.

**Total v1.0: ~55 assets.** Un inventario deliberadamente pequeño, que es lo que hace
alcanzable la coherencia visual con un solo autor.

---

## 4. Convención de nombres

```
assets/src/<categoría>/<nombre>.svg

categorías: units · terrain · resources · anomalies · diplomacy · states · ui · brand

nombre: kebab-case, en inglés, sin abreviar, sin versión, sin tamaño
        ✅ fire-support.svg      ❌ fireSup_v2_32.svg
```

Cada archivo lleva cabecera obligatoria:

```svg
<!--
  asset: units/line
  role: símbolo de fuerza de Línea sobre el mapa y en la UI
  grid: 24
  stroke: 2
  colors: currentColor
  author: <nombre>
  created: 2026-08-15
  original: true
-->
```

El campo `original: true` es una **declaración explícita de autoría**, verificada por el
script de lint: si falta, el build falla. Es la garantía documental de la exigencia de IP
del brief.

---

## 5. Del SVG al componente

```
assets/src/units/line.svg
        │
        ▼  npm run assets:build
apps/web/components/art/generated/Line.tsx      ← componente React
apps/web/components/art/generated/index.ts      ← registro tipado
assets/manifest.json                            ← inventario + hashes
```

El generador:

1. Valida la cabecera y la cuadrícula (`viewBox="0 0 24 24"`).
2. Sustituye colores literales por `currentColor` o por variables de la paleta;
   **falla** si encuentra un hex no registrado.
3. Optimiza (elimina metadatos, redondea a 2 decimales).
4. Emite un componente React tipado con props `size`, `title`, `className`.
5. Actualiza `manifest.json` con hash, dimensiones y peso.

```tsx
export function Line({ size = 24, title, ...p }: ArtProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}
         role={title ? 'img' : 'presentation'} aria-label={title} {...p}>
      {title && <title>{title}</title>}
      <path d="…" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
```

`title` es **obligatorio** cuando el icono transmite información: llega ya traducido
desde i18n. Un icono decorativo lleva `role="presentation"`.

---

## 6. QA visual: la Galería de Assets

`npm run gallery` → `/dev/gallery` (solo en desarrollo).

Es el requisito §15 del brief y la herramienta que hace que la coherencia sea verificable
y no una opinión.

```
┌──────────────────────────────────────────────────────────┐
│ GALERÍA DE ASSETS                          55 assets     │
│ Tamaño  [16][24][32][48][96]     Fondo [terrenos ▾]      │
│ ☐ Silueta   ☐ Alto contraste   ☐ Rejilla   ☐ Daltonismo  │
├──────────────────────────────────────────────────────────┤
│ ESCALA — el mismo asset a todos los tamaños              │
│   ▪  ▪   ▪    ▪     ▪                                    │
│  16  24  32   48    96                                   │
├──────────────────────────────────────────────────────────┤
│ SOBRE TERRENO — cada asset sobre los 8 terrenos          │
│  ┌────┬────┬────┬────┬────┬────┬────┬────┐               │
│  │llan│urba│elev│bosq│agua│yaci│bast│núcl│               │
│  │ ▪  │ ▪  │ ▪  │ ▪  │ ▪  │ ▪  │ ▪  │ ▪  │               │
│  └────┴────┴────┴────┴────┴────┴────┴────┘               │
│  contraste:  8.1  6.4  7.2  9.0  5.8  6.9  4.1⚠ 7.7      │
├──────────────────────────────────────────────────────────┤
│ EN CONTEXTO — mapa real, semilla 42, 5 jugadores         │
│ EN DISPOSITIVO — 360×640 · 390×844 · 768 · 1440          │
│ FAMILIA — los 55 juntos, para detectar al intruso        │
└──────────────────────────────────────────────────────────┘
```

### 6.1 Los seis paneles y qué detecta cada uno

| Panel | Detecta |
|---|---|
| **Escala** | Detalle que desaparece a 16 px; trazos que se emborronan |
| **Silueta** | Iconos irreconocibles sin color — el test más duro |
| **Sobre terreno** | Contraste insuficiente sobre algún fondo (calculado, con aviso automático) |
| **En contexto** | Solapamientos, apiñamiento, ilegibilidad a escala real de juego |
| **En dispositivo** | Tamaño real en pantallas reales |
| **Familia** | El asset que «no es de la misma mano» — se ve al instante viendo los 55 juntos |

El panel **Familia** es el más valioso: la incoherencia visual es invisible mirando un
asset y evidente mirando cincuenta.

### 6.2 Comprobaciones automáticas

Ejecutadas en CI (`npm run assets:check`), fallan el build:

```
✓ viewBox = "0 0 24 24"
✓ ancho de trazo ∈ {1, 2}
✓ sin colores literales fuera de la paleta
✓ sin <text>
✓ sin <image>, <foreignObject>, <script>
✓ ≤ 12 nodos de dibujo
✓ ≤ 2 KB por archivo
✓ cabecera completa con original: true
✓ contraste ≥ 3:1 sobre los 8 terrenos          ← calculado, no estimado
✓ silueta distinguible: distancia de Hamming ≥ 15 % contra cualquier otro asset
✓ total de assets ≤ 150 KB
```

La comprobación de **silueta distinguible** rasteriza cada asset a 16 px en negro sólido
y compara todos los pares. Si dos iconos se parecen demasiado en pequeño, el jugador los
confundirá en el mapa — y eso se detecta automáticamente, no en playtesting.

---

## 7. Criterios de aprobación

Un asset entra en `main` solo si:

```
□ Pasa todas las comprobaciones automáticas (§6.2)
□ Reconocible en silueta a 16 px
□ Contraste ≥ 3:1 sobre los 8 terrenos
□ Coherente en el panel Familia
□ Distinguible de los demás en el panel Familia
□ Legible en 360×640 en el panel En contexto
□ Legible con el filtro de daltonismo (deuteranopía y protanopía)
□ Cabecera con original: true y autor
□ Añadido al manifiesto
□ Captura del panel En contexto adjunta al PR
```

Los tres últimos son revisión humana; el resto es automático.

---

## 8. Efectos y animación

**Sin sistema de partículas, sin sprites, sin librería de animación.**
Todo con CSS y SMIL/CSS sobre los mismos SVG:

| Efecto | Implementación | Duración |
|---|---|---|
| Selección | Anillo con `stroke-dasharray` animado | continua, 2 s |
| Movimiento | Trazo que se dibuja (`stroke-dashoffset`) | 400 ms |
| Combate | Destello + sacudida de la región | 600 ms |
| Captura | Barrido de color desde el borde | 500 ms |
| Anomalía | Distorsión del contorno con `filter: url(#rift)` | 800 ms |
| Consagración | Pulso del Núcleo | continua, 3 s |
| Ceniza | 40 partículas CSS, solo en menús | continua |

**Todo desactivable con `prefers-reduced-motion`, y el juego sigue siendo plenamente
jugable e informativo sin ninguna animación** (la información nunca está *solo* en el
movimiento).

---

## 9. Marca

`assets/src/brand/`: logotipo (marca completa y símbolo), favicon, icono PWA, imagen de
apertura. Mismas reglas, misma paleta, mismo repositorio.

El símbolo: **un círculo incompleto con una traza que lo atraviesa** — la ciudad plegada
y la Ceniza que la corta. Legible a 16 px como favicon.

---

## 10. Versionado de assets

- Los assets **no llevan versión en el nombre**. Git es el versionado.
- `manifest.json` guarda el hash de cada asset: un cambio visual es detectable en el diff.
- Cambiar un asset **no** rompe partidas (no forman parte del estado).
- Los cosméticos desbloqueables (emblemas, paletas) sí se referencian por clave estable
  en `account_unlocks`: **esas claves no se renombran nunca**.

---

## 11. Plan (v0.9)

| Paso | Entrega |
|:-:|---|
| 1 | `palette.json` + generación de tokens |
| 2 | Galería con los 6 paneles |
| 3 | `assets:check` en CI |
| 4 | Terrenos (8) — lo primero que se ve |
| 5 | Fuerzas (4) |
| 6 | Recursos (4) |
| 7 | UI (14) |
| 8 | Estados (10) |
| 9 | Anomalías (8) y diplomacia (6) |
| 10 | Marca |
| 11 | Pase de coherencia sobre el panel Familia |
| 12 | Auditoría de contraste y daltonismo |

Los pasos 1–3 (herramientas) van **antes** que ningún asset: la galería y las
comprobaciones existen antes de que haya nada que comprobar, para que el primer asset ya
nazca validado.
