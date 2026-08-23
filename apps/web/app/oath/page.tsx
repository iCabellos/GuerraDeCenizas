import { redirect } from 'next/navigation';
import { OathForm } from '@/components/OathForm';
import { currentViewer } from '@/lib/server/session';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * El Juramento.
 *
 * Es lo único que se interpone entre entrar y la Ciudad, y se pasa **una vez en la vida
 * de la cuenta**. No contradice [ADR-026](../../../docs/DECISIONS.md#adr-026) —que prohíbe
 * pantallas intermedias entre el jugador y su turno— porque no está en el camino de jugar:
 * está en el camino de existir. Quien ya juró no vuelve a verla.
 */
export default async function Page() {
  const viewer = await currentViewer();
  if (!viewer) redirect('/sign-in');
  if (viewer.sworn) redirect('/');

  return (
    <OathForm
      messages={DICTIONARIES[viewer.locale]}
      profileId={viewer.profileId}
      initialName={viewer.displayName}
    />
  );
}
