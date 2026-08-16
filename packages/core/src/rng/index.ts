/**
 * PRNG determinista — xoshiro128** con siembra splitmix32.
 *
 * Por qué a mano y no una librería: `packages/core` no puede tener dependencias de
 * runtime (ADR-001), y necesitamos garantía de que Node, Chromium y el simulador
 * producen exactamente la misma secuencia. xoshiro128** solo usa enteros de 32 bits y
 * `Math.imul`, así que no hay margen para divergencias de coma flotante.
 *
 * El **cursor** es parte del contrato: cuenta cuántos valores se han consumido, y se
 * guarda en `GameState.rngCursor`. Sin él, reanudar una partida daría otra secuencia.
 */

function splitmix32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  /** Valores consumidos desde la siembra. */
  cursor: number;

  constructor(seed: number, cursor = 0) {
    const mix = splitmix32(seed);
    this.s0 = mix();
    this.s1 = mix();
    this.s2 = mix();
    this.s3 = mix();
    this.cursor = 0;
    // Avanzar hasta el cursor pedido reproduce exactamente el estado guardado.
    for (let i = 0; i < cursor; i++) this.nextUint32();
  }

  /**
   * Entero sin signo de 32 bits. Es la única fuente de aleatoriedad del motor.
   *
   * Ojo con `& 0xffffffff`: en JavaScript los operadores de bits trabajan con enteros
   * de 32 bits CON SIGNO, así que enmascarar así devuelve negativos por encima de 2^31.
   * El único cierre correcto es `>>> 0`, que sí es sin signo.
   */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;

    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    this.cursor++;
    return result;
  }

  /** Real en [0, 1). 53 bits no: 32 bastan y evitan discrepancias entre motores. */
  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  /**
   * Entero en [0, maxExclusive). El sesgo del módulo es despreciable para nuestros
   * tamaños (bolsas de decenas de elementos) y a cambio es reproducible y barato.
   */
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return (this.nextUint32() >>> 0) % maxExclusive;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('Rng.pick sobre una lista vacía');
    return items[this.int(items.length)] as T;
  }

  /** Fisher–Yates. Devuelve una copia; no muta la entrada. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }
}

function rotl(x: number, k: number): number {
  return (((x << k) | (x >>> (32 - k))) >>> 0);
}

export function makeRng(seed: number, cursor = 0): Rng {
  return new Rng(seed, cursor);
}
