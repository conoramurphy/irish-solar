import { applyDegradation } from '../models/solar';
import { calculateIRR, calculateNPV } from '../models/financial';

/**
 * Projected export rate decline schedule.
 *
 * Models the effect of rising solar penetration on export tariffs.
 * Once grid-level solar penetration exceeds ~15%, midday wholesale prices
 * collapse (observed in California, Australia, Germany) and export tariffs
 * follow. The schedule below reflects a conservative step-down from the
 * current Irish MSS rate, stabilising at a floor consistent with marginal
 * wholesale value of daytime solar.
 *
 * Returns a multiplier (0–1) to apply to Year 1 export revenue.
 */
export function getExportRateMultiplier(calendarYear: number): number {
  if (calendarYear <= 2030) return 1.0;
  if (calendarYear === 2031) return 11 / 14;
  if (calendarYear === 2032) return 8 / 14;
  return 6 / 14; // 2033+
}

export interface CashFlowRow {
  year: number;
  generation: number;
  savings: number;
  loanPayment: number;
  netCashFlow: number;
  cumulativeCashFlow: number;
}

export interface ProjectionResult {
  cashFlows: CashFlowRow[];
  /** Years until cumulative cash flow recovers the full system cost (after grants & tax relief). */
  simplePayback: number;
  npv: number;
  irr: number;
  annualSavings: number;
}

export interface ProjectionInputs {
  year1OperationalSavings: number;
  year1ExportRevenue: number;
  year1TaxSavings: number;
  baseGeneration: number;
  annualLoanPayment: number;
  loanTermYears: number;
  equityAmount: number;
  effectiveNetCost: number;
  analysisYears?: number;
  /**
   * When true, applies both:
   * - Import tariff escalation at IMPORT_ESCALATION_RATE per year (avoided-cost savings grow)
   * - Export rate step-down from 2031 per the solar-saturation schedule
   */
  applyFutureRateChanges: boolean;
  baseCalendarYear: number;
}

/** Conservative historical electricity price inflation rate (per year). */
export const IMPORT_ESCALATION_RATE = 0.03;

/**
 * Project 25-year cash flows from Year 1 results.
 *
 * When `applyFutureRateChanges` is true:
 * - Self-consumption savings (avoided import cost) compound at IMPORT_ESCALATION_RATE/year
 * - Export revenue steps down from 2031 per the solar-market-saturation schedule
 *
 * When false, both components only decline due to panel degradation (0.5%/year).
 */
export function projectCashFlows(inputs: ProjectionInputs): ProjectionResult {
  const {
    year1OperationalSavings,
    year1ExportRevenue,
    year1TaxSavings,
    baseGeneration,
    annualLoanPayment,
    loanTermYears,
    effectiveNetCost,
    analysisYears = 25,
    applyFutureRateChanges,
    baseCalendarYear,
  } = inputs;

  const year1NonExportSavings = year1OperationalSavings - year1ExportRevenue;
  const cashFlows: CashFlowRow[] = [];
  let cumulativeCashFlow = -effectiveNetCost;

  for (let year = 1; year <= analysisYears; year++) {
    const degradationFactor = applyDegradation(1, year - 1);
    const yearGeneration = baseGeneration * degradationFactor;

    const calendarYear = baseCalendarYear + year - 1;

    // Import-rate savings grow with tariff escalation (avoided cost rises as grid prices rise)
    const importEscalation = applyFutureRateChanges
      ? Math.pow(1 + IMPORT_ESCALATION_RATE, year - 1)
      : 1.0;

    // Export revenue shrinks as high solar penetration compresses midday wholesale prices
    const exportMultiplier = applyFutureRateChanges
      ? getExportRateMultiplier(calendarYear)
      : 1.0;

    const yearExportRevenue = year1ExportRevenue * degradationFactor * exportMultiplier;
    const yearNonExportSavings = year1NonExportSavings * degradationFactor * importEscalation;
    const yearOperationalSavings = yearNonExportSavings + yearExportRevenue;

    const yearTotalSavings = yearOperationalSavings + (year === 1 ? year1TaxSavings : 0);
    const loanPayment = year <= loanTermYears ? annualLoanPayment : 0;
    const netCashFlow = yearTotalSavings - loanPayment;
    cumulativeCashFlow += netCashFlow;

    cashFlows.push({
      year,
      generation: yearGeneration,
      savings: yearOperationalSavings,
      loanPayment,
      netCashFlow,
      cumulativeCashFlow,
    });
  }

  const annualCashFlows = cashFlows.map((cf) => cf.netCashFlow);
  const annualSavings = cashFlows[0]?.savings ?? 0;

  // Payback = year when cumulative cash flow crosses zero (system has paid for itself).
  // Uses linear interpolation within the crossover year for fractional precision.
  let simplePayback = Infinity;
  for (let i = 0; i < cashFlows.length; i++) {
    if (cashFlows[i].cumulativeCashFlow >= 0) {
      if (i === 0) {
        simplePayback = cashFlows[i].year;
      } else {
        const prevCum = cashFlows[i - 1].cumulativeCashFlow;
        const curCum = cashFlows[i].cumulativeCashFlow;
        const fraction = -prevCum / (curCum - prevCum);
        simplePayback = cashFlows[i - 1].year + fraction;
      }
      break;
    }
  }

  const npv = calculateNPV(effectiveNetCost, annualCashFlows, 0.05);
  const irr = calculateIRR(effectiveNetCost, annualCashFlows);

  return { cashFlows, simplePayback, npv, irr, annualSavings };
}
