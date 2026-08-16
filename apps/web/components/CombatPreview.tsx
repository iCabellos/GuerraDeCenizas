'use client';

import type { CombatPreview as Preview, Seat } from '@gdc/core';
import { seatColor } from '@/lib/theme';

/**
 * La pantalla que solo es posible porque el combate no lleva dados.
 *
 * El número que se muestra aquí sale de la MISMA función que resuelve el turno, así que
 * no puede mentir sobre las reglas. Lo único que puede fallar es la información de
 * partida — y por eso el aviso de incertidumbre no es letra pequeña: es la enseñanza
 * central del juego. El resultado es exacto *dado lo que sabes*, y lo que no sabes se
 * paga con Sombra, no con suerte.
 */
export function CombatPreview({
  preview,
  seat,
  onConfirm,
  onCancel,
}: {
  preview: Preview;
  seat: Seat;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const mine = preview.sides.find((s) => s.seat === seat);
  const theirs = preview.sides.filter((s) => s.seat !== seat);
  const win = preview.winner === seat;
  const draw = preview.winner === null;

  return (
    <section
      className="absolute inset-x-0 bottom-0 max-h-[70%] overflow-y-auto border-t-2 border-rust bg-panel px-4 pb-4 pt-3"
      aria-label="Previsualización de combate"
    >
      <div className="mx-auto mb-3 h-1 w-10 rounded-sharp bg-line" aria-hidden />
      <h2 className="text-lg font-bold leading-tight">Atacar</h2>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <PowerCard label="Tú" seat={seat} power={mine?.power ?? 0} />
        <PowerCard
          label={theirs.length > 1 ? `${theirs.length} rivales` : 'Rival'}
          seat={theirs[0]?.seat ?? 0}
          power={Math.max(0, ...theirs.map((t) => t.power))}
        />
      </div>

      <p
        className={`mt-4 text-center text-2xl font-bold ${
          draw ? 'text-warn' : win ? 'text-success' : 'text-danger'
        }`}
      >
        {draw ? 'Empate — os destruís' : win ? '✓ Vences' : '✕ Pierdes'}
      </p>

      {mine && (
        <p className="mt-1 text-center text-sm text-muted">
          {mine.losses >= 1
            ? 'Pierdes la fuerza entera'
            : `Pierdes ~${Math.round(mine.losses * 100)} % → ` +
              `🛡${round(mine.survivors.line)} 🎯${round(mine.survivors.fire)} ✈${round(mine.survivors.sky)}`}
        </p>
      )}

      {preview.uncertain && (
        <p className="mt-3 rounded-sharp border border-warn/50 bg-raised px-3 py-2 text-xs text-warn">
          ⚠ Estimación. Parte de la fuerza enemiga está oculta, así que el cálculo usa lo
          que ves. Las reglas son exactas; tu información, no.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-14 flex-1 rounded-sharp border-2 border-line text-muted"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-14 flex-1 rounded-sharp bg-rust text-lg font-bold text-void"
        >
          Confirmar
        </button>
      </div>
    </section>
  );
}

function PowerCard({ label, seat, power }: { label: string; seat: Seat; power: number }) {
  return (
    <div className="rounded-sharp border-2 border-line bg-raised p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="text-2xl font-bold" style={{ color: seatColor(seat) }}>
        {round(power)}
      </p>
      <p className="text-[10px] text-faint">potencia</p>
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
