import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Muted, Shell, Title } from '@/components/ui/Shell';
import { currentViewer, guestLocale } from '@/lib/server/session';
import { translator } from '@/lib/i18n/index';

/**
 * Entrada. Con sesión se va directo a las partidas: nadie quiere una portada entre él y
 * el turno que le toca jugar.
 */
export default async function Page() {
  if (await currentViewer()) redirect('/games');

  const t = translator(await guestLocale());

  return (
    <Shell>
      <div className="flex flex-1 flex-col justify-center gap-3">
        <Title>{t('app.name')}</Title>
        <Muted>{t('app.tagline')}</Muted>
      </div>
      <Link
        href="/sign-in"
        className="flex min-h-14 items-center justify-center rounded-sharp bg-rust px-4 text-base font-medium text-void"
      >
        {t('auth.title')}
      </Link>
    </Shell>
  );
}
