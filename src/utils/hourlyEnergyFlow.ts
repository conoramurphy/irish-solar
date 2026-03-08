import type { HourlyEnergyFlow, HourlySimulationResult, Tariff, TradingConfig } from '../types';
import type { HourStamp } from './solarTimeseriesParser';
import { getEffectiveTariffBucketForHour, getTariffRateForHour } from './tariffRate';
import { DAYS_PER_MONTH_NON_LEAP } from '../constants/calendar';

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
  /** Grid Export Cap (kW). Default is unlimited (Infinity) if not set. */
  gridExportCapKw?: number;
}


/**
 * Calculate baseline cost (no solar) for an hour
 */
function calculateBaselineCost(
  consumption: number,
  hourOfDay: number,
  tariff: Tariff,
  dayOfWeek: number | undefined,
  slotsPerDay: number,
  hourlyPrice?: number,
  tradingConfig?: TradingConfig
): number {
  let unitRate = 0;

  if (hourlyPrice !== undefined && tradingConfig?.enabled) {
    // Dynamic pricing: Price + Margin
    unitRate = hourlyPrice + (tradingConfig.importMargin ?? 0);
  } else {
    // Static tariff
    unitRate = getTariffRateForHour(hourOfDay, tariff, dayOfWeek);
  }

  const pso = tariff.psoLevy || 0;
  
  // Standing charge is per day; slotsPerDay splits it across the resolution
  const standingCharge = tariff.standingCharge / slotsPerDay;
  
  return standingCharge + (consumption * (unitRate + pso));
}

/**
 * Calculate domestic tariff optimization signals based on rate windows.
 * For domestic tariffs with time-of-use rates (EV, night, day/night, etc.),
 * identify cheap charging windows and expensive discharging windows.
 * 
 * Strategy:
 * - CHARGE during cheapest rate windows (EV rate, free electricity, night rate)
 * - DISCHARGE during most expensive rate windows (peak rate, day rate)
 * - AUTO otherwise (solar self-consumption)
 * 
 * @returns Array of signals for each hour
 */
function calculateDomesticTariffSignals(
  tariff: Tariff,
  timeStamps: HourStamp[] | undefined,
  totalHours: number
): ('CHARGE' | 'DISCHARGE' | 'AUTO')[] {
  const signals = new Array(totalHours).fill('AUTO');
  
  // Calculate hourly rates for the entire year
  const hourlyRates: number[] = [];
  for (let hour = 0; hour < totalHours; hour++) {
    const hourOfDay = timeStamps ? timeStamps[hour]!.hour : hour % 24;
    const dayOfWeek = timeStamps 
      ? new Date(timeStamps[hour]!.year, timeStamps[hour]!.monthIndex, timeStamps[hour]!.day).getDay() 
      : undefined;
    
    hourlyRates.push(getTariffRateForHour(hourOfDay, tariff, dayOfWeek));
  }
  
  // Find unique rate levels and sort them
  const uniqueRates = Array.from(new Set(hourlyRates)).sort((a, b) => a - b);
  
  // If there's only one rate (flat tariff), no optimization needed
  if (uniqueRates.length <= 1) {
    return signals;
  }
  
  // Identify cheap and expensive rate thresholds
  const cheapThreshold = uniqueRates[0]; // Cheapest rate for charging
  const expensiveThreshold = uniqueRates[uniqueRates.length - 1]; // Most expensive (peak)
  
  // Find the first hour of peak rate each day to start discharge
  // Process day by day (24-hour chunks)
  const peakStartHours: number[] = [];
  
  const slotsPerDay = totalHours > 10000 ? 48 : 24;
  for (let dayStart = 0; dayStart < totalHours; dayStart += slotsPerDay) {
    const dayEnd = Math.min(dayStart + slotsPerDay, totalHours);
    const dayRates = hourlyRates.slice(dayStart, dayEnd);
    
    const peakStartInDay = dayRates.findIndex(r => r === expensiveThreshold);
    if (peakStartInDay !== -1) {
      peakStartHours.push(dayStart + peakStartInDay);
    }
  }
  
  for (let hour = 0; hour < totalHours; hour++) {
    const rate = hourlyRates[hour];
    const slotInDay = hour % slotsPerDay;
    const dayStart = hour - slotInDay;
    
    const peakStart = peakStartHours.find(ps => ps >= dayStart && ps < dayStart + slotsPerDay);
    
    // CHARGE: Only during absolute cheapest rate (EV rate, free electricity)
    if (rate === cheapThreshold) {
      signals[hour] = 'CHARGE';
    }
    // DISCHARGE: From peak hour onwards until end of day (or until we hit charging hours)
    // This ensures battery holds charge until peak, then discharges continuously
    else if (peakStart !== undefined && hour >= peakStart && rate > cheapThreshold) {
      signals[hour] = 'DISCHARGE';
    }
    // Otherwise: AUTO (solar self-consumption only, battery won't actively discharge)
  }
  
  return signals;
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

  const slotsPerDay = totalHours > 10000 ? 48 : 24;
  
  for (let i = 0; i < totalHours; i += slotsPerDay) {
    const dayPrices = hourlyPrices.slice(i, Math.min(i + slotsPerDay, totalHours));
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
 * @param useDomesticOptimization Whether to use domestic tariff optimization (smart charging for TOU tariffs)
 */
export function simulateHourlyEnergyFlow(
  hourlyGeneration: number[],
  hourlyConsumption: number[],
  tariff: Tariff,
  batteryConfig?: BatteryConfig,
  includeHourlyDetail = false,
  timeStamps?: HourStamp[],
  hourlyPrices?: number[],
  tradingConfig?: TradingConfig,
  useDomesticOptimization = false
): HourlySimulationResult {
  if (hourlyGeneration.length !== hourlyConsumption.length) {
    throw new Error('Generation and consumption arrays must have the same length');
  }
  const validLengths = [8760, 8784, 17520, 17568];
  if (!validLengths.includes(hourlyGeneration.length)) {
    throw new Error(
      `Simulation supports 8760/8784 (hourly) or 17520/17568 (half-hourly) slots, got ${hourlyGeneration.length}`
    );
  }

  const useTrading = tradingConfig?.enabled && hourlyPrices && hourlyPrices.length === hourlyGeneration.length;

  // Derive resolution from input length: 48 slots/day for half-hourly, 24 for hourly
  const slotsPerDay = hourlyGeneration.length > 10000 ? 48 : 24;

  const battery = batteryConfig ? {
    capacity: Math.max(0, batteryConfig.capacityKwh),
    efficiency: Math.max(0, Math.min(1, batteryConfig.efficiency ?? 0.9)),
    soc: Math.max(0, Math.min(1, batteryConfig.initialSoC ?? 0)) * Math.max(0, batteryConfig.capacityKwh),
    maxChargeRate: Math.max(0, batteryConfig.maxChargeRateKw ?? batteryConfig.capacityKwh), 
    maxDischargeRate: Math.max(0, batteryConfig.maxDischargeRateKw ?? batteryConfig.capacityKwh)
  } : null;

  // Use the export cap from batteryConfig or default to infinity (no limit)
  // Even if no battery is present, we might want to respect this, but currently it's passed in BatteryConfig.
  // Ideally, it should be a top-level parameter, but let's extract it safely.
  const gridExportCapKw = batteryConfig?.gridExportCapKw ?? Infinity;

  let totalGridImport = 0;
  let totalGridExport = 0;
  let totalGridExportCurtailed = 0; // Energy that would be exported but is above cap (unpaid)
  let totalSelfConsumption = 0;
  let totalImportCost = 0;
  let totalExportRevenue = 0;
  let totalBaselineCost = 0;

  const hourlyData: HourlyEnergyFlow[] = [];
  const totalHours = hourlyGeneration.length;

  if (timeStamps && timeStamps.length !== totalHours) {
    throw new Error('timeStamps length must match hourly arrays length');
  }

  // Pre-calculate optimization signals
  // Priority: Trading signals > Domestic tariff signals > AUTO (self-consumption)
  let optimizationSignals: ('CHARGE' | 'DISCHARGE' | 'AUTO')[];
  
  if (useTrading) {
    // Commercial mode with market trading: use price-based signals
    optimizationSignals = calculateTradingSignals(hourlyPrices!, tradingConfig!, totalHours);
  } else if (battery && useDomesticOptimization) {
    // Domestic mode (house): use rate-based smart charging for TOU tariffs
    optimizationSignals = calculateDomesticTariffSignals(tariff, timeStamps, totalHours);
  } else {
    // Commercial/farm without trading, or flat tariffs: use AUTO (self-consumption only)
    optimizationSignals = new Array(totalHours).fill('AUTO');
  }

  let totalSolarToLoadKwh = 0;
  let totalBatteryToLoadKwh = 0;
  let totalSolarToLoadSavings = 0;
  let totalBatteryToLoadSavings = 0;

  for (let hour = 0; hour < totalHours; hour++) {
    const generation = Math.max(0, hourlyGeneration[hour] || 0);
    const consumption = Math.max(0, hourlyConsumption[hour] || 0);
    const hourlyPrice = hourlyPrices ? hourlyPrices[hour] : undefined;

    const hourOfDay = timeStamps ? timeStamps[hour]!.hour : hour % 24;

    const dayOfWeek = timeStamps
      ? new Date(timeStamps[hour]!.year, timeStamps[hour]!.monthIndex, timeStamps[hour]!.day).getDay()
      : undefined;

    // Calculate baseline cost (no solar, for comparison)
    // If trading enabled, baseline uses dynamic price too (fair comparison)
    const baselineCost = calculateBaselineCost(consumption, hourOfDay, tariff, dayOfWeek, slotsPerDay, hourlyPrice, tradingConfig);
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
      const signal = optimizationSignals[hour];
      
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
          
          // Remaining solar -> Export (subject to cap)
          const potentialExport = surplus - solarUsed;
          // If we hit the cap, the excess is curtailed (lost)
          gridExport = Math.min(potentialExport, gridExportCapKw);
          const curtailed = Math.max(0, potentialExport - gridExport);
          totalGridExportCurtailed += curtailed;
          
          // For trading mode: Top up battery from grid to maximize capacity
          // For domestic tariffs: DO NOT charge from grid when solar surplus exists
          // (solar self-consumption always takes priority for home/small business)
          if (useTrading) {
            // 2. Top up from Grid (Force Charge for trading arbitrage)
            const spaceRemaining = battery.capacity - battery.soc;
            const chargeRateRemaining = maxInput - solarUsed; // Remaining input bandwidth
            
            if (spaceRemaining > 0 && chargeRateRemaining > 0) {
               const maxGridInput = Math.min(chargeRateRemaining, spaceRemaining / battery.efficiency);
               const gridInput = maxGridInput;
               
               batteryCharge += gridInput * battery.efficiency;
               battery.soc += gridInput * battery.efficiency;
               gridImport += gridInput; // Import for battery
            }
          }
          // For domestic tariffs, solar surplus charging is sufficient - no grid top-up
          
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
           // Solar export = surplus (subject to cap).
           const potentialSolarExport = Math.abs(netEnergy);
           // We will add battery export to this later, so let's track total export for this hour
           let currentHourExport = 0;
           
           const allowedSolarExport = Math.min(potentialSolarExport, gridExportCapKw);
           const solarCurtailed = Math.max(0, potentialSolarExport - allowedSolarExport);
           totalGridExportCurtailed += solarCurtailed;
           currentHourExport += allowedSolarExport;
           gridExport += allowedSolarExport;
           
           // Battery Dump
           // Output max discharge rate or available energy
           // We assume maxDischargeRate is "output energy".
           const maxOutput = battery.maxDischargeRate;
           
           // Check remaining export headroom
           const remainingExportCap = Math.max(0, gridExportCapKw - currentHourExport);
           
           // Discharge is limited by: Available Energy, Max Discharge Rate, AND Remaining Export Cap
           const potentialDischarge = Math.min(availableEnergy, maxOutput);
           const dischargeAmount = Math.min(potentialDischarge, remainingExportCap); // Output energy
           const batteryCurtailed = Math.max(0, potentialDischarge - dischargeAmount);
           totalGridExportCurtailed += batteryCurtailed;
           
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
           // SIGNAL IS DISCHARGE. So yes, dump the rest (subject to cap).
           const outputRemaining = targetOutput - coveredByBattery;
           
           // We are exporting the remaining battery output.
           // Check if we have export headroom.
           // In this branch, Grid Import > 0 (to cover remaining deficit), so Net Grid Flow is Import.
           // Wait, you can't import and export simultaneously on a single meter usually.
           // If we still have deficit, we are importing.
           // So we can't "dump to grid" while importing for load.
           // The "DISCHARGE" signal implies "Use battery to reduce load, then export".
           // If we are still importing, we consumed everything locally.
           // So NO export here.
           
           // HOWEVER, previous code logic was:
           // "gridImport += remainingDeficit"
           // "gridExport += outputRemaining"
           // This implies simultaneous import/export which is physically impossible on a single phase/meter
           // unless it's a specific setup.
           // BUT, `targetOutput` was calculated based on `maxOutput`.
           // `coveredByBattery` used some of that.
           // `outputRemaining` is what's left of the battery's *capacity* to discharge.
           // If we are in deficit, the load ate it all. 
           // Why would there be `outputRemaining`?
           // Ah, `targetOutput = min(maxPossible, maxOutput)`.
           // `coveredByBattery = min(deficit, targetOutput)`.
           // If deficit > targetOutput, then covered = targetOutput, remaining = 0.
           // If deficit < targetOutput, then covered = deficit, remaining > 0.
           // If deficit < targetOutput, it means the battery COVERS the load and has EXTRA.
           // In that case, we should NOT have `remainingDeficit > 0`.
           // Let's re-verify the logic block.
           
           // Case A: Battery < Deficit. 
           // covered = targetOutput. remaining = 0.
           // remainingDeficit = deficit - targetOutput > 0.
           // gridImport > 0.
           // Correct. No export.
           
           // Case B: Battery > Deficit.
           // covered = deficit.
           // remainingDeficit = 0.
           // gridImport = 0.
           // outputRemaining > 0.
           // NOW we can export `outputRemaining` (subject to cap).
           
           if (outputRemaining > 0) {
              const allowedExport = Math.min(outputRemaining, gridExportCapKw);
              const batteryCurtailed = Math.max(0, outputRemaining - allowedExport);
              totalGridExportCurtailed += batteryCurtailed;
              
              batteryDischarge += allowedExport;
              battery.soc -= allowedExport / battery.efficiency;
              gridExport += allowedExport;
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
          
          // Export remainder (subject to cap)
          const potentialExport = surplus - effectiveInput;
          const allowedExport = Math.min(potentialExport, gridExportCapKw);
          const curtailed = Math.max(0, potentialExport - allowedExport);
          totalGridExportCurtailed += curtailed;
          gridExport = Math.max(0, allowedExport);
          
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
        const potentialExport = Math.abs(netEnergy);
        // Apply export cap even without battery
        // We need to pass gridExportCapKw to this function even if batteryConfig is undefined?
        // Currently it's inside batteryConfig. 
        // We defined `gridExportCapKw` at top of function scope from batteryConfig?.gridExportCapKw.
        // If batteryConfig is undefined, it defaults to Infinity.
        // If the user has NO battery but wants to cap export (e.g. 100kW limit), 
        // they must pass a dummy batteryConfig or we need a top-level param.
        // For now, `gridExportCapKw` handles it if passed.
        gridExport = Math.min(potentialExport, gridExportCapKw);
        const curtailed = Math.max(0, potentialExport - gridExport);
        totalGridExportCurtailed += curtailed;
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
       unitRate = getTariffRateForHour(hourOfDay, tariff, dayOfWeek);
       exportRate = tariff.exportRate;
    }

    const pso = tariff.psoLevy || 0;
    const standingCharge = tariff.standingCharge / slotsPerDay;
    
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
      // Prefer the *effective* bucket so audit + downstream reporting can distinguish EV/free windows.
      const bucket = getEffectiveTariffBucketForHour(hourOfDay, tariff, dayOfWeek);
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
    totalGridExportCurtailed,
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

function hourToMonthIndexFallback(slotIndex: number, totalSlotsInYear: number): number {
  const slotsPerDay = totalSlotsInYear > 10000 ? 48 : 24;
  const totalDays = totalSlotsInYear / slotsPerDay;
  const isLeap = totalDays > 365;
  const dpm = isLeap
    ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    : DAYS_PER_MONTH_NON_LEAP;
  let cumulativeSlots = 0;
  for (let m = 0; m < 12; m++) {
    const monthSlots = (dpm[m] ?? 30) * slotsPerDay;
    if (slotIndex < cumulativeSlots + monthSlots) return m;
    cumulativeSlots += monthSlots;
  }
  return 11;
}
