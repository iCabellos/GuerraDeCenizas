#!/usr/bin/env node
/**
 * Verifica que todos los enlaces internos de la documentación resuelven:
 *   - el archivo destino existe;
 *   - el ancla destino existe en ese archivo.
 *
 * Se ejecuta en CI. Un enlace roto en la documentación es un fallo de build:
 * los documentos se referencian entre sí constantemente y una referencia muerta
 * hace que el lector deje de confiar en el resto.
 *
 *   node tools/docs-pdf/check-links.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { slug } from './slug.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Anclas disponibles en un documento: encabezados + anclas HTML explícitas. */
function anchorsOf(markdown) {
  const out = new Set();
  for (const line of markdown.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) out.add(slug(h[1]));
    for (const [, id] of line.matchAll(/\sid="([^"]+)"/g)) out.add(id);
  }
  return out;
}

const files = [
  'README.md',
  'CHANGELOG.md',
  ...(await readdir(path.join(ROOT, 'docs'))).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
];

const anchors = new Map();
const bodies = new Map();
for (const f of files) {
  const raw = await readFile(path.join(ROOT, f), 'utf8');
  bodies.set(f, raw);
  anchors.set(f, anchorsOf(raw));
}

let broken = 0;
const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

for (const [file, body] of bodies) {
  const dir = path.dirname(path.join(ROOT, file));
  for (const [, href] of body.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(href)) {
      if (href.startsWith('#')) {
        const frag = decodeURIComponent(href.slice(1));
        if (!anchors.get(file).has(frag)) {
          console.error(`✗ ${file}  ancla local inexistente: #${frag}`);
          broken++;
        }
      }
      continue;
    }

    const [target, frag] = href.split('#');
    const abs = path.resolve(dir, target);
    const rel = path.relative(ROOT, abs);

    if (!existsSync(abs)) {
      console.error(`✗ ${file}  archivo inexistente: ${href}`);
      broken++;
      continue;
    }
    if (frag && anchors.has(rel) && !anchors.get(rel).has(decodeURIComponent(frag))) {
      console.error(`✗ ${file}  ancla inexistente en ${rel}: #${frag}`);
      broken++;
    }
  }
}

if (broken) {
  console.error(`\n${broken} enlace(s) roto(s).`);
  process.exit(1);
}
console.log(`✓ enlaces de documentación correctos (${files.length} archivos)`);
