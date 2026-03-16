import { useMemo, useState } from 'react';
import type { CalculationResult, SensitivityVariant, SystemConfiguration, Tariff } from '../types';
import { calculateAnnualBillSummary } from '../utils/billSummary';
import { estimateSystemCost } from '../utils/costEstimation';
import { projectCashFlows, type ProjectionResult, IMPORT_ESCALATION_RATE, getExportRateMultiplier } from '../utils/exportRateProjection';
import { calculateIRR } from '../models/financial';
import { applyDegradation } from '../models/solar';
import { formatCurrency, formatNumber } from '../utils/format';
import { AuditModal } from './AuditModal';
import { EnergyAnalyticsChart } from './EnergyAnalyticsChart';
import { MarketAnalysis } from './MarketAnalysis';
import { InputsUsedPanel } from './InputsUsedPanel';
import { SaveReportModal } from './SaveReportModal';
import { TariffComparisonTab } from './TariffComparisonTab';
import type { TariffComparisonRow } from './TariffComparisonTab';
import { SavingsBreakdownChart } from './SavingsBreakdownChart';

interface ResultsSectionProps {
  standardResult: CalculationResult | null;
  marketResult?: CalculationResult | null;
  tariffComparisonResults?: TariffComparisonRow[] | null;
  config?: SystemConfiguration;
  tariff?: Tariff;
  availableYears?: number[];
  selectedYear?: number;
  onSelectYear?: (year: number) => void;
  onSelectSimulation?: (annualProduction: number, batterySizeKwh?: number) => void;
  onBack?: () => void;
  onSaveReport?: (name: string) => void;
  existingReportNames?: string[];
  isReadOnly?: boolean;
  onShare?: () => Promise<void>;
}

const ANALYSIS_YEARS = 25;

function reprojectVariant(
  v: SensitivityVariant,
  applyFutureRateChanges: boolean,
  baseCalendarYear: number
): SensitivityVariant {
  const year1NonExport = v.annualSavings - v.year1ExportRevenue;
  const netCashFlows: number[] = [];
  let year10Net = 0;

  for (let year = 1; year <= ANALYSIS_YEARS; year++) {
    const deg = applyDegradation(1, year - 1);
    const calYear = baseCalendarYear + year - 1;
    const importEsc = applyFutureRateChanges ? Math.pow(1 + IMPORT_ESCALATION_RATE, year - 1) : 1;
    const exportMul = applyFutureRateChanges ? getExportRateMultiplier(calYear) : 1;
    const yearSavings = year1NonExport * deg * importEsc + v.year1ExportRevenue * deg * exportMul;
    const yearLoanPayment = year <= v.loanTermYears ? v.annualLoanPayment : 0;
    const netCf = yearSavings - yearLoanPayment;
    netCashFlows.push(netCf);
    if (year <= 10) year10Net += netCf;
  }

  // IRR basis is equity (actual cash outlay); fall back to netCost if equity is zero (all-cash).
  const irrBasis = v.equityAmount > 0 ? v.equityAmount : v.netCost;
  return {
    ...v,
    irr: calculateIRR(irrBasis, netCashFlows),
    year10NetCashFlow: year10Net,
  };
}

function formatSignedCurrency(value: number) {
  const sign = value >= 0 ? '+' : '−';
  const abs = Math.abs(value);
  return `${sign}${formatCurrency(abs)}`;
}

function formatPercentFraction(fraction: number, digits = 1) {
  const f = Number.isFinite(fraction) ? fraction : 0;
  return `${(f * 100).toFixed(digits)}%`;
}

export function ResultsSection({ 
  standardResult,
  marketResult,
  tariffComparisonResults,
  config,
  tariff,
  availableYears = [], 
  selectedYear, 
  onSelectYear, 
  onSelectSimulation,
  onBack,
  onSaveReport,
  existingReportNames = [],
  isReadOnly = false,
  onShare,
}: ResultsSectionProps) {
  const [activeTab, setActiveTab] = useState<'standard' | 'tariff-comparison' | 'financial'>('standard');
  const [auditOpen, setAuditOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [applyFutureRateChanges, setApplyFutureRateChanges] = useState(true);
  const [ratesInfoOpen, setRatesInfoOpen] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'sharing' | 'copied' | 'error'>('idle');

  const reportDate = new Date().toLocaleDateString();

  // Use the standard result for all content tabs
  const activeResult = useMemo(() => standardResult, [standardResult]);

  const analyticsYear = useMemo(() => {
    const y = activeResult?.audit?.year;
    if (typeof y === 'number') return y;
    const hk = activeResult?.audit?.hourly?.[0]?.hourKey;
    if (hk) {
      const maybeYear = Number(hk.slice(0, 4));
      if (Number.isFinite(maybeYear)) return maybeYear;
    }
    return new Date().getFullYear();
  }, [activeResult?.audit?.hourly, activeResult?.audit?.year]);

  const { solarYield, batteryYield } = useMemo(() => {
    if (!config || !activeResult) return { solarYield: 0, batteryYield: 0 };
    
    // Simple cost attribution logic
    // 1. Estimate standalone base costs
    const kwp = config.systemSizeKwp || (config.annualProductionKwh / 950); // Fallback estimation
    const kwh = config.batterySizeKwh || 0;
    
    const mode = config.businessType === 'house' ? 'domestic' : 'commercial';

    const solarBaseCost = estimateSystemCost(kwp, 0, mode);
    const batteryBaseCost = estimateSystemCost(0, kwh, mode);
    
    // 2. Allocate Net Cost proportionally
    const totalBase = solarBaseCost + batteryBaseCost;
    if (totalBase <= 0) return { solarYield: 0, batteryYield: 0 };

    const solarShare = solarBaseCost / totalBase;
    const batteryShare = batteryBaseCost / totalBase;

    const solarAllocatedCost = activeResult.netCost * solarShare;
    const batteryAllocatedCost = activeResult.netCost * batteryShare;

    // 3. Calculate Yields (Annual Savings / Allocated Cost)
    // Note: Export revenue is attributed to Solar yield here as it's generated by solar
    const solarTotalSavings = activeResult.annualSolarToLoadSavings + activeResult.annualExportRevenue;
    
    const sYield = solarAllocatedCost > 0 ? solarTotalSavings / solarAllocatedCost : 0;
    const bYield = batteryAllocatedCost > 0 ? activeResult.annualBatteryToLoadSavings / batteryAllocatedCost : 0;

    return { solarYield: sYield, batteryYield: bYield };
  }, [config, activeResult]);

  const annualBill = useMemo(() => {
    const monthly = activeResult?.audit?.monthly;
    if (!monthly || monthly.length === 0) return null;
    return calculateAnnualBillSummary(monthly);
  }, [activeResult?.audit?.monthly]);

  const financialProjection: { active: ProjectionResult; flat: ProjectionResult } | null = useMemo(() => {
    if (!standardResult) return null;

    const baseCalendarYear = standardResult.audit?.year
      ?? standardResult.inputsUsed?.simulation?.year
      ?? new Date().getFullYear();

    const loanPaymentYear1 = standardResult.cashFlows[0]?.loanPayment ?? 0;
    const loanTermYears = loanPaymentYear1 > 0
      ? standardResult.cashFlows.filter((cf) => cf.loanPayment > 0).length
      : 0;

    const shared = {
      year1OperationalSavings: standardResult.annualSavings,
      year1ExportRevenue: standardResult.annualExportRevenue,
      year1TaxSavings: standardResult.year1TaxSavings ?? 0,
      baseGeneration: standardResult.annualGeneration,
      annualLoanPayment: loanPaymentYear1,
      loanTermYears,
      equityAmount: standardResult.equityAmount ?? standardResult.netCost,
      effectiveNetCost: standardResult.effectiveNetCost ?? standardResult.netCost,
      analysisYears: 25,
      baseCalendarYear,
      year1SolarDirectSavings: standardResult.annualSolarToLoadSavings,
      year1BatteryDisplacement: standardResult.annualBatteryToLoadSavings,
    };

    return {
      active: projectCashFlows({ ...shared, applyFutureRateChanges }),
      flat: projectCashFlows({ ...shared, applyFutureRateChanges: false }),
    };
  }, [standardResult, applyFutureRateChanges]);

  // Re-project tariff comparison rows: IRR, NPV, payback update when toggle changes.
  // Annual Savings and Export Credits are Year 1 actuals — they stay fixed.
  const projectedTariffRows = useMemo(() => {
    if (!tariffComparisonResults) return null;
    const baseCalendarYear = standardResult?.audit?.year
      ?? standardResult?.inputsUsed?.simulation?.year
      ?? new Date().getFullYear();
    return tariffComparisonResults.map((row) => {
      const r = row.result;
      const loanPaymentYear1 = r.cashFlows[0]?.loanPayment ?? 0;
      const loanTermYears = loanPaymentYear1 > 0
        ? r.cashFlows.filter((cf) => cf.loanPayment > 0).length : 0;
      const proj = projectCashFlows({
        year1OperationalSavings: r.annualSavings,
        year1ExportRevenue: r.annualExportRevenue,
        year1TaxSavings: r.year1TaxSavings ?? 0,
        baseGeneration: r.annualGeneration,
        annualLoanPayment: loanPaymentYear1,
        loanTermYears,
        equityAmount: r.equityAmount ?? r.netCost,
        effectiveNetCost: r.effectiveNetCost ?? r.netCost,
        analysisYears: 25,
        applyFutureRateChanges,
        baseCalendarYear,
      });
      return {
        ...row,
        result: { ...r, irr: proj.irr, npv: proj.npv, simplePayback: proj.simplePayback },
      };
    });
  }, [tariffComparisonResults, standardResult, applyFutureRateChanges]);

  const projectedMarketResult = useMemo(() => {
    if (!marketResult) return marketResult;
    const baseCalendarYear = standardResult?.audit?.year
      ?? standardResult?.inputsUsed?.simulation?.year
      ?? new Date().getFullYear();
    const r = marketResult;
    const loanPaymentYear1 = r.cashFlows[0]?.loanPayment ?? 0;
    const loanTermYears = loanPaymentYear1 > 0
      ? r.cashFlows.filter((cf) => cf.loanPayment > 0).length : 0;
    const proj = projectCashFlows({
      year1OperationalSavings: r.annualSavings,
      year1ExportRevenue: r.annualExportRevenue,
      year1TaxSavings: r.year1TaxSavings ?? 0,
      baseGeneration: r.annualGeneration,
      annualLoanPayment: loanPaymentYear1,
      loanTermYears,
      equityAmount: r.equityAmount ?? r.netCost,
      effectiveNetCost: r.effectiveNetCost ?? r.netCost,
      analysisYears: 25,
      applyFutureRateChanges,
      baseCalendarYear,
    });
    return { ...r, irr: proj.irr, npv: proj.npv, simplePayback: proj.simplePayback };
  }, [marketResult, standardResult, applyFutureRateChanges]);

  // Re-project sensitivity heat map cells using the same future-rate logic.
  // Each cell already stores Year 1 actuals; we only re-compute IRR and 10-year cumulative.
  const projectedSensitivity = useMemo(() => {
    const sens = standardResult?.sensitivityAnalysis;
    if (!sens) return null;
    const baseCalendarYear = standardResult?.audit?.year
      ?? standardResult?.inputsUsed?.simulation?.year
      ?? new Date().getFullYear();

    return {
      ...sens,
      rows: sens.rows.map((row) => ({
        ...row,
        noBattery:     reprojectVariant(row.noBattery,     applyFutureRateChanges, baseCalendarYear),
        halfBattery:   reprojectVariant(row.halfBattery,   applyFutureRateChanges, baseCalendarYear),
        fullBattery:   reprojectVariant(row.fullBattery,   applyFutureRateChanges, baseCalendarYear),
        doubleBattery: reprojectVariant(row.doubleBattery, applyFutureRateChanges, baseCalendarYear),
      })),
    };
  }, [standardResult, applyFutureRateChanges]);

  if (!standardResult) {
    return (
      <div className="bg-slate-50 rounded-xl border border-dashed border-slate-300 p-10 text-center h-full flex flex-col items-center justify-center text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mb-4 opacity-50">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
        </svg>
        <p>Run a calculation to generate the ROI report.</p>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
      <div className="px-8 py-7 md:px-10 md:py-8 border-b border-slate-100">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl font-serif font-bold text-tines-dark leading-tight">Projected Impact Report</h2>
            <p className="mt-1 text-sm text-slate-500">Summary of costs, savings, and returns based on your inputs.</p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-4">
              {availableYears.length > 1 && onSelectYear && selectedYear && (
                <div className="flex items-center gap-2">
                  <label htmlFor="year-select" className="text-sm font-medium text-slate-500">
                    Simulation Year:
                  </label>
                  <select
                    id="year-select"
                    value={selectedYear}
                    onChange={(e) => onSelectYear(Number(e.target.value))}
                    className="rounded-md border-slate-200 py-1 pl-3 pr-8 text-sm focus:border-emerald-700 focus:ring-emerald-700"
                  >
                    {availableYears.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="text-sm font-medium text-slate-400 shrink-0">{reportDate}</div>
            </div>
            {/* Future rate changes toggle */}
            <div className="flex items-center gap-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyFutureRateChanges}
                  onChange={(e) => setApplyFutureRateChanges(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-8 h-4 bg-slate-300 rounded-full peer peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4" />
              </label>
              <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                Price in future rate changes
              </span>
              <button
                type="button"
                onClick={() => setRatesInfoOpen(true)}
                className="flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 text-slate-400 hover:border-amber-500 hover:text-amber-600 transition-colors text-[10px] font-bold leading-none"
                aria-label="Learn about future rate projections"
              >
                ?
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Rates info modal */}
      {ratesInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setRatesInfoOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-800">Future Rate Projections</h3>
              <button type="button" onClick={() => setRatesInfoOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
              <p>
                When enabled, the financial projection accounts for two opposing forces that are likely to play out over a 25-year system lifetime:
              </p>
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
                <div className="font-semibold text-emerald-800 mb-1">↑ Import tariffs rise at +3%/year</div>
                <p className="text-emerald-700 text-xs">
                  A conservative estimate based on historical Irish and European electricity price trends. As grid electricity becomes more expensive, the value of every kWh your system generates and uses on-site grows proportionally.
                </p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                <div className="font-semibold text-amber-800 mb-1">↓ Export tariffs decline from 2031</div>
                <p className="text-amber-700 text-xs">
                  Once solar penetration exceeds ~15% of grid capacity, everyone is exporting at the same time (midday summer). This collapses the wholesale value of daytime electricity — a pattern already observed in California, South Australia, and Germany. The projection steps the export rate down: 100% (≤2030) → 79% (2031) → 57% (2032) → 43% (2033+).
                </p>
              </div>
              <p className="text-xs text-slate-500">
                Net effect: rising self-consumption value typically outweighs falling export value over 25 years — but this varies significantly based on how much of your generation you export vs. use on-site.
              </p>
              <p className="text-xs text-slate-400">
                Toggle off to see a flat-rate projection using today's import and export rates for the full 25-year period.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 md:p-8">
        
        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 mb-8">
          <button
            onClick={() => setActiveTab('standard')}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'standard'
                ? 'border-emerald-700 text-emerald-800'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Standard Analysis
          </button>
          {tariffComparisonResults && tariffComparisonResults.length > 0 && (
            <button
              onClick={() => setActiveTab('tariff-comparison')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'tariff-comparison'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Tariff Comparison
              {marketResult && (
                <span className="ml-1.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full align-middle">+ Market</span>
              )}
            </button>
          )}
          {(
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'financial'
                  ? 'border-emerald-700 text-emerald-800'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              Financial Analysis
            </button>
          )}
        </div>

        {/* --- STANDARD ANALYSIS TAB --- */}
        {activeTab === 'standard' && activeResult && (
          <div className="animate-in fade-in duration-300">

            {/* Top Picks from the heat map */}
            {projectedSensitivity && (() => {
              const COLS = ['noBattery', 'halfBattery', 'fullBattery', 'doubleBattery'] as const;

              // Flatten every cell into a list with its row metadata
              type Cell = SensitivityVariant & { sizeKwp: number; genKwh: number };
              const cells: Cell[] = projectedSensitivity.rows.flatMap((row) =>
                COLS.map((c) => ({
                  ...row[c],
                  sizeKwp: row.systemSizeKwp,
                  genKwh: row.annualGenerationKwh,
                }))
              );

              // 1. Fastest payback — lowest equity / net-annual-cash-flow ratio.
              //    Denominator is year1NetCashFlow (savings minus loan payments) so loan repayments are
              //    correctly accounted for. Only consider cells where the investor actually recovers cash.
              const fastestPayback = cells
                .filter((c) => c.year1NetCashFlow > 0 && c.equityAmount > 0)
                .reduce<Cell | null>((best, c) => {
                  const pb = c.equityAmount / c.year1NetCashFlow;
                  const bestPb = best ? best.equityAmount / best.year1NetCashFlow : Infinity;
                  return pb < bestPb ? c : best;
                }, null);

              // 2. Best 10-year return — highest cumulative net cash at year 10
              const best10yr = cells.reduce<Cell | null>((best, c) =>
                !best || c.year10NetCashFlow > best.year10NetCashFlow ? c : best,
              null);

              // 3. Energy independence — configuration whose annual electricity savings (incl. export)
              //    land nearest to the original baseline bill, i.e. net bill closest to €0.
              //    Loan payments are irrelevant here — this is about energy cost, not financing.
              const originalBill = annualBill?.baseline ?? 0;
              const independence = originalBill > 0
                ? cells
                  .filter((c) => c.annualGenerationKwh > 0)
                  .reduce<Cell | null>((best, c) => {
                    const distC = Math.abs(originalBill - c.annualSavings);
                    const distBest = best ? Math.abs(originalBill - best.annualSavings) : Infinity;
                    return distC < distBest ? c : best;
                  }, null)
                : null;

              if (!fastestPayback && !best10yr && !independence) return null;

              const picks: Array<{
                cell: Cell;
                icon: string;
                title: string;
                value: string;
                tagline: string;
                accent: string;
                accentBg: string;
                accentBorder: string;
              }> = [];

              if (fastestPayback) {
                const pb = fastestPayback.equityAmount / fastestPayback.year1NetCashFlow;
                picks.push({
                  cell: fastestPayback,
                  icon: '⚡',
                  title: 'Fastest Payback',
                  value: `${pb.toFixed(1)} years`,
                  tagline: `Equity recovered in ${pb.toFixed(1)} years net of loan payments.`,
                  accent: 'text-amber-700',
                  accentBg: 'bg-amber-50',
                  accentBorder: 'border-amber-200',
                });
              }

              if (best10yr) {
                picks.push({
                  cell: best10yr,
                  icon: '📈',
                  title: 'Best 10-Year Return',
                  value: formatSignedCurrency(best10yr.year10NetCashFlow),
                  tagline: 'You make the most money over a decade.',
                  accent: 'text-emerald-700',
                  accentBg: 'bg-emerald-50',
                  accentBorder: 'border-emerald-200',
                });
              }

              if (independence) {
                const netBill = originalBill - independence.annualSavings;
                const netBillDisplay = netBill <= 0
                  ? `${formatCurrency(Math.abs(netBill))}/yr credit`
                  : `${formatCurrency(netBill)}/yr net bill`;
                const tagline = netBill <= 0
                  ? `Electricity effectively free — ${formatCurrency(Math.abs(netBill))}/yr export credit.`
                  : `Nearest to a zero electricity bill — ${formatCurrency(netBill)}/yr residual.`;
                picks.push({
                  cell: independence,
                  icon: '🏠',
                  title: 'Energy Independence',
                  value: netBillDisplay,
                  tagline,
                  accent: 'text-blue-700',
                  accentBg: 'bg-blue-50',
                  accentBorder: 'border-blue-200',
                });
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {picks.map((p) => (
                    <button
                      key={p.title}
                      type="button"
                      onClick={() => onSelectSimulation?.(p.cell.genKwh, p.cell.batterySizeKwh)}
                      className={`relative rounded-2xl border ${p.accentBorder} ${p.accentBg} p-6 text-left transition-all hover:shadow-md hover:brightness-[0.97] cursor-pointer group`}
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xl">{p.icon}</span>
                        <span className={`text-xs font-bold uppercase tracking-wider ${p.accent}`}>{p.title}</span>
                      </div>
                      <div className={`text-3xl font-bold ${p.accent} tabular-nums`}>{p.value}</div>
                      <p className="text-sm text-slate-600 mt-2 leading-relaxed">{p.tagline}</p>
                      <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
                        <span>{p.cell.sizeKwp.toFixed(1)} kWp · {p.cell.batterySizeKwh > 0 ? `${p.cell.batterySizeKwh.toFixed(1)} kWh battery` : 'No battery'}</span>
                        <span className={`font-semibold ${p.accent} opacity-0 group-hover:opacity-100 transition-opacity`}>
                          Simulate →
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              );
            })()}

            {/* 1. Energy Analytics Chart (Top) */}
            {activeResult.audit?.hourly && activeResult.audit.hourly.length > 0 && (
              <div className="mb-8">
                <EnergyAnalyticsChart hourlyData={activeResult.audit.hourly} year={analyticsYear} />
              </div>
            )}

            {/* Savings Breakdown Compact Section */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                 <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-1">
                   Total Annual Savings {config?.excludeVat && '(Ex. VAT)'}
                 </div>
                 <div className="text-2xl font-bold text-emerald-700">{formatCurrency(activeResult.annualSavings)}</div>
                 <div className="text-xs text-emerald-600/80 mt-1">Bill reduction + export credits (net)</div>
              </div>
              
              <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                 <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                   Solar Displacement {config?.excludeVat && '(Ex. VAT)'}
                 </div>
                 <div className="text-xl font-bold text-slate-700">{formatCurrency(activeResult.annualSolarToLoadSavings)}</div>
                 <div className="text-xs text-slate-400 mt-1">Direct to Load</div>
                 {solarYield > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-xs text-slate-400">Yield</span>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {formatPercentFraction(solarYield)}
                      </span>
                    </div>
                 )}
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                 <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                   Battery Displacement {config?.excludeVat && '(Ex. VAT)'}
                 </div>
                 <div className="text-xl font-bold text-slate-700">{formatCurrency(activeResult.annualBatteryToLoadSavings)}</div>
                 <div className="text-xs text-slate-400 mt-1">Stored & Discharged</div>
                 {batteryYield > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-50 flex justify-between items-center">
                      <span className="text-xs text-slate-400">Yield</span>
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {formatPercentFraction(batteryYield)}
                      </span>
                    </div>
                 )}
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-100 shadow-sm">
                 <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                   Export Credits {config?.excludeVat && '(Ex. VAT)'}
                 </div>
                 <div className="text-xl font-bold text-slate-700">{formatCurrency(activeResult.annualExportRevenue)}</div>
                 <div className="text-xs text-slate-400 mt-1">Feed-in / market value</div>
              </div>
            </div>

            {/* Bill Comparison Card */}
            {annualBill && (
              <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200 mb-8">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6">
                  Estimated Annual Electricity Bill (Net) {config?.excludeVat && '(Ex. VAT)'}
                </h3>
                <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">
                   <div className="text-center md:text-left">
                     <div className="text-sm font-medium text-slate-500 mb-1">Current Bill</div>
                     <div className="text-3xl md:text-4xl font-bold text-slate-700 tabular-nums">
                       {formatCurrency(annualBill.baseline)}
                     </div>
                     <div className="text-xs text-slate-400 mt-2">Before solar PV</div>
                   </div>
                   
                   <div className="flex-1 w-full md:w-auto relative h-12 flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t-2 border-slate-200 md:border-dashed"></div>
                      </div>
                      <div className="relative bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-sm font-bold border border-emerald-200 shadow-sm">
                        {(() => {
                          const savingsFraction = annualBill.baseline > 0 ? annualBill.savings / annualBill.baseline : 0;
                          const clamped = Math.min(1, Math.max(0, savingsFraction));
                          const pct = (clamped * 100).toFixed(0);
                          const suffix = savingsFraction > 1 ? '%+' : '%';
                          return `-${pct}${suffix}`;
                        })()}
                      </div>
                   </div>

                   <div className="text-center md:text-right">
                     <div className="text-sm font-medium text-slate-500 mb-1">Net Bill</div>
                     <div className={`text-3xl md:text-4xl font-bold tabular-nums ${
                       annualBill.netBill < 0 ? 'text-emerald-700' : 'text-emerald-600'
                     }`}>
                       {formatCurrency(Math.max(0, annualBill.netBill))}
                       {annualBill.netBill < 0 && (
                         <span className="ml-2 text-sm font-semibold text-emerald-700">
                           (€{Math.abs(annualBill.netBill).toFixed(0)} credit)
                         </span>
                       )}
                     </div>
                     <div className="text-xs text-emerald-600/70 mt-2">After solar PV (net of export credits)</div>
                   </div>
                </div>
              </div>
            )}

            {/* Monthly Before/After Table */}
            {activeResult.audit?.monthly && activeResult.audit.monthly.length === 12 && (
              <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">
                    Monthly Bill Comparison {config?.excludeVat && '(Ex. VAT)'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">After = import charges minus export credits (net). Export % = share of generation sent to grid (after on-site use and battery).</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-3">Month</th>
                        <th className="px-6 py-3 text-right">Before</th>
                        <th className="px-6 py-3 text-right">After (Net)</th>
                        <th className="px-6 py-3 text-right">Savings</th>
                        <th className="px-6 py-3 text-right">Export %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeResult.audit.monthly.map((m) => {
                        const monthName = new Date(2000, m.monthIndex, 1).toLocaleString('en-IE', { month: 'short' });
                        const baseline = m.baselineCost ?? 0;
                        const importCost = m.importCost ?? 0;
                        const exportRevenue = m.exportRevenue ?? 0;
                        // Net bill = Import cost - Export revenue (can be negative for credits)
                        const netBill = importCost - exportRevenue;
                        // Savings = Baseline - Net bill (total financial benefit)
                        const savings = baseline - netBill;
                        const exportRate = m.generation > 0 ? m.gridExport / m.generation : 0;
                        const isHighExport = exportRate > 0.3;
                        
                        return (
                          <tr key={m.monthIndex} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-3 font-medium text-slate-700">{monthName}</td>
                            <td className="px-6 py-3 text-right text-slate-600 tabular-nums">{formatCurrency(baseline)}</td>
                            <td className={`px-6 py-3 text-right tabular-nums font-medium ${
                              netBill < 0 ? 'text-emerald-700' : 'text-emerald-600'
                            }`}>
                              {formatCurrency(Math.max(0, netBill))}
                              {netBill < 0 && <span className="ml-1 text-xs">(€{Math.abs(netBill).toFixed(0)} credit)</span>}
                            </td>
                            <td className="px-6 py-3 text-right text-emerald-600 tabular-nums font-medium">
                              {formatCurrency(savings)}
                            </td>
                            <td className={`px-6 py-3 text-right tabular-nums font-medium ${
                              isHighExport ? 'text-amber-600' : 'text-slate-600'
                            }`}>
                              {formatPercentFraction(exportRate)}
                              {isHighExport && <span className="ml-1 text-xs">⚠️</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {annualBill && (
                      <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                        <tr>
                          <td className="px-6 py-4 text-slate-800">Total</td>
                          <td className="px-6 py-4 text-right text-slate-700 tabular-nums">{formatCurrency(annualBill.baseline)}</td>
                          <td className={`px-6 py-4 text-right tabular-nums ${
                            annualBill.netBill < 0 ? 'text-emerald-800' : 'text-emerald-700'
                          }`}>
                            {formatCurrency(Math.max(0, annualBill.netBill))}
                            {annualBill.netBill < 0 && (
                              <span className="ml-1 text-xs">(€{Math.abs(annualBill.netBill).toFixed(0)} credit)</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right text-emerald-700 tabular-nums">{formatCurrency(annualBill.savings)}</td>
                          <td className="px-6 py-4 text-right text-slate-700 tabular-nums">
                            {formatPercentFraction(activeResult.annualExport / (activeResult.annualGeneration || 1))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            {/* Solar Sizing Sensitivity — Heat-Map Grid */}
            {activeResult && projectedSensitivity && (() => {
              const sens = projectedSensitivity;
              const currentBattery = config?.batterySizeKwh ?? 0;

              const COLUMNS: Array<{
                key: 'noBattery' | 'halfBattery' | 'fullBattery' | 'doubleBattery';
                label: string;
                factorLabel: string;
              }> = [
                { key: 'noBattery',     label: 'No Battery',    factorLabel: '0×' },
                { key: 'halfBattery',   label: '½ Battery',     factorLabel: '0.5×' },
                { key: 'fullBattery',   label: 'Full Battery',  factorLabel: '1×' },
                { key: 'doubleBattery', label: '2× Battery',    factorLabel: '2×' },
              ];

              // Linear IRR colour: worst (red) → best (green) using min/max across grid
              const allIrrs = sens.rows.flatMap((r) => COLUMNS.map((c) => r[c.key].irr)).filter(Number.isFinite);
              const irrMin = allIrrs.length ? Math.min(...allIrrs) : 0;
              const irrMax = allIrrs.length ? Math.max(...allIrrs) : 0.25;
              const irrRange = Math.max(irrMax - irrMin, 0.01);

              const irrColour = (irr: number) => {
                if (!Number.isFinite(irr)) return { bg: 'bg-slate-100', text: 'text-slate-400', border: 'border-slate-200', style: {} as React.CSSProperties };
                const t = Math.max(0, Math.min(1, (irr - irrMin) / irrRange));
                const hue = 120 * t; // 0 = red, 120 = green
                return {
                  bg: '',
                  text: 'text-slate-800',
                  border: 'border-slate-200',
                  style: {
                    backgroundColor: `hsl(${hue}, 70%, 94%)`,
                    borderColor: `hsl(${hue}, 50%, 85%)`
                  }
                };
              };

              const formatIrr = (irr: number) =>
                Number.isFinite(irr) ? `${(irr * 100).toFixed(1)}%` : 'N/A';

              return (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-8">
                  {/* Header */}
                  <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">
                      Solar &amp; Battery Sizing — IRR Heat Map
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      25-year IRR on equity · Yr1 and yr10 cash flow · Click any cell to re-run that configuration
                    </p>
                  </div>

                  <div className="overflow-x-auto">
                    {/* Column headers */}
                    <div className="grid grid-cols-[180px_repeat(4,1fr)] min-w-[640px]">
                      <div className="px-4 py-3 bg-slate-50 border-b border-r border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-end">
                        Solar size
                      </div>
                      {COLUMNS.map((col) => (
                        <div
                          key={col.key}
                          className="px-3 py-3 bg-slate-50 border-b border-r border-slate-100 text-center last:border-r-0"
                        >
                          <div className="text-xs font-semibold text-slate-700">{col.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{col.factorLabel} battery</div>
                        </div>
                      ))}

                      {/* Data rows */}
                      {sens.rows.map((row) => {
                        const isSolarCurrent = Math.abs(row.scaleFactor - 1.0) < 0.01;

                        return [
                          // Row label cell
                          <div
                            key={`label-${row.scaleFactor}`}
                            className={`px-4 py-3 border-b border-r border-slate-100 flex flex-col justify-center ${
                              isSolarCurrent ? 'bg-indigo-50/40' : 'bg-white'
                            }`}
                          >
                            <span className="text-sm font-semibold text-slate-800 tabular-nums">
                              {row.systemSizeKwp.toFixed(1)} kWp
                            </span>
                            <span className="text-xs text-slate-500 tabular-nums">
                              {formatNumber(row.annualGenerationKwh)} kWh/yr
                            </span>
                            {isSolarCurrent && (
                              <span className="mt-1 text-[10px] font-medium text-indigo-600 bg-indigo-100 rounded px-1.5 py-0.5 self-start">
                                Current size
                              </span>
                            )}
                          </div>,

                          // Four battery variant cells
                          ...COLUMNS.map((col) => {
                            const v = row[col.key];
                            const isBatteryCurrent =
                              isSolarCurrent &&
                              Math.abs(v.batterySizeKwh - currentBattery) < 0.5 &&
                              v.batteryFactor === (currentBattery > 0 ? 1.0 : 0);
                            const colours = irrColour(v.irr);
                            const isClickable = !isBatteryCurrent;

                            return (
                              <div
                                key={`${row.scaleFactor}-${col.key}`}
                                onClick={() =>
                                  isClickable &&
                                  onSelectSimulation?.(row.annualGenerationKwh, v.batterySizeKwh)
                                }
                                className={[
                                  'px-3 py-3 border-b border-r border-slate-100 last:border-r-0 flex flex-col items-center justify-center text-center transition-all',
                                  colours.bg || '',
                                  isClickable
                                    ? 'cursor-pointer hover:brightness-95 hover:shadow-inner'
                                    : 'cursor-default',
                                  isBatteryCurrent
                                    ? 'ring-2 ring-inset ring-indigo-400'
                                    : '',
                                ].join(' ')}
                                style={colours.style}
                              >
                                {/* IRR — value and label on same line */}
                                <div className={`flex items-baseline gap-1 leading-none ${colours.text}`}>
                                  <span className="text-sm font-semibold tabular-nums">
                                    {formatIrr(v.irr)}
                                  </span>
                                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">IRR</span>
                                </div>

                                {/* Yr10 cumulative */}
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className={`text-xs tabular-nums font-medium ${v.year10NetCashFlow >= 0 ? 'text-slate-600' : 'text-rose-500'}`}>
                                    {formatSignedCurrency(v.year10NetCashFlow)}
                                  </span>
                                  <span className="text-[10px] text-slate-400">yr10</span>
                                </div>

                                {/* Export % — share of generation exported to grid */}
                                <div className="flex items-baseline gap-1 mt-0.5">
                                  <span className={`text-[10px] tabular-nums font-medium ${v.spillageFraction > 0.3 ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {(v.spillageFraction * 100).toFixed(0)}%
                                  </span>
                                  <span className="text-[10px] text-slate-400">export</span>
                                </div>

                                {/* Export-limited hours */}
                                {v.exportCurtailedHours > 0 && (
                                  <div className="flex items-baseline gap-1 mt-0.5">
                                    <span className={`text-[10px] tabular-nums font-medium ${v.exportCurtailedHours > 500 ? 'text-rose-600' : v.exportCurtailedHours > 100 ? 'text-amber-600' : 'text-slate-400'}`}>
                                      {v.exportCurtailedHours}h
                                    </span>
                                    <span className="text-[10px] text-slate-400">cap-limited</span>
                                  </div>
                                )}

                                {/* Battery size */}
                                {v.batterySizeKwh > 0 && (
                                  <span className="text-[10px] text-slate-400 mt-0.5">
                                    {v.batterySizeKwh.toFixed(1)} kWh
                                  </span>
                                )}

                                {/* Active badge */}
                                {isBatteryCurrent && (
                                  <span className="mt-1.5 text-[10px] font-semibold text-indigo-600 bg-indigo-100 rounded px-1.5 py-0.5">
                                    Running
                                  </span>
                                )}
                              </div>
                            );
                          }),
                        ];
                      })}
                    </div>
                  </div>

                  <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-3">
                    <span>{sens.note}</span>
                    {applyFutureRateChanges && (
                      <span className="ml-auto shrink-0 text-amber-600 font-medium">↑ import +3%/yr · ↓ export declining from 2031</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Legacy Solar Spillage Sensitivity Analysis (Fallback) */}
            {activeResult && !activeResult.sensitivityAnalysis && activeResult.solarSpillageAnalysis && (
              <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">Solar Sizing Sensitivity</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click a row to simulate that system size.
                    </p>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="px-6 py-3">PV Size (Annual kWh)</th>
                        <th className="px-6 py-3 text-right">Scale Factor</th>
                        <th className="px-6 py-3 text-right">Exported</th>
                        <th className="px-6 py-3 text-right">Export %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeResult.solarSpillageAnalysis.curve.map((p) => {
                        const isCurrent = Math.abs(p.scaleFactor - 1.0) < 0.01;
                        const isHighExport = p.spillageFraction > 0.3;
                        
                        return (
                          <tr 
                            key={p.scaleFactor} 
                            onClick={() => !isCurrent && onSelectSimulation?.(p.annualGenerationKwh)}
                            className={`transition-colors ${
                              isCurrent 
                                ? 'bg-slate-50/80 font-medium cursor-default' 
                                : 'hover:bg-emerald-50 cursor-pointer group'
                            }`}
                          >
                            <td className="px-6 py-3 tabular-nums text-slate-700 group-hover:text-emerald-800">
                              {formatNumber(p.annualGenerationKwh)}
                              {isCurrent && <span className="ml-2 text-xs font-normal text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Current</span>}
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums text-slate-600">{p.scaleFactor.toFixed(2)}×</td>
                            <td className="px-6 py-3 text-right tabular-nums text-slate-600">{formatNumber(p.exportKwh)} kWh</td>
                            <td className={`px-6 py-3 text-right tabular-nums font-medium ${isHighExport ? 'text-amber-600' : 'text-slate-700'}`}>
                              {formatPercentFraction(p.spillageFraction)}
                              {isHighExport && <span className="ml-2 text-xs font-normal text-amber-600">⚠️</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- TARIFF COMPARISON TAB --- */}
        {activeTab === 'tariff-comparison' && tariffComparisonResults && tariffComparisonResults.length > 0 && (
          <div className="animate-in fade-in duration-300">
            <TariffComparisonTab
              rows={projectedTariffRows ?? tariffComparisonResults}
              activeTariffId={tariff?.id}
              marketResult={projectedMarketResult ?? marketResult}
              excludeVat={config?.excludeVat}
            />
            {/* Market Analysis chart (if market data available) */}
            {marketResult?.audit?.hourly && marketResult.audit.hourly.length > 0 && (
              <div className="mt-10">
                <h3 className="text-base font-semibold text-slate-700 mb-4">Market Rate — Hourly Price Analysis</h3>
                <MarketAnalysis hourlyData={marketResult.audit.hourly} year={analyticsYear} />
              </div>
            )}
          </div>
        )}

        {/* --- FINANCIAL TAB --- */}
        {activeTab === 'financial' && standardResult && financialProjection && (() => {
          const proj = financialProjection.active;
          const flatProj = financialProjection.flat;
          const projCashFlows = proj.cashFlows;
          const lastCf = projCashFlows[projCashFlows.length - 1];
          const totalSavings = projCashFlows.reduce((s, cf) => s + cf.savings, 0);
          const flatTotalSavings = flatProj.cashFlows.reduce((s, cf) => s + cf.savings, 0);

          return (
          <div className="animate-in fade-in duration-300">
            {/* Active projection mode indicator */}
            <div className="flex items-center gap-3 mb-6">
              {applyFutureRateChanges ? (
                <>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-100 text-amber-800 px-3 py-1 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                    Future rates applied
                  </span>
                  <span className="text-xs text-slate-400">↑ Import +3%/yr · ↓ Export declining from 2031</span>
                  <span className={`text-xs font-semibold ml-auto ${totalSavings >= flatTotalSavings ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {formatCurrency(Math.abs(totalSavings - flatTotalSavings))} {totalSavings >= flatTotalSavings ? 'more' : 'less'} than flat-rate over 25 years
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-100 text-slate-500 px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
                  Flat rates — today's import and export prices held constant
                </span>
              )}
            </div>

            {/* Financial Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {/* Investment Card */}
              <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Investment</h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-slate-500">System Cost</div>
                    <div className="text-2xl font-bold text-slate-700">{formatCurrency(standardResult.systemCost)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">After Grants</div>
                    <div className="text-lg font-semibold text-emerald-600">{formatCurrency(standardResult.netCost)}</div>
                  </div>
                  {(standardResult.year1TaxSavings ?? 0) > 0 && (
                    <div>
                      <div className="text-xs text-slate-500">Tax Relief (Year 1)</div>
                      <div className="text-sm font-medium text-emerald-600">{formatCurrency(standardResult.year1TaxSavings ?? 0)}</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Returns Card */}
              <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-200">
                <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-4">Returns</h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs text-emerald-600">Annual Savings (Year 1)</div>
                    <div className="text-2xl font-bold text-emerald-700">{formatCurrency(proj.annualSavings)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-emerald-600">25-Year Total</div>
                    <div className="text-lg font-semibold text-emerald-700">
                      {formatCurrency(totalSavings)}
                    </div>
                    {applyFutureRateChanges && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        vs {formatCurrency(flatTotalSavings)} flat-rate
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-emerald-600">Payback Period</div>
                    <div className="text-lg font-semibold text-emerald-700">
                      {Number.isFinite(proj.simplePayback) ? `${proj.simplePayback.toFixed(1)} years` : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Advanced Metrics Card */}
              <div className="rounded-xl p-6 border" style={{ background: '#ECFDF5', borderColor: 'rgba(22,101,52,0.2)' }}>
                <h3 className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: '#1E8A5E' }}>Advanced Metrics</h3>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs" style={{ color: '#1E8A5E' }}>Internal Rate of Return</div>
                    <div className="text-2xl font-bold" style={{ color: '#0D4027' }}>
                      {Number.isFinite(proj.irr) ? `${(proj.irr * 100).toFixed(1)}%` : 'N/A'}
                    </div>
                    {applyFutureRateChanges && Number.isFinite(flatProj.irr) && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        vs {(flatProj.irr * 100).toFixed(1)}% flat-rate
                      </div>
                    )}
                    <div className="text-[10px] mt-1" style={{ color: '#4ADE80', filter: 'brightness(0.7)' }}>25-year IRR</div>
                  </div>
                  <div>
                    <div className="text-xs" style={{ color: '#1E8A5E' }}>Net Present Value</div>
                    <div className="text-lg font-semibold" style={{ color: '#0D4027' }}>{formatCurrency(proj.npv)}</div>
                    {applyFutureRateChanges && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        vs {formatCurrency(flatProj.npv)} flat-rate
                      </div>
                    )}
                    <div className="text-[10px] mt-1 text-emerald-700">@ 5% discount rate</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Savings Breakdown Chart */}
            <SavingsBreakdownChart
              cashFlows={projCashFlows}
              hasBattery={(activeResult?.annualBatteryToLoadSavings ?? 0) > 0}
              applyFutureRateChanges={applyFutureRateChanges}
            />

            {/* Cash Flow Timeline */}
            <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                <h3 className="text-sm font-bold tracking-wider text-slate-500 uppercase">25-Year Cash Flow</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {applyFutureRateChanges
                    ? 'Import +3%/yr · Export declining from 2031 · Solar degradation 0.5%/yr'
                    : 'Flat rates · Solar degradation 0.5%/yr'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Net cash flow = Savings − Loan repayment.</p>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="px-4 py-2 text-left">Year</th>
                        <th className="px-4 py-2 text-right">Generation (kWh)</th>
                        <th className="px-4 py-2 text-right">Savings</th>
                        <th className="px-4 py-2 text-right">Loan repayment</th>
                        <th className="px-4 py-2 text-right">Net Cash Flow</th>
                        <th className="px-4 py-2 text-right">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {projCashFlows.slice(0, 10).map((cf) => (
                        <tr key={cf.year} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 font-medium text-slate-700">Year {cf.year}</td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{formatNumber(cf.generation)}</td>
                          <td className="px-4 py-2 text-right text-emerald-600 tabular-nums font-medium">{formatCurrency(cf.savings)}</td>
                          <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{formatCurrency(cf.loanPayment)}</td>
                          <td className={`px-4 py-2 text-right tabular-nums font-medium ${
                            cf.netCashFlow >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}>
                            {formatSignedCurrency(cf.netCashFlow)}
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums font-bold ${
                            cf.cumulativeCashFlow >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}>
                            {formatSignedCurrency(cf.cumulativeCashFlow)}
                          </td>
                        </tr>
                      ))}
                      {projCashFlows.length > 10 && (
                        <tr className="bg-slate-50">
                          <td colSpan={6} className="px-4 py-2 text-center text-xs text-slate-400">
                            ... showing first 10 years of 25 ...
                          </td>
                        </tr>
                      )}
                      {lastCf && (
                      <tr className="bg-slate-50 font-bold border-t-2 border-slate-200">
                        <td className="px-4 py-3 text-slate-800">Final (Year 25)</td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          {formatNumber(lastCf.generation)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">
                          {formatCurrency(lastCf.savings)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                          {formatCurrency(lastCf.loanPayment)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-700 tabular-nums">
                          {formatSignedCurrency(lastCf.netCashFlow)}
                        </td>
                        <td className="px-4 py-3 text-right text-emerald-800 tabular-nums">
                          {formatSignedCurrency(lastCf.cumulativeCashFlow)}
                        </td>
                      </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Key Assumptions */}
            <div className="bg-slate-50 rounded-xl p-6 border border-slate-200">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Assumptions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-slate-500">Analysis Period:</span>
                  <span className="ml-2 font-semibold text-slate-700">25 years</span>
                </div>
                <div>
                  <span className="text-slate-500">Discount Rate:</span>
                  <span className="ml-2 font-semibold text-slate-700">5% per annum</span>
                </div>
                <div>
                  <span className="text-slate-500">Solar Degradation:</span>
                  <span className="ml-2 font-semibold text-slate-700">0.5% per year</span>
                </div>
                <div>
                  <span className="text-slate-500">Import Escalation:</span>
                  <span className={`ml-2 font-semibold ${applyFutureRateChanges ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {applyFutureRateChanges ? '+3% per year' : 'Not applied'}
                  </span>
                </div>
                <div className="col-span-full pt-2 border-t border-slate-200 mt-1">
                  <span className="text-slate-500">Export Rate:</span>
                  <span className={`ml-2 font-semibold ${applyFutureRateChanges ? 'text-amber-700' : 'text-slate-400'}`}>
                    {applyFutureRateChanges
                      ? 'Flat to 2030 → 79% in 2031 → 57% in 2032 → 43% from 2033'
                      : 'Flat (not applied)'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          );
        })()}

        <InputsUsedPanel inputsUsed={activeResult?.inputsUsed} diagnostics={activeResult?.diagnostics} />

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div>
            {activeResult && activeResult.audit ? (
              <button
                type="button"
                className="text-sm font-medium text-slate-500 hover:text-tines-purple transition-colors"
                onClick={() => setAuditOpen(true)}
              >
                Open detailed auditor view
              </button>
            ) : (
              <span className="text-xs text-slate-400">Auditor view unavailable (no hourly data)</span>
            )}
          </div>

          <div className="flex gap-4 flex-wrap">
            {!isReadOnly && onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
                Edit Inputs
              </button>
            )}
            
            {!isReadOnly && onSaveReport && (
              <button
                onClick={() => setSaveModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                </svg>
                Save As...
              </button>
            )}

            {onShare && (
              <button
                onClick={async () => {
                  setShareState('sharing');
                  try {
                    await onShare();
                    setShareState('copied');
                    setTimeout(() => setShareState('idle'), 3000);
                  } catch {
                    setShareState('error');
                    setTimeout(() => setShareState('idle'), 3000);
                  }
                }}
                disabled={shareState === 'sharing'}
                className="inline-flex items-center gap-2 rounded-lg border border-green-600 bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {shareState === 'sharing' && (
                  <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
                {shareState === 'copied' && (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
                {shareState === 'idle' || shareState === 'error' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185z" />
                  </svg>
                ) : null}
                {shareState === 'idle' && 'Share Report'}
                {shareState === 'sharing' && 'Saving…'}
                {shareState === 'copied' && 'Link copied!'}
                {shareState === 'error' && 'Share failed'}
              </button>
            )}

            {!isReadOnly && (
              <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2 opacity-50 cursor-not-allowed" disabled title="PDF export coming soon">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export Report
              </button>
            )}
          </div>
        </div>

        {auditOpen && activeResult && activeResult.audit && (
          <AuditModal 
            audit={activeResult.audit} 
            onClose={() => setAuditOpen(false)} 
            excludeVat={config?.excludeVat}
          />
        )}
        
        <SaveReportModal
          isOpen={saveModalOpen}
          existingNames={existingReportNames}
          onCancel={() => setSaveModalOpen(false)}
          onSave={(name) => {
            onSaveReport?.(name);
            setSaveModalOpen(false);
          }}
        />
      </div>
    </section>
  );
}
