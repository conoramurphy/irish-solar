/**
 * Calibration script: compare heat pump model output against sample_house_heat_pump_2025.csv.
 *
 * Run: npx tsx scripts/calibrate_hp.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateHeatPumpProfile, estimateSCOP } from '../src/utils/heatPumpModel';
import { parseWeatherCSV } from '../src/utils/weatherDataLoader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Load real weather data ---
const weatherCsv = readFileSync(join(__dirname, '../public/data/weather/Dublin_2025.csv'), 'utf-8');
const weather = parseWeatherCSV(weatherCsv, 'Dublin');

// --- Sample house params (from HEAT_PUMP_PLAN.md) ---
// BER B2, 115 m², HLI ≈ 1.3, good install
const params = {
  archetypeId: '1990s_semi', // closest match for BER B2
  hliOverride: 1.3,
  floorAreaM2: 115,
  insulation: [] as const,
  installQuality: 'good' as const,
  location: 'Dublin',
  year: 2025,
  occupants: 4, // 115/30 ≈ 3.8, rounds to 4
};

console.log('=== Heat Pump Calibration ===');
console.log(`Archetype: ${params.archetypeId}, HLI: ${params.hliOverride}, Floor: ${params.floorAreaM2} m²`);
console.log(`Install quality: ${params.installQuality}, Location: ${params.location}, Occupants: ${params.occupants}`);
console.log();

// --- Run with synthetic temps ---
const profileSynthetic = generateHeatPumpProfile(params);
const totalSyntheticKwh = profileSynthetic.reduce((a, b) => a + b, 0);
const scopSynthetic = estimateSCOP(params);

console.log('--- Synthetic temperature model ---');
console.log(`HP electricity: ${totalSyntheticKwh.toFixed(0)} kWh/yr`);
console.log(`SCOP: ${scopSynthetic.toFixed(2)}`);

// --- Run with real temps ---
const paramsReal = { ...params, realTemperaturesC: weather.temperatureC };
const profileReal = generateHeatPumpProfile(paramsReal);
const totalRealKwh = profileReal.reduce((a, b) => a + b, 0);
const scopReal = estimateSCOP(paramsReal);

console.log();
console.log('--- Real 2025 temperature data ---');
console.log(`HP electricity: ${totalRealKwh.toFixed(0)} kWh/yr`);
console.log(`SCOP: ${scopReal.toFixed(2)}`);

// --- Expected ---
const expectedHpKwh = 2080; // from plan: total 9320 - base 7240
const expectedTotalKwh = 9320;
const baseHouseKwh = expectedTotalKwh - expectedHpKwh;

console.log();
console.log('--- Target (from sample_house_heat_pump_2025.csv) ---');
console.log(`Total house: ${expectedTotalKwh} kWh/yr`);
console.log(`Estimated base appliances: ~${baseHouseKwh} kWh/yr`);
console.log(`Estimated HP portion: ~${expectedHpKwh} kWh/yr`);

console.log();
console.log('--- Comparison ---');
console.log(`Synthetic HP vs expected: ${totalSyntheticKwh.toFixed(0)} vs ${expectedHpKwh} (${((totalSyntheticKwh / expectedHpKwh - 1) * 100).toFixed(1)}%)`);
console.log(`Real temp HP vs expected: ${totalRealKwh.toFixed(0)} vs ${expectedHpKwh} (${((totalRealKwh / expectedHpKwh - 1) * 100).toFixed(1)}%)`);

// --- Monthly breakdown ---
console.log();
console.log('--- Monthly HP electricity (real temps, kWh) ---');
const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let slotIdx = 0;
for (let m = 0; m < 12; m++) {
  const slotsInMonth = daysInMonth[m] * 48;
  let monthTotal = 0;
  for (let s = 0; s < slotsInMonth; s++) {
    monthTotal += profileReal[slotIdx++];
  }
  console.log(`  Month ${(m + 1).toString().padStart(2)}: ${monthTotal.toFixed(0).padStart(6)} kWh`);
}

// ===================================================================
// Compare against real meter data (HDF_kW_10013712656)
// ===================================================================

// Model this house: estimated HLI 2.3, ~150m², poor install
const realHouseParams = {
  archetypeId: '1980s_semi' as const,
  hliOverride: 2.3,
  floorAreaM2: 150,
  insulation: [] as const,
  installQuality: 'poor' as const,
  location: 'Dublin',
  year: 2025,
  occupants: 4,
  realTemperaturesC: weather.temperatureC,
};

const realHouseProfile = generateHeatPumpProfile(realHouseParams);
const realHouseScop = estimateSCOP(realHouseParams);
const realHouseTotal = realHouseProfile.reduce((a, b) => a + b, 0);

console.log();
console.log('=== Real meter house (HLI ~2.3, 150m², poor install) ===');
console.log(`Model HP electricity: ${realHouseTotal.toFixed(0)} kWh/yr`);
console.log(`Model SCOP: ${realHouseScop.toFixed(2)}`);

// Monthly model output
const daysInMonth2 = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
let idx2 = 0;
console.log();
console.log('Month  ModelHP  Actual   ActualDaily  ModelDaily');
const actualData: Record<number, { kwh: number; days: number }> = {
  10: { kwh: 317, days: 14 },
  11: { kwh: 877, days: 30 },
  12: { kwh: 776, days: 31 },
};
for (let m = 0; m < 12; m++) {
  const slotsInMonth = daysInMonth2[m] * 48;
  let monthTotal = 0;
  for (let s = 0; s < slotsInMonth; s++) monthTotal += realHouseProfile[idx2++];
  const modelDaily = monthTotal / daysInMonth2[m];
  const actual = actualData[m + 1];
  const actualStr = actual ? `${actual.kwh.toFixed(0).padStart(6)}   ${(actual.kwh / actual.days).toFixed(1).padStart(8)}` : '     —         —';
  console.log(`  ${(m + 1).toString().padStart(2)}   ${monthTotal.toFixed(0).padStart(6)}  ${actualStr}   ${modelDaily.toFixed(1).padStart(8)}`);
}

// ===================================================================
// Real meter house — EV-stripped estimate: ~8,300 kWh/yr HP electricity
// HLC ~290 W/K from temperature regression. Try different parameters.
// ===================================================================

console.log();
console.log('=== Model vs real meter house (EV stripped, ~8,300 kWh HP target) ===');
console.log();
console.log('Params                                        HP kWh/yr  SCOP   vs 8300');

for (const { label, hli, area, offset } of [
  { label: 'HLI 1.9, 150m², offset +0  (good)  ', hli: 1.9, area: 150, offset: 0 },
  { label: 'HLI 1.9, 150m², offset +3          ', hli: 1.9, area: 150, offset: 3 },
  { label: 'HLI 1.9, 150m², offset +5          ', hli: 1.9, area: 150, offset: 5 },
  { label: 'HLI 1.9, 150m², offset +7          ', hli: 1.9, area: 150, offset: 7 },
  { label: 'HLI 1.9, 150m², offset +10 (poor)  ', hli: 1.9, area: 150, offset: 10 },
  { label: 'HLI 2.0, 145m², offset +5          ', hli: 2.0, area: 145, offset: 5 },
  { label: 'HLI 2.0, 145m², offset +7          ', hli: 2.0, area: 145, offset: 7 },
  { label: 'HLI 2.4, 120m², offset +5          ', hli: 2.4, area: 120, offset: 5 },
  { label: 'HLI 2.4, 120m², offset +7          ', hli: 2.4, area: 120, offset: 7 },
  { label: 'HLI 1.7, 170m², offset +5          ', hli: 1.7, area: 170, offset: 5 },
]) {
  const p = {
    archetypeId: '1980s_semi' as const,
    hliOverride: hli,
    floorAreaM2: area,
    insulation: [] as const,
    installQuality: 'good' as const,
    flowTempOffsetC: offset,
    location: 'Dublin',
    year: 2025,
    occupants: 4,
    realTemperaturesC: weather.temperatureC,
  };
  const prof = generateHeatPumpProfile(p);
  const total = prof.reduce((a: number, b: number) => a + b, 0);
  const scop = estimateSCOP(p);
  const pct = ((total / 8300 - 1) * 100).toFixed(0);
  console.log(`  ${label}  ${total.toFixed(0).padStart(7)}  ${scop.toFixed(2)}   ${pct.padStart(4)}%`);
}

// --- Diagnostics: DHW vs space heating split ---
import { calculateCOP, getFlowTempC } from '../src/utils/heatPumpModel';
import { getDesignFlowTempC } from '../src/data/heatPumpArchetypes';

const hli = 1.3;
const hlc = hli * 115; // W/K
const designFlow = getDesignFlowTempC(hli);
console.log();
console.log('=== Diagnostics ===');
console.log(`HLC: ${hlc} W/K, Design flow: ${designFlow}°C`);

// DHW annual
const dhwPerDay = 2.56 * 4; // kWh thermal, 4 occupants
let dhwElecTotal = 0;
let spaceElecTotal = 0;
for (let s = 0; s < weather.temperatureC.length && s < 17568; s++) {
  const tOut = weather.temperatureC[s];
  const halfHour = s % 48;

  // Space heating
  if (tOut < 15.5) {
    const deltaT = Math.max(0, 21 - tOut);
    const thermalKwh = (hlc * deltaT * 0.5) / 1000;
    const tFlow = getFlowTempC(tOut, designFlow, 'good');
    const cop = calculateCOP(tOut, tFlow);
    spaceElecTotal += thermalKwh / cop;
  }

  // DHW (simplified — same profile weighting as the model)
  const copDhw = calculateCOP(tOut, 52);
  // Average daily DHW spread across 48 slots
  const dhwThermal = dhwPerDay / 48; // simplified uniform
  dhwElecTotal += dhwThermal / copDhw;
}

console.log(`Space heating elec: ${spaceElecTotal.toFixed(0)} kWh/yr`);
console.log(`DHW elec: ${dhwElecTotal.toFixed(0)} kWh/yr`);
console.log(`Total HP elec: ${(spaceElecTotal + dhwElecTotal).toFixed(0)} kWh/yr`);

// Spot checks
for (const tOut of [-3, 0, 5, 10, 15]) {
  const tFlow = getFlowTempC(tOut, designFlow, 'good');
  const cop = calculateCOP(tOut, tFlow);
  const deltaT = Math.max(0, 21 - tOut);
  const heatKw = hlc * deltaT / 1000;
  console.log(`  T_out=${tOut}°C → T_flow=${tFlow.toFixed(1)}°C, COP=${cop.toFixed(2)}, heat=${heatKw.toFixed(2)}kW, elec=${(heatKw/cop).toFixed(2)}kW`);
}
