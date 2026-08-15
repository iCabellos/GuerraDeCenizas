'use client';

import { useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';
import { Button, Field, Notice } from '@/components/ui/Shell';

type Messages = Record<string, string>;

/**
 * Formulario de enlace mágico.
 *
 * Recibe los textos ya resueltos en el servidor: el componente no sabe en qué idioma
 * está, y así no hay ni un literal visible aquí dentro.
 *
 * **Siempre responde lo mismo, exista o no la cuenta.** Un mensaje distinto para un
 * correo desconocido convertiría este formulario en un comprobador de quién está
 * registrado.
 */
export function SignInForm({ messages }: { messages: Messages }) {
  const t = (key: string) => messages[key] ?? key;

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (status === 'sending') return;
    setStatus('sending');

    const { error } = await browserClient().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    setStatus(error ? 'error' : 'sent');
  }

  if (status === 'sent') return <Notice>{t('auth.sent')}</Notice>;

  return (
    <form onSubmit={send} className="flex flex-col gap-4">
      <Field label={t('auth.email')}>
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('auth.emailPlaceholder')}
          className="min-h-14 rounded-sharp border border-line bg-raised px-3 text-base text-ink placeholder:text-faint focus:border-rust focus:outline-none"
        />
      </Field>

      <Button type="submit" disabled={status === 'sending' || email.trim().length < 5}>
        {status === 'sending' ? t('auth.sending') : t('auth.send')}
      </Button>

      {status === 'error' && <Notice tone="error">{t('error.network')}</Notice>}
    </form>
  );
}
