# CLAUDE.md — `tools/`

Utilidades del repositorio. **No es código de producto**: nada de aquí llega al bundle
del juego ni al servidor.

## Reglas

- Scripts en Node puro (`.mjs`), ejecutables directamente con `node`.
- Dependencias solo en `devDependencies` de la raíz, y justificadas.
- Todo script imprime qué hizo y **sale con código distinto de cero si falla**: se
  ejecutan en CI y un fallo silencioso es peor que no tener el script.
- Sin estado. Misma entrada, misma salida.

## Qué hay

| Herramienta | Qué hace |
|---|---|
| `docs-pdf/build.mjs` | Markdown → HTML → PDF con Chromium. Portada, índice, paginación. |
| `docs-pdf/check-links.mjs` | Verifica enlaces internos de la documentación (bloqueante en CI) |
| `docs-pdf/slug.mjs` | Algoritmo de anclas idéntico al de GitHub. Lo comparten los dos. |
| `check-deps.mjs` | Reglas estructurales del monorepo: core sin dependencias, `factions/` sin ver `balance/`, cliente sin tocar el servidor (bloqueante en CI) |
| `pg/harness.mjs` | Postgres efímero para los tests de RLS: shim de Supabase + migraciones + seed (bloqueante en CI) |
| `assets/build.mjs` | SVG originales → componentes React tipados + manifiesto. Falla si falta la declaración de autoría, si el color no está en la paleta o si el icono no cabe en la cuadrícula (bloqueante en CI) |

## Al añadir una herramienta

Crea su carpeta con un `README.md` que explique **el pipeline**, no solo el comando. Si
mañana hay que reemplazar Chromium por otra cosa, quien lo haga necesita saber por qué
estaba ahí.
