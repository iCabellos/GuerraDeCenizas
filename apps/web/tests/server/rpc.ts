/**
 * `Rpc` sobre el Postgres local: lo que en producción hace `supabase.rpc()`.
 *
 * Existe para que los tests ejecuten **el código de autoridad real** —`resolveTurn`,
 * `startGame`, `joinGame`— contra las funciones SQL reales, en vez de contra un doble.
 * Un test de la resolución de turnos que simule la base de datos no prueba lo único que
 * de verdad puede fallar aquí: la concurrencia.
 *
 * Los argumentos viajan como un único JSON entre comillas de dólar. Es la forma de
 * pasar un estado de partida entero por `psql` sin escapar nada — y el estado lleva
 * nombres de región con apóstrofos.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Rpc } from '../../lib/server/resolve';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const TAG = '$gdcrpc$';

type ArgKind = 'scalar' | 'json' | 'seats';
type ArgSpec = readonly [name: string, sqlType: string, kind?: ArgKind];

/**
 * Firmas de las funciones. Repetirlas aquí es deliberado: PostgREST resuelve los tipos
 * por nombre y este arnés no puede, así que si alguien cambia una firma en la migración
 * y no aquí, el test falla — que es justo lo que debe pasar.
 */
const SIGNATURES: Record<string, { args: readonly ArgSpec[]; returnsTable?: boolean }> = {
  create_game: {
    args: [
      ['p_profile', 'uuid'], ['p_player_count', 'smallint'], ['p_cadence', 'text'],
      ['p_private', 'boolean'], ['p_seed', 'bigint'], ['p_engine', 'text'],
      ['p_mapgen', 'text'],
    ],
  },
  join_game: { args: [['p_code', 'text'], ['p_profile', 'uuid']] },
  lobby_state: { args: [['p_game', 'uuid']] },
  start_game: {
    args: [
      ['p_game', 'uuid'], ['p_profile', 'uuid'], ['p_state', 'jsonb', 'json'],
      ['p_checksum', 'text'], ['p_views', 'jsonb', 'json'], ['p_deadline', 'timestamptz'],
    ],
  },
  submit_orders: {
    args: [
      ['p_game', 'uuid'], ['p_profile', 'uuid'], ['p_turn', 'smallint'],
      ['p_payload', 'jsonb', 'json'], ['p_submit', 'boolean'],
    ],
  },
  begin_resolution: { args: [['p_game', 'uuid'], ['p_now', 'timestamptz']] },
  commit_resolution: {
    args: [
      ['p_game', 'uuid'], ['p_turn', 'smallint'], ['p_state_version', 'integer'],
      ['p_state', 'jsonb', 'json'], ['p_checksum', 'text'], ['p_views', 'jsonb', 'json'],
      ['p_applied', 'jsonb', 'json'], ['p_submitted', 'smallint[]', 'seats'],
      ['p_deadline', 'timestamptz'], ['p_phase', 'public.game_phase'],
      ['p_status', 'public.game_status'],
    ],
  },
  due_games: { args: [['p_now', 'timestamptz'], ['p_limit', 'int']], returnsTable: true },
};

function connection() {
  const file = join(REPO, '.pgtest', 'connection.json');
  return JSON.parse(readFileSync(file, 'utf8')) as {
    bin: string; socketDir: string; database: string; user: string;
  };
}

function argExpression([name, sqlType, kind]: ArgSpec): string {
  if (kind === 'json') return `a.v->'${name}'`;
  if (kind === 'seats') {
    return `coalesce((select array_agg(x::smallint order by x::smallint)
             from jsonb_array_elements_text(a.v->'${name}') x), '{}'::smallint[])`;
  }
  return `(a.v->>'${name}')::${sqlType}`;
}

function run(sql: string, role: 'service_role' | 'owner'): string {
  const { bin, socketDir, database, user } = connection();
  return execFileSync(
    join(bin, 'psql'),
    ['-h', socketDir, '-U', user, '-d', database,
     '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '--no-psqlrc'],
    {
      input: `${role === 'service_role' ? 'set role service_role;\n' : ''}${sql}\n`,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,   // un estado de 5 jugadores no cabe en el buffer por defecto
    },
  ).trim();
}

/**
 * SQL como `service_role`: exactamente los permisos que tiene la capa de autoridad en
 * producción. Si una función necesitara más, aquí se nota.
 */
export function runAsService(sql: string): string {
  return run(sql, 'service_role');
}

export const rpc: Rpc = async (fn, args) => {
  const signature = SIGNATURES[fn];
  if (!signature) throw new Error(`Firma desconocida para ${fn}()`);

  const json = JSON.stringify(args);
  if (json.includes(TAG)) throw new Error('los argumentos colisionan con el delimitador');

  const call = `public.${fn}(${signature.args.map(argExpression).join(', ')})`;
  const select = signature.returnsTable
    ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from a, ${call} t`
    : `select ${call} from a`;

  const output = runAsService(`with a as (select ${TAG}${json}${TAG}::jsonb as v)\n${select};`);
  return output === '' ? null : (JSON.parse(output) as unknown);
};

/**
 * SQL suelto para montar escenarios y comprobar resultados, como dueño de la base.
 *
 * No va por `service_role` a propósito: preparar fixtures y leer `game_states` para
 * comprobar el resultado es trabajo de administración, no algo que la aplicación deba
 * poder hacer. Mezclarlos escondería que a la capa de autoridad le falta un permiso.
 */
export function scalar(sql: string): string {
  return run(sql, 'owner');
}
