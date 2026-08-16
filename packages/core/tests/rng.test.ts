/**
 * Tests del PRNG.
 *
 * El caso `nextUint32 nunca es negativo` está aquí por un fallo real: la implementación
 * cerraba con `& 0xffffffff`, y en JavaScript los operadores de bits son de 32 bits CON
 * SIGNO, así que devolvía negativos por encima de 2^31. `shuffle` acababa indexando con
 * un índice negativo y dejaba huecos en el array, lo que producía mapas con menos
 * yacimientos de los debidos. Un fallo de una línea que rompía la equidad del juego.
 */

import { describe, expect, it } from 'vitest';
import { Rng, makeRng } from '../src/rng/index';

describe('Rng', () => {
  it('nextUint32 siempre está en [0, 2^32)', () => {
    const rng = new Rng(12345);
    for (let i = 0; i < 100_000; i++) {
      const value = rng.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('int(n) siempre está en [0, n)', () => {
    const rng = new Rng(7);
    for (const n of [1, 2, 3, 5, 18, 96, 1000]) {
      for (let i = 0; i < 2000; i++) {
        const value = rng.int(n);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(n);
      }
    }
  });

  it('next() está en [0, 1)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 10_000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('la misma semilla produce la misma secuencia', () => {
    const a = Array.from({ length: 500 }, () => new Rng(2024).nextUint32());
    const first = new Rng(2024);
    const b = Array.from({ length: 500 }, () => first.nextUint32());
    expect(a[0]).toBe(b[0]);

    const x = new Rng(2024);
    const y = new Rng(2024);
    for (let i = 0; i < 500; i++) expect(x.nextUint32()).toBe(y.nextUint32());
  });

  it('semillas distintas divergen', () => {
    const a = new Rng(1).nextUint32();
    const b = new Rng(2).nextUint32();
    expect(a).not.toBe(b);
  });

  it('el cursor reproduce exactamente el estado guardado', () => {
    const original = new Rng(555);
    for (let i = 0; i < 37; i++) original.nextUint32();
    expect(original.cursor).toBe(37);

    const restored = makeRng(555, 37);
    expect(restored.cursor).toBe(37);
    for (let i = 0; i < 20; i++) expect(restored.nextUint32()).toBe(original.nextUint32());
  });

  it('shuffle conserva todos los elementos y no deja huecos', () => {
    const source = Array.from({ length: 18 }, (_, i) => `t${i}`);
    for (let seed = 0; seed < 200; seed++) {
      const shuffled = new Rng(seed).shuffle(source);
      expect(shuffled).toHaveLength(source.length);
      expect(shuffled.every((v) => v !== undefined)).toBe(true);
      expect([...shuffled].sort()).toEqual([...source].sort());
    }
  });

  it('shuffle no muta la entrada', () => {
    const source = ['a', 'b', 'c', 'd'];
    const copy = [...source];
    new Rng(1).shuffle(source);
    expect(source).toEqual(copy);
  });

  it('pick devuelve siempre un elemento de la lista', () => {
    const rng = new Rng(3);
    const items = ['x', 'y', 'z'];
    for (let i = 0; i < 500; i++) expect(items).toContain(rng.pick(items));
  });

  it('la distribución es razonablemente uniforme', () => {
    const rng = new Rng(4242);
    const buckets = new Array(10).fill(0);
    const draws = 100_000;
    for (let i = 0; i < draws; i++) buckets[rng.int(10)]!++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 * 0.9);
      expect(count).toBeLessThan(draws / 10 * 1.1);
    }
  });
});
