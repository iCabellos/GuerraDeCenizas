import 'server-only';

import { FACTION_IDS, type FactionId } from '@gdc/core';
import { localeFromHeader, isLocale, type Locale } from '../i18n/index';
import { headers } from 'next/headers';
import { userClient } from './supabase';

/** Perfil de quien mira la página, con su idioma ya resuelto. */
export interface Viewer {
  profileId: string;
  displayName: string;
  locale: Locale;
  factionId: FactionId;
  /** `false` mientras la cuenta no haya jurado: su facción es solo el valor por defecto. */
  sworn: boolean;
}

/**
 * Quién está mirando.
 *
 * `getUser()` valida el token contra Supabase en vez de fiarse de la cookie. Y el perfil
 * se lee con el cliente de usuario, no con el de servicio: si por un error el perfil no
 * existiera, es mejor que la página lo trate como «sin sesión» a que lo invente.
 */
export async function currentViewer(): Promise<Viewer | null> {
  const supabase = await userClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, locale, faction_id, sworn_at')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    profileId: data.user.id,
    displayName: profile.display_name as string,
    locale: isLocale(profile.locale) ? profile.locale : 'es',
    // La facción sale de una columna `text`: se valida contra el catálogo del motor en
    // vez de confiar en ella. Un valor corrupto pintaría el emblema equivocado, no un
    // fallo — pero pintar el emblema de otra facción es mentirle al jugador.
    factionId: FACTION_IDS.includes(profile.faction_id as FactionId)
      ? (profile.faction_id as FactionId)
      : 'vantera',
    /**
     * ¿Ha jurado esta cuenta?
     *
     * `faction_id` nace con un valor por defecto, así que por sí solo no distingue «juré
     * Vantera» de «nadie me ha preguntado». Esto sí, y es lo que decide si hay que pasar
     * por el Juramento antes de la Ciudad.
     */
    sworn: profile.sworn_at !== null && profile.sworn_at !== undefined,
  };
}

/** Idioma para las pantallas donde todavía no hay perfil: el del navegador. */
export async function guestLocale(): Promise<Locale> {
  return localeFromHeader((await headers()).get('accept-language'));
}
