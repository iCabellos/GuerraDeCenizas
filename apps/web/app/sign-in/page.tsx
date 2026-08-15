import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/SignInForm';
import { Muted, Shell, Title } from '@/components/ui/Shell';
import { currentViewer, guestLocale } from '@/lib/server/session';
import { DICTIONARIES, translator } from '@/lib/i18n/index';

/**
 * Enlace mágico: sin contraseñas.
 *
 * No es solo comodidad. Una contraseña obliga a gestionar recuperación, rotación y fugas,
 * y este juego no necesita nada de eso — la cuenta solo guarda progresión.
 */
export default async function Page() {
  if (await currentViewer()) redirect('/games');

  const locale = await guestLocale();
  const t = translator(locale);

  return (
    <Shell>
      <Title>{t('auth.title')}</Title>
      <Muted>{t('auth.intro')}</Muted>
      {/* Los textos viajan al cliente ya resueltos: el componente no conoce el idioma. */}
      <SignInForm messages={DICTIONARIES[locale]} />
    </Shell>
  );
}
