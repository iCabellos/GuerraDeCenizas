#!/usr/bin/env node
/**
 * Verifica las reglas estructurales del monorepo. Bloqueante en CI.
 *
 *   1. `@gdc/core` no puede tener dependencias de runtime (ADR-001). Es lo que garantiza
 *      que el motor corra idéntico en servidor, cliente y simulador.
 *   2. `core/src/factions/` no puede importar `balance/` (ADR-021). Barrera estructural
 *      de la regla de oro: si el código no ve las constantes, no puede modificarlas.
 *   3. Ningún componente de cliente puede tocar la clave de servicio de Supabase.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;

function fail(message) {
  console.error(`✗ ${message}`);
  failures++;
}

// 1 · core sin dependencias de runtime
const corePkg = JSON.parse(await readFile(path.join(ROOT, 'packages/core/package.json'), 'utf8'));
const deps = Object.keys(corePkg.dependencies ?? {});
if (deps.length > 0) {
  fail(`@gdc/core tiene dependencias de runtime: ${deps.join(', ')} (ADR-001 lo prohíbe)`);
} else {
  console.log('✓ @gdc/core no tiene dependencias de runtime');
}

// 2 · factions/ no ve balance/
const factionsDir = path.join(ROOT, 'packages/core/src/factions');
for (const file of await readdir(factionsDir)) {
  if (!file.endsWith('.ts')) continue;
  const source = await readFile(path.join(factionsDir, file), 'utf8');
  if (/from\s+['"][^'"]*balance/.test(source) || /\bBALANCE\b/.test(source)) {
    fail(`factions/${file} referencia balance/ (ADR-021 lo prohíbe)`);
  }
}
if (failures === 0) console.log('✓ factions/ no importa balance/');

// 3 · la clave de servicio nunca en cliente
const componentsDir = path.join(ROOT, 'apps/web/components');
if (existsSync(componentsDir)) {
  const before = failures;
  for (const file of await readdir(componentsDir, { recursive: true })) {
    if (!/\.tsx?$/.test(String(file))) continue;
    const source = await readFile(path.join(componentsDir, String(file)), 'utf8');
    if (source.includes('SERVICE_ROLE')) fail(`components/${file} referencia SERVICE_ROLE`);
    if (/from\s+['"]@?\/?lib\/server/.test(source)) fail(`components/${file} importa lib/server`);
  }
  if (failures === before) console.log('✓ ningún componente de cliente toca el servidor');
}

if (failures > 0) {
  console.error(`\n${failures} violación(es) estructural(es).`);
  process.exit(1);
}
console.log('\nEstructura del monorepo correcta.');
