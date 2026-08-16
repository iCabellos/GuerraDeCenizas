import { redirect } from 'next/navigation';
import { Home } from '@/components/Home';
import { currentViewer } from '@/lib/server/session';
import { userClient } from '@/lib/server/supabase';
import { DICTIONARIES } from '@/lib/i18n/index';
import type { DistrictLevels } from '@/components/CityView';

/**
 * La vista. Al abrir el juego se ve tu ciudad, y punto
 * ([ADR-026](../../../docs/DECISIONS.md#adr-026)).
 *
 * Si hay una campaña en curso se entra directamente en ella: cuando te toca jugar un
 * turno, cualquier pantalla intermedia es un peaje. Y en cadencia Blitz ese peaje se come
 * un pedazo real del plazo.
 */
export default async function Page() {
  const viewer = await currentViewer();
  if (!viewer) redirect('/sign-in');

  const supabase = await userClient();

  const { data: active } = await supabase
    .from('games')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (active) redirect(`/g/${active.id}`);

  const { data: city } = await supabase
    .from('cities')
    .select('ash_bank, districts')
    .eq('profile_id', viewer.profileId)
    .maybeSingle();

  return (
    <Home
      messages={DICTIONARIES[viewer.locale]}
      profileId={viewer.profileId}
      factionId={viewer.factionId}
      districts={(city?.districts as DistrictLevels) ?? {}}
      ash={(city?.ash_bank as number) ?? 0}
    />
  );
}
