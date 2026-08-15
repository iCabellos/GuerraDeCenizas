#!/usr/bin/env node
/**
 * Genera dist/GuerraDeCenizas.pdf a partir de la documentación Markdown del repositorio.
 *
 * Pipeline (100 % reproducible, sin herramientas de pago):
 *   Markdown ─markdown-it─► HTML ─hoja de estilo de impresión─► Chromium ─► PDF
 *
 * Chromium se toma de la instalación local de Playwright. Ver README del tool.
 *
 *   node tools/docs-pdf/build.mjs [--out docs/GuerraDeCenizas.pdf] [--html-only]
 *
 * El PDF se versiona en el repositorio (es un entregable); el HTML intermedio va a
 * dist/ y está ignorado por git.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/** Orden del documento. Cada entrada es un capítulo del PDF. */
const CHAPTERS = [
  { file: 'README.md',                       title: 'El proyecto',                 part: 'I · Visión' },
  { file: 'docs/DISCOVERY.md',               title: 'Discovery',                   part: 'I · Visión' },
  { file: 'docs/GAME_DESIGN.md',             title: 'Game Design Document',        part: 'II · Diseño de juego' },
  { file: 'docs/DIPLOMACY.md',               title: 'Diplomacia',                  part: 'II · Diseño de juego' },
  { file: 'docs/METAPROGRESSION.md',         title: 'Metaprogresión',              part: 'II · Diseño de juego' },
  { file: 'docs/FACTIONS.md',                title: 'Sistema de facciones',        part: 'II · Diseño de juego' },
  { file: 'docs/MAP_GENERATION.md',          title: 'Generación procedural',       part: 'III · Sistemas' },
  { file: 'docs/MULTIPLAYER.md',             title: 'Multijugador',                part: 'III · Sistemas' },
  { file: 'docs/TECHNICAL_DESIGN.md',        title: 'Technical Design Document',   part: 'III · Sistemas' },
  { file: 'docs/UX_MOBILE.md',               title: 'UX / UI — Mobile first',      part: 'IV · Producción' },
  { file: 'docs/ASSET_PIPELINE.md',          title: 'Pipeline de assets',          part: 'IV · Producción' },
  { file: 'docs/TESTING_AND_SIMULATION.md',  title: 'Testing y simulación',        part: 'IV · Producción' },
  { file: 'docs/ROADMAP.md',                 title: 'Roadmap',                     part: 'V · Ejecución' },
  { file: 'docs/DECISIONS.md',               title: 'Registro de decisiones',      part: 'V · Ejecución' },
];

const args = process.argv.slice(2);
const outPath = path.resolve(ROOT, valueOf('--out') ?? 'docs/GuerraDeCenizas.pdf');
const htmlOnly = args.includes('--html-only');

function valueOf(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

// El mismo algoritmo de anclas que usa GitHub, para que un enlace funcione igual
// en el repositorio y en el PDF.
import { slug } from './slug.mjs';

const md = new MarkdownIt({ html: true, linkify: false, typographer: false })
  .use(anchor, { level: [1, 2, 3], slugify: slug });

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Los ids de cada capítulo se prefijan con `cN-` para que documentos distintos con
 * encabezados iguales («Índice», «Tests») no colisionen dentro del PDF.
 */
function scopeIds(html, chapterIndex) {
  return html.replace(/\sid="([^"]+)"/g, ` id="c${chapterIndex}-$1"`);
}

/**
 * Reescribe los enlaces relativos entre documentos (docs/X.md#ancla, ../README.md)
 * a anclas internas del PDF, para que el documento sea navegable sin salir del archivo.
 */
function rewriteInternalLinks(html, chapterIndex) {
  return html.replace(/href="([^"]+)"/g, (whole, href) => {
    if (/^(https?:|mailto:)/.test(href)) return whole;
    if (href.startsWith('#')) return `href="#c${chapterIndex}-${href.slice(1)}"`;

    const [target, frag] = href.split('#');
    const normalized = target.replace(/^\.\.\//, '').replace(/^\.\//, '');
    const idx = CHAPTERS.findIndex(
      (c) => c.file === normalized || c.file === `docs/${normalized}`,
    );
    if (idx < 0) return whole;
    return `href="#c${idx}${frag ? `-${decodeURIComponent(frag)}` : ''}"`;
  });
}

/** Extrae los encabezados de nivel 2 para el índice. */
function outlineOf(markdown) {
  return markdown
    .split('\n')
    .filter((l) => /^## (?!#)/.test(l))
    .map((l) => l.replace(/^##\s+/, '').replace(/[*`_]/g, '').trim())
    .filter((t) => t && !/^Índice$/i.test(t));
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const version = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version;

  const chapters = [];
  for (const [i, ch] of CHAPTERS.entries()) {
    const abs = path.join(ROOT, ch.file);
    if (!existsSync(abs)) {
      console.error(`✗ falta ${ch.file}`);
      process.exitCode = 1;
      continue;
    }
    const raw = await readFile(abs, 'utf8');
    // El H1 del documento se sustituye por la portadilla del capítulo.
    const body = raw.replace(/^#\s+.*\n/, '');
    const html = rewriteInternalLinks(scopeIds(md.render(body), i), i);
    chapters.push({ ...ch, index: i, html, outline: outlineOf(body) });
  }

  const parts = [...new Set(chapters.map((c) => c.part))];

  const toc = parts
    .map(
      (part) => `
      <div class="toc-part">
        <h3>${esc(part)}</h3>
        ${chapters
          .filter((c) => c.part === part)
          .map(
            (c) => `
          <div class="toc-chapter">
            <a class="toc-title" href="#c${c.index}">
              <span class="toc-num">${String(c.index + 1).padStart(2, '0')}</span>
              <span>${esc(c.title)}</span>
            </a>
            <ul class="toc-sub">
              ${c.outline.slice(0, 14).map((s) => `<li>${esc(s)}</li>`).join('')}
            </ul>
          </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');

  const doc = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Guerra de Cenizas — Documentación de diseño</title>
<style>${await readFile(path.join(HERE, 'print.css'), 'utf8')}</style>
</head>
<body>

<section class="cover">
  <div class="cover-mark" aria-hidden="true">
    <svg viewBox="0 0 120 120" width="120" height="120">
      <circle cx="60" cy="60" r="46" fill="none" stroke="#D6CFC4" stroke-width="2"
              stroke-dasharray="230 60" transform="rotate(-40 60 60)"/>
      <path d="M18 92 L102 28" stroke="#C9683A" stroke-width="2" fill="none"/>
    </svg>
  </div>
  <h1 class="cover-title">Guerra de Cenizas</h1>
  <p class="cover-sub">War of Ashes</p>
  <p class="cover-tag">4X multijugador por turnos · mobile-first · la guerra como idioma de la negociación</p>
  <div class="cover-meta">
    <div><span>Documento</span><strong>Diseño y arquitectura</strong></div>
    <div><span>Versión</span><strong>${esc(version)}</strong></div>
    <div><span>Fase</span><strong>1 — Diseño</strong></div>
    <div><span>Fecha</span><strong>${today}</strong></div>
  </div>
  <p class="cover-foot">Universo, mecánicas y assets originales.<br>Documento generado desde el repositorio.</p>
</section>

<section class="toc">
  <h2 class="toc-h">Índice</h2>
  ${toc}
</section>

${chapters
  .map(
    (c) => `
<section class="chapter" id="c${c.index}">
  <header class="chapter-head">
    <p class="chapter-part">${esc(c.part)}</p>
    <p class="chapter-num">${String(c.index + 1).padStart(2, '0')}</p>
    <h1 class="chapter-title">${esc(c.title)}</h1>
    <p class="chapter-src">${esc(c.file)}</p>
  </header>
  <div class="prose">${c.html}</div>
</section>`,
  )
  .join('\n')}

</body>
</html>`;

  await mkdir(path.dirname(outPath), { recursive: true });
  const htmlPath = path.join(ROOT, 'dist', `${path.basename(outPath, '.pdf')}.html`);
  await mkdir(path.dirname(htmlPath), { recursive: true });
  await writeFile(htmlPath, doc, 'utf8');
  console.log(`✓ HTML  ${path.relative(ROOT, htmlPath)}`);

  if (htmlOnly) return;

  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath: resolveChromium() });
  try {
    const page = await browser.newPage();
    await page.setContent(doc, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: outPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '20mm', left: '17mm', right: '17mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font-size:7.5pt;color:#8A867E;padding:0 17mm;
                    font-family:-apple-system,system-ui,sans-serif;display:flex;
                    justify-content:space-between;">
          <span>Guerra de Cenizas — Documentación de diseño</span>
          <span class="pageNumber"></span>
        </div>`,
    });
    console.log(`✓ PDF   ${path.relative(ROOT, outPath)}`);
  } finally {
    await browser.close();
  }
}

/** Chromium de Playwright; PLAYWRIGHT_BROWSERS_PATH tiene prioridad si está definido. */
function resolveChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base) {
    for (const c of [
      path.join(base, 'chromium', 'chrome-linux', 'chrome'),
      path.join(base, 'chromium', 'chrome-linux64', 'chrome'),
    ]) {
      if (existsSync(c)) return c;
    }
    // Instalaciones versionadas: chromium-1194/chrome-linux/chrome
    for (const dir of readdirSync(base).filter((d) => d.startsWith('chromium-'))) {
      const c = path.join(base, dir, 'chrome-linux', 'chrome');
      if (existsSync(c)) return c;
    }
  }
  return undefined; // deja que Playwright resuelva su ruta por defecto
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
