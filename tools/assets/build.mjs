#!/usr/bin/env node
/**
 * `assets/src/**\/*.svg` → componentes React tipados + manifiesto.
 *
 * La decisión que lo define todo: **los assets son código**
 * ([ASSET_PIPELINE §1](../../docs/ASSET_PIPELINE.md)). Viven en el repositorio como SVG
 * escritos a mano, se revisan en los diffs y se compilan como cualquier otra fuente. No
 * hay binarios, no hay marketplace, no hay licencias que auditar.
 *
 * El generador **falla** —no avisa— cuando:
 *
 *   · falta la cabecera obligatoria o el campo `original: true`;
 *   · el `viewBox` no es la cuadrícula de 24;
 *   · aparece un color literal que no está en la paleta.
 *
 * Lo tercero es lo que mantiene el tema coherente: un `#ff0000` suelto en un icono no se
 * ve en una revisión de código, y en cambio rompe el modo daltónico y el contraste sin
 * que nadie sepa por qué.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = path.join(ROOT, 'assets/src');
const OUT = path.join(ROOT, 'apps/web/components/art/generated');
const MANIFEST = path.join(ROOT, 'assets/manifest.json');

const REQUIRED_HEADER = ['asset', 'role', 'grid', 'stroke', 'colors', 'author', 'created'];
const CATEGORIES = new Set([
  'units', 'terrain', 'resources', 'anomalies', 'diplomacy', 'states', 'ui', 'brand',
]);

/** Únicos colores admitidos. Cualquier otro hex literal es un fallo de build. */
const PALETTE = new Set([
  'currentColor', 'none', 'transparent',
  'var(--color-ash)', 'var(--color-ash-glow)',
]);

let failures = 0;
const fail = (file, message) => {
  console.error(`✗ ${file}: ${message}`);
  failures += 1;
};

// ─────────────────────────────────── Lectura ──────────────────────────────────

async function collect(dir, prefix = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...(await collect(path.join(dir, entry.name), rel)));
    else if (entry.name.endsWith('.svg')) found.push(rel);
  }
  return found.sort();
}

function parseHeader(source, file) {
  const match = source.match(/<!--([\s\S]*?)-->/);
  if (!match) {
    fail(file, 'sin cabecera de asset');
    return null;
  }
  const header = Object.fromEntries(
    (match[1] ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.includes(':'))
      .map((line) => {
        const at = line.indexOf(':');
        return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
      }),
  );

  for (const key of REQUIRED_HEADER) {
    if (!header[key]) fail(file, `falta \`${key}\` en la cabecera`);
  }
  // La declaración de autoría es la garantía documental de la exigencia de IP del brief.
  // Sin ella no se publica, por mucho que el dibujo sea correcto.
  if (header.original !== 'true') fail(file, 'falta la declaración `original: true`');
  if (header.grid !== '24') fail(file, `la cuadrícula debe ser 24, no ${header.grid}`);

  return header;
}

function validateColors(body, file) {
  for (const hex of body.match(/#[0-9a-fA-F]{3,8}/g) ?? []) {
    fail(file, `color literal ${hex}: usa currentColor o una variable de la paleta`);
  }
  for (const value of body.match(/(?:fill|stroke|stop-color)="([^"]+)"/g) ?? []) {
    const colour = value.split('="')[1]?.slice(0, -1) ?? '';
    if (!PALETTE.has(colour) && !colour.startsWith('url(#')) {
      fail(file, `color no registrado: ${colour}`);
    }
  }
}

// ──────────────────────────────── Generación ──────────────────────────────────

/** `stroke-width` → `strokeWidth`. React no acepta los atributos en kebab-case. */
function reactify(svgBody) {
  return svgBody.replace(/\s([a-z]+(?:-[a-z]+)+)=/g, (_match, name) =>
    ` ${name.replace(/-([a-z])/g, (_m, c) => c.toUpperCase())}=`,
  );
}

function componentName(assetPath) {
  return assetPath
    .split(/[/-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function emitComponent(name, header, body) {
  const inner = reactify(body)
    .split('\n')
    .map((line) => (line.trim() ? `      ${line.trim()}` : ''))
    .filter(Boolean)
    .join('\n');

  return `/** ${header.role} */
export function ${name}({ size = 24, title, ...rest }: ArtProps) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="square" strokeLinejoin="miter"
      role={title ? 'img' : 'presentation'} aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
${inner}
    </svg>
  );
}
`;
}

// ─────────────────────────────────── Main ─────────────────────────────────────

if (!existsSync(SRC)) {
  console.error(`No existe ${SRC}`);
  process.exit(1);
}

const files = await collect(SRC);
const manifest = [];
const components = [];

for (const file of files) {
  const source = await readFile(path.join(SRC, file), 'utf8');
  const header = parseHeader(source, file);
  if (!header) continue;

  const category = file.split('/')[0] ?? '';
  if (!CATEGORIES.has(category)) {
    fail(file, `categoría desconocida: ${category}. Válidas: ${[...CATEGORIES].join(', ')}`);
  }
  if (header.asset !== file.replace(/\.svg$/, '')) {
    fail(file, `la cabecera dice \`${header.asset}\` y el archivo está en \`${file}\``);
  }

  const open = source.match(/<svg[^>]*>/)?.[0] ?? '';
  if (!open.includes('viewBox="0 0 24 24"')) fail(file, 'el viewBox debe ser "0 0 24 24"');

  const body = source.slice(source.indexOf(open) + open.length, source.lastIndexOf('</svg>')).trim();
  validateColors(body, file);

  // Silueta: un icono con demasiados trazos no se reconoce a 16 px, que es el tamaño al
  // que se ve de verdad en el mapa.
  const strokes = (body.match(/<(path|rect|circle|line|polygon|polyline)\b/g) ?? []).length;
  if (strokes > 12) fail(file, `${strokes} trazos: el máximo son 12 (ASSET_PIPELINE §2.2)`);

  const name = componentName(file.replace(/\.svg$/, '').split('/').slice(1).join('-'));
  components.push({ name, code: emitComponent(name, header, body), category });
  manifest.push({
    asset: header.asset,
    role: header.role,
    component: name,
    author: header.author,
    created: header.created,
    original: true,
    strokes,
    bytes: Buffer.byteLength(source),
    sha256: createHash('sha256').update(source).digest('hex').slice(0, 16),
  });
}

if (failures > 0) {
  console.error(`\n${failures} problema(s) en los assets. No se genera nada.`);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const byCategory = new Map();
for (const component of components) {
  if (!byCategory.has(component.category)) byCategory.set(component.category, []);
  byCategory.get(component.category).push(component);
}

const banner = `// GENERADO POR tools/assets/build.mjs — NO EDITAR A MANO.
// La fuente son los SVG de assets/src/. Ejecuta \`npm run assets:build\`.
import type { ArtProps } from './types';
`;

// El tipo vive aparte: si cada archivo de categoría lo exportara, el barril daría
// «has already exported a member named ArtProps» y el build de TypeScript fallaría.
await writeFile(
  path.join(OUT, 'types.ts'),
  `// GENERADO POR tools/assets/build.mjs — NO EDITAR A MANO.
import type { SVGProps } from 'react';

export interface ArtProps extends Omit<SVGProps<SVGSVGElement>, 'title'> {
  size?: number;
  /** Obligatorio cuando el icono transmite información: llega traducido desde i18n. */
  title?: string;
}
`,
);

for (const [category, list] of [...byCategory].sort()) {
  await writeFile(
    path.join(OUT, `${category}.tsx`),
    `${banner}\n${list.map((component) => component.code).join('\n')}`,
  );
}

const names = components.map((component) => component.name).sort();
await writeFile(
  path.join(OUT, 'index.ts'),
  `// GENERADO POR tools/assets/build.mjs — NO EDITAR A MANO.
export type { ArtProps } from './types';
${[...byCategory.keys()].sort().map((category) => `export * from './${category}';`).join('\n')}

/** Registro tipado. Lo usa la Galería para enumerar todo sin olvidarse de nada. */
export const ART_NAMES = [
${names.map((name) => `  '${name}',`).join('\n')}
] as const;

export type ArtName = (typeof ART_NAMES)[number];
`,
);

await writeFile(MANIFEST, `${JSON.stringify({ generated: manifest }, null, 2)}\n`);

const bytes = manifest.reduce((total, asset) => total + asset.bytes, 0);
console.log(`✓ ${manifest.length} assets → ${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(1)} KB de fuente)`);
