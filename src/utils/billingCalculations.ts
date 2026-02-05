import type { ExampleMonth, TariffConfiguration, TariffSlot } from '../types/billing';

/**
 * Calculate the implied rate (€/kWh) from an example month's bill
 */
export function calculateImpliedRate(totalKwh: number, totalBillEur: number): number {
  if (totalKwh <= 0) return 0;
  return totalBillEur / totalKwh;
}

/**
 * Curve consumption across 12 months using two example months
 * Uses sinusoidal interpolation between the two points
 */
export function curveConsumption(exampleMonths: ExampleMonth[]): number[] {
  if (exampleMonths.length < 2) {
    // Fallback: distribute evenly
    const avgKwh = exampleMonths[0]?.totalKwh || 0;
    return Array(12).fill(avgKwh);
  }

  // Sort by month index
  const sorted = [...exampleMonths].sort((a, b) => a.monthIndex - b.monthIndex);
  const [first, second] = sorted;

  // Simple sinusoidal curve between the two points
  // Assume first is winter (low solar, high consumption) and second is summer
  const result: number[] = [];
  
  for (let month = 0; month < 12; month++) {
    // Calculate position in the year cycle (0 to 2π)
    const angle = (month / 12) * 2 * Math.PI;
    
    // Peak consumption in winter (Jan ≈ 0 radians), minimum in summer (Jul ≈ π radians)
    // Shift so January (month 0) is at the peak
    const shiftedAngle = angle - (first.monthIndex / 12) * 2 * Math.PI;
    
    // Cosine wave: 1 at 0, -1 at π
    const normalized = (Math.cos(shiftedAngle) + 1) / 2; // 0 to 1
    
    // Interpolate between min (summer) and max (winter)
    const minKwh = Math.min(first.totalKwh, second.totalKwh);
    const maxKwh = Math.max(first.totalKwh, second.totalKwh);
    
    // If first month has higher consumption, it's winter
    if (first.totalKwh > second.totalKwh) {
      result[month] = minKwh + (maxKwh - minKwh) * normalized;
    } else {
      result[month] = minKwh + (maxKwh - minKwh) * (1 - normalized);
    }
  }

  return result;
}

/**
 * Calculate estimated bill for a month given kWh and tariff configuration
 */
export function calculateMonthlyBill(
  monthKwh: number,
  tariffConfig: TariffConfiguration,
  tariffSlotUsage?: Record<string, number>
): number {
  if (tariffConfig.type === 'flat' && tariffConfig.flatRate) {
    return monthKwh * tariffConfig.flatRate;
  }

  if (tariffConfig.type === 'custom' && tariffConfig.customSlots && tariffSlotUsage) {
    let totalBill = 0;
    
    for (const slot of tariffConfig.customSlots) {
      const slotUsageFraction = tariffSlotUsage[slot.id] || 0;
      const slotKwh = monthKwh * slotUsageFraction;
      totalBill += slotKwh * slot.ratePerKwh;
    }
    
    return totalBill;
  }

  return 0;
}

/**
 * Calculate average flat rate from example months (if using flat tariff)
 */
export function calculateAverageFlatRate(exampleMonths: ExampleMonth[]): number {
  if (exampleMonths.length === 0) return 0;
  
  const totalKwh = exampleMonths.reduce((sum, m) => sum + m.totalKwh, 0);
  const totalBill = exampleMonths.reduce((sum, m) => sum + m.totalBillEur, 0);
  
  return calculateImpliedRate(totalKwh, totalBill);
}

/**
 * Derive custom tariff slots from example months
 * Uses the tariff slot usage and bills to back-calculate rates
 */
export function deriveCustomTariffRates(
  exampleMonths: ExampleMonth[],
  slots: TariffSlot[]
): TariffSlot[] {
  // This is a simplified approach - in reality you'd solve a system of equations
  // For now, we'll use a weighted average approach
  
  return slots.map(slot => {
    let weightedRate = 0;
    let totalWeight = 0;
    
    for (const month of exampleMonths) {
      const slotUsage = month.tariffSlotUsage[slot.id] || 0;
      if (slotUsage > 0) {
        const monthRate = calculateImpliedRate(month.totalKwh, month.totalBillEur);
        weightedRate += monthRate * slotUsage * month.totalKwh;
        totalWeight += slotUsage * month.totalKwh;
      }
    }
    
    return {
      ...slot,
      ratePerKwh: totalWeight > 0 ? weightedRate / totalWeight : slot.ratePerKwh
    };
  });
}

/**
 * Estimate bills for all 12 months based on curved consumption and tariff
 */
export function estimateAnnualBills(
  curvedMonthlyKwh: number[],
  tariffConfig: TariffConfiguration,
  exampleMonths: ExampleMonth[]
): number[] {
  // Use the tariff slot usage from the closest example month for each month
  return curvedMonthlyKwh.map((monthKwh, monthIndex) => {
    // Find closest example month to use its tariff distribution
    const closestExample = exampleMonths.reduce((closest, example) => {
      const currentDist = Math.abs(example.monthIndex - monthIndex);
      const closestDist = Math.abs(closest.monthIndex - monthIndex);
      return currentDist < closestDist ? example : closest;
    }, exampleMonths[0]);

    return calculateMonthlyBill(monthKwh, tariffConfig, closestExample?.tariffSlotUsage);
  });
}
