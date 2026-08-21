import Link from 'next/link';
import type { Outcome, PlayerView, Seat } from '@gdc/core';
import { Ash, Mark } from '@/components/art/generated';
import { FactionEmblem } from '@/components/GameChrome';
import { seatColor } from '@/lib/theme';

/**
 * Cómo acabó la campaña.
 *
 * Antes esta pantalla no existía: al cerrar el T12 la partida pasaba a `finished` y la
 * ruta te devolvía a la portada sin decir nada. Doce turnos de aritmética y ni una cifra
 * al final — que es justo lo contrario de un juego cuya premisa es que las cuentas se
 * pueden verificar.
 *
 * Las filas vienen de `match_results`, escritas por la autoridad al resolver el último
 * turno. Aquí no se calcula nada.
 */

export interface StandingRow {
  seat: number;
  outcome: string;
  seams: number | null;
  ash: number | null;
  regions: number | null;
  ash_awarded: number;
}

export function CampaignResult({
  rows, view, messages,
}: {
  rows: readonly StandingRow[];
  /** La última vista: de aquí salen los nombres y las facciones, ya filtrados por RLS. */
  view: PlayerView;
  messages: Readonly<Record<string, string>>;
}) {
  const t = (key: string): string => messages[key] ?? key;

  const nameOf = (seat: number): string =>
    seat === view.seat
      ? view.self.name
      : view.opponents.find((o) => o.seat === seat)?.name ?? `#${seat + 1}`;
  const factionOf = (seat: number) =>
    seat === view.seat
      ? view.self.factionId
      : view.opponents.find((o) => o.seat === seat)?.factionId ?? 'vantera';

  const mine = rows.find((row) => row.seat === view.seat);

  /**
   * El orden lo manda el desenlace, no la Ceniza premiada.
   *
   * Ordenar por lo premiado colaría a un superviviente con mucha reserva por delante de
   * quien ganó la Reclamación Menor, porque el 35 % de una reserva grande puede superar
   * al 55 % de una pequeña. La clasificación cuenta quién ganó, no quién cobró más.
   */
  const RANK: Record<string, number> = {
    attuned: 0, coalition: 1, lesser: 2, survivor: 3, reduced: 4, abandoned: 5,
  };
  const ranked = [...rows].sort(
    (a, b) => (RANK[a.outcome] ?? 9) - (RANK[b.outcome] ?? 9)
      || (b.ash ?? 0) - (a.ash ?? 0)
      || a.seat - b.seat,
  );

  return (
    <div className="relative flex min-h-dvh flex-col bg-void px-4 pb-8 pt-10">
      <div className="chart-grid pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative z-10 flex items-center gap-3">
        <Mark size={28} className="text-rust" />
        <div>
          <h1 className="type-display text-xl text-ink">{t('result.title')}</h1>
          <p className="type-label !tracking-wider">{t('result.nobodyAttuned')}</p>
        </div>
      </header>

      {/* Lo primero que se busca al terminar es cuánto te llevas. Va arriba y grande. */}
      {mine && (
        <section className="relative z-10 mt-6 flex items-center gap-3 rounded-sharp
          border border-rust/50 bg-rust/10 px-4 py-3">
          <Ash size={22} className="text-ash" />
          <span className="type-figure text-2xl text-ink">+{mine.ash_awarded}</span>
          <span className="type-label flex-1">{t('result.awarded')}</span>
        </section>
      )}

      <ol className="relative z-10 mt-5 flex flex-col gap-2">
        {ranked.map((row, index) => {
          const you = row.seat === view.seat;
          const Emblem = FactionEmblem;
          return (
            <li
              key={row.seat}
              className={`flex items-center gap-3 rounded-sharp border px-3 py-3 ${
                you ? 'border-rust/60 bg-rust/5' : 'border-line bg-panel'
              }`}
            >
              <span className="type-figure w-5 text-muted">{index + 1}</span>
              <span className="h-8 w-1" style={{ background: seatColor(row.seat as Seat) }} aria-hidden />
              <Emblem factionId={factionOf(row.seat)} size={20} className="shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="type-title truncate text-sm text-ink">
                  {nameOf(row.seat)}{you && ` · ${t('result.you')}`}
                </p>
                <p className="type-label truncate">{t(`result.${row.outcome as Outcome}`)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="type-figure text-sm text-ink">{row.regions ?? 0}</p>
                <p className="type-label">{t('result.regions')}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="type-figure text-sm text-ash">{row.ash ?? 0}</p>
                <p className="type-label">{t('resource.ash')}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <Link
        href="/"
        className="type-title relative z-10 mt-auto flex min-h-14 items-center justify-center
          rounded-sharp border border-rust bg-rust text-sm text-void"
      >
        {t('result.back')}
      </Link>
    </div>
  );
}
