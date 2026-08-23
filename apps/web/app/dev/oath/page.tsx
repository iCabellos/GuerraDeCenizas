import { notFound } from 'next/navigation';
import { OathForm } from '@/components/OathForm';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * Vista previa del Juramento, sin sesión.
 *
 * `/oath` exige cuenta y se pasa una sola vez en la vida de un perfil, así que sin esto
 * la pantalla sería irrevisable a los cinco minutos de existir. Solo en desarrollo.
 */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <OathForm
      messages={DICTIONARIES.es}
      profileId="00000000-0000-4000-8000-0000000000de"
      initialName="Kael"
    />
  );
}
