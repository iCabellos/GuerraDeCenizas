'use client';

import {
  ALL_POLICIES, BALANCE, POLICY_BRANCH,
  type ArmId, type PlayerView, type PolicyId, type ResearchOrder,
} from '@gdc/core';

/**
 * Investigación: Grados y Políticas.
 *
 * Vive **en la columna**, no flotando sobre el mapa. Un panel que flota vuelve a traer
 * el fallo de siempre —un destino resaltado debajo— y `pointer-events: none` resuelve
 * los taps, no la visibilidad.
 *
 * Dos cosas que la pantalla tiene que decir sin un párrafo que las explique:
 *
 *  1. **Investigar cuesta el turno de la Fundición.** Por eso, si ya hay una Fundición
 *     en obra este turno, aquí no se puede pedir nada: se enseña, no se cuenta.
 *  2. **El Grado no mejora lo que ya está en el mapa.** Se enseña el grado actual junto
 *     al precio del siguiente, que es la comparación que hay que hacer para decidir.
 *
 * Como todo lo demás de `components/`, **no decide nada**: propone una orden y `reduce()`
 * la vuelve a validar contra el estado autoritativo.
 */

type T = (key: string, params?: Record<string, string | number>) => string;

const ARMS: readonly ArmId[] = ['line', 'fire', 'sky'];

export function ResearchPanel({
  view, chosen, onChoose, t,
}: {
  view: PlayerView;
  /** Lo que ya se pidió este turno. `null` = nada. */
  chosen: ResearchOrder | null;
  onChoose: (order: ResearchOrder | null) => void;
  t: T;
}) {
  const foundry = Math.max(
    0,
    ...view.buildings.filter((b) => b.own && b.kind === 'foundry' && b.building === 0)
      .map((b) => b.level),
  );
  const { ore, ember } = view.self.resources;

  const same = (order: ResearchOrder): boolean =>
    chosen !== null
    && chosen.kind === order.kind
    && (order.kind === 'tier'
      ? chosen.kind === 'tier' && chosen.arm === order.arm
      : chosen.kind === 'policy' && chosen.policy === order.policy);

  return (
    <div className="max-h-[28dvh] overflow-y-auto bg-panel px-3 pb-2 pt-2">
      {/* El material vive aquí y no en la barra permanente: seis cifras no caben en
          360 px, y un número que solo importa cuando vas a gastarlo no tiene por qué
          estar en pantalla los otros veintitrés turnos. */}
      <p className="type-figure text-xs text-muted tabular-nums">
        {t('res.ore.short', { n: Math.round(ore) })}
        {' · '}
        {t('res.ember.short', { n: Math.round(ember) })}
      </p>

      {foundry === 0 ? (
        <p className="type-label mt-2 !text-faint">{t('research.needsFoundry')}</p>
      ) : (
        <>
          <section className="mt-2">
            <span className="type-label">{t('research.title')}</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ARMS.map((arm) => {
                const current = view.self.tiers[arm];
                const target = current + 1;
                const cost = target <= 3 ? BALANCE.tiers.cost[target] : null;
                const needs = BALANCE.tiers.foundryRequired[target] ?? 9;
                const order: ResearchOrder = { kind: 'tier', arm };
                const picked = same(order);
                const can = Boolean(
                  cost && foundry >= needs && ore >= cost.ore && ember >= cost.ember,
                );

                return (
                  <button
                    key={arm}
                    type="button"
                    aria-pressed={picked}
                    disabled={!picked && !can}
                    onClick={() => onChoose(picked ? null : order)}
                    className={`flex min-h-11 flex-col items-start justify-center border px-2.5
                      text-sm font-semibold disabled:border-line/50 disabled:text-faint ${
                        picked ? 'border-rust bg-rust/20 text-rust' : 'border-line bg-raised'
                      }`}
                  >
                    <span>{t('research.tier', { arm: t(`arm.${arm}`) })}</span>
                    <span className="type-figure text-[11px] text-muted tabular-nums">
                      {t('research.tierAt', { tier: current })}
                      {cost && ` · ${t('res.ore.short', { n: cost.ore })} · ${t('res.ember.short', { n: cost.ember })}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {(['economy', 'military'] as const).map((branch) => (
            <section key={branch} className="mt-3">
              <span className="type-label">{t(`policy.branch.${branch}`)}</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {ALL_POLICIES.filter((id) => POLICY_BRANCH[id] === branch).map((id) => {
                  const rank = view.self.policies[id] ?? 0;
                  const cost = rank < 3 ? BALANCE.policies.cost[rank + 1] : null;
                  const order: ResearchOrder = { kind: 'policy', policy: id as PolicyId };
                  const picked = same(order);
                  const can = Boolean(cost && ore >= cost.ore && ember >= cost.ember);

                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={picked}
                      disabled={!picked && !can}
                      onClick={() => onChoose(picked ? null : order)}
                      className={`flex min-h-11 flex-col items-start justify-center border px-2.5
                        text-sm font-semibold disabled:border-line/50 disabled:text-faint ${
                          picked ? 'border-rust bg-rust/20 text-rust' : 'border-line bg-raised'
                        }`}
                    >
                      <span>{t(`policy.${id}`)}</span>
                      <span className="type-figure text-[11px] text-muted tabular-nums">
                        {t('policy.rank', { rank })}
                        {cost && ` · ${t('res.ore.short', { n: cost.ore })} · ${t('res.ember.short', { n: cost.ember })}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
