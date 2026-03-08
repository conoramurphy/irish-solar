import { applyDegradation } from '../models/solar';
import { calculateIRR, calculateNPV, calculateSimplePayback } from '../models/financial';

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
  applyExportRateDecline: boolean;
  baseCalendarYear: number;
}

/**
 * Project 25-year cash flows from Year 1 results.
 *
 * When `applyExportRateDecline` is true, the export-revenue component of
 * annual savings is scaled down according to the projected export rate
 * schedule for the corresponding calendar year, while self-consumption
 * savings (avoided import costs) are unaffected.
 */
export function projectCashFlows(inputs: ProjectionInputs): ProjectionResult {
  const {
    year1OperationalSavings,
    year1ExportRevenue,
    year1TaxSavings,
    baseGeneration,
    annualLoanPayment,
    loanTermYears,
    equityAmount,
    effectiveNetCost,
    analysisYears = 25,
    applyExportRateDecline,
    baseCalendarYear,
  } = inputs;

  const year1NonExportSavings = year1OperationalSavings - year1ExportRevenue;
  const cashFlows: CashFlowRow[] = [];
  let cumulativeCashFlow = -equityAmount;

  for (let year = 1; year <= analysisYears; year++) {
    const degradationFactor = applyDegradation(1, year - 1);
    const yearGeneration = baseGeneration * degradationFactor;

    const calendarYear = baseCalendarYear + year - 1;
    const exportMultiplier = applyExportRateDecline
      ? getExportRateMultiplier(calendarYear)
      : 1.0;

    const yearExportRevenue = year1ExportRevenue * degradationFactor * exportMultiplier;
    const yearNonExportSavings = year1NonExportSavings * degradationFactor;
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
  const simplePayback = calculateSimplePayback(effectiveNetCost, annualSavings);
  const npv = calculateNPV(equityAmount, annualCashFlows, 0.05);
  const irr = calculateIRR(equityAmount, annualCashFlows);

  return { cashFlows, simplePayback, npv, irr, annualSavings };
}
