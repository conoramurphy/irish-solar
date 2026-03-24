/**
 * Heat pump scenario billing layer.
 *
 * For non-solar steps: calculates annual electricity cost directly from the HP
 * electricity profile × real tariff rates, without needing solar data.
 *
 * For solar steps: delegates to the existing runCalculation() engine with the
 * HP profile as hourlyConsumptionOverride, so the full solar dispatch + battery
 * arbitrage + tariff billing runs exactly as it does in the main wizard.
 */

import type { Tariff } from '../types';
import type { ParsedSolarData } from './solarTimeseriesParser';
import { getTariffRateForHour } from './tariffRate';
import { runCalculation } from './calculations';
import type { ScenarioStep, SolarMaxResult } from './heatPumpScenarios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioBillingResult {
  stepId: string;
  /** Total HP electricity consumed (kWh/year) */
  annualHpElecKwh: number;
  /**
   * Annual total electricity bill (€/year) including standing charge.
   * For solar steps, this is after solar/battery savings.
   */
  annualBillEur: number;
  /** Annual solar generation self-consumed (kWh) — 0 for non-solar steps */
  annualSelfConsumptionKwh: number;
  /** Annual export revenue (€) — 0 for non-solar steps */
  annualExportRevenueEur: number;
}

export interface WaterfallBillingResults {
  gasBaselineBillEur: number;
  steps: ScenarioBillingResult[];
  solarMax: ScenarioBillingResult;
}

// ---------------------------------------------------------------------------
// Non-solar billing (direct tariff calculation)
// ---------------------------------------------------------------------------

/**
 * Calculates annual electricity cost for an HP profile against a tariff,
 * without any solar generation.
 *
 * Uses getTariffRateForHour() — the same function used by the main simulation engine.
 */
export function calculateDirectHpBill(
  hpProfileKwh: number[],
  tariff: Tariff,
): ScenarioBillingResult & { stepId: string } {
  const isLeap = hpProfileKwh.length === 17664;
  const slotsPerDay = 48;

  let annualHpElecKwh = 0;
  let annualEnergyCostEur = 0;

  for (let slot = 0; slot < hpProfileKwh.length; slot++) {
    const kWh = hpProfileKwh[slot];
    annualHpElecKwh += kWh;

    // Half-hourly slot → hour of day (0–23) for tariff rate lookup
    const hourOfDay = Math.floor((slot % slotsPerDay) / 2);
    // Day of week: approximate from slot index (0=Mon assumption is fine for annual average)
    const dayOfWeek = Math.floor(slot / slotsPerDay) % 7;

    const ratePerKwh = getTariffRateForHour(hourOfDay, tariff, dayOfWeek);
    annualEnergyCostEur += kWh * ratePerKwh;
  }

  const daysInYear = isLeap ? 366 : 365;
  const standingChargeEur = tariff.standingCharge * daysInYear;

  return {
    stepId: '',
    annualHpElecKwh,
    annualBillEur: annualEnergyCostEur + standingChargeEur,
    annualSelfConsumptionKwh: 0,
    annualExportRevenueEur: 0,
  };
}

// ---------------------------------------------------------------------------
// Solar-step billing (full simulation engine)
// ---------------------------------------------------------------------------

/** Approximate annual solar yield (kWh/kWp) for Ireland — conservative estimate */
const IRELAND_SOLAR_YIELD_KWH_PER_KWP = 950;

/**
 * Runs a solar scenario through the existing runCalculation() engine.
 * Returns annual bill after solar + battery savings.
 */
function calculateSolarHpBill(
  hpProfileKwh: number[],
  solarKwp: number,
  batteryKwh: number,
  tariff: Tariff,
  solarData: ParsedSolarData,
): Omit<ScenarioBillingResult, 'stepId'> {
  const annualProductionKwh = solarKwp * IRELAND_SOLAR_YIELD_KWH_PER_KWP;

  const result = runCalculation(
    {
      annualProductionKwh,
      systemSizeKwp: solarKwp,
      batterySizeKwh: batteryKwh,
      installationCost: 0, // not needed for billing
      location: 'Dublin',  // location affects solar yield scaling, not tariff
      businessType: 'house',
    },
    [], // no grants needed for billing
    { equity: 0, interestRate: 0, termYears: 0 },
    tariff,
    { enabled: false },
    {},
    [],
    1, // single year
    undefined,
    solarData,
    undefined,
    hpProfileKwh,
  );

  const annualHpElecKwh = hpProfileKwh.reduce((a, b) => a + b, 0);

  return {
    annualHpElecKwh,
    annualBillEur: result.annualSavings > 0
      ? (annualHpElecKwh * getAverageRatePerKwh(tariff)) - result.annualSavings + (tariff.standingCharge * 365)
      : annualHpElecKwh * getAverageRatePerKwh(tariff) + tariff.standingCharge * 365,
    annualSelfConsumptionKwh: result.annualSelfConsumption,
    annualExportRevenueEur: result.annualExportRevenue ?? 0,
  };
}

/** Weighted average tariff rate across a typical day (approximation for solar step billing) */
function getAverageRatePerKwh(tariff: Tariff): number {
  let total = 0;
  for (let h = 0; h < 24; h++) {
    total += getTariffRateForHour(h, tariff);
  }
  return total / 24;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Calculates billing results for all waterfall steps and the solar max scenario.
 *
 * Non-solar steps are calculated directly (fast, no async needed).
 * Solar steps use the full simulation engine (requires solarData).
 *
 * @param steps        - Waterfall scenario steps from buildWaterfallScenarios()
 * @param solarMaxStep - Solar maximalist scenario from buildSolarMaxScenario()
 * @param tariff       - Selected domestic tariff
 * @param solarData    - Solar timeseries data (required for solar steps, can be null for non-solar-only)
 * @param gasBaselineBillEur - Pre-computed gas baseline from estimateFuelBaseline()
 */
export function calculateAllScenarioBills(
  steps: ScenarioStep[],
  solarMaxStep: SolarMaxResult,
  tariff: Tariff,
  solarData: ParsedSolarData | null,
  gasBaselineBillEur: number,
): WaterfallBillingResults {
  const stepResults: ScenarioBillingResult[] = steps.map((step) => {
    if (step.solarKwp > 0 && solarData) {
      return {
        stepId: step.id,
        ...calculateSolarHpBill(
          step.hpProfileKwh,
          step.solarKwp,
          step.batteryKwh,
          tariff,
          solarData,
        ),
      };
    }
    return {
      ...calculateDirectHpBill(step.hpProfileKwh, tariff),
      stepId: step.id,
    };
  });

  const solarMaxBilling: ScenarioBillingResult = solarData
    ? {
        stepId: solarMaxStep.id,
        ...calculateSolarHpBill(
          solarMaxStep.hpProfileKwh,
          solarMaxStep.solarKwp,
          solarMaxStep.batteryKwh,
          tariff,
          solarData,
        ),
      }
    : {
        ...calculateDirectHpBill(solarMaxStep.hpProfileKwh, tariff),
        stepId: solarMaxStep.id,
      };

  return {
    gasBaselineBillEur,
    steps: stepResults,
    solarMax: solarMaxBilling,
  };
}
