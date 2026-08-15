import 'server-only';

import { localeFromHeader, isLocale, type Locale } from '../i18n/index';
import { headers } from 'next/headers';
import { userClient } from './supabase';

/** Perfil de quien mira la página, con su idioma ya resuelto. */
export interface Viewer {
  profileId: string;
  displayName: string;
  locale: Locale;
  factionId: string;
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
    .select('display_name, locale, faction_id')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) return null;

  return {
    profileId: data.user.id,
    displayName: profile.display_name as string,
    locale: isLocale(profile.locale) ? profile.locale : 'es',
    factionId: profile.faction_id as string,
  };
}

/** Idioma para las pantallas donde todavía no hay perfil: el del navegador. */
export async function guestLocale(): Promise<Locale> {
  return localeFromHeader((await headers()).get('accept-language'));
}
