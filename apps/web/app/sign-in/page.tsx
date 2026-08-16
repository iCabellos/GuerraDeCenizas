import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/SignInForm';
import { Legend, Masthead, Muted, Rule, Screen } from '@/components/ui/Shell';
import { currentViewer, guestLocale } from '@/lib/server/session';
import { DICTIONARIES, translator } from '@/lib/i18n/index';

/**
 * Entrada por enlace mágico: sin contraseñas.
 *
 * No es solo comodidad. Una contraseña obliga a gestionar recuperación, rotación y
 * fugas, y esta cuenta solo guarda progresión — nada que justifique esa superficie.
 */
export default async function Page() {
  if (await currentViewer()) redirect('/games');

  const locale = await guestLocale();
  const t = translator(locale);

  return (
    <Screen>
      <Masthead subtitle={t('app.tagline')} />

      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        <div className="flex flex-col gap-2">
          <Legend>{t('auth.title')}</Legend>
          <Muted>{t('auth.intro')}</Muted>
        </div>
        {/* Los textos viajan al cliente ya resueltos: el componente no conoce el idioma. */}
        <SignInForm messages={DICTIONARIES[locale]} />
      </div>

      <Rule />
      <p className="text-xs leading-relaxed text-muted">{t('app.pitch')}</p>
    </Screen>
  );
}
