'use client';

import { useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';
import { Command, Field, Input, Notice } from '@/components/ui/Shell';
import { Submitted } from '@/components/art/generated';

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
  );
}
