'use client';

import { useState } from 'react';
import * as Art from '@/components/art/generated';

interface Entry {
  asset: string;
  role: string;
  component: string;
  strokes: number;
  bytes: number;
}

/**
 * Los cuatro paneles de QA visual y qué detecta cada uno
 * ([ASSET_PIPELINE §6.1](../../../docs/ASSET_PIPELINE.md#61-los-seis-paneles-y-qué-detecta-cada-uno)):
 *
 * · **Escala** — el mismo icono a 16, 24 y 40 px. Caza el detalle que se convierte en
 *   una mancha en el mapa, que es donde de verdad se ve.
 * · **Silueta** — relleno sólido, sin trazo interior. Si dos assets no se distinguen
 *   aquí, tampoco se distinguirán de reojo durante un turno de tres minutos.
 * · **Superficies** — sobre `void`, `panel` y `raised`. Caza contrastes que solo
 *   funcionan sobre un fondo.
 * · **Rejilla** — todos juntos al mismo tamaño. Caza al que tiene otro peso de trazo.
 */
const PANELS = ['scale', 'silhouette', 'surfaces', 'grid'] as const;
type PanelKind = (typeof PANELS)[number];

const PANEL_LABEL: Record<PanelKind, string> = {
  scale: 'Escala',
  silhouette: 'Silueta',
  surfaces: 'Superficies',
  grid: 'Rejilla',
};

export function AssetGallery({ manifest }: { manifest: Entry[] }) {
  const [panel, setPanel] = useState<PanelKind>('scale');
  const registry = Art as unknown as Record<string, typeof Art.Mark>;

  return (
    <div className="flex flex-col gap-4 pb-10">
      <div className="flex gap-1">
        {PANELS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setPanel(kind)}
            aria-pressed={panel === kind}
            className={`type-label min-h-11 flex-1 rounded-sharp border px-1 ${
              panel === kind
                ? 'border-rust bg-rust/12 text-ink'
                : 'border-line bg-raised'
            }`}
          >
            {PANEL_LABEL[kind]}
          </button>
        ))}
      </div>

      {panel === 'grid' ? (
        <div className="grid grid-cols-4 gap-2">
          {manifest.map((entry) => {
            const Icon = registry[entry.component];
            return Icon ? (
              <div
                key={entry.asset}
                title={entry.asset}
                className="flex aspect-square items-center justify-center rounded-sharp border border-line bg-panel text-ink"
              >
                <Icon size={28} />
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {manifest.map((entry) => {
            const Icon = registry[entry.component];
            if (!Icon) return null;
            return (
              <li
                key={entry.asset}
                className="registered rounded-sharp border border-line bg-panel p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="type-title text-xs text-ink">{entry.asset}</span>
                  <span className="type-figure text-[0.65rem] text-faint">
                    {entry.strokes} trazos · {entry.bytes} B
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-4">
                  {panel === 'scale' && (
                    <>
                      <Icon size={16} className="text-ink" />
                      <Icon size={24} className="text-ink" />
                      <Icon size={40} className="text-ink" />
                    </>
                  )}
                  {panel === 'silhouette' && (
                    <>
                      {/* Relleno sólido: es la prueba de que la forma se reconoce sin
                          detalle interior, que es como se ve a 16 px. */}
                      <span className="text-ink [&_svg_*]:fill-current [&_svg_*]:stroke-current">
                        <Icon size={16} />
                      </span>
                      <span className="text-ink [&_svg_*]:fill-current [&_svg_*]:stroke-current">
                        <Icon size={40} />
                      </span>
                    </>
                  )}
                  {panel === 'surfaces' && (
                    <>
                      <span className="flex size-12 items-center justify-center bg-void text-ink">
                        <Icon size={24} />
                      </span>
                      <span className="flex size-12 items-center justify-center bg-panel text-ink">
                        <Icon size={24} />
                      </span>
                      <span className="flex size-12 items-center justify-center bg-raised text-muted">
                        <Icon size={24} />
                      </span>
                      <span className="flex size-12 items-center justify-center bg-rust text-void">
                        <Icon size={24} />
                      </span>
                    </>
                  )}
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted">{entry.role}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
