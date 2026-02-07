import type { HourlyEnergyFlow, HourlySimulationResult, Tariff } from '../types';
import { getTariffBucketForHour } from './hourlyConsumption';
import { normalizeBucketKey } from './consumption';
import type { HourStamp } from './solarTimeseriesParser';

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function getDaysPerMonthForYear(totalHoursInYear: number): number[] {
  const febDays = totalHoursInYear === 8784 ? 29 : 28;
  return [31, febDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
}

/**
 * Battery configuration
 */
export interface BatteryConfig {
  /** Battery capacity in kWh */
  capacityKwh: number;
  /** Round-trip efficiency (0-1), default 0.9 (90%) */
  efficiency?: number;
  /** Initial state of charge (0-1), default 0 */
  initialSoC?: number;
}

/**
 * Get the tariff rate for a specific hour and bucket
 */
function getTariffRateForHour(hourOfDay: number, tariff: Tariff): number {
  const bucket = getTariffBucketForHour(hourOfDay, tariff);
  
  // Find the rate for this bucket
  const rate = tariff.rates.find(r => normalizeBucketKey(r.period) === bucket);
  return rate?.rate || 0;
}

/**
 * Calculate baseline cost (no solar) for an hour
 */
function calculateBaselineCost(
  consumption: number,
  hourOfDay: number,
  tariff: Tariff
): number {
  const unitRate = getTariffRateForHour(hourOfDay, tariff);
  const pso = tariff.psoLevy || 0;
  
  // Standing charge is per day, so divide by 24 for hourly cost
  const standingCharge = tariff.standingCharge / 24;
  
  return standingCharge + consumption * (unitRate + pso);
}

/**
 * Simulate hour-by-hour energy flow for a full year
 * 
 * @param hourlyGeneration Array of 8760 hourly generation values (kWh)
 * @param hourlyConsumption Array of 8760 hourly consumption values (kWh)
 * @param tariff Tariff configuration
 * @param batteryConfig Battery configuration (optional)
 * @param includeHourlyDetail Whether to include detailed hourly data in results
 */
export function simulateHourlyEnergyFlow(
  hourlyGeneration: number[],
  hourlyConsumption: number[],
  tariff: Tariff,
  batteryConfig?: BatteryConfig,
  includeHourlyDetail = false,
  timeStamps?: HourStamp[]
): HourlySimulationResult {
  if (hourlyGeneration.length !== hourlyConsumption.length) {
    throw new Error('Generation and consumption arrays must have the same number of hours');
  }
  if (hourlyGeneration.length !== 8760 && hourlyGeneration.length !== 8784) {
    throw new Error('Hourly simulation supports only 8760 (non-leap) or 8784 (leap) hours');
  }

  const battery = batteryConfig ? {
    capacity: Math.max(0, batteryConfig.capacityKwh),
    efficiency: Math.max(0, Math.min(1, batteryConfig.efficiency ?? 0.9)),
    soc: Math.max(0, Math.min(1, batteryConfig.initialSoC ?? 0)) * batteryConfig.capacityKwh
  } : null;

  let totalGridImport = 0;
  let totalGridExport = 0;
  let totalSelfConsumption = 0;
  let totalImportCost = 0;
  let totalExportRevenue = 0;
  let totalBaselineCost = 0;

  const hourlyData: HourlyEnergyFlow[] = [];

  const totalHours = hourlyGeneration.length;

  if (timeStamps && timeStamps.length !== totalHours) {
    throw new Error('timeStamps length must match hourly arrays length');
  }

  for (let hour = 0; hour < totalHours; hour++) {
    const generation = Math.max(0, hourlyGeneration[hour] || 0);
    const consumption = Math.max(0, hourlyConsumption[hour] || 0);

    const hourOfDay = timeStamps ? timeStamps[hour]!.hour : hour % 24;

    // Calculate baseline cost (no solar, for comparison)
    const baselineCost = calculateBaselineCost(consumption, hourOfDay, tariff);
    totalBaselineCost += baselineCost;

    // Net energy: positive = deficit (need import), negative = surplus (can export)
    let netEnergy = consumption - generation;
    
    let gridImport = 0;
    let gridExport = 0;
    let batteryCharge = 0;
    let batteryDischarge = 0;

    if (battery) {
      if (netEnergy < 0) {
        // Surplus: charge battery first, then export
        const surplus = Math.abs(netEnergy);
        const availableCapacity = battery.capacity - battery.soc;
        
        // Charge battery (accounting for efficiency loss)
        // We can charge up to availableCapacity, using surplus/efficiency input energy
        const energyToStore = Math.min(surplus * battery.efficiency, availableCapacity);
        const energyUsedFromSurplus = energyToStore / battery.efficiency;
        
        batteryCharge = energyToStore;
        battery.soc += energyToStore;
        
        // Export remainder
        const exported = surplus - energyUsedFromSurplus;
        gridExport = Math.max(0, exported);
        netEnergy = 0; // All surplus handled
      } else if (netEnergy > 0) {
        // Deficit: discharge battery first, then import
        const deficit = netEnergy;
        const availableEnergy = battery.soc;
        
        // Discharge battery (accounting for efficiency loss)
        const dischargeAmount = Math.min(deficit, availableEnergy * battery.efficiency);
        batteryDischarge = dischargeAmount;
        battery.soc -= dischargeAmount / battery.efficiency;
        
        // Import remainder
        const remaining = deficit - dischargeAmount;
        gridImport = Math.max(0, remaining);
        netEnergy = remaining;
      }
    } else {
      // No battery: direct import/export
      if (netEnergy < 0) {
        gridExport = Math.abs(netEnergy);
        netEnergy = 0;
      } else if (netEnergy > 0) {
        gridImport = netEnergy;
      }
    }

    // Calculate costs
    const unitRate = getTariffRateForHour(hourOfDay, tariff);
    const pso = tariff.psoLevy || 0;
    const standingCharge = tariff.standingCharge / 24;
    
    const importCost = standingCharge + gridImport * (unitRate + pso);
    const exportRevenue = gridExport * tariff.exportRate;

    // Accumulate totals
    totalGridImport += gridImport;
    totalGridExport += gridExport;
    totalSelfConsumption += (generation - gridExport);
    totalImportCost += importCost;
    totalExportRevenue += exportRevenue;

    if (includeHourlyDetail) {
      const bucket = getTariffBucketForHour(hourOfDay, tariff);
      const savings = baselineCost - importCost + exportRevenue;
      hourlyData.push({
        hour,
        generation,
        consumption,
        gridImport,
        gridExport,
        batteryCharge,
        batteryDischarge,
        batterySoC: battery?.soc || 0,
        baselineCost,
        importCost,
        exportRevenue,
        savings,
        tariffBucket: bucket
      });
    }
  }

  const totalSavings = totalBaselineCost - totalImportCost + totalExportRevenue;

  return {
    totalGridImport,
    totalGridExport,
    totalSelfConsumption,
    totalImportCost,
    totalExportRevenue,
    totalSavings,
    hourlyData: includeHourlyDetail ? hourlyData : undefined
  };
}

/**
 * Aggregate hourly simulation results to monthly breakdown
 */
export function aggregateHourlyResultsToMonthly(
  hourlyData: HourlyEnergyFlow[],
  timeStamps?: HourStamp[]
): Array<{
  monthIndex: number;
  generation: number;
  consumption: number;
  gridImport: number;
  gridExport: number;
  selfConsumption: number;
  baselineCost: number;
  importCost: number;
  exportRevenue: number;
  savings: number;
}> {
  const monthlyResults = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    generation: 0,
    consumption: 0,
    gridImport: 0,
    gridExport: 0,
    selfConsumption: 0,
    baselineCost: 0,
    importCost: 0,
    exportRevenue: 0,
    savings: 0
  }));

  if (timeStamps && timeStamps.length !== hourlyData.length) {
    throw new Error('timeStamps length must match hourlyData length');
  }

  for (let i = 0; i < hourlyData.length; i++) {
    const row = hourlyData[i]!;
    const monthIndex = timeStamps ? timeStamps[i]!.monthIndex : hourToMonthIndexFallback(i, hourlyData.length);

    const bucket = monthlyResults[monthIndex];
    bucket.generation += row.generation;
    bucket.consumption += row.consumption;
    bucket.gridImport += row.gridImport;
    bucket.gridExport += row.gridExport;
    bucket.selfConsumption += (row.generation - row.gridExport);
    bucket.baselineCost += row.baselineCost;
    bucket.importCost += row.importCost;
    bucket.exportRevenue += row.exportRevenue;
    bucket.savings += row.savings;
  }

  return monthlyResults;
}

function hourToMonthIndexFallback(hourIndex: number, totalHoursInYear: number): number {
  const daysPerMonth = getDaysPerMonthForYear(totalHoursInYear);
  let cumulativeHours = 0;
  for (let m = 0; m < 12; m++) {
    const monthHours = (daysPerMonth[m] ?? DAYS_PER_MONTH[m] ?? 30) * 24;
    if (hourIndex < cumulativeHours + monthHours) return m;
    cumulativeHours += monthHours;
  }
  return 11;
}
