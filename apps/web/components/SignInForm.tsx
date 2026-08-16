'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '@/lib/supabase-browser';
import { authCallbackUrl } from '@/lib/site-url';
import { Command, Field, Input, Notice, Rule } from '@/components/ui/Shell';
import { Submitted } from '@/components/art/generated';

type Messages = Record<string, string>;

/**
 * Dos formas de entrar: con correo, o sin nada.
 *
 * **Siempre responde lo mismo, exista o no la cuenta.** Un mensaje distinto para un
 * correo desconocido convertiría este formulario en un comprobador de quién está
 * registrado.
 *
 * Recibe los textos ya resueltos en el servidor: el componente no sabe en qué idioma
 * está, y así no hay ni un literal visible aquí dentro.
 */
export function SignInForm({ messages }: { messages: Messages }) {
  const t = (key: string) => messages[key] ?? key;

  const router = useRouter();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [guest, setGuest] = useState<'idle' | 'entering' | 'error'>('idle');

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');

    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      // `authCallbackUrl()` y no `window.location.origin`: ver `lib/site-url.ts`.
      options: { emailRedirectTo: authCallbackUrl() },
    });

    setStatus(error ? 'error' : 'sent');
  }

  /**
   * Invitado: una sesión anónima de Supabase.
   *
   * No es una cuenta de mentira ni un camino aparte. Crea una fila real en `auth.users`,
   * y el trigger de alta le hace su perfil y su Ciudad **exactamente igual** que a una
   * cuenta con correo. Lo único que no tiene es forma de identificarse: sin correo no hay
   * enlace mágico, así que la sesión vive en la cookie de este navegador y en ninguno más.
   *
   * Eso es a la vez la comodidad y el precio, y no se puede esconder: si pierde este
   * dispositivo, pierde la cuenta. De ahí el aviso de debajo del botón.
   */
  async function enterAsGuest() {
    if (guest === 'entering') return;
    setGuest('entering');

    const { error } = await browserClient().auth.signInAnonymously();
    if (error) {
      setGuest('error');
      return;
    }
    // La cookie de sesión ya está puesta; `/` la lee en el servidor y pinta la ciudad.
    router.replace('/');
    router.refresh();
  }

  if (status === 'sent') {
    return (
      <div className="flex items-start gap-3 rounded-sharp border border-success/50 bg-success/10 p-4">
        <Submitted size={20} className="mt-0.5 shrink-0 text-success" />
        <div>
          <p className="type-title text-sm text-ink">{t('auth.checkInbox')}</p>
          <p className="mt-1 text-sm text-muted">{t('auth.sent')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={send} className="flex flex-col gap-4">
        <Field label={t('auth.email')}>
          <Input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t('auth.emailPlaceholder')}
          />
        </Field>

        <Command type="submit" disabled={status === 'sending' || email.trim().length < 5}>
          {status === 'sending' ? t('auth.sending') : t('auth.send')}
        </Command>

        {status === 'error' && <Notice tone="error">{t('error.network')}</Notice>}
      </form>

      <Rule />

      <div className="flex flex-col gap-2">
        <Command
          tone="ghost"
          onClick={enterAsGuest}
          disabled={guest === 'entering'}
        >
          {guest === 'entering' ? t('auth.guestEntering') : t('auth.guest')}
        </Command>
        {/* El precio, dicho antes de pagarlo y no después. */}
        <p className="text-xs leading-relaxed text-muted">{t('auth.guestWarning')}</p>
        {guest === 'error' && <Notice tone="error">{t('error.guest_unavailable')}</Notice>}
      </div>
    </div>
  );
}
