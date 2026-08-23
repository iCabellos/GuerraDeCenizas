import { notFound } from 'next/navigation';
import { Home } from '@/components/Home';
import { CityView } from '@/components/CityView';
import { DICTIONARIES } from '@/lib/i18n/index';

/**
 * Vista previa de la pantalla principal, sin base de datos.
 *
 * La vista única depende de la sesión y de Supabase, así que sin credenciales no habría
 * forma de mirarla — y una pantalla que no se puede mirar no se puede revisar. Esto la
 * monta con una cuenta de ejemplo a medio construir: tres distritos levantados, tres en
 * cimientos, que es justo el estado en el que hay que comprobar que la ciudad **cuenta**
 * lo que tienes y lo que te falta.
 *
 * Solo en desarrollo.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ arrivals?: string; of?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  // `?arrivals=2&of=5` monta la espera del emparejamiento, que es el estado que no se
  // puede alcanzar sin base de datos y sin embargo es el que más hay que mirar.
  const { arrivals, of } = await searchParams;
  if (arrivals) {
    return (
      <div className="relative flex h-dvh items-center justify-center bg-void">
        <div className="chart-grid pointer-events-none absolute inset-0 opacity-40" />
        <div className="ashfall" />
        <CityView
          className="relative z-10 h-full max-h-[min(80vh,520px)] w-full"
          messages={DICTIONARIES.es}
          label="Buscando campaña"
          factionId="koldvik"
          profileId="00000000-0000-4000-8000-0000000000de"
          districts={{ archive: 2, foundry: 3, antenna: 1 }}
          ash={312}
          arrivals={Number(arrivals)}
          arrivalTotal={Number(of ?? 5)}
        />
      </div>
    );
  }

  return (
    <Home
      messages={DICTIONARIES.es}
      profileId="00000000-0000-4000-8000-0000000000de"
      factionId="koldvik"
      displayName="Bren"
      districts={{ archive: 2, foundry: 3, antenna: 1 }}
      ash={312}
    />
  );
}
