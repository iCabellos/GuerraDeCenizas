/**
 * Reproduce el algoritmo de `github-slugger`, que es el que usa GitHub al renderizar
 * Markdown: minúsculas, se eliminan puntuación y símbolos, y cada espacio pasa a
 * guion. **Los acentos se conservan** (`#investigación`, no `#investigacion`).
 *
 * Lo comparten el generador de PDF y el verificador de enlaces, para que un enlace
 * funcione igual en el repositorio y en el documento impreso.
 */
export function slug(s) {
  return s
    .replace(/<[^>]+>/g, '')            // etiquetas HTML en línea (<sub>, <br>…)
    .replace(/[*`_[\]()]/g, '')         // énfasis y enlaces de Markdown
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '') // GitHub elimina el resto de la puntuación
    .trim()
    .replace(/\s/g, '-');               // cada espacio → un guion (dobles incluidos)
}
