import { useMemo, useState } from 'react';
import type { CalculationResult } from '../types';

type InputsUsed = NonNullable<CalculationResult['inputsUsed']>;

type Props = {
  inputsUsed?: CalculationResult['inputsUsed'];
  diagnostics?: CalculationResult['diagnostics'];
};

function formatMaybeNumber(n: number | undefined, digits = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function renderTsv(lines: string[][]) {
  return lines.map((cols) => cols.join('\t')).join('\n');
}

export function InputsUsedPanel({ inputsUsed, diagnostics }: Props) {
  const [open, setOpen] = useState(false);

  const warningCount = diagnostics?.warnings?.length ?? 0;

  const sections = useMemo(() => {
    if (!inputsUsed) return null;

    const iu = inputsUsed as InputsUsed;

    const annualConsumptionSourceLabel =
      iu.simulation.consumptionSource === 'override' ? 'Imported hourly usage (override)' : 'Monthly profile (derived)';

    return {
      iu,
      annualConsumptionSourceLabel
    };
  }, [inputsUsed]);

  if (!inputsUsed || !sections) return null;

  const { iu, annualConsumptionSourceLabel } = sections;

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
      >
        <div>
          <div className="text-sm font-bold text-slate-700">Inputs actually used</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Traceability snapshot from the engine.
            {warningCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                {warningCount} warning{warningCount === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        <div className="text-slate-500 text-sm font-semibold">
          {open ? 'Hide' : 'Show'}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5">
          {diagnostics?.warnings?.length ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">Warnings</div>
              <ul className="mt-2 list-disc pl-5 space-y-1 text-amber-900">
                {diagnostics.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-500">No warnings recorded.</div>
          )}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg bg-white border border-slate-200 p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">System configuration</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <dt className="text-slate-500">Business type</dt>
                <dd className="text-slate-700 font-medium">{iu.config.businessType}</dd>

                <dt className="text-slate-500">Location</dt>
                <dd className="text-slate-700 font-medium">{iu.config.location || '—'}</dd>

                <dt className="text-slate-500">Annual PV (kWh)</dt>
                <dd className="text-slate-700 font-medium">{iu.config.annualProductionKwh.toLocaleString()}</dd>

                <dt className="text-slate-500">System size (kWp)</dt>
                <dd className="text-slate-700 font-medium">{formatMaybeNumber(iu.config.systemSizeKwp)}</dd>

                <dt className="text-slate-500">Battery (kWh)</dt>
                <dd className="text-slate-700 font-medium">{iu.config.batterySizeKwh.toLocaleString()}</dd>

                <dt className="text-slate-500">Export cap (kW)</dt>
                <dd className="text-slate-700 font-medium">{formatMaybeNumber(iu.config.gridExportCapKw, 0)}</dd>

                <dt className="text-slate-500">Project cost (€)</dt>
                <dd className="text-slate-700 font-medium">{iu.config.installationCost.toLocaleString()}</dd>
              </dl>
            </div>

            <div className="rounded-lg bg-white border border-slate-200 p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Simulation</div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                <dt className="text-slate-500">Year</dt>
                <dd className="text-slate-700 font-medium">{iu.simulation.year}</dd>

                <dt className="text-slate-500">Hours</dt>
                <dd className="text-slate-700 font-medium">{iu.simulation.totalHours.toLocaleString()}</dd>

                <dt className="text-slate-500">Consumption</dt>
                <dd className="text-slate-700 font-medium">{annualConsumptionSourceLabel}</dd>

                <dt className="text-slate-500">Market prices</dt>
                <dd className="text-slate-700 font-medium">{iu.simulation.marketPricesProvided ? 'Provided' : 'Not provided'}</dd>
              </dl>

              {iu.corrections?.solar?.warnings?.length ? (
                <div className="mt-4 text-xs text-slate-600">
                  <div className="font-semibold">Solar normalization</div>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    {iu.corrections.solar.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {iu.corrections?.consumption?.warnings?.length ? (
                <div className="mt-3 text-xs text-slate-600">
                  <div className="font-semibold">Consumption normalization</div>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    {iu.corrections.consumption.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {iu.corrections?.prices?.warnings?.length ? (
                <div className="mt-3 text-xs text-slate-600">
                  <div className="font-semibold">Price normalization</div>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    {iu.corrections.prices.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="rounded-lg bg-white border border-slate-200 p-4 md:col-span-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tariff</div>
              <div className="mt-2 text-sm text-slate-700 font-medium">
                {iu.tariff.supplier} — {iu.tariff.product} ({iu.tariff.type})
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Standing charge: €{iu.tariff.standingCharge.toFixed(2)}/day · Export rate: €{iu.tariff.exportRate.toFixed(3)}/kWh
              </div>
              <div className="mt-3 text-xs text-slate-600">
                <div className="font-semibold">Rates used</div>
                <ul className="mt-1 list-disc pl-5 space-y-1">
                  {iu.tariff.rates.map((r) => (
                    <li key={`${r.period}-${r.hours ?? ''}-${r.rate}`}>
                      <span className="font-medium">{r.period}</span>
                      {r.hours ? <span className="text-slate-500"> ({r.hours})</span> : null}: €{r.rate.toFixed(3)}/kWh
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-lg bg-white border border-slate-200 p-4 md:col-span-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grants & financing</div>
              <div className="mt-2 text-xs text-slate-600">
                Equity: €{iu.financing.equity.toLocaleString()} · Term: {iu.financing.termYears}y · Interest:{' '}
                {(iu.financing.interestRate * 100).toFixed(2)}%
              </div>

              <div className="mt-3">
                {iu.grants.length ? (
                  <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                    {iu.grants.map((g) => (
                      <li key={g.id}>
                        <span className="font-medium">{g.name}</span> <span className="text-slate-500">({g.type})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-slate-500">No grants selected.</div>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-white border border-slate-200 p-4 md:col-span-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Timeseries samples (first 100 rows)</div>
              <div className="mt-2 text-xs text-slate-500">
                These are the first 100 timesteps after parsing/normalization (i.e. the engine’s actual inputs).
              </div>

              <div className="mt-3 space-y-3">
                <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">Solar (hourKey, month, day, hour, irradianceWm2)</summary>
                  <pre className="mt-2 max-h-80 overflow-auto text-[11px] leading-snug text-slate-700 whitespace-pre">
                    {renderTsv([
                      ['hourKey', 'monthIndex', 'day', 'hour', 'irradianceWm2', 'sourceIndex'],
                      ...iu.samples!.solar.map((r) => [
                        r.hourKey,
                        String(r.stamp.monthIndex),
                        String(r.stamp.day),
                        String(r.stamp.hour),
                        String(r.irradianceWm2),
                        String(r.sourceIndex)
                      ])
                    ])}
                  </pre>
                </details>

                {iu.samples?.consumption ? (
                  <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                      Consumption override (hourKey, consumptionKwh)
                    </summary>
                    <pre className="mt-2 max-h-80 overflow-auto text-[11px] leading-snug text-slate-700 whitespace-pre">
                      {renderTsv([
                        ['hourKey', 'consumptionKwh'],
                        ...iu.samples.consumption.map((r) => [r.hourKey, String(r.consumptionKwh)])
                      ])}
                    </pre>
                  </details>
                ) : (
                  <div className="text-[11px] text-slate-500">
                    No imported consumption override sample (consumption was generated from a monthly profile).
                  </div>
                )}

                {iu.samples?.prices ? (
                  <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">Market prices (hourKey, priceEurPerKwh)</summary>
                    <pre className="mt-2 max-h-80 overflow-auto text-[11px] leading-snug text-slate-700 whitespace-pre">
                      {renderTsv([
                        ['hourKey', 'priceEurPerKwh'],
                        ...iu.samples.prices.map((r) => [r.hourKey, String(r.priceEurPerKwh)])
                      ])}
                    </pre>
                  </details>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
