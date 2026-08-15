/**
 * Cliente mínimo de Postgres para los tests de seguridad.
 *
 * Habla con la base por `psql`, no por un driver. Motivo: `packages/core` no puede tener
 * dependencias y el resto del proyecto tampoco las añade sin justificarlas (ADR-024).
 * Un `execFileSync` de veinte líneas hace exactamente lo que hace falta aquí — ejecutar
 * SQL con un rol y unas claims concretas — y no arrastra un árbol de dependencias.
 *
 * Cada consulta va dentro de `begin … rollback`: los tests que intentan escribir dejan
 * la base como estaba, así que el orden entre ellos no puede importar.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

interface Connection {
  bin: string;
  socketDir: string;
  database: string;
  user: string;
}

let cached: Connection | null = null;

function connection(): Connection {
  if (cached) return cached;
  const file = join(REPO, '.pgtest', 'connection.json');
  try {
    cached = JSON.parse(readFileSync(file, 'utf8')) as Connection;
  } catch {
    throw new Error(
      `No hay base de datos de pruebas (${file}).\n` +
        'Levántala con: node tools/pg/harness.mjs up',
    );
  }
  return cached;
}

export interface QueryResult {
  /** `false` cuando Postgres rechazó la consulta (permiso, política, restricción). */
  ok: boolean;
  rows: string[][];
  error: string;
}

export type Actor =
  | { role: 'anon' }
  | { role: 'authenticated'; profileId: string }
  | { role: 'service_role' };

function claims(actor: Actor): string {
  if (actor.role === 'authenticated') {
    return JSON.stringify({ sub: actor.profileId, role: 'authenticated' });
  }
  return JSON.stringify({ role: actor.role });
}

/**
 * Ejecuta SQL con el rol y el JWT del actor.
 *
 * `set local role` cambia `current_user`, que es lo que mira RLS. Es exactamente lo que
 * hace PostgREST al recibir un token: si el test pasara como superusuario, RLS ni
 * siquiera se evaluaría y no estaríamos probando nada.
 */
export function query(actor: Actor, sql: string): QueryResult {
  const { bin, socketDir, database, user } = connection();
  const script = [
    'begin;',
    `set local "request.jwt.claims" = '${claims(actor).replace(/'/g, "''")}';`,
    `set local role ${actor.role};`,
    sql.trim().endsWith(';') ? sql.trim() : `${sql.trim()};`,
    'rollback;',
  ].join('\n');

  try {
    const stdout = execFileSync(
      join(bin, 'psql'),
      ['-h', socketDir, '-U', user, '-d', database,
       '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-F', '', '--no-psqlrc'],
      { input: script, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const rows = stdout.split('\n').filter((line) => line.length > 0)
      .map((line) => line.split(''));
    return { ok: true, rows, error: '' };
  } catch (error) {
    const shell = error as { stderr?: string; stdout?: string };
    return { ok: false, rows: [], error: (shell.stderr ?? '').trim() };
  }
}

/** Número de filas visibles para el actor. Falla el test si la consulta no es legal. */
export function count(actor: Actor, from: string): number {
  const result = query(actor, `select count(*) from ${from}`);
  if (!result.ok) return -1;
  return Number(result.rows[0]?.[0] ?? '0');
}

/** Todo lo que un actor ve de una columna, en orden. */
export function column(actor: Actor, sql: string): string[] {
  const result = query(actor, sql);
  if (!result.ok) throw new Error(`La consulta falló:\n${sql}\n${result.error}`);
  return result.rows.map((row) => row[0] ?? '');
}

/** Reaplica la partida de prueba. Se llama una vez, antes de los tests. */
export function seed(): void {
  const { bin, socketDir, database, user } = connection();
  execFileSync(
    join(bin, 'psql'),
    ['-h', socketDir, '-U', user, '-d', database,
     '-v', 'ON_ERROR_STOP=1', '-X', '-q', '--no-psqlrc',
     '-f', join(REPO, 'supabase', 'tests', 'seed.sql')],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  );
}

// Los asientos del `seed.sql`. Repetirlos aquí es deliberado: si alguien cambia el seed
// sin mirar, los tests fallan en vez de pasar comprobando otra cosa.
export const SEAT_0 = '00000000-0000-4000-8000-000000000000';
export const SEAT_1 = '00000000-0000-4000-8000-000000000001';
export const SEAT_2 = '00000000-0000-4000-8000-000000000002';
export const OUTSIDER = '00000000-0000-4000-8000-000000000009';
export const GAME = '11111111-1111-4111-8111-111111111111';

export const asSeat0: Actor = { role: 'authenticated', profileId: SEAT_0 };
export const asSeat1: Actor = { role: 'authenticated', profileId: SEAT_1 };
export const asSeat2: Actor = { role: 'authenticated', profileId: SEAT_2 };
export const asOutsider: Actor = { role: 'authenticated', profileId: OUTSIDER };
export const asAnon: Actor = { role: 'anon' };
export const asService: Actor = { role: 'service_role' };
