/**
 * Serialización canónica y checksum.
 *
 * Dos estados que representan la misma partida deben producir exactamente la misma
 * cadena, y por tanto el mismo checksum, en cualquier motor de JavaScript. De eso
 * dependen: la detección de divergencias cliente/servidor, la reproducción de partidas
 * desde `(semilla, órdenes)` y los tests de determinismo.
 */

/** Redondeo a 4 decimales. Comparar floats crudos rompería el determinismo. */
export function round4(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10000) / 10000;
}

/**
 * JSON con claves ordenadas, sin `undefined` y con los reales redondeados.
 * No usa `JSON.stringify` con `replacer` porque el orden de claves de los objetos
 * depende del orden de inserción, que no está garantizado entre implementaciones.
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'number':
      return Number.isInteger(value) ? String(value) : String(round4(value));
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'undefined':
      return 'null';
    case 'object':
      break;
    default:
      throw new TypeError(`canonicalJson no admite ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/**
 * FNV-1a de 64 bits sobre la forma canónica.
 *
 * No es criptográfico y no pretende serlo: solo tiene que detectar divergencias de
 * estado, y para eso 64 bits sobran. Se usa BigInt porque su aritmética está
 * especificada de forma exacta y no depende del motor.
 */
export function checksum(value: unknown): string {
  const text = canonicalJson(value);
  const MASK = (1n << 64n) - 1n;
  const PRIME = 0x100000001b3n;
  let hash = 0xcbf29ce484222325n;

  for (let i = 0; i < text.length; i++) {
    hash = (hash ^ BigInt(text.charCodeAt(i))) & MASK;
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Checksum del estado de una partida.
 *
 * Idéntico en propósito a `checksum(state)` y **mucho más barato**: el mapa se sustituye
 * por su propio checksum, calculado una sola vez por objeto de mapa.
 *
 * La razón es la misma que la de [ADR-044]: el mapa es **inmutable durante toda la
 * partida**. Volver a serializar sus 271 regiones y sus ~700 aristas en cada turno era
 * el 60 % del coste de `reduce()` —medido: 4,5 ms de los 5,6 de un turno— y no aportaba
 * ni un bit de información nueva después del turno 0.
 *
 * **La garantía no se toca.** Un mapa distinto sigue dando un checksum distinto, porque
 * su checksum entra en el del estado. Lo único que desaparece es el trabajo repetido.
 *
 * La memoria es por identidad de objeto y eso basta porque el mapa nunca se muta: la
 * inmutabilidad es una regla del paquete, no una casualidad.
 */
const MAP_CHECKSUMS = new WeakMap<object, string>();

export function stateChecksum(state: { map: object }): string {
  let mapSum = MAP_CHECKSUMS.get(state.map);
  if (mapSum === undefined) {
    mapSum = checksum(state.map);
    MAP_CHECKSUMS.set(state.map, mapSum);
  }
  return checksum({ ...state, map: mapSum });
}

/** Congela en profundidad. Solo se usa en tests, para verificar que `reduce` es puro. */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
