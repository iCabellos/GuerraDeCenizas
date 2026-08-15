# Generación del PDF de documentación

Convierte la documentación Markdown del repositorio en un único PDF profesional con
portada, índice y paginación.

```bash
npm run docs:pdf         # → docs/GuerraDeCenizas.pdf
npm run docs:check       # verifica los enlaces internos entre documentos
```

## Pipeline

```
docs/*.md + README.md
      │
      ▼  markdown-it (+ markdown-it-anchor)
    HTML por capítulo
      │  · ids prefijados por capítulo (evita colisiones entre documentos)
      │  · enlaces relativos reescritos a anclas internas del PDF
      ▼
  documento único  +  print.css
      │
      ▼  Chromium headless (Playwright) · page.pdf()
docs/GuerraDeCenizas.pdf
```

**Sin herramientas de pago y sin dependencias externas al repositorio.** No hace falta
LaTeX, ni Pandoc, ni un servicio en la nube: tres paquetes npm y el Chromium que ya usa
Playwright para los tests E2E.

## Estructura del documento

| Parte | Capítulos |
|---|---|
| I · Visión | El proyecto (README) · Discovery |
| II · Diseño de juego | GDD · Diplomacia · Metaprogresión |
| III · Sistemas | Generación procedural · Multijugador · TDD |
| IV · Producción | UX/UI · Assets · Testing |
| V · Ejecución | Roadmap · Decisiones |

El orden y los títulos se definen en la constante `CHAPTERS` de `build.mjs`. Añadir un
documento nuevo al PDF es añadir una línea ahí.

## Requisitos

- Node ≥ 22
- Chromium de Playwright. Si `PLAYWRIGHT_BROWSERS_PATH` está definido, el script lo busca
  ahí; si no, deja que Playwright resuelva su ruta por defecto. Para instalarlo:

  ```bash
  npx playwright install chromium
  ```

## En CI

`npm run docs:pdf` se ejecuta en el pipeline y **debe completar sin error**: un fallo
significa que un documento se ha roto o que un enlace apunta a un sitio inexistente.

`npm run docs:check` es más estricto y también bloqueante: comprueba que cada enlace
interno apunta a un archivo que existe **y a un ancla que existe en ese archivo**. Usa el
mismo algoritmo de anclas que GitHub (`slug.mjs`), así que un enlace válido aquí lo es
también navegando el repositorio en la web.

## Nota sobre el PDF versionado

`docs/GuerraDeCenizas.pdf` se commitea porque es un entregable que se comparte con gente
que no va a clonar el repositorio. Se regenera cuando cambia la documentación, en el
mismo commit que el cambio. El HTML intermedio (`dist/`) está ignorado por git.
