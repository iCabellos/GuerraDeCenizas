import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Guerra de Cenizas',
  description: '4X multijugador por turnos. Prototipo v0.1.',
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
    <html lang="es">
      <body className="min-h-dvh bg-void text-ink antialiased">{children}</body>
    </html>
  );
}
