/**
 * Heat pump results display.
 *
 * Two sections:
 * 1. Packages — 4 named bundles shown side-by-side for easy comparison
 * 2. Waterfall — marginal value of every addition, with cavity/drylining as alternatives
 *
 * Gas baseline includes carbon tax (Finance Act 2020), standing charge saving,
 * and 2030 projection.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Tariff } from '../types';
import type {
  WaterfallResult,
  SolarMaxResult,
  GasBaselineEstimate,
  ScenarioStep,
  PackagesResult,
  PackageScenario,
} from '../utils/heatPumpScenarios';
import type { WaterfallBillingResults } from '../utils/heatPumpBilling';
import { calculateDirectHpBill } from '../utils/heatPumpBilling';
import { formatCurrency } from '../utils/format';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HeatPumpResultsProps {
  waterfall: WaterfallResult;
  solarMax: SolarMaxResult;
  packages: PackagesResult;
  billing: WaterfallBillingResults;
  baseline: GasBaselineEstimate;
  floorAreaM2: number;
  solarDataLoaded: boolean;
  tariff: Tariff;
  location: string;
  dhwSchedule: 'draw-time' | 'night-boost';
}

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
  packages,
  billing,
  baseline,
  solarDataLoaded,
  tariff,
  location,
  dhwSchedule,
}: HeatPumpResultsProps) {
  const navigate = useNavigate();
  void solarMax; // solar max is now part of packages
  const fuelLabel = baseline.fuelType === 'gas' ? 'gas' : 'oil';
  // Total saving includes standing charge elimination
  const totalGasBaseline = baseline.annualBillEur + baseline.standingChargeEur;

  function handleContinueInWizard(step: ScenarioStep | PackageScenario, totalKwh: number, label: string) {
    const handoff: HpHandoff = {
      hpProfileKwh: step.hpProfileKwh,
      location,
      tariffId: tariff.id,
      totalKwh,
      label: `HP: ${label}`,
    };
    try { sessionStorage.setItem(HP_HANDOFF_KEY, JSON.stringify(handoff)); } catch { /* */ }
    navigate('/full-model');
  }

  return (
    <div className="space-y-6">
      {/* Baseline summary */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-amber-900 uppercase tracking-wide mb-3">
          Current {fuelLabel} baseline
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Annual fuel bill" value={fmt(baseline.annualBillEur)} />
          <Stat label={`${fuelLabel} standing charge`} value={fmt(baseline.standingChargeEur) + '/yr'}
            note="eliminated with HP" />
          <Stat label="Carbon tax component" value={fmt(baseline.annualCarbonTaxEur) + '/yr'}
            note="Finance Act 2020 S.40" />
          <Stat label="Projected 2030 bill" value={fmt(baseline.projectedBill2030Eur) + '/yr'}
            note={`carbon tax → €100/t`} />
          <Stat label="Annual CO₂" value={`${Math.round(baseline.annualCo2Kg)} kg`} />
        </div>
      </div>

      {/* DHW schedule + solar data notices */}
      <div className="flex flex-col gap-2">
        <div className={`rounded-lg border px-4 py-2 text-sm ${dhwSchedule === 'night-boost' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
          {dhwSchedule === 'night-boost'
            ? 'Night-rate DHW: cylinder recharged overnight (01:00–07:00). Bills reflect the night rate.'
            : 'Flat-rate DHW: hot water billed at draw time. A night-rate tariff would shift this to cheaper slots.'}
        </div>
        {!solarDataLoaded && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-800">
            Solar data unavailable — solar steps show HP-only cost.
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* PACKAGES — side-by-side comparison                                */}
      {/* ================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Recommended packages</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            All include a properly installed heat pump. Compare total cost vs annual saving.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          {packages.packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              tariff={tariff}
              totalGasBaseline={totalGasBaseline}
              fuelLabel={fuelLabel}
              onContinue={(totalKwh) => handleContinueInWizard(pkg, totalKwh, pkg.label)}
            />
          ))}
        </div>
      </div>

      {/* ================================================================= */}
      {/* WATERFALL — marginal value of every addition                      */}
      {/* ================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900">Waterfall — marginal value of each upgrade</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Starting from a poorly-installed heat pump. Each step adds to the previous.
            {baseline.standingChargeEur > 0 && ` "vs ${fuelLabel}" includes ${fmt(baseline.standingChargeEur)}/yr standing charge saving.`}
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2 mt-2">
            Many heat pump installs in Ireland are poor — undersized radiators, no weather compensation,
            fixed high flow temperatures. Field trials (EST RHPP, BEIS Electrification of Heat) show
            SCOP 2.5–3.0 for these installs vs 3.5+ with proper commissioning. The first row shows the
            cost of a bad install; the second shows what a proper one saves.
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

                const savingVsGas = totalGasBaseline - bill.annualBillEur;
                const isAlternative = !!step.alternativeTo;
                const isHpPoor = step.id === 'hp_poor';

                // For payback: use saving vs previous main step (skip alternatives)
                let savingVsPrev = 0;
                if (!isHpPoor && !isAlternative) {
                  const prevMainSteps = waterfall.steps.slice(0, i).filter((s) => !s.alternativeTo);
                  const prevMain = prevMainSteps[prevMainSteps.length - 1];
                  const prevIdx = prevMain ? waterfall.steps.indexOf(prevMain) : -1;
                  const prevBill = prevIdx >= 0 ? billing.steps[prevIdx]?.annualBillEur : totalGasBaseline;
                  savingVsPrev = (prevBill ?? totalGasBaseline) - bill.annualBillEur;
                } else if (isAlternative) {
                  // Alternative: saving vs the step BEFORE the one it replaces
                  const replacedIdx = waterfall.steps.findIndex((s) => s.id === step.alternativeTo);
                  const baseIdx = replacedIdx > 0 ? replacedIdx - 1 : 0;
                  const baseBill = billing.steps[baseIdx]?.annualBillEur ?? totalGasBaseline;
                  savingVsPrev = baseBill - bill.annualBillEur;
                }

                const isSolarStep = step.solarKwp > 0;
                const isBetter = savingVsGas > 0;

                return (
                  <tr key={step.id} className={`${isAlternative ? 'bg-purple-50/50' : ''} ${isSolarStep ? 'bg-green-50/50' : ''}`}>
                    <td className="px-4 py-3">
                      {isAlternative && (
                        <span className="text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded mr-2">
                          OR
                        </span>
                      )}
                      <span className="font-medium text-slate-800">{step.label}</span>
                      {isSolarStep && (
                        <span className="ml-2 text-xs text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                          {step.solarKwp} kWp{step.batteryKwh > 0 ? ` + ${step.batteryKwh} kWh` : ''}
                        </span>
                      )}
                      {!isSolarStep && step.batteryKwh > 0 && (
                        <span className="ml-2 text-xs text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                          {step.batteryKwh} kWh EV rate arbitrage
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
                      {isHpPoor
                        ? '—'
                        : step.incrementalCostEur > 0
                          ? fmtPayback(savingVsPrev, step.incrementalCostEur)
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleContinueInWizard(step, bill.annualHpElecKwh, step.label)}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap"
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
          Payback = step cost ÷ saving vs previous step. HP row has no payback (sunk cost).
          "vs {fuelLabel}" includes {fmt(baseline.standingChargeEur)}/yr standing charge saving.
          Grants: SEAI Feb 2026 (HP €12,500, attic €1,500, cavity €1,300, EWI €6,000, drylining €3,500, solar €1,800).
          Carbon tax: €63.50/t CO₂ (2026), rising to €100/t by 2030 (Finance Act 2020 S.40).
          Export rate: {fmt(tariff.exportRate)}/kWh ({tariff.supplier}).
        </div>
      </div>

      {/* Methodology */}
      <div className="text-xs text-slate-400 px-1 space-y-1">
        <p>
          COP: Carnot-based (η=0.52, condenser +3K, evaporator −6K). Poor install = fixed flow temp (no weather comp).
          Good/heatgeek = weather compensation curve. Calibrated against EN14511/Keymark + real Irish meter data.
        </p>
        <p>
          Gas baseline: HDD 2,150, boiler 90%. Gas €0.137/kWh, oil €0.105/kWh.
          CO₂: SEAI factors (gas 0.203, oil 0.264 kg/kWh).
          Carbon tax: Finance Act 2020 S.40 — €7.50/tonne/yr to €100 by 2030.
        </p>
      </div>
    </div>
  );
}

function PackageCard({
  pkg,
  tariff,
  totalGasBaseline,
  fuelLabel,
  onContinue,
}: {
  pkg: PackageScenario;
  tariff: Tariff;
  totalGasBaseline: number;
  fuelLabel: string;
  onContinue: (totalKwh: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const bill = calculateDirectHpBill(pkg.hpProfileKwh, tariff);
  const savingVsGas = totalGasBaseline - bill.annualBillEur;
  const payback = savingVsGas > 0 ? pkg.totalCostEur / savingVsGas : -1;

  // Cost breakdown without totals row (last item)
  const itemLines = pkg.costBreakdown.slice(0, -1);
  const totalsLine = pkg.costBreakdown[pkg.costBreakdown.length - 1];

  return (
    <div className="p-4 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-900">{pkg.label}</h3>
      <p className="text-xs text-slate-400 mt-1 flex-grow">{pkg.description}</p>
      <div className="mt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Total cost</span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="font-medium text-slate-800 hover:text-blue-600 underline decoration-dotted cursor-pointer"
          >
            {fmt(pkg.totalCostEur)}
          </button>
        </div>

        {/* Expandable cost breakdown */}
        {expanded && (
          <div className="bg-slate-50 rounded-lg p-3 -mx-1 text-xs space-y-1.5">
            <div className="grid grid-cols-4 gap-1 text-slate-400 font-medium border-b border-slate-200 pb-1">
              <span className="col-span-1">Item</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Grant</span>
              <span className="text-right">Net</span>
            </div>
            {itemLines.map((line, i) => (
              <div key={i} className="grid grid-cols-4 gap-1 text-slate-600">
                <span className="col-span-1 truncate" title={line.label}>{line.label}</span>
                <span className="text-right tabular-nums">{fmt(line.grossCostEur)}</span>
                <span className="text-right tabular-nums text-green-600">
                  {line.grantEur > 0 ? `-${fmt(line.grantEur)}` : '—'}
                </span>
                <span className="text-right tabular-nums font-medium">{fmt(line.netCostEur)}</span>
              </div>
            ))}
            {totalsLine && (
              <div className="grid grid-cols-4 gap-1 text-slate-800 font-semibold border-t border-slate-200 pt-1">
                <span className="col-span-1">Total</span>
                <span className="text-right tabular-nums">{fmt(totalsLine.grossCostEur)}</span>
                <span className="text-right tabular-nums text-green-700">-{fmt(totalsLine.grantEur)}</span>
                <span className="text-right tabular-nums">{fmt(totalsLine.netCostEur)}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Annual HP bill</span>
          <span className="font-medium text-slate-800">{fmt(bill.annualBillEur)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Saving vs {fuelLabel}</span>
          <span className="font-medium text-green-700">{fmt(savingVsGas)}/yr</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Payback</span>
          <span className="font-medium text-slate-800">
            {payback > 0 && payback <= 50 ? `${payback.toFixed(1)} yrs` : '—'}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">SCOP</span>
          <span className="text-slate-600">{pkg.estimatedSCOP.toFixed(2)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onContinue(bill.annualHpElecKwh)}
        className="mt-3 w-full text-center text-xs text-blue-600 hover:text-blue-800 hover:underline"
      >
        Solar model →
      </button>
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
