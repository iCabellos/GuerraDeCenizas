import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { userClient } from '@/lib/server/supabase';

/**
 * `GET /auth/callback` — el enlace del correo aterriza aquí.
 *
 * Canjea el código por una sesión y planta la cookie httpOnly. Que la sesión viva en una
 * cookie httpOnly y no en `localStorage` es lo que impide que un XSS se lleve el token.
 *
 * **Supabase manda dos formatos de enlace y hay que entender los dos.** Con el flujo PKCE
 * llega `?code=`; con las plantillas de correo que usan `{{ .TokenHash }}` llega
 * `?token_hash=&type=`. Cuál toca depende de la plantilla configurada en el proyecto, que
 * es un ajuste del panel — es decir, algo que puede cambiar sin tocar este repositorio.
 * Soportar solo uno hace que el enlace redirija bien y aun así no inicie sesión, que es
 * de los fallos más desconcertantes que hay: la URL es correcta y no pasa nada.
 */

const OTP_TYPES: readonly EmailOtpType[] = [
  'signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email',
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = url.searchParams.get('next') ?? '/';

  // Supabase puede devolver el fallo en la propia URL — enlace caducado, ya usado. Sin
  // esto se trataría como «falta el código» y la persona vería el formulario otra vez sin
  // saber que su enlace había expirado.
  const authError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (authError) return NextResponse.redirect(new URL('/sign-in?error=link', url.origin));

  const supabase = await userClient();

  let failed: boolean;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    failed = Boolean(error);
  } else {
    return NextResponse.redirect(new URL('/sign-in', url.origin));
  }

  if (failed) return NextResponse.redirect(new URL('/sign-in?error=link', url.origin));

  // `next` solo puede ser una ruta interna: sin esta comprobación, el enlace del correo
  // sería un redirector abierto hacia cualquier dominio.
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(safe, url.origin));
}
