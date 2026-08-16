import { redirect } from 'next/navigation';

/**
 * Raíz. No hay portada: con sesión se va a las partidas y sin ella, a entrar.
 *
 * Nadie quiere una pantalla de bienvenida entre él y el turno que le toca jugar, y en
 * cadencia Blitz esa pantalla cuesta segundos de un plazo de tres minutos.
 */
export default async function Page() {
  redirect('/games');
}
