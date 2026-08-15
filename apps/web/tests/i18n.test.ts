/**
 * Paridad de idiomas.
 *
 * Una clave que exista en español y falte en inglés no rompe nada: se ve el castellano en
 * medio de una interfaz en inglés y nadie abre un issue. Por eso hace falta un test — es
 * un fallo que no se nota hasta que lo ve un jugador.
 */

import { describe, expect, it } from 'vitest';
import {
  DICTIONARIES, LOCALES, isLocale, localeFromHeader, translate, translator,
} from '../lib/i18n/index';
import { ALL_ANOMALIES, FACTION_IDS } from '@gdc/core';

const keys = Object.fromEntries(
  LOCALES.map((locale) => [locale, Object.keys(DICTIONARIES[locale]).sort()]),
) as Record<(typeof LOCALES)[number], string[]>;

describe('diccionarios', () => {
  it('ambos idiomas tienen exactamente las mismas claves', () => {
    expect(keys.en).toEqual(keys.es);
  });

  it('ninguna traducción está vacía', () => {
    for (const locale of LOCALES) {
      const empty = Object.entries(DICTIONARIES[locale])
        .filter(([, value]) => String(value).trim() === '')
        .map(([key]) => key);
      expect(empty, `vacías en ${locale}`).toEqual([]);
    }
  });

  it('los parámetros de una clave coinciden entre idiomas', () => {
    // Si el español dice «Faltan {missing}» y el inglés «{count} still to join», el texto
    // sale con un `{missing}` crudo en pantalla. Es el error más fácil de cometer al
    // traducir y el más difícil de ver.
    const params = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

    for (const key of keys.es) {
      const spanish = params((DICTIONARIES.es as Record<string, string>)[key]!);
      const english = params((DICTIONARIES.en as Record<string, string>)[key]!);
      expect(english, `parámetros distintos en «${key}»`).toEqual(spanish);
    }
  });

  it('cada facción tiene nombre en los dos idiomas', () => {
    for (const faction of FACTION_IDS) {
      for (const locale of LOCALES) {
        expect(keys[locale]).toContain(`faction.${faction}`);
      }
    }
  });
});

describe('translate', () => {
  it('sustituye los parámetros', () => {
    expect(translate('es', 'lobby.waiting', { missing: 2 })).toBe('Faltan 2 por entrar');
    expect(translate('en', 'lobby.waiting', { missing: 2 })).toBe('2 still to join');
  });

  it('deja el marcador intacto si falta el parámetro', () => {
    expect(translate('es', 'lobby.waiting')).toContain('{missing}');
  });

  it('una clave desconocida se devuelve tal cual y no lanza', () => {
    // Un texto feo en una esquina es un incidente; una excepción en el render deja al
    // jugador sin partida.
    const unknown = 'clave.que.no.existe' as never;
    expect(() => translate('es', unknown)).not.toThrow();
    expect(translate('es', unknown)).toBe('clave.que.no.existe');
  });

  it('el traductor ligado hace lo mismo', () => {
    expect(translator('en')('resource.ash')).toBe('Ash');
  });
});

describe('detección de idioma', () => {
  it.each([
    ['en-GB,en;q=0.9', 'en'],
    ['es-ES,es;q=0.9,en;q=0.8', 'es'],
    ['fr-FR,fr;q=0.9', 'es'],
    [null, 'es'],
  ])('%s ⇒ %s', (header, expected) => {
    expect(localeFromHeader(header)).toBe(expected);
  });

  it('reconoce los idiomas soportados y rechaza el resto', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('cobertura del vocabulario del juego', () => {
  it('los cuatro recursos y las tres armas están traducidos', () => {
    for (const key of ['supply', 'industry', 'intel', 'ash']) {
      expect(keys.es).toContain(`resource.${key}`);
    }
    for (const key of ['line', 'fire', 'sky']) {
      expect(keys.es).toContain(`arm.${key}`);
    }
  });

  it('hay un texto de error por cada código que devuelve la API', () => {
    // Los errores de la API son códigos, no frases: el cliente traduce. Un código sin
    // traducción se le enseñaría al jugador en crudo.
    const codes = [
      'unauthorized', 'bad_request', 'not_found', 'forbidden', 'game_not_found',
      'game_full', 'game_not_joinable', 'already_started', 'not_the_host',
      'seats_empty', 'not_your_seat', 'wrong_turn', 'game_not_active',
      'code_collision', 'bad_player_count', 'seed_mismatch', 'internal',
    ];
    for (const code of codes) expect(keys.es).toContain(`error.${code}`);
  });

  it('las anomalías todavía no se muestran, así que no se traducen', () => {
    // Recordatorio deliberado: llegan en v0.7. Cuando existan, este test tiene que
    // convertirse en el contrario.
    expect(ALL_ANOMALIES.length).toBeGreaterThan(0);
    expect(keys.es.some((key) => key.startsWith('anomaly.'))).toBe(false);
  });
});
