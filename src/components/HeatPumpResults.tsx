/**
 * Heat pump results display.
 *
 * Shows the waterfall payback table (poor install → each upgrade step)
 * and the solar-maximalist comparison, referenced against the gas/oil baseline.
 */

import type { Tariff } from '../types';
import type { WaterfallResult, SolarMaxResult, GasBaselineEstimate } from '../utils/heatPumpScenarios';
import type { WaterfallBillingResults } from '../utils/heatPumpBilling';
import { formatCurrency } from '../utils/format';

interface HeatPumpResultsProps {
  waterfall: WaterfallResult;
  solarMax: SolarMaxResult;
  billing: WaterfallBillingResults;
  baseline: GasBaselineEstimate;
  floorAreaM2: number;
  tariff: Tariff;
}

function fmt(n: number) {
  return formatCurrency(n);
}

function fmtKwh(n: number) {
  return `${Math.round(n).toLocaleString('en-IE')} kWh`;
}

function fmtPayback(savingPerYear: number, cost: number): string {
  if (savingPerYear <= 0) return '—';
  const years = cost / savingPerYear;
  if (years < 0) return '—';
  if (years > 50) return '>50 yrs';
  return `${years.toFixed(1)} yrs`;
}

export function HeatPumpResults({
  waterfall,
  solarMax,
  billing,
  baseline,
}: HeatPumpResultsProps) {
  const gasAnnualBill = baseline.annualBillEur;
  const fuelLabel = baseline.fuelType === 'gas' ? 'gas' : 'oil';

  return (
    <div className="space-y-6">
      {/* Baseline summary */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide mb-3">
          Current {fuelLabel} baseline
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Annual fuel bill" value={fmt(baseline.annualBillEur)} />
          <Stat label="Annual fuel use" value={fmtKwh(baseline.annualFuelKwh)} />
          <Stat label="Annual CO₂" value={`${Math.round(baseline.annualCo2Kg)} kg`} />
          <Stat label="CO₂ vs heat pump" value={`−${Math.round(baseline.annualCo2Kg * 0.65)} kg est.`} note="≈65% reduction" />
        </div>
      </div>

      {/* Waterfall table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Waterfall — each upgrade builds on the last</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Annual HP electricity cost vs your {fuelLabel} baseline of {fmt(gasAnnualBill)}/yr.
            Solar steps show HP-only cost (solar savings are additional).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Step</th>
                <th className="px-4 py-3 text-right font-medium">SCOP</th>
                <th className="px-4 py-3 text-right font-medium">HP kWh/yr</th>
                <th className="px-4 py-3 text-right font-medium">Annual bill</th>
                <th className="px-4 py-3 text-right font-medium">vs {fuelLabel}</th>
                <th className="px-4 py-3 text-right font-medium">Step cost</th>
                <th className="px-4 py-3 text-right font-medium">Payback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waterfall.steps.map((step, i) => {
                const bill = billing.steps[i];
                if (!bill) return null;

                const savingVsGas = gasAnnualBill - bill.annualBillEur;
                const savingVsPrev =
                  i > 0
                    ? (billing.steps[i - 1]?.annualBillEur ?? bill.annualBillEur) - bill.annualBillEur
                    : gasAnnualBill - bill.annualBillEur;

                const isSolarStep = step.solarKwp > 0;
                const isBetter = savingVsGas > 0;

                return (
                  <tr key={step.id} className={isSolarStep ? 'bg-green-50/50' : ''}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{step.label}</span>
                      {step.solarKwp > 0 && (
                        <span className="ml-2 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                          {step.solarKwp} kWp solar{step.batteryKwh > 0 ? ` + ${step.batteryKwh} kWh battery` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {step.estimatedSCOP.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {fmtKwh(bill.annualHpElecKwh)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800 tabular-nums">
                      {fmt(bill.annualBillEur)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${isBetter ? 'text-green-700' : 'text-red-600'}`}>
                      {isBetter ? '−' : '+'}{fmt(Math.abs(savingVsGas))}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                      {step.incrementalCostEur > 0 ? fmt(step.incrementalCostEur) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 tabular-nums">
                      {step.incrementalCostEur > 0
                        ? fmtPayback(savingVsPrev, step.incrementalCostEur)
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
          Payback = step cost ÷ additional saving vs previous step. Annual bill includes electricity standing charge.
          HLI = {waterfall.steps[0]?.effectiveHLI.toFixed(2)} W/K/m² (starting), house: {waterfall.archetypeLabel}.
        </div>
      </div>

      {/* Solar max scenario */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Solar maximalist scenario</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Minimum insulation (attic + cavity + air sealing) + good install + 10 kWp solar + 10 kWh battery.
            Solar savings not modelled here — load solar data in the main calculator for the full picture.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Estimated SCOP" value={solarMax.estimatedSCOP.toFixed(2)} />
            <Stat label="HP electricity" value={fmtKwh(billing.solarMax.annualHpElecKwh)} />
            <Stat label="HP bill (no solar)" value={fmt(billing.solarMax.annualBillEur)} />
            <Stat label="Total system cost" value={fmt(solarMax.cumulativeCostEur)} note="after grants" />
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <strong>Next step:</strong> Load solar data in the main calculator with this HP profile
            to see the full savings from solar self-consumption and export revenue.
          </div>
        </div>
      </div>

      {/* Methodology note */}
      <div className="text-xs text-slate-400 px-1 space-y-1">
        <p>
          Heat pump model: Carnot-based COP (η = 0.52, condenser +3K, evaporator −6K), weather compensation
          curve calibrated against EN14511/Keymark data and real Irish meter readings.
        </p>
        <p>
          Gas baseline: degree-day method, HDD 2,150 (base 15.5°C), boiler efficiency 90%, gas €0.137/kWh, oil €0.105/kWh.
          CO₂: SEAI emission factors (gas 0.203 kg/kWh, oil 0.264 kg/kWh).
        </p>
        <p>
          Weather data: Met Éireann regional climate normals — verify against station data before publishing.
          SEAI grant amounts: heat pump €12,500, solar €1,800 (≤4 kWp). All costs are post-grant net figures.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900 mt-0.5">{value}</p>
      {note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}
    </div>
  );
}
