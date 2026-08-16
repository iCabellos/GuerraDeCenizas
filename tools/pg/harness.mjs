/**
 * Arranca un Postgres efímero, le aplica el shim de Supabase y las migraciones.
 *
 * Los siete tests de RLS son bloqueantes (ROADMAP v0.3): si uno falla, no hay release.
 * Un test bloqueante no puede depender de Docker ni de una cuenta en la nube, así que
 * esto levanta un clúster de usar y tirar con los binarios del sistema y habla con él
 * por socket unix — sin puertos, sin red, sin conflictos con nada.
 *
 * Solo escucha en socket unix a propósito: un Postgres de pruebas con la autenticación
 * en `trust` escuchando en TCP es un agujero, aunque sea local y aunque sea un rato.
 *
 * Uso:
 *   node tools/pg/harness.mjs up      # levanta y aplica todo
 *   node tools/pg/harness.mjs reset   # recrea la base desde cero
 *   node tools/pg/harness.mjs down    # para y borra
 *   node tools/pg/harness.mjs psql    # consola interactiva
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync, mkdirSync, readdirSync, rmSync, chownSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PG_ROOT = join(REPO, '.pgtest');
export const DATA_DIR = join(PG_ROOT, 'data');
export const SOCKET_DIR = join(PG_ROOT, 'sock');
export const LOG_FILE = join(PG_ROOT, 'postgres.log');
export const DB_NAME = 'gdc_test';
export const DB_USER = 'postgres';
export const CONNECTION_FILE = join(PG_ROOT, 'connection.json');

// ─────────────────────────────── Localizar los binarios ───────────────────────

function findBinDir() {
  const candidates = [];
  for (const base of ['/usr/lib/postgresql', '/usr/local/pgsql', '/opt/homebrew/opt']) {
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base).sort().reverse()) {
      candidates.push(join(base, entry, 'bin'));
      candidates.push(join(base, entry, 'libexec', 'bin'));
    }
  }
  candidates.push('/usr/local/bin', '/usr/bin');
  for (const dir of candidates) {
    if (existsSync(join(dir, 'initdb')) && existsSync(join(dir, 'pg_ctl'))) return dir;
  }
  throw new Error(
    'No encuentro los binarios de PostgreSQL (initdb, pg_ctl).\n' +
      'Instala PostgreSQL 15+ — en Debian/Ubuntu: apt-get install postgresql\n' +
      'Los tests de RLS son bloqueantes: sin base de datos no se pueden dar por buenos.',
  );
}

const BIN = findBinDir();

/**
 * Postgres se niega a arrancar como root, con razón. Si el proceso va como root
 * —contenedores, CI—, todo se ejecuta con el usuario `postgres` del sistema.
 */
function serverIdentity() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return null;
  const passwd = spawnSync('id', ['-u', 'postgres'], { encoding: 'utf8' });
  const group = spawnSync('id', ['-g', 'postgres'], { encoding: 'utf8' });
  if (passwd.status !== 0 || group.status !== 0) {
    throw new Error(
      'Estoy como root y no existe el usuario `postgres` del sistema.\n' +
        'Postgres no arranca como root: crea el usuario o ejecuta los tests sin root.',
    );
  }
  return { uid: Number(passwd.stdout.trim()), gid: Number(group.stdout.trim()) };
}

const IDENTITY = serverIdentity();

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    ...(IDENTITY && options.asServer !== false ? IDENTITY : {}),
    ...options,
    env: { ...process.env, PGDATA: DATA_DIR, LC_ALL: 'C', ...(options.env ?? {}) },
  });
  if (result.error) throw result.error;
  return result;
}

function must(cmd, args, options = {}) {
  const result = run(cmd, args, options);
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} falló (código ${result.status})\n` +
        `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result;
}

function own(path) {
  if (IDENTITY) chownSync(path, IDENTITY.uid, IDENTITY.gid);
}

// ────────────────────────────────── Ciclo de vida ─────────────────────────────

export function isRunning() {
  if (!existsSync(join(DATA_DIR, 'postmaster.pid'))) return false;
  return run(join(BIN, 'pg_ctl'), ['-D', DATA_DIR, 'status']).status === 0;
}

export function start() {
  if (isRunning()) return;

  if (!existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    mkdirSync(DATA_DIR, { recursive: true });
    own(PG_ROOT);
    own(DATA_DIR);
    must(join(BIN, 'initdb'), [
      '-D', DATA_DIR,
      '-U', DB_USER,
      '--auth-local=trust',
      '--no-sync',           // es un clúster de usar y tirar; fsync solo lo hace lento
      '-E', 'UTF8',
      '--locale=C',
    ]);
  }

  mkdirSync(SOCKET_DIR, { recursive: true });
  own(SOCKET_DIR);
  if (existsSync(LOG_FILE)) rmSync(LOG_FILE);

  must(join(BIN, 'pg_ctl'), [
    '-D', DATA_DIR,
    '-l', LOG_FILE,
    // `-h ''` ⇒ nada de TCP. Solo el socket unix de este directorio.
    '-o', `-k ${SOCKET_DIR} -h '' -c fsync=off -c full_page_writes=off`,
    '-w', '-t', '30',
    'start',
  ]);
}

export function stop() {
  if (!existsSync(join(DATA_DIR, 'postmaster.pid'))) return;
  run(join(BIN, 'pg_ctl'), ['-D', DATA_DIR, '-m', 'immediate', '-w', 'stop']);
}

export function destroy() {
  stop();
  if (existsSync(PG_ROOT)) rmSync(PG_ROOT, { recursive: true, force: true });
}

// ──────────────────────────────────── SQL ─────────────────────────────────────

export function psqlArgs(database = DB_NAME) {
  return ['-h', SOCKET_DIR, '-U', DB_USER, '-d', database, '-v', 'ON_ERROR_STOP=1',
          '-X', '-q', '--no-psqlrc'];
}

export function sql(text, { database = DB_NAME } = {}) {
  const result = run(join(BIN, 'psql'), [...psqlArgs(database), '-c', text]);
  if (result.status !== 0) {
    throw new Error(`SQL falló:\n${text}\n${result.stderr}`);
  }
  return result.stdout;
}

export function sqlFile(path, { database = DB_NAME } = {}) {
  const result = run(join(BIN, 'psql'), [...psqlArgs(database), '-f', path]);
  if (result.status !== 0) {
    throw new Error(`No se pudo aplicar ${path}:\n${result.stderr}`);
  }
  return result.stdout;
}

export function databaseExists() {
  const result = run(join(BIN, 'psql'), [
    ...psqlArgs('postgres'), '-t', '-A',
    '-c', `select 1 from pg_database where datname = '${DB_NAME}'`,
  ]);
  return result.status === 0 && result.stdout.trim() === '1';
}

export function migrations() {
  const dir = join(REPO, 'supabase', 'migrations');
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => join(dir, f));
}

/** Shim de Supabase + todas las migraciones, en orden. */
export function applySchema() {
  sqlFile(join(REPO, 'supabase', 'tests', 'shim.sql'));
  for (const file of migrations()) sqlFile(file);
}

export function reset() {
  start();
  if (databaseExists()) {
    sql(`drop database ${DB_NAME} with (force)`, { database: 'postgres' });
  }
  sql(`create database ${DB_NAME}`, { database: 'postgres' });
  applySchema();
  return publish();
}

/** Idempotente: si ya está levantado y con esquema, no toca nada. */
export function up() {
  start();
  if (!databaseExists()) {
    sql(`create database ${DB_NAME}`, { database: 'postgres' });
    applySchema();
  }
  return publish();
}

/**
 * Deja los datos de conexión en un archivo para que los tests no tengan que volver a
 * adivinar dónde está `psql` ni cómo se llama el socket. Duplicar esa búsqueda en el
 * lado TypeScript sería tener dos fuentes de verdad para lo mismo.
 */
export function publish() {
  const info = { bin: BIN, socketDir: SOCKET_DIR, database: DB_NAME, user: DB_USER };
  writeFileSync(CONNECTION_FILE, `${JSON.stringify(info, null, 2)}\n`);
  return info;
}

// ───────────────────────────── Enganche para Vitest ───────────────────────────

export function setup() {
  reset();
}

export function teardown() {
  // El clúster se queda vivo entre ejecuciones: `initdb` tarda ~2 s y repetirlo en cada
  // `npm test` convierte el ciclo de TDD en un castigo. `down` lo borra cuando toque.
  if (process.env.GDC_PG_KEEP === '0') destroy();
}

// ─────────────────────────────────── CLI ──────────────────────────────────────

const COMMANDS = {
  up() {
    const info = up();
    console.log(`Postgres listo · socket ${info.socketDir} · base ${info.database}`);
  },
  reset() {
    reset();
    console.log(`Base ${DB_NAME} recreada con ${migrations().length} migraciones.`);
  },
  down() {
    destroy();
    console.log('Clúster parado y borrado.');
  },
  status() {
    console.log(isRunning() ? 'arriba' : 'parado');
  },
  url() {
    console.log(`postgresql://${DB_USER}@localhost/${DB_NAME}?host=${SOCKET_DIR}`);
  },
  psql() {
    start();
    const result = spawnSync(join(BIN, 'psql'), psqlArgs(), {
      stdio: 'inherit',
      ...(IDENTITY ?? {}),
      env: { ...process.env, PGDATA: DATA_DIR },
    });
    process.exit(result.status ?? 0);
  },
};

if (process.argv[1] && statSync(process.argv[1]).ino === statSync(fileURLToPath(import.meta.url)).ino) {
  const command = process.argv[2] ?? 'up';
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Comando desconocido: ${command}\nUsa: ${Object.keys(COMMANDS).join(' | ')}`);
    process.exit(1);
  }
  try {
    handler();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
