import es from './es.json';
import en from './en.json';

/**
 * i18n mínima: un diccionario plano por idioma y una función.
 *
 * Sin librería. Lo que hace falta aquí es buscar una clave y sustituir `{parámetros}`;
 * una dependencia de i18n resolvería además plurales complejos, formatos por región y
 * carga diferida de espacios de nombres — nada de lo cual necesita este juego, y todo lo
 * cual pesa en el presupuesto de 180 KB de la ruta de partida.
 *
 * **Regla dura del proyecto: cero literales visibles en componentes.** No es cosmética.
 * Las ofertas diplomáticas son datos, no frases ([ADR-015](../../../docs/DECISIONS.md#adr-015)):
 * un jugador en español y otro en inglés tienen que ver exactamente la misma oferta, o la
 * negociación deja de ser verificable.
 *
 * `es.json` y `en.json` deben tener el mismo conjunto de claves. Hay un test que lo exige.
 */

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DICTIONARIES = { es, en } as const;

/** Las claves salen del castellano, que es el idioma en el que se diseña el juego. */
export type MessageKey = keyof typeof es;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Traduce. Una clave que falte se devuelve tal cual **en vez de lanzar**: un texto feo en
 * una esquina es un incidente; una excepción en el render deja al jugador sin partida.
 */
export function translate(
  locale: Locale,
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
): string {
  const dictionary = DICTIONARIES[locale] as Record<string, string>;
  const fallback = DICTIONARIES.es as Record<string, string>;
  const template = dictionary[key] ?? fallback[key] ?? key;

  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Traductor ligado a un idioma. Es lo que reciben los componentes. */
export type Translator = (
  key: MessageKey,
  params?: Readonly<Record<string, string | number>>,
) => string;

export function translator(locale: Locale): Translator {
  return (key, params) => translate(locale, key, params);
}

/**
 * Idioma a usar cuando todavía no hay perfil: la cabecera del navegador.
 *
 * El idioma del perfil manda siempre que exista. Esto solo cubre la pantalla de entrada,
 * que es justo donde el jugador aún no ha podido decirnos nada.
 */
export function localeFromHeader(header: string | null): Locale {
  if (!header) return 'es';
  for (const part of header.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase() ?? '';
    if (tag.startsWith('en')) return 'en';
    if (tag.startsWith('es')) return 'es';
  }
  return 'es';
}
