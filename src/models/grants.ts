import type { BusinessType, Grant } from '../types';

/**
 * Grants model.
 *
 * Current assumption: grants are additive and each grant is capped independently.
 * If future policy implies mutually-exclusive grants, enforce it here (and update tests).
 */

export interface GrantCalculationContext {
  /** Installed DC capacity (kWp). Required for some SEAI/TAMS schemes. */
  systemSizeKwp?: number;
  /** Annual electricity consumption (kWh). Used by TAMS SCIS to cap eligible kWp (kWh/1000, max 62). */
  annualConsumptionKwh?: number;
  /** Battery size (kWh). Used by TAMS SCIS to cap eligible battery (min(battery, 0.5 * eligibleKwp)). */
  batterySizeKwh?: number;
}

function calculateSeaiNonDomesticMicrogenSolarPvGrant(systemSizeKwp: number): number {
  // Based on SEAI Non-Domestic Microgen (Solar PV) schedule.
  // Interpreted as a piecewise linear schedule that reproduces SEAI's example amounts:
  // 1kWp=900, 2=1800, 3=2100, 4=2400, 5=2400, 6=2400, 7=2700, 20=6600, 30=8600, 1000=162600.
  const kwp = Math.min(Math.max(0, systemSizeKwp), 1000);
  if (kwp <= 0) return 0;

  const seg = (from: number, to: number, ratePerKwp: number) =>
    Math.max(0, Math.min(kwp, to) - from) * ratePerKwp;

  // 0..2 @ 900/kWp
  const a = seg(0, 2, 900);
  // 2..4 @ 300/kWp
  const b = seg(2, 4, 300);
  // 4..6 @ 0/kWp
  const c = seg(4, 6, 0);
  // 6..20 @ 300/kWp
  const d = seg(6, 20, 300);
  // 20..200 @ 200/kWp
  const e = seg(20, 200, 200);
  // 200..1000 @ 150/kWp
  const f = seg(200, 1000, 150);

  return a + b + c + d + e + f;
}

function calculateSeaiDomesticSolarGrant(systemSizeKwp: number): number {
  // SEAI Domestic Solar PV Scheme (2025):
  // €700 per kWp up to 2kWp
  // €200 per kWp for each additional kWp up to 4kWp
  // Capped at €1,800
  const kwp = Math.max(0, systemSizeKwp);
  
  if (kwp <= 2) {
    return kwp * 700;
  }
  
  const first2 = 2 * 700; // 1400
  const additional = Math.min(kwp - 2, 2) * 200; // max 2 extra kWp * 200
  
  return Math.min(first2 + additional, 1800);
}

// TAMS 3 SCIS constants (Solar Capital Investment Scheme)
const TAMS_INVESTMENT_CEILING_EUR = 90_000;
const TAMS_MAX_GRANT_EUR = 54_000; // 60% of ceiling
const TAMS_MIN_INVESTMENT_EUR = 2_000;
const TAMS_MAX_ELIGIBLE_KWP = 62;
const TAMS_REF_PANELS_EUR_PER_KWP = 1_441;
const TAMS_REF_PANELS_FIXED_EUR = 1_849;
const TAMS_REF_BATTERY_EUR_PER_KWH = 703;
const TAMS_REF_BATTERY_FIXED_EUR = 753;

function referenceCostPanels(kwp: number): number {
  return kwp <= 0 ? 0 : TAMS_REF_PANELS_EUR_PER_KWP * kwp + TAMS_REF_PANELS_FIXED_EUR;
}

function referenceCostBattery(kwh: number): number {
  return kwh <= 0 ? 0 : TAMS_REF_BATTERY_EUR_PER_KWH * kwh + TAMS_REF_BATTERY_FIXED_EUR;
}

function calculateTamsScisSolarPvGrant(
  systemCost: number,
  context: GrantCalculationContext
): number {
  const kwp = context.systemSizeKwp ?? 0;
  const batteryKwh = context.batterySizeKwh ?? 0;
  const annualKwh = context.annualConsumptionKwh;

  if (!Number.isFinite(kwp) || kwp <= 0) return 0;
  if (systemCost < TAMS_MIN_INVESTMENT_EUR) return 0;

  // Eligible kWp = min(annual kWh/1000, 62, installed kWp). If no consumption, grant 0.
  const consumptionCapKwp =
    annualKwh != null && Number.isFinite(annualKwh) && annualKwh > 0
      ? Math.min(annualKwh / 1000, TAMS_MAX_ELIGIBLE_KWP)
      : 0;
  const eligibleKwp = Math.min(consumptionCapKwp, kwp);
  if (eligibleKwp <= 0) return 0;

  const eligibleBatteryKwh = Math.min(batteryKwh, eligibleKwp * 0.5);

  const refEligible =
    referenceCostPanels(eligibleKwp) + referenceCostBattery(eligibleBatteryKwh);
  const refTotal = referenceCostPanels(kwp) + referenceCostBattery(batteryKwh);
  const proratedActualEligible =
    refTotal > 0 ? systemCost * (refEligible / refTotal) : 0;
  const eligibleCost = Math.min(
    refEligible,
    proratedActualEligible,
    TAMS_INVESTMENT_CEILING_EUR
  );
  const grant = Math.min(0.6 * eligibleCost, TAMS_MAX_GRANT_EUR);
  return Math.max(0, Math.round(grant));
}

export function calculateSingleGrantAmount(
  systemCost: number,
  grant: Grant,
  context: GrantCalculationContext = {}
): number {
  if (!Number.isFinite(systemCost) || systemCost <= 0) return 0;

  const method = grant.calculation?.method ?? 'percentage-of-cost';

  if (method === 'seai-domestic-solar-pv') {
    const kwp = context.systemSizeKwp;
    // Allow 0/undefined to return 0 gracefully
    if (!kwp || kwp <= 0) return 0;
    return calculateSeaiDomesticSolarGrant(kwp);
  }

  if (method === 'seai-non-domestic-microgen-solar-pv') {
    const kwp = context.systemSizeKwp;
    if (!Number.isFinite(kwp) || (kwp ?? 0) <= 0) {
      throw new Error(`Grant "${grant.name}" requires a valid system size (kWp).`);
    }

    const calculatedAmount = calculateSeaiNonDomesticMicrogenSolarPvGrant(kwp!);
    return Math.min(Math.max(0, calculatedAmount), grant.maxAmount);
  }

  if (method === 'tams-scis-solar-pv') {
    if (!Number.isFinite(context.systemSizeKwp) || (context.systemSizeKwp ?? 0) <= 0) {
      return 0;
    }
    return calculateTamsScisSolarPvGrant(systemCost, context);
  }

  // Default / legacy: percentage-of-cost
  const calculatedAmount = systemCost * (grant.percentage / 100);
  return Math.min(Math.max(0, calculatedAmount), grant.maxAmount);
}

export function calculateGrantAmount(
  systemCost: number,
  grants: Grant[],
  context: GrantCalculationContext = {}
): {
  totalGrant: number;
  breakdown: Array<{ grantId: string; amount: number }>;
} {
  if (!Number.isFinite(systemCost) || systemCost <= 0) {
    return { totalGrant: 0, breakdown: [] };
  }

  const breakdown = grants.filter(Boolean).map((grant) => {
    const amount = calculateSingleGrantAmount(systemCost, grant, context);
    return { grantId: grant.id, amount };
  });

  const totalGrant = breakdown.reduce((sum, item) => sum + item.amount, 0);
  return { totalGrant, breakdown };
}

export function getEligibleGrants(businessType: BusinessType, allGrants: Grant[]): Grant[] {
  return allGrants.filter((grant) => grant.eligibleFor.includes(businessType));
}
