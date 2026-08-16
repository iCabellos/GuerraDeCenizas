# `tools/assets` — de SVG a componente

## Por qué existe

**Los assets son código** ([ASSET_PIPELINE §1](../../docs/ASSET_PIPELINE.md)). Viven en el
repositorio como SVG escritos a mano, se revisan en los diffs igual que cualquier otro
archivo y se compilan a componentes React. No hay binarios, no hay marketplace y no hay
licencias de terceros que auditar — que es exactamente lo que exige el brief.

## El pipeline

```
assets/src/<categoría>/<nombre>.svg     cuadrícula 24 · trazo 2 · cabecera obligatoria
        │
        ▼   npm run assets:build
apps/web/components/art/generated/
        ├── <categoría>.tsx             un componente por asset, tipado
        ├── types.ts                    ArtProps
        └── index.ts                    barril + ART_NAMES para la Galería
assets/manifest.json                    inventario con hash, trazos y peso
        │
        ▼
/dev/gallery                            QA visual — solo en desarrollo
```

## Lo que el generador rechaza

No avisa: **falla el build**.

| Comprobación | Por qué |
|---|---|
| Cabecera completa y `original: true` | Es la garantía documental de autoría que pide el brief |
| `viewBox="0 0 24 24"` | Un asset fuera de cuadrícula rompe la alineación óptica con los demás |
| Colores fuera de la paleta | Un `#ff0000` suelto no se ve en una revisión y sí rompe el contraste y el modo daltónico |
| Máximo 12 trazos | Un icono con más detalle es una mancha a 16 px, que es el tamaño al que se ve en el mapa |
| Categoría conocida | `units · terrain · resources · anomalies · diplomacy · states · ui · brand` |

## La Galería no es un escaparate

Es la herramienta que hace **verificable** la coherencia visual en vez de opinable, y ya
sirvió: el emblema de Koldvik parecía una copa de cóctel y la Mortaja de Oshara, una señal
de peligro. Los cuatro paneles y qué caza cada uno:

| Panel | Qué detecta |
|---|---|
| **Escala** | El detalle que se convierte en una mancha a 16 px |
| **Silueta** | Dos assets que no se distinguen de reojo durante un turno de tres minutos |
| **Superficies** | Contrastes que solo funcionan sobre un fondo |
| **Rejilla** | El asset que tiene otro peso de trazo que el resto |

## Al añadir un asset

```
□ Cabecera completa, con `original: true`
□ Cuadrícula de 24, trazo de 2, remates cuadrados y uniones en inglete
□ Sin degradados (la Ceniza es la única excepción del juego)
□ Sin texto dentro del SVG: rompería la i18n
□ Reconocible en negro sólido a 16 px — míralo en el panel Silueta
□ npm run assets:build en verde
```
