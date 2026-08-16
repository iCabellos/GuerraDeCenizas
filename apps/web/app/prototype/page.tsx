import { PrototypeGame } from '@/components/PrototypeGame';

/**
 * v0.1 — prototipo local (hot seat). Sin auth, sin base de datos, sin red.
 * Toda la partida vive en memoria del navegador y se resuelve con el mismo `reduce()`
 * que usará el servidor en v0.3.
 */
export default function Page() {
  return <PrototypeGame />;
}
