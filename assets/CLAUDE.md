# CLAUDE.md — `assets/`

## Regla número uno

**Todo asset es original y se escribe a mano como SVG dentro de este repositorio.**

Prohibido y verificado en CI: assets de marketplaces, imágenes de terceros, iconos con
licencia incompatible, tipografías con licencia restrictiva, referencias a propiedad
intelectual ajena, y **cualquier archivo binario** en `assets/src/`.

Que los assets sean código de texto en git hace que su procedencia sea trivialmente
rastreable — que es exactamente lo que el proyecto exige.

## Restricciones de cada SVG

```
viewBox="0 0 24 24"      cuadrícula de 24
stroke-width 1 o 2       constante dentro de un asset
sin degradados           (única excepción: el brillo de la Ceniza)
≤ 12 nodos de dibujo     si necesita más, es un icono equivocado
≤ 2 KB
sin <text>               rompería la i18n
sin <image>, <script>, <foreignObject>
colores: currentColor o variables de assets/tokens/palette.json
```

## Cabecera obligatoria

```svg
<!--
  asset: units/line
  role: símbolo de fuerza de Línea sobre el mapa y en la UI
  grid: 24
  stroke: 2
  colors: currentColor
  author: <nombre>
  created: AAAA-MM-DD
  original: true
-->
```

`original: true` es una **declaración explícita de autoría**. Si falta, el build falla.

## Antes de dar un asset por bueno

```
□ Reconocible en silueta a 16 px
□ Contraste ≥ 3:1 sobre los 8 terrenos
□ Coherente con los demás en el panel «Familia» de la Galería
□ Distinguible de los demás en pequeño
□ Legible en 360×640 en el panel «En contexto»
□ Legible con filtro de daltonismo
```

`npm run gallery` abre la Galería de Assets, que comprueba automáticamente escala,
contraste sobre cada terreno y similitud de siluetas entre pares.

**La incoherencia visual es invisible mirando un asset y evidente mirando cincuenta.**
Usa el panel «Familia».

## Estado actual

**Sin assets todavía.** Llegan en v0.9, y las herramientas (paleta, galería,
comprobaciones) van **antes** que el primer asset, para que nazca ya validado.

Detalle completo: [`docs/ASSET_PIPELINE.md`](../docs/ASSET_PIPELINE.md).

---

## Estado actual

**24 assets originales**, generados a componentes por `npm run assets:build` y revisables
en `/dev/gallery`. Tipografía resuelta: Archivo Variable, SIL OFL, en `assets/fonts/` con
su licencia ([ADR-017](../docs/DECISIONS.md#adr-017)).

Faltan las anomalías (8), la diplomacia (6) y buena parte de estados e interfaz: llegan
con los sistemas que las usan, no antes. Un asset sin sistema detrás es un asset que se
dibuja dos veces.

**Lo que ya cazó la Galería:** el emblema de Koldvik parecía una copa de cóctel y la
Mortaja de Oshara, una señal de peligro. Ninguno de los dos se veía mal en el archivo
suelto — se vieron mal al ponerlos a 16 px al lado de los demás. Para eso está.
