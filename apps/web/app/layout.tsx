import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/**
 * Archivo Variable (Omnibus-Type, SIL OFL 1.1) — [ADR-017](../../../docs/DECISIONS.md#adr-017).
 *
 * Una sola familia con eje de anchura 62–125 %, que es exactamente lo que pide
 * [ASSET_PIPELINE §2.4](../../../docs/ASSET_PIPELINE.md#24-tipografía): geométrica,
 * condensable y con números tabulares. Los títulos usan la anchura estrecha y el texto
 * corrido la normal — **una familia, no dos**, que es lo que mantiene la coherencia sin
 * pagar una segunda descarga.
 *
 * Se sirve desde el propio repositorio. Ni una petición a un dominio de terceros: no por
 * purismo, sino porque una fuente que tarda es una fuente que provoca salto de maquetación
 * en el primer segundo de partida.
 *
 * Solo el subconjunto `latin`: cubre ES y EN enteros —incluidos ñ, tildes, ¿ y ¡— y
 * ahorra los 86 KB de `latin-ext`, que solo hacen falta para idiomas que este juego no
 * tiene.
 */
const archivo = localFont({
  src: '../../../assets/fonts/archivo-latin.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-archivo',
  declarations: [{ prop: 'font-stretch', value: '62% 125%' }],
});

export const metadata: Metadata = {
  title: 'Guerra de Cenizas',
  description:
    '4X multijugador por turnos. La diplomacia es aritmética y el combate no lleva dados.',
};

// Mobile-first de verdad: sin zoom del navegador, la escala la controla el mapa.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0e0f12',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={archivo.variable}>
      <body className="min-h-dvh bg-void text-ink antialiased">{children}</body>
    </html>
  );
}
