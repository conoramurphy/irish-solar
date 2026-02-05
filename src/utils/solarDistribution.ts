/**
 * Distributes annual solar production across months based on daily irradiance data
 */

interface MonthlyIrradianceData {
  month: string;
  avgDailyIrradianceKwhM2: number;
  daysInMonth: number;
}

interface LocationIrradianceData {
  latitude: number;
  longitude: number;
  monthlyIrradiance: Record<string, MonthlyIrradianceData>;
}

export interface MonthlyProduction {
  monthIndex: number;
  monthName: string;
  productionKwh: number;
  avgDailyProductionKwh: number;
}

export interface HourlyProductionCurve {
  hour: number; // 0-23
  productionFraction: number; // fraction of daily production in this hour
}

/**
 * Calculate the fraction of annual production that occurs in each month
 * based on irradiance patterns
 */
export function calculateMonthlyProductionFractions(
  locationData: LocationIrradianceData
): number[] {
  // Calculate total annual irradiance (sum of daily irradiance * days per month)
  let totalAnnualIrradiance = 0;
  const monthlyIrradiance: number[] = [];

  for (let i = 0; i < 12; i++) {
    const monthData = locationData.monthlyIrradiance[i.toString()];
    const monthTotal = monthData.avgDailyIrradianceKwhM2 * monthData.daysInMonth;
    monthlyIrradiance.push(monthTotal);
    totalAnnualIrradiance += monthTotal;
  }

  // Calculate fraction for each month
  return monthlyIrradiance.map(irr => irr / totalAnnualIrradiance);
}

/**
 * Distribute total annual production across months based on location irradiance
 */
export function distributeAnnualProduction(
  totalAnnualProductionKwh: number,
  locationData: LocationIrradianceData
): MonthlyProduction[] {
  const monthlyFractions = calculateMonthlyProductionFractions(locationData);
  
  return monthlyFractions.map((fraction, index) => {
    const monthData = locationData.monthlyIrradiance[index.toString()];
    const monthlyProduction = totalAnnualProductionKwh * fraction;
    
    return {
      monthIndex: index,
      monthName: monthData.month,
      productionKwh: monthlyProduction,
      avgDailyProductionKwh: monthlyProduction / monthData.daysInMonth
    };
  });
}

/**
 * Generate a solar production curve for a single day
 * Based on a bell curve centered at solar noon
 * Peak production occurs around 13:00 (1 PM) in Ireland
 */
export function generateDailySolarCurve(): HourlyProductionCurve[] {
  // Bell curve parameters
  const peakHour = 13; // 1 PM solar time for Ireland
  const sigma = 3; // Standard deviation (controls width of curve)
  
  const curve: HourlyProductionCurve[] = [];
  let totalFraction = 0;
  
  // Calculate raw values based on Gaussian distribution
  for (let hour = 0; hour < 24; hour++) {
    // Only generate during daylight hours (roughly 6 AM to 8 PM)
    if (hour < 6 || hour > 20) {
      curve.push({ hour, productionFraction: 0 });
    } else {
      // Gaussian function centered at peakHour
      const exponent = -Math.pow(hour - peakHour, 2) / (2 * Math.pow(sigma, 2));
      const value = Math.exp(exponent);
      curve.push({ hour, productionFraction: value });
      totalFraction += value;
    }
  }
  
  // Normalize so fractions sum to 1
  return curve.map(({ hour, productionFraction }) => ({
    hour,
    productionFraction: productionFraction / totalFraction
  }));
}

/**
 * Calculate average daily production for a specific day of year
 * considering seasonal variations
 */
export function getDailyProduction(
  dayOfYear: number,
  monthlyProduction: MonthlyProduction[]
): number {
  // Determine which month this day falls in
  let cumulativeDays = 0;
  for (const monthData of monthlyProduction) {
    const monthDays = monthData.productionKwh / monthData.avgDailyProductionKwh;
    if (dayOfYear <= cumulativeDays + monthDays) {
      return monthData.avgDailyProductionKwh;
    }
    cumulativeDays += monthDays;
  }
  
  // Fallback to last month
  return monthlyProduction[11].avgDailyProductionKwh;
}

/**
 * Get hourly production for a specific day of the year
 */
export function getHourlyProductionForDay(
  dayOfYear: number,
  monthlyProduction: MonthlyProduction[]
): HourlyProductionCurve[] {
  const dailyTotal = getDailyProduction(dayOfYear, monthlyProduction);
  const curve = generateDailySolarCurve();
  
  return curve.map(({ hour, productionFraction }) => ({
    hour,
    productionFraction: dailyTotal * productionFraction
  }));
}
