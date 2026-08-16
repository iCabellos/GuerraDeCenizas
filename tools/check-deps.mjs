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
    if (/SERVICE_ROLE|SUPABASE_SECRET_KEY/.test(source)) {
      fail(`components/${file} referencia la clave de servicio`);
    }
    if (/from\s+['"]@?\/?lib\/server/.test(source)) fail(`components/${file} importa lib/server`);
  }
  if (failures === before) console.log('✓ ningún componente de cliente toca el servidor');
}

// 4 · la clave de servicio no sale de la capa de autoridad
//
// La distinción que importa no es «servidor o cliente», sino **qué rol de Postgres**.
// Un Server Component puede leer con el cliente de usuario: RLS decide lo que ve, y eso
// es exactamente lo que queremos. Lo que no puede salir de `lib/server/` y `app/api/` es
// `service_role`, que omite RLS y con el que `game_states` se lee entero.
//
// Y ningún componente de cliente puede importar `lib/server`, aunque solo fuera para
// leer: un import así se bundlea hacia el navegador con todo lo que arrastre.
const AUTHORITY = /from\s+['"](@\/lib\/server|\.\.?\/[^'"]*lib\/server)/;
// `SUPABASE_SECRET_KEY` es el nombre nuevo de la misma clave (`sb_secret_…`). Si la regla
// solo vigilara el nombre viejo, bastaría con usar el nuevo para colarla en el cliente.
const SERVICE = /\b(serviceClient|serviceRpc|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)\b/;
const webDir = path.join(ROOT, 'apps/web');
if (existsSync(webDir)) {
  const before = failures;
  for (const entry of await readdir(webDir, { recursive: true })) {
    const file = String(entry);
    if (!/\.tsx?$/.test(file)) continue;
    if (file.startsWith('node_modules') || file.startsWith('.next')) continue;
    if (file.startsWith('lib/server/') || file.startsWith('app/api/')) continue;
    if (file.startsWith('tests/')) continue;   // los tests ejercitan la autoridad a propósito

    const source = await readFile(path.join(webDir, file), 'utf8');
    if (SERVICE.test(source)) {
      fail(`apps/web/${file} usa el rol de servicio fuera de la capa de autoridad`);
    }
    if (/^\s*['"]use client['"]/m.test(source) && AUTHORITY.test(source)) {
      fail(`apps/web/${file} es un componente de cliente y importa lib/server`);
    }
  }
  if (failures === before) console.log('✓ el rol de servicio no sale de app/api y lib/server');
}

if (failures > 0) {
  console.error(`\n${failures} violación(es) estructural(es).`);
  process.exit(1);
}
console.log('\nEstructura del monorepo correcta.');
