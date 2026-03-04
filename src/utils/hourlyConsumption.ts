import type { BusinessType, ConsumptionProfile, Tariff, TariffBucketKey } from '../types';
import { normalizeBucketKey } from './consumption';
import { DAYS_PER_MONTH_NON_LEAP, getDaysPerMonthFromHours } from '../constants/calendar';

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
 * Expand an hourly curve (24 values) to a half-hourly curve (48 values) by
 * repeating each hourly value into two equal 30-minute slots.
 */
function expandHourlyTo30Min(hourly: number[]): number[] {
  const result: number[] = [];
  for (const v of hourly) {
    result.push(v / 2, v / 2);
  }
  return result;
}

/**
 * Generate a realistic daily consumption curve.
 * @param businessType Business type
 * @param slotsPerDay 24 for hourly, 48 for half-hourly
 * Returns normalized values that sum to 1 (length equals slotsPerDay).
 */
export function generateDailyConsumptionCurve(businessType: BusinessType = 'hotel', slotsPerDay: 24 | 48 = 24): number[] {
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
    const normalized = hourlyFactors.map(f => f / sum);
    return slotsPerDay === 48 ? expandHourlyTo30Min(normalized) : normalized;
  }

  // Default: Commercial/Hotel consumption pattern
  const hourlyFactors = [
    0.6, 0.5, 0.5, 0.5, 0.5, 0.6,  // 00-05: night (low)
    0.8, 1.0, 1.2, 1.3, 1.3, 1.3,  // 06-11: morning ramp + midday
    1.3, 1.3, 1.2, 1.2, 1.1, 1.0,  // 12-17: afternoon
    1.0, 0.9, 0.8, 0.7, 0.7, 0.6   // 18-23: evening decline
  ];
  
  const sum = hourlyFactors.reduce((a, b) => a + b, 0);
  const normalized = hourlyFactors.map(f => f / sum);
  return slotsPerDay === 48 ? expandHourlyTo30Min(normalized) : normalized;
}

/**
 * Distribute monthly consumption across slots based on bucket shares.
 * Supports both hourly (slotsPerDay=24) and half-hourly (slotsPerDay=48) output.
 *
 * @param monthlyKwh Total consumption for the month
 * @param bucketShares Share of consumption in each tariff bucket (should sum to 1)
 * @param daysInMonth Number of days in the month
 * @param tariff Tariff configuration to determine hour-to-bucket mapping
 * @param businessType Business type to determine daily profile shape
 * @param slotsPerDay 24 for hourly, 48 for half-hourly
 */
export function distributeMonthlyConsumptionToHourly(
  monthlyKwh: number,
  bucketShares: Record<TariffBucketKey, number>,
  daysInMonth: number,
  tariff: Tariff,
  businessType: BusinessType = 'hotel',
  slotsPerDay: 24 | 48 = 24
): number[] {
  const dailyCurve = generateDailyConsumptionCurve(businessType, slotsPerDay);
  
  // First, determine how much energy belongs to each bucket
  const bucketAllocations = new Map<TariffBucketKey, number>();
  for (const [bucket, share] of Object.entries(bucketShares)) {
    bucketAllocations.set(bucket, monthlyKwh * share);
  }
  
  // Count slots in each bucket (TOU is still based on the wall-clock hour)
  const bucketSlotCounts = new Map<TariffBucketKey, number>();
  for (let slot = 0; slot < slotsPerDay; slot++) {
    const hour = Math.floor(slot / (slotsPerDay / 24));
    const bucket = getTariffBucketForHour(hour, tariff);
    bucketSlotCounts.set(bucket, (bucketSlotCounts.get(bucket) || 0) + 1);
  }
  
  // Build per-bucket daily curve arrays
  const bucketCurves = new Map<TariffBucketKey, number[]>();
  for (let slot = 0; slot < slotsPerDay; slot++) {
    const hour = Math.floor(slot / (slotsPerDay / 24));
    const bucket = getTariffBucketForHour(hour, tariff);
    if (!bucketCurves.has(bucket)) {
      bucketCurves.set(bucket, []);
    }
    bucketCurves.get(bucket)!.push(dailyCurve[slot]);
  }
  
  // Normalize curves per bucket so they sum to 1
  const normalizedBucketCurves = new Map<TariffBucketKey, number[]>();
  for (const [bucket, curve] of bucketCurves.entries()) {
    const sum = curve.reduce((a, b) => a + b, 0);
    normalizedBucketCurves.set(bucket, curve.map(v => sum > 0 ? v / sum : 0));
  }
  
  // Distribute consumption across the month
  const slotConsumption: number[] = [];
  for (let day = 0; day < daysInMonth; day++) {
    const bucketSlotIndices = new Map<TariffBucketKey, number>();
    
    for (let slot = 0; slot < slotsPerDay; slot++) {
      const hour = Math.floor(slot / (slotsPerDay / 24));
      const bucket = getTariffBucketForHour(hour, tariff);
      const bucketEnergy = bucketAllocations.get(bucket) || 0;
      const bucketSlotCount = bucketSlotCounts.get(bucket) || 1;
      const bucketCurve = normalizedBucketCurves.get(bucket) || [];
      const bucketSlotIndex = bucketSlotIndices.get(bucket) || 0;
      
      const dailyBucketEnergy = bucketEnergy / daysInMonth;
      const curveFactor = bucketCurve[bucketSlotIndex] || (1 / bucketSlotCount);
      slotConsumption.push(dailyBucketEnergy * curveFactor);
      bucketSlotIndices.set(bucket, bucketSlotIndex + 1);
    }
  }
  
  return slotConsumption;
}

/**
 * Convert a monthly consumption profile into per-slot consumption for a full year.
 * Supports both hourly (slotsPerDay=24) and half-hourly (slotsPerDay=48) output.
 * Returns an array of totalSlotsInYear consumption values (kWh per slot).
 */
export function generateHourlyConsumption(
  consumptionProfile: ConsumptionProfile,
  tariff: Tariff,
  totalHoursInYear = 8760,
  timeStamps?: Array<{ monthIndex: number; day: number; hour: number; minute?: number }>,
  businessType: BusinessType = 'hotel'
): number[] {
  const slotsPerDay: 24 | 48 = totalHoursInYear > 10000 ? 48 : 24;
  const slotConsumption: number[] = [];
  const daysPerMonth = getDaysPerMonthFromHours(totalHoursInYear);
  
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const month = consumptionProfile.months[monthIndex];
    if (!month) continue;
    
    const monthlyKwh = month.totalKwh || 0;
    const bucketShares = month.bucketShares || {};
    const daysInMonth = daysPerMonth[monthIndex] ?? DAYS_PER_MONTH_NON_LEAP[monthIndex];
    
    const monthSlots = distributeMonthlyConsumptionToHourly(
      monthlyKwh,
      bucketShares,
      daysInMonth,
      tariff,
      businessType,
      slotsPerDay
    );
    
    slotConsumption.push(...monthSlots);
  }
  
  if (slotConsumption.length !== totalHoursInYear) {
    throw new Error(`generateHourlyConsumption produced ${slotConsumption.length} slots, expected ${totalHoursInYear}`);
  }

  if (timeStamps && timeStamps.length !== totalHoursInYear) {
    throw new Error('timeStamps length must match totalHoursInYear');
  }

  return slotConsumption;
}

/**
 * Aggregate per-slot consumption back to monthly totals (for validation).
 * Works for both hourly (8760/8784) and half-hourly (17520/17568) arrays.
 */
export function aggregateHourlyToMonthly(hourlyConsumption: number[]): number[] {
  const monthlyTotals: number[] = [];
  let slotIndex = 0;

  const slotsPerDay: 24 | 48 = hourlyConsumption.length > 10000 ? 48 : 24;
  const daysPerMonth = getDaysPerMonthFromHours(hourlyConsumption.length);
  
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const daysInMonth = daysPerMonth[monthIndex] ?? DAYS_PER_MONTH_NON_LEAP[monthIndex];
    const slotsInMonth = daysInMonth * slotsPerDay;
    
    let monthTotal = 0;
    for (let i = 0; i < slotsInMonth; i++) {
      monthTotal += hourlyConsumption[slotIndex] || 0;
      slotIndex++;
    }
    
    monthlyTotals.push(monthTotal);
  }
  
  return monthlyTotals;
}
