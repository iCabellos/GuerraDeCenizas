import { notFound } from 'next/navigation';
import manifest from '../../../../../assets/manifest.json';
import { Legend, Masthead, Muted, Rule, Screen } from '@/components/ui/Shell';
import { AssetGallery } from '@/components/AssetGallery';

/**
 * Galería de assets — QA visual.
 *
 * Es el requisito §15 del brief y la herramienta que hace que la coherencia visual sea
 * **verificable** en vez de una opinión. Enseña cada asset a los tamaños a los que se ve
 * de verdad, en silueta sólida y sobre las superficies del juego.
 *
 * Solo en desarrollo: en producción devuelve 404. No es información sensible, pero una
 * ruta de herramienta accesible en producción es una ruta que alguien acabará indexando.
 */
export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <Screen quiet>
      <Masthead subtitle="dev · QA" />
      <div className="mt-6 flex flex-col gap-2">
        <Legend>Galería de assets</Legend>
        <Muted>
          {manifest.generated.length} assets originales · cuadrícula 24 · trazo 2 ·
          sin degradados salvo la Ceniza
        </Muted>
      </div>
      <Rule />
      <AssetGallery manifest={manifest.generated} />
    </Screen>
  );
}
