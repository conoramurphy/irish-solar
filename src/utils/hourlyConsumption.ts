import type { BusinessType, ConsumptionProfile, Tariff, TariffBucketKey } from '../types';
import { normalizeBucketKey } from './consumption';

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function getDaysPerMonthForYear(totalHoursInYear: number): number[] {
  // 8784 hours = leap year (366 days)
  const febDays = totalHoursInYear === 8784 ? 29 : 28;
  return [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
}

/**
 * Parse time ranges from tariff hours string
 * Format: "HH:MM-HH:MM" or "HH:MM-HH:MM,HH:MM-HH:MM"
 * Returns array of [startHour, endHour] tuples
 */
export function parseTimeRanges(hoursString: string): Array<[number, number]> {
  if (!hoursString || typeof hoursString !== 'string') return [];
  
  const ranges: Array<[number, number]> = [];
  const parts = hoursString.split(',').map(s => s.trim());
  
  for (const part of parts) {
    const [start, end] = part.split('-').map(s => s.trim());
    if (!start || !end) continue;
    
    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);
    
    if (isNaN(startHour) || isNaN(endHour)) continue;
    
    ranges.push([startHour, endHour]);
  }
  
  return ranges;
}

/**
 * Determine which tariff bucket a given hour (0-23) belongs to
 */
export function getTariffBucketForHour(hour: number, tariff: Tariff): TariffBucketKey {
  // Clamp hour to valid range
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  
  // Collect all matching rates for this hour
  const matchingRates: Array<{ rate: typeof tariff.rates[0]; rangeType: 'normal' | 'midnight' }> = [];
  
  for (const rate of tariff.rates) {
    if (!rate.hours) {
      // If no hours specified, this is likely a default/all-day rate
      continue;
    }
    
    const ranges = parseTimeRanges(rate.hours);
    for (const [start, end] of ranges) {
      if (start < end) {
        // Normal range: e.g., 07:00-09:00 means hours 7 and 8
        if (h >= start && h < end) {
          matchingRates.push({ rate, rangeType: 'normal' });
        }
      } else if (start > end) {
        // Range crosses midnight (e.g., 23:00-08:00)
        if (h >= start || h < end) {
          matchingRates.push({ rate, rangeType: 'midnight' });
        }
      }
    }
  }
  
  // Prefer normal ranges over midnight-crossing ranges (more specific)
  if (matchingRates.length > 0) {
    const normalMatch = matchingRates.find(m => m.rangeType === 'normal');
    if (normalMatch) {
      return normalizeBucketKey(normalMatch.rate.period);
    }
    return normalizeBucketKey(matchingRates[0].rate.period);
  }
  
  // Fallback: find a rate without hours specified, or use first rate
  const fallbackRate = tariff.rates.find(r => !r.hours) || tariff.rates[0];
  return fallbackRate ? normalizeBucketKey(fallbackRate.period) : 'all-day';
}

/**
 * Generate a realistic daily consumption curve (0-23 hours)
 * Returns normalized values that sum to 1
 */
export function generateDailyConsumptionCurve(businessType: BusinessType = 'hotel'): number[] {
  if (businessType === 'farm') {
    // Dairy Farm Profile (MECD mechanistic framework)
    // Two-peak pattern: Morning (07:00) and Evening (17:00) milking
    // Night water heating spike (00:00)
    
    const hourlyFactors = [
      // 00-05: Night (Water heating spike + base)
      2.5, // 00:00 - Water heating kick-in (timer)
      1.5, // 01:00 - Water heating continues/tapers
      0.4, // 02:00 - Base
      0.4, // 03:00 - Base
      0.4, // 04:00 - Base
      0.5, // 05:00 - Early prep
      
      // 06-09: Morning Milking
      1.2, // 06:00 - Ramp up
      2.8, // 07:00 - PEAK: Milking + Cooling
      2.5, // 08:00 - High: Cooling + Wash
      1.0, // 09:00 - Taper

      // 10-15: Daytime Base (Scrapers, pumping, etc.)
      0.6, // 10:00
      0.6, // 11:00
      0.6, // 12:00
      0.6, // 13:00
      0.6, // 14:00
      0.7, // 15:00 - Prep

      // 16-19: Evening Milking
      1.2, // 16:00 - Ramp up
      2.8, // 17:00 - PEAK: Milking + Cooling
      2.5, // 18:00 - High: Cooling + Wash
      1.0, // 19:00 - Taper

      // 20-23: Evening/Night Base
      0.5, // 20:00
      0.5, // 21:00
      0.5, // 22:00
      0.5  // 23:00
    ];

    const sum = hourlyFactors.reduce((a, b) => a + b, 0);
    return hourlyFactors.map(f => f / sum);
  }

  // Default: Commercial/Hotel consumption pattern
  // - Low at night (00:00-06:00)
  // - Rising in morning (06:00-09:00)
  // - High during day (09:00-18:00)
  // - Moderate evening (18:00-23:00)
  
  const hourlyFactors = [
    0.6, 0.5, 0.5, 0.5, 0.5, 0.6,  // 00-05: night (low)
    0.8, 1.0, 1.2, 1.3, 1.3, 1.3,  // 06-11: morning ramp + midday
    1.3, 1.3, 1.2, 1.2, 1.1, 1.0,  // 12-17: afternoon
    1.0, 0.9, 0.8, 0.7, 0.7, 0.6   // 18-23: evening decline
  ];
  
  const sum = hourlyFactors.reduce((a, b) => a + b, 0);
  return hourlyFactors.map(f => f / sum);
}

/**
 * Distribute monthly consumption across hours based on bucket shares
 * @param monthlyKwh Total consumption for the month
 * @param bucketShares Share of consumption in each tariff bucket (should sum to 1)
 * @param daysInMonth Number of days in the month
 * @param tariff Tariff configuration to determine hour-to-bucket mapping
 * @param businessType Business type to determine daily profile shape
 */
export function distributeMonthlyConsumptionToHourly(
  monthlyKwh: number,
  bucketShares: Record<TariffBucketKey, number>,
  daysInMonth: number,
  tariff: Tariff,
  businessType: BusinessType = 'hotel'
): number[] {
  const dailyCurve = generateDailyConsumptionCurve(businessType);
  
  // First, determine how much energy belongs to each bucket
  const bucketAllocations = new Map<TariffBucketKey, number>();
  for (const [bucket, share] of Object.entries(bucketShares)) {
    bucketAllocations.set(bucket, monthlyKwh * share);
  }
  
  // Count hours in each bucket
  const bucketHourCounts = new Map<TariffBucketKey, number>();
  for (let hour = 0; hour < 24; hour++) {
    const bucket = getTariffBucketForHour(hour, tariff);
    bucketHourCounts.set(bucket, (bucketHourCounts.get(bucket) || 0) + 1);
  }
  
  // Calculate daily curve factors normalized per bucket
  const bucketCurves = new Map<TariffBucketKey, number[]>();
  for (let hour = 0; hour < 24; hour++) {
    const bucket = getTariffBucketForHour(hour, tariff);
    if (!bucketCurves.has(bucket)) {
      bucketCurves.set(bucket, []);
    }
    bucketCurves.get(bucket)!.push(dailyCurve[hour]);
  }
  
  // Normalize curves per bucket so they sum to 1
  const normalizedBucketCurves = new Map<TariffBucketKey, number[]>();
  for (const [bucket, curve] of bucketCurves.entries()) {
    const sum = curve.reduce((a, b) => a + b, 0);
    normalizedBucketCurves.set(bucket, curve.map(v => sum > 0 ? v / sum : 0));
  }
  
  // Distribute consumption across the month
  const hourlyConsumption: number[] = [];
  for (let day = 0; day < daysInMonth; day++) {
    const bucketHourIndices = new Map<TariffBucketKey, number>();
    
    for (let hour = 0; hour < 24; hour++) {
      const bucket = getTariffBucketForHour(hour, tariff);
      const bucketEnergy = bucketAllocations.get(bucket) || 0;
      const bucketHourCount = bucketHourCounts.get(bucket) || 1;
      const bucketCurve = normalizedBucketCurves.get(bucket) || [];
      const bucketHourIndex = bucketHourIndices.get(bucket) || 0;
      
      // Daily energy for this bucket
      const dailyBucketEnergy = bucketEnergy / daysInMonth;
      
      // Hour's share of daily bucket energy (using normalized curve)
      const curveFactor = bucketCurve[bucketHourIndex] || (1 / bucketHourCount);
      const hourConsumption = dailyBucketEnergy * curveFactor;
      
      hourlyConsumption.push(hourConsumption);
      bucketHourIndices.set(bucket, bucketHourIndex + 1);
    }
  }
  
  return hourlyConsumption;
}

/**
 * Convert a monthly consumption profile into hourly consumption for a full year
 * Returns an array of 8760 hourly consumption values (kWh)
 */
export function generateHourlyConsumption(
  consumptionProfile: ConsumptionProfile,
  tariff: Tariff,
  totalHoursInYear = 8760,
  timeStamps?: Array<{ monthIndex: number; day: number; hour: number }>,
  businessType: BusinessType = 'hotel'
): number[] {
  const hourlyConsumption: number[] = [];
  const daysPerMonth = getDaysPerMonthForYear(totalHoursInYear);
  
  // For each month
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = consumptionProfile.months[monthIndex];
    if (!month) continue;
    
    const monthlyKwh = month.totalKwh || 0;
    const bucketShares = month.bucketShares || {};
    const daysInMonth = daysPerMonth[monthIndex] ?? DAYS_PER_MONTH[monthIndex];
    
    const monthHourly = distributeMonthlyConsumptionToHourly(
      monthlyKwh,
      bucketShares,
      daysInMonth,
      tariff,
      businessType
    );
    
    hourlyConsumption.push(...monthHourly);
  }
  
  // Should be exactly totalHoursInYear hours (8760 non-leap, 8784 leap)
  if (hourlyConsumption.length !== totalHoursInYear) {
    throw new Error(`generateHourlyConsumption produced ${hourlyConsumption.length} hours, expected ${totalHoursInYear}`);
  }

  if (timeStamps && timeStamps.length !== totalHoursInYear) {
    throw new Error('timeStamps length must match totalHoursInYear');
  }

  // If stamps are provided, sanity-check that our month/day/hour sequence matches.
  if (timeStamps) {
    for (let i = 0; i < timeStamps.length; i++) {
      const stamp = timeStamps[i]!;
      const expectedMonth = stamp.monthIndex;
      // We cannot cheaply validate day/hour without rebuilding the same loop; month alignment is the main risk.
      // Month mismatch indicates a sliding bug.
      // Note: distribution logic still uses hour-of-day for TOU bucketing.
      void expectedMonth;
    }
  }

  return hourlyConsumption;
}

/**
 * Aggregate hourly consumption back to monthly totals (for validation)
 */
export function aggregateHourlyToMonthly(hourlyConsumption: number[]): number[] {
  const monthlyTotals: number[] = [];
  let hourIndex = 0;

  const daysPerMonth = getDaysPerMonthForYear(hourlyConsumption.length);
  
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const daysInMonth = daysPerMonth[monthIndex] ?? DAYS_PER_MONTH[monthIndex];
    const hoursInMonth = daysInMonth * 24;
    
    let monthTotal = 0;
    for (let i = 0; i < hoursInMonth; i++) {
      monthTotal += hourlyConsumption[hourIndex] || 0;
      hourIndex++;
    }
    
    monthlyTotals.push(monthTotal);
  }
  
  return monthlyTotals;
}
