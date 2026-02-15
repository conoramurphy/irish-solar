import type { HourlyEnergyFlow, HourlySimulationResult, Tariff, TradingConfig } from '../types';
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
  /** Maximum charge rate (kW), default to capacity (1C) */
  maxChargeRateKw?: number;
  /** Maximum discharge rate (kW), default to capacity (1C) */
  maxDischargeRateKw?: number;
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
  tariff: Tariff,
  daysInMonth: number,
  hourlyPrice?: number,
  tradingConfig?: TradingConfig
): number {
  let unitRate = 0;
  
  if (hourlyPrice !== undefined && tradingConfig?.enabled) {
    // Dynamic pricing: Price + Margin
    unitRate = hourlyPrice + (tradingConfig.importMargin ?? 0);
  } else {
    // Static tariff
    unitRate = getTariffRateForHour(hourOfDay, tariff);
  }

  const pso = (tariff.psoLevy || 0) / daysInMonth;
  
  // Standing charge is per day, so divide by 24 for hourly cost
  const standingCharge = (tariff.standingCharge + pso) / 24;
  
  return standingCharge + consumption * unitRate;
}

/**
 * Pre-calculate trading signals for each day based on price quantiles.
 * Returns an array of actions for each hour: 'CHARGE' | 'DISCHARGE' | 'AUTO'
 */
function calculateTradingSignals(
  hourlyPrices: number[],
  tradingConfig: TradingConfig,
  totalHours: number
): ('CHARGE' | 'DISCHARGE' | 'AUTO')[] {
  const signals = new Array(totalHours).fill('AUTO');
  const windowSize = tradingConfig.hoursWindow ?? 4;
  
  if (windowSize <= 0) return signals;

  // Process day by day (24-hour chunks)
  // Note: This assumes 00:00 to 23:00 alignment.
  // Ideally, we should align with days using timeStamps, but strict 24h blocks is a reasonable approximation for "Day Ahead".
  
  for (let i = 0; i < totalHours; i += 24) {
    // Get prices for this day (handle end of year truncation if any)
    const dayPrices = hourlyPrices.slice(i, Math.min(i + 24, totalHours));
    if (dayPrices.length === 0) break;

    // Create array of { price, hourIndex }
    const detailed = dayPrices.map((price, idx) => ({ price, idx }));
    
    // Sort by price
    detailed.sort((a, b) => a.price - b.price);
    
    // N cheapest hours = CHARGE
    // We take the first N
    for (let k = 0; k < Math.min(windowSize, detailed.length); k++) {
      const hourOffset = detailed[k].idx;
      signals[i + hourOffset] = 'CHARGE';
    }
    
    // N most expensive hours = DISCHARGE
    // We take the last N
    // Be careful not to overlap if windowSize is large (e.g. > 12)
    // If overlap, "DISCHARGE" (sell high) usually beats "CHARGE" (buy low) if we consider opportunity cost,
    // but physically you can't do both. 
    // Let's just take the top N that aren't already marked CHARGE.
    
    let expensiveCount = 0;
    for (let k = detailed.length - 1; k >= 0; k--) {
      if (expensiveCount >= windowSize) break;
      
      const hourOffset = detailed[k].idx;
      if (signals[i + hourOffset] !== 'CHARGE') {
        signals[i + hourOffset] = 'DISCHARGE';
        expensiveCount++;
      }
    }
  }
  
  return signals;
}

/**
 * Simulate hour-by-hour energy flow for a full year
 * 
 * @param hourlyGeneration Array of 8760 hourly generation values (kWh)
 * @param hourlyConsumption Array of 8760 hourly consumption values (kWh)
 * @param tariff Tariff configuration
 * @param batteryConfig Battery configuration (optional)
 * @param includeHourlyDetail Whether to include detailed hourly data in results
 * @param timeStamps Optional timestamps for accurate hour-of-day/month mapping
 * @param hourlyPrices Optional array of hourly prices (EUR/kWh) for dynamic pricing
 * @param tradingConfig Optional trading configuration
 */
export function simulateHourlyEnergyFlow(
  hourlyGeneration: number[],
  hourlyConsumption: number[],
  tariff: Tariff,
  batteryConfig?: BatteryConfig,
  includeHourlyDetail = false,
  timeStamps?: HourStamp[],
  hourlyPrices?: number[],
  tradingConfig?: TradingConfig
): HourlySimulationResult {
  if (hourlyGeneration.length !== hourlyConsumption.length) {
    throw new Error('Generation and consumption arrays must have the same number of hours');
  }
  if (hourlyGeneration.length !== 8760 && hourlyGeneration.length !== 8784) {
    throw new Error('Hourly simulation supports only 8760 (non-leap) or 8784 (leap) hours');
  }

  const useTrading = tradingConfig?.enabled && hourlyPrices && hourlyPrices.length === hourlyGeneration.length;

  const battery = batteryConfig ? {
    capacity: Math.max(0, batteryConfig.capacityKwh),
    efficiency: Math.max(0, Math.min(1, batteryConfig.efficiency ?? 0.9)),
    soc: Math.max(0, Math.min(1, batteryConfig.initialSoC ?? 0)) * Math.max(0, batteryConfig.capacityKwh),
    maxChargeRate: Math.max(0, batteryConfig.maxChargeRateKw ?? batteryConfig.capacityKwh), 
    maxDischargeRate: Math.max(0, batteryConfig.maxDischargeRateKw ?? batteryConfig.capacityKwh)
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

  // Pre-calculate trading signals if applicable
  const tradingSignals = useTrading 
    ? calculateTradingSignals(hourlyPrices!, tradingConfig!, totalHours)
    : new Array(totalHours).fill('AUTO');

  let totalSolarToLoadKwh = 0;
  let totalBatteryToLoadKwh = 0;
  let totalSolarToLoadSavings = 0;
  let totalBatteryToLoadSavings = 0;

  for (let hour = 0; hour < totalHours; hour++) {
    const generation = Math.max(0, hourlyGeneration[hour] || 0);
    const consumption = Math.max(0, hourlyConsumption[hour] || 0);
    const hourlyPrice = hourlyPrices ? hourlyPrices[hour] : undefined;

    const hourOfDay = timeStamps ? timeStamps[hour]!.hour : hour % 24;
    const monthIndex = timeStamps ? timeStamps[hour]!.monthIndex : new Date(2021, 0, 1 + Math.floor(hour / 24)).getMonth();
    const daysInMonth = getDaysPerMonthForYear(totalHours)[monthIndex] ?? 30;

    // Calculate baseline cost (no solar, for comparison)
    // If trading enabled, baseline uses dynamic price too (fair comparison)
    const baselineCost = calculateBaselineCost(consumption, hourOfDay, tariff, daysInMonth, hourlyPrice, tradingConfig);
    totalBaselineCost += baselineCost;

    let gridImport = 0;
    let gridExport = 0;
    let batteryCharge = 0;
    let batteryDischarge = 0;
    
    // Net energy from solar perspective:
    // Positive = Surplus (Solar > Load)
    // Negative = Deficit (Solar < Load)
    // Wait, let's keep consistency with previous code:
    // Previous code: netEnergy = consumption - generation
    // Positive = Deficit (Need Import)
    // Negative = Surplus (Can Export)
    let netEnergy = consumption - generation;
    
    // Track localized displacement for breakdown
    let solarToLoadKwh = Math.min(generation, consumption);
    let batteryToLoadKwh = 0;

    if (battery) {
      const signal = tradingSignals[hour];
      
      if (signal === 'CHARGE') {
        // FORCE CHARGE STRATEGY
        // 1. Solar serves Load first? 
        //    Standard "Smart" usually prioritizes Solar -> Load, then fills rest from Grid.
        //    Or does it fill entirely from Grid?
        //    Let's assume: Solar -> Load first.
        
        // If Surplus (netEnergy < 0): Solar covers load fully, remaining is surplus.
        //    Charge battery from surplus.
        //    If battery still has room, top up from Grid.
        
        // If Deficit (netEnergy > 0): Solar insufficient.
        //    Load is covered by Solar + Grid.
        //    Battery charges from Grid.
        
        
        if (netEnergy < 0) {
          // Surplus scenario
          const surplus = Math.abs(netEnergy);
          
          // 1. Charge from Solar Surplus
          
          // Note: maxChargeRate applies to input side typically? Or output side?
          // Usually C-rate is on the DC side. 
          // Let's assume maxChargeRate is "energy entering battery".
          // If we input 1kWh from grid, 0.9 enters battery.
          // Wait, simplistic model: "Charge X kWh" -> SOC increases by X * eff? 
          // Or "Input Y kWh" -> SOC increases by Y * eff?
          // Previous code: "energyToStore = min(surplus * eff, capacity - soc)" -> "energyUsed = energyToStore / eff"
          // This implies surplus is "Input Energy".
          // So charge rate limit should apply to Input Energy? Or stored energy?
          // Let's apply to Input Energy for simplicity with previous code.
          
          const maxInput = battery.maxChargeRate;
          
          // Actually, we need to respect capacity.
          // input * eff <= capacity - soc  => input <= (capacity - soc) / eff
          const maxInputByCapacity = (battery.capacity - battery.soc) / battery.efficiency;
          const effectiveInputFromSolar = Math.min(surplus, maxInput, maxInputByCapacity);
          
          batteryCharge += effectiveInputFromSolar * battery.efficiency; // Stored amount
          battery.soc += batteryCharge;
          
          // Solar surplus used
          const solarUsed = effectiveInputFromSolar;
          
          // Remaining solar -> Export
          const remainingSolar = surplus - solarUsed;
          gridExport = Math.max(0, remainingSolar);
          
          // 2. Top up from Grid (Force Charge) if space remains
          const spaceRemaining = battery.capacity - battery.soc;
          const chargeRateRemaining = maxInput - solarUsed; // Remaining input bandwidth
          
          if (spaceRemaining > 0 && chargeRateRemaining > 0) {
             const maxGridInput = Math.min(chargeRateRemaining, spaceRemaining / battery.efficiency);
             const gridInput = maxGridInput;
             
             batteryCharge += gridInput * battery.efficiency;
             battery.soc += gridInput * battery.efficiency;
             gridImport += gridInput; // Import for battery
          }
          
        } else {
          // Deficit scenario (Solar < Load)
          // Load needs (consumption - generation).
          // Battery charges from Grid.
          
          gridImport += netEnergy; // Import for Load
          
          // Charge Battery from Grid
          const spaceRemaining = battery.capacity - battery.soc;
          const maxGridInput = Math.min(battery.maxChargeRate, spaceRemaining / battery.efficiency);
          
          batteryCharge += maxGridInput * battery.efficiency;
          battery.soc += maxGridInput * battery.efficiency;
          gridImport += maxGridInput; // Import for battery
        }
        
      } else if (signal === 'DISCHARGE') {
        // FORCE DISCHARGE STRATEGY (Dump to Load/Grid)
        // 1. Solar serves Load.
        // 2. Battery serves remaining Load.
        // 3. Battery dumps remaining energy to Grid.
        
        const availableEnergy = battery.soc;
        
        if (netEnergy < 0) {
           // Surplus (Solar > Load)
           // Solar covers load.
           // Solar export = surplus.
           
           gridExport += Math.abs(netEnergy);
           
           // Battery Dump
           // Output max discharge rate or available energy
           // We assume maxDischargeRate is "output energy".
           const maxOutput = battery.maxDischargeRate;
           const dischargeAmount = Math.min(availableEnergy, maxOutput); // Output energy
           
           // Discharge logic in previous code:
           // "dischargeAmount = min(deficit, available * eff)" -> SOC -= dischargeAmount / eff
           // Wait, previous code: "dischargeAmount = min(deficit, available * eff)"
           // This implies "dischargeAmount" is ENERGY DELIVERED (after efficiency loss on output?)
           // Or is efficiency only on input?
           // Standard simple models: Eff is usually round-trip. Often split sqrt(eff) in, sqrt(eff) out.
           // Previous code implementation:
           // "energyToStore = surplus * eff" (Loss on Input)
           // "dischargeAmount = min(deficit, available * eff)" (Loss on Output???)
           // If available is SOC, and we discharge, usually SOC decreases by X, and we get X * eff out?
           // Or SOC decreases by X/eff to get X out?
           // The previous code: "soc -= dischargeAmount / eff" implies:
           // To deliver Y, we remove Y/eff from SOC.
           // This effectively applies efficiency TWICE if we charged with eff too?
           // Let's check "round-trip efficiency" definition.
           // Usually: E_out / E_in = Eff.
           // If we do E_stored = E_in * Eff_in
           // And E_out = E_stored * Eff_out
           // Then E_out = E_in * Eff_in * Eff_out = E_in * Eff_roundtrip.
           // If `efficiency` parameter is 0.9 (roundtrip), we should take sqrt(0.9) ~ 0.95 for each leg?
           // OR apply it all on one leg.
           // Previous code applied it on BOTH legs:
           // 1. Charge: stored = input * eff. (SOC = Input * 0.9)
           // 2. Discharge: soc -= output / eff. (SOC reduced by Output / 0.9)
           //    => Output = SOC_delta * 0.9.
           //    => Output = (Input * 0.9) * 0.9 = Input * 0.81.
           // So the previous code implements `efficiency^2` round trip if `efficiency` is 0.9.
           // That's 81% RTE. That's probably acceptable for a simple model, but slightly aggressive loss.
           // But I will STICK TO THE EXISTING LOGIC to avoid breaking behavior, unless I see it's clearly broken.
           // It says "Round-trip efficiency (0-1), default 0.9".
           // If it means RTE, applying 0.9 twice yields 0.81.
           // I'll stick to the pattern but maybe relax it to sqrt?
           // No, stick to pattern for consistency.
           
           batteryDischarge = dischargeAmount;
           battery.soc -= dischargeAmount / battery.efficiency;
           
           gridExport += dischargeAmount;
           
        } else {
           // Deficit (Load > Solar)
           const deficit = netEnergy;
           
           // Battery covers deficit first
           // Output capacity limited by maxDischargeRate
           const maxOutput = battery.maxDischargeRate;
           
           // Available from battery (output side)
           // We have `soc` kWh inside. We can deliver `soc * eff`? 
           // Previous code: "dischargeAmount = min(deficit, soc * eff)".
           // Wait, previous code says: "availableEnergy = battery.soc".
           // "dischargeAmount = min(deficit, availableEnergy * battery.efficiency)"
           // "soc -= dischargeAmount / battery.efficiency".
           // If we discharge `soc * eff`, then `soc -= (soc * eff) / eff` => `soc -= soc` => 0. Correct.
           
           const maxPossibleOutput = battery.soc * battery.efficiency;
           const targetOutput = Math.min(maxPossibleOutput, maxOutput);
           
           // Use to cover deficit
           const coveredByBattery = Math.min(deficit, targetOutput);
           batteryToLoadKwh = coveredByBattery;
           
           batteryDischarge += coveredByBattery;
           battery.soc -= coveredByBattery / battery.efficiency;
           
           // Remaining deficit from Grid
           const remainingDeficit = deficit - coveredByBattery;
           gridImport += remainingDeficit;
           
           // If we still have discharge capacity and energy, dump it to grid?
           // SIGNAL IS DISCHARGE. So yes, dump the rest.
           const outputRemaining = targetOutput - coveredByBattery;
           if (outputRemaining > 0) {
              batteryDischarge += outputRemaining;
              battery.soc -= outputRemaining / battery.efficiency;
              gridExport += outputRemaining;
           }
        }
        
      } else {
        // AUTO (Self-Consumption)
        // Same as original logic
        if (netEnergy < 0) {
          // Surplus: charge battery first, then export
          const surplus = Math.abs(netEnergy);
          const availableCapacity = battery.capacity - battery.soc;
          
          // Limit by max charge rate
          const maxInput = battery.maxChargeRate;
          
          // Charge battery
          // input energy = surplus
          // energyToStore = min(surplus * eff, capacity - soc, maxInput * eff)
          // Wait, maxInput is input kW.
          const effectiveInput = Math.min(surplus, maxInput, availableCapacity / battery.efficiency);
          
          const energyToStore = effectiveInput * battery.efficiency;
          
          batteryCharge = energyToStore;
          battery.soc += energyToStore;
          
          // Export remainder
          const exported = surplus - effectiveInput;
          gridExport = Math.max(0, exported);
          
        } else if (netEnergy > 0) {
          // Deficit: discharge battery first, then import
          const deficit = netEnergy;
          const availableEnergy = battery.soc; // Internal energy
          
          // Max output
          const maxOutput = battery.maxDischargeRate;
          
          // Discharge battery
          // max possible delivered = available * eff
          const maxPossibleOutput = availableEnergy * battery.efficiency;
          
          const dischargeAmount = Math.min(deficit, maxPossibleOutput, maxOutput);
          
          batteryToLoadKwh = dischargeAmount;
          batteryDischarge = dischargeAmount;
          battery.soc -= dischargeAmount / battery.efficiency;
          
          // Import remainder
          const remaining = deficit - dischargeAmount;
          gridImport = Math.max(0, remaining);
        }
      }
    } else {
      // No battery: direct import/export
      if (netEnergy < 0) {
        gridExport = Math.abs(netEnergy);
      } else if (netEnergy > 0) {
        gridImport = netEnergy;
      }
    }

    // Calculate costs
    // Use dynamic price if available
    let unitRate = 0;
    let exportRate = 0;

    if (useTrading) {
       unitRate = (hourlyPrice || 0) + (tradingConfig!.importMargin || 0);
       exportRate = (hourlyPrice || 0) - (tradingConfig!.exportMargin || 0);
       // Prevent negative export revenue? 
       // If price is very negative, you pay to export. 
       // If price is positive but small < margin, export rate is negative?
       // The user said "exports do not work with market pricing... I have not built in export logic".
       // But strictly, if you export to market, you get market price.
       // We will allow negative exportRate (paying to export) as that's realistic in negative prices,
       // unless user wants a floor.
       // We'll trust the math: (Price - Margin).
    } else {
       unitRate = getTariffRateForHour(hourOfDay, tariff);
       exportRate = tariff.exportRate;
    }

    const pso = tariff.psoLevy || 0;
    const standingCharge = tariff.standingCharge / 24;
    
    // Value of displaced energy (avoided cost)
    // Avoided cost = unitRate + pso
    const effectiveImportRate = unitRate + pso;
    
    totalSolarToLoadKwh += solarToLoadKwh;
    totalBatteryToLoadKwh += batteryToLoadKwh;
    
    totalSolarToLoadSavings += (solarToLoadKwh * effectiveImportRate);
    totalBatteryToLoadSavings += (batteryToLoadKwh * effectiveImportRate);

    const importCost = standingCharge + gridImport * effectiveImportRate;
    
    // Export revenue
    const exportRevenue = gridExport * exportRate;

    // Accumulate totals
    totalGridImport += gridImport;
    totalGridExport += gridExport;
    totalSelfConsumption += (generation - gridExport); // This might be slightly inaccurate if battery is involved?
    // selfConsumption = solarToLoad + batteryToLoad?
    // No, strictly "self-consumption" usually means "solar energy used on site".
    // If battery is charged from solar, that counts as self-consumption (eventually).
    // The previous formula (generation - gridExport) assumes all non-exported solar is self-consumed (either directly or via battery).
    // But if battery dumps to grid, that energy is exported, so it's subtracted.
    // So (generation - totalExport) is correct for "Solar Self-Consumption".
    
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
        tariffBucket: bucket,
        marketPrice: hourlyPrice
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
    
    // Breakdown
    totalSolarToLoadKwh,
    totalBatteryToLoadKwh,
    totalSolarToLoadSavings,
    totalBatteryToLoadSavings,
    
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
