export type CostingMode = 'commercial' | 'domestic';

export type SolarPriceTier = '<=10kWp' | '10-50kWp' | '50-150kWp' | '>150kWp' | 'none';

export interface SystemCostBreakdown {
  mode: CostingMode;
  inputs: {
    kwp: number;
    batteryKwh: number;
  };
  solar: {
    tier: SolarPriceTier;
    pricePerKwp: number;
    baseCost: number;
  };
  battery: {
    pricePerKwh: number;
    baseCost: number;
  };
  subtotalHardware: number;
  bosMarkup: number;
  /** Total cost before VAT (EUR) */
  totalBaseCost: number;
}

function getCommercialSolarPricePerKwp(kwp: number): { tier: SolarPriceTier; pricePerKwp: number } {
  // Curve calibrated to ~€880/kWp for ~75kWp commercial systems
  if (kwp <= 0) return { tier: 'none', pricePerKwp: 0 };
  if (kwp <= 10) return { tier: '<=10kWp', pricePerKwp: 1200 };
  if (kwp <= 50) return { tier: '10-50kWp', pricePerKwp: 1200 - ((kwp - 10) / 40) * 250 }; // 1200 -> 950
  if (kwp <= 150) return { tier: '50-150kWp', pricePerKwp: 950 - ((kwp - 50) / 100) * 150 }; // 950 -> 800
  return { tier: '>150kWp', pricePerKwp: 800 };
}

function getDomesticSolarPricePerKwp(kwp: number): { tier: SolarPriceTier; pricePerKwp: number } {
  // Domestic heuristic calibrated to a user-provided baseline:
  // 8 kWp + 5 kWh battery ≈ €8,000 (inc VAT at 13.5%).
  // That implies ≈ €7,048 ex VAT.
  // 
  // Design goals:
  // - keep small systems in a plausible domestic range
  // - avoid the heavy commercial BOS uplift
  // - still provide a gently decreasing €/kWp with size
  if (kwp <= 0) return { tier: 'none', pricePerKwp: 0 };
  if (kwp <= 10) return { tier: '<=10kWp', pricePerKwp: 650 };
  // 10–20 kWp: 650 -> 575
  if (kwp <= 20) return { tier: '10-50kWp', pricePerKwp: 650 - ((kwp - 10) / 10) * 75 };
  // Beyond typical domestic range, keep it conservative.
  return { tier: '10-50kWp', pricePerKwp: 575 };
}

export function estimateSystemCostBreakdown(
  kwpRaw: number,
  batteryKwhRaw: number,
  mode: CostingMode = 'commercial'
): SystemCostBreakdown {
  const kwp = Number.isFinite(kwpRaw) ? Math.max(0, kwpRaw) : 0;
  const batteryKwh = Number.isFinite(batteryKwhRaw) ? Math.max(0, batteryKwhRaw) : 0;

  const solarPricing = mode === 'domestic' ? getDomesticSolarPricePerKwp(kwp) : getCommercialSolarPricePerKwp(kwp);

  const solarBaseCost = kwp * solarPricing.pricePerKwp;

  const batteryPricePerKwh = mode === 'domestic' ? 300 : 350;
  const batteryBaseCost = batteryKwh * batteryPricePerKwh;

  // BOS / controls / integration markup
  // Domestic uses a much smaller uplift than commercial.
  const bosMarkup = mode === 'domestic' ? 1.05 : 1.33;

  const subtotalHardware = solarBaseCost + batteryBaseCost;
  const totalBaseCost = subtotalHardware * bosMarkup;

  return {
    mode,
    inputs: { kwp, batteryKwh },
    solar: {
      tier: solarPricing.tier,
      pricePerKwp: solarPricing.pricePerKwp,
      baseCost: solarBaseCost
    },
    battery: {
      pricePerKwh: batteryPricePerKwh,
      baseCost: batteryBaseCost
    },
    subtotalHardware,
    bosMarkup,
    totalBaseCost
  };
}

export function estimateSystemCost(kwp: number, batteryKwh: number, mode: CostingMode = 'commercial'): number {
  const breakdown = estimateSystemCostBreakdown(kwp, batteryKwh, mode);
  if (breakdown.subtotalHardware <= 0) return 0;
  return breakdown.totalBaseCost;
}
