/**
 * Equidad del campo de batalla.
 *
 * El juego entero se apoya en una premisa aritmética: ganar exige pagar más Ceniza de la
 * que da **el reparto justo de un jugador**. Si el mapa no reparte igual, esa frase deja
 * de significar nada y la diplomacia deja de ser verificable.
 *
 * Por eso lo que se comprueba aquí no son las constantes del generador sino la intención:
 * los tres sectores tienen que ser **el mismo territorio girado 120°**. Un test que fijara
 * `RING[2] = ['urban', ...]` bendeciría cualquier reparto desigual mientras no se tocara
 * la tabla; éste lo caza.
 */

import { describe, expect, it } from 'vitest';
import { boardTiles, type Kind } from '../components/world/board';

const tiles = boardTiles(3);

/** Recuento de terrenos de un sector, para comparar sectores entre sí. */
function terrainOf(sector: number): Record<string, number> {
  const count: Record<string, number> = {};
  for (const tile of tiles.filter((t) => t.sector === sector)) {
    count[tile.kind] = (count[tile.kind] ?? 0) + 1;
  }
  return count;
}

describe('campo de batalla', () => {
  it('un hexágono de radio 3 son 37 casillas', () => {
    expect(tiles).toHaveLength(37);
  });

  it('el centro es el Núcleo, y es el único', () => {
    const cores = tiles.filter((t) => t.kind === 'core');
    expect(cores).toHaveLength(1);
    expect(cores[0]).toMatchObject({ q: 0, r: 0, ring: 0 });
  });

  it('el Núcleo no es de nadie: no cae en ningún sector', () => {
    expect(tiles.find((t) => t.ring === 0)?.sector).toBe(-1);
  });

  it('todo lo demás pertenece a uno de los tres sectores', () => {
    const outside = tiles.filter((t) => t.ring > 0);
    expect(outside).toHaveLength(36);
    for (const tile of outside) {
      expect(tile.sector, `casilla ${tile.q},${tile.r}`).toBeGreaterThanOrEqual(0);
      expect(tile.sector, `casilla ${tile.q},${tile.r}`).toBeLessThan(3);
    }
  });

  it('los tres sectores son el mismo territorio girado: mismo reparto de terreno', () => {
    const [a, b, c] = [terrainOf(0), terrainOf(1), terrainOf(2)];
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('los tres sectores tienen el mismo número de casillas', () => {
    for (const sector of [0, 1, 2]) {
      expect(tiles.filter((t) => t.sector === sector), `sector ${sector}`).toHaveLength(12);
    }
  });

  it('cada sector tiene exactamente un Bastión: uno empieza, nadie empieza con dos', () => {
    for (const sector of [0, 1, 2]) {
      const bastions = tiles.filter((t) => t.sector === sector && t.kind === 'bastion');
      expect(bastions, `sector ${sector}`).toHaveLength(1);
    }
  });

  it('cada sector tiene el mismo número de Yacimientos', () => {
    const seams = [0, 1, 2].map((s) => tiles.filter((t) => t.sector === s && t.kind === 'seam').length);
    expect(new Set(seams).size, `yacimientos por sector: ${seams.join(', ')}`).toBe(1);
  });

  it('ninguna casilla se queda sin terreno asignado', () => {
    const kinds: Kind[] = ['water', 'plain', 'forest', 'urban', 'seam', 'high', 'bastion', 'core'];
    for (const tile of tiles) {
      expect(kinds, `casilla ${tile.q},${tile.r}`).toContain(tile.kind);
    }
  });
});
