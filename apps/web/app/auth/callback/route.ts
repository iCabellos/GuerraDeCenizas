import { NextResponse } from 'next/server';
import { userClient } from '@/lib/server/supabase';

/**
 * `GET /auth/callback` — el enlace del correo aterriza aquí.
 *
 * Canjea el código por una sesión y planta la cookie httpOnly. Que la sesión viva en una
 * cookie httpOnly y no en `localStorage` es lo que impide que un XSS se lleve el token.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (!code) return NextResponse.redirect(new URL('/sign-in', url.origin));

  const supabase = await userClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/sign-in?error=1', url.origin));

  // `next` solo puede ser una ruta interna: sin esta comprobación, el enlace del correo
  // sería un redirector abierto hacia cualquier dominio.
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(safe, url.origin));
}
