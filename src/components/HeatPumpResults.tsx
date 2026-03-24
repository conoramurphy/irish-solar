/**
 * Heat pump results display.
 *
 * Shows the waterfall payback table (poor install → each upgrade step)
 * and the solar-maximalist comparison, referenced against the gas/oil baseline.
 *
 * "Continue in solar calculator" stores the HP profile in sessionStorage and
 * navigates to /full-model, where the wizard picks it up as the consumption profile.
 */

import { useNavigate } from 'react-router-dom';
import type { Tariff } from '../types';
import type { WaterfallResult, SolarMaxResult, GasBaselineEstimate, ScenarioStep } from '../utils/heatPumpScenarios';
import type { WaterfallBillingResults, ScenarioBillingResult } from '../utils/heatPumpBilling';
import { formatCurrency } from '../utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeatPumpResultsProps {
  waterfall: WaterfallResult;
  solarMax: SolarMaxResult;
  billing: WaterfallBillingResults;
  baseline: GasBaselineEstimate;
  floorAreaM2: number;
  solarDataLoaded: boolean;
  tariff: Tariff;
  location: string;
}

// Stored in sessionStorage so the main wizard can pick it up
export interface HpHandoff {
  hpProfileKwh: number[];
  location: string;
  tariffId: string;
  totalKwh: number;
  label: string;
}

const HP_HANDOFF_KEY = '__hpHandoff';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return formatCurrency(n);
}

function fmtKwh(n: number) {
  return `${Math.round(n).toLocaleString('en-IE')} kWh`;
}

function fmtPayback(savingPerYear: number, cost: number): string {
  if (savingPerYear <= 0 || cost <= 0) return '—';
  const years = cost / savingPerYear;
  if (years > 50) return '>50 yrs';
  return `${years.toFixed(1)} yrs`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeatPumpResults({
  waterfall,
  solarMax,
  billing,
  baseline,
  solarDataLoaded,
  tariff,
  location,
}: HeatPumpResultsProps) {
  const navigate = useNavigate();
  const gasAnnualBill = baseline.annualBillEur;
  const fuelLabel = baseline.fuelType === 'gas' ? 'gas' : 'oil';

  function handleContinueInWizard(step: ScenarioStep, bill: ScenarioBillingResult) {
    const handoff: HpHandoff = {
      hpProfileKwh: step.hpProfileKwh,
      location,
      tariffId: tariff.id,
      totalKwh: bill.annualHpElecKwh,
      label: `HP profile: ${step.label}`,
    };
    try {
      sessionStorage.setItem(HP_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // sessionStorage full or unavailable — navigate anyway, wizard will start fresh
    }
    navigate('/full-model');
  }

  function handleContinueSolarMax() {
    const handoff: HpHandoff = {
      hpProfileKwh: solarMax.hpProfileKwh,
      location,
      tariffId: tariff.id,
      totalKwh: billing.solarMax.annualHpElecKwh,
      label: `HP profile: Solar maximalist (${solarMax.archetypeLabel})`,
    };
    try {
      sessionStorage.setItem(HP_HANDOFF_KEY, JSON.stringify(handoff));
    } catch {
      // sessionStorage full or unavailable
    }
    navigate('/full-model');
  }

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
          <Stat label="vs heat pump" value={`−${Math.round(baseline.annualCo2Kg * 0.65)} kg est.`} note="≈65% CO₂ reduction" />
        </div>
      </div>

      {/* Solar data notice */}
      {!solarDataLoaded && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
          Solar data unavailable for this location — solar steps show HP electricity cost only (no solar savings modelled).
        </div>
      )}

      {/* Waterfall table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Waterfall — each upgrade builds on the last</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            HP annual electricity cost vs {fuelLabel} baseline of {fmt(gasAnnualBill)}/yr.
            {solarDataLoaded && ' Solar steps use real irradiance data (same engine as solar calculator).'}
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
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waterfall.steps.map((step, i) => {
                const bill = billing.steps[i];
                if (!bill) return null;

                const savingVsGas = gasAnnualBill - bill.annualBillEur;
                const prevBill = billing.steps[i - 1]?.annualBillEur ?? gasAnnualBill;
                const savingVsPrev = prevBill - bill.annualBillEur;
                const isSolarStep = step.solarKwp > 0;
                const isBetter = savingVsGas > 0;

                return (
                  <tr key={step.id} className={isSolarStep ? 'bg-green-50/50' : ''}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{step.label}</span>
                      {isSolarStep && (
                        <span className="ml-2 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                          {step.solarKwp} kWp{step.batteryKwh > 0 ? ` + ${step.batteryKwh} kWh` : ''}
                        </span>
                      )}
                      {isSolarStep && bill.annualSelfConsumptionKwh > 0 && (
                        <div className="text-xs text-green-600 mt-0.5">
                          {fmtKwh(bill.annualSelfConsumptionKwh)} self-consumed
                          {bill.annualExportRevenueEur > 0 && ` · ${fmt(bill.annualExportRevenueEur)} export`}
                        </div>
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
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleContinueInWizard(step, bill)}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
                        title="Open this HP profile in the solar calculator"
                      >
                        Solar model →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-400">
          Payback = step cost ÷ additional saving vs previous step. Bill includes electricity standing charge.
          HLI starts at {waterfall.steps[0]?.effectiveHLI.toFixed(2)} W/K/m² (archetype: {waterfall.archetypeLabel}).
        </div>
      </div>

      {/* Solar max scenario */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Solar maximalist scenario</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Minimum insulation (attic + cavity + air sealing) + good install + 10 kWp solar + 10 kWh battery.
          </p>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Estimated SCOP" value={solarMax.estimatedSCOP.toFixed(2)} />
            <Stat label="HP electricity" value={fmtKwh(billing.solarMax.annualHpElecKwh)} />
            <Stat label="Annual bill" value={fmt(billing.solarMax.annualBillEur)}
              note={solarDataLoaded ? 'after solar savings' : 'HP only, no solar'} />
            <Stat label="System cost" value={fmt(solarMax.cumulativeCostEur)} note="after grants" />
          </div>
          {solarDataLoaded && billing.solarMax.annualSelfConsumptionKwh > 0 && (
            <div className="mt-3 text-sm text-green-700">
              {fmtKwh(billing.solarMax.annualSelfConsumptionKwh)} self-consumed ·{' '}
              {fmt(billing.solarMax.annualExportRevenueEur)} export revenue
            </div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={handleContinueSolarMax}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Continue in solar calculator →
            </button>
            <span className="text-xs text-slate-400">
              Loads this HP profile as your consumption — add your solar system in Step 2
            </span>
          </div>
        </div>
      </div>

      {/* Methodology note */}
      <div className="text-xs text-slate-400 px-1 space-y-1">
        <p>
          Heat pump model: Carnot-based COP (η = 0.52, condenser +3K, evaporator −6K), weather compensation
          calibrated against EN14511/Keymark data and real Irish meter readings.
        </p>
        <p>
          Gas baseline: degree-day method, HDD 2,150 (base 15.5°C), boiler efficiency 90%, gas €0.137/kWh, oil €0.105/kWh.
          CO₂: SEAI emission factors (gas 0.203 kg/kWh, oil 0.264 kg/kWh).
        </p>
        <p>
          Weather: Met Éireann regional climate normals — verify against station data before publishing.
          SEAI grants: heat pump €12,500, solar €1,800 (≤4 kWp). All costs are post-grant net figures.
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
