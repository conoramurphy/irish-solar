/**
 * Orientation payback analysis script — PVGIS-powered.
 *
 * Uses pre-baked PVGIS hourly profiles (8760 hours per orientation) to give
 * each orientation its TRUE temporal generation shape, then runs the full
 * hourly simulation engine to compute savings, self-consumption, and payback.
 *
 * This means west-facing panels correctly generate during expensive 5-7pm
 * peak tariff hours, and east-facing panels correctly peak in the morning.
 *
 * Run:  npx tsx scripts/orientation-payback.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseSolarTimeseriesCSV, normalizeSolarTimeseriesYear } from '../src/utils/solarTimeseriesParser.js';
import { runCalculation } from '../src/utils/calculations.js';
import { parsePvgisBinary, findProfile, type PvgisProfileEntry } from '../src/utils/pvgisProfileLoader.js';
import type {
  SystemConfiguration,
  Grant,
  Financing,
  Tariff,
  TradingConfig,
  HistoricalSolarData,
} from '../src/types/index.js';

// ── Dublin solar CSV (2023, CAMS half-hourly) ──────────────────────────
const csvPath = path.resolve('public/data/solar/Dublin_2023.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const rawSolar = parseSolarTimeseriesCSV(csvContent, 'Dublin');
const { normalized: solarData } = normalizeSolarTimeseriesYear(rawSolar, rawSolar.year);

// ── Load Dublin PVGIS profiles ─────────────────────────────────────────
const pvgisBinPath = path.resolve('public/data/pvgis/dublin.bin');
if (!fs.existsSync(pvgisBinPath)) {
  console.error('Dublin PVGIS profile not found. Run: npx tsx scripts/fetch-pvgis-profiles.ts');
  process.exit(1);
}
const pvgisBuf = fs.readFileSync(pvgisBinPath);
const pvgisData = parsePvgisBinary(pvgisBuf.buffer.slice(pvgisBuf.byteOffset, pvgisBuf.byteOffset + pvgisBuf.byteLength));

// ── Sample consumption: 4 200 kWh/yr "Small Traditional" house ─────────
const consumptionCsvPath = path.resolve('public/data/usages/sample_house_small_traditional_2025.csv');
const consumptionCsv = fs.readFileSync(consumptionCsvPath, 'utf-8');

function parseConsumptionCsv(csv: string): number[] {
  const lines = csv.split('\n');
  const dataStart = lines.findIndex(l => /^\d{2}\/\d{2}\/\d{4}/.test(l.trim()));
  if (dataStart === -1) {
    const numericStart = lines.findIndex(l => {
      const parts = l.split(',');
      return parts.length >= 2 && !isNaN(parseFloat(parts[1]));
    });
    if (numericStart === -1) throw new Error('Cannot parse consumption CSV');
    const hourly: number[] = [];
    for (let i = numericStart; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 2) {
        const val = parseFloat(parts[1]);
        if (Number.isFinite(val)) hourly.push(Math.max(0, val));
      }
    }
    return hourly;
  }
  const hourly: number[] = [];
  for (let i = dataStart; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length >= 2) {
      const val = parseFloat(parts[1]);
      if (Number.isFinite(val)) hourly.push(Math.max(0, val));
    }
  }
  return hourly;
}

const hourlyConsumption = parseConsumptionCsv(consumptionCsv);

// ── Tariff: typical Irish TOU ──────────────────────────────────────────
const tariff: Tariff = {
  id: 'generic-tou',
  supplier: 'Generic',
  product: 'TOU Reference',
  type: 'time-of-use',
  standingCharge: 0.70,
  rates: [
    { period: 'night', hours: '23:00-08:00', rate: 0.18 },
    { period: 'day',   hours: '08:00-17:00', rate: 0.30 },
    { period: 'peak',  hours: '17:00-23:00', rate: 0.38 },
  ],
  exportRate: 0.21,
};

// ── Grants (SEAI domestic) ─────────────────────────────────────────────
const grantsJson = JSON.parse(fs.readFileSync(path.resolve('src/data/grants.json'), 'utf-8'));
const domesticGrant: Grant[] = grantsJson.filter((g: Grant) =>
  g.eligibleFor.includes('house') && g.type === 'SEAI'
);

// ── Financing: cash purchase ───────────────────────────────────────────
const financing: Financing = { equity: 99999, interestRate: 0, termYears: 0 };
const trading: TradingConfig = { enabled: false };
const historicalSolar: Record<string, HistoricalSolarData> = {};

// ── Orientations to test ───────────────────────────────────────────────
const TILT = 30; // degrees — typical Irish roof pitch
const ORIENTATIONS = [
  { label: 'South',     azimuth:   0 },
  { label: 'SSW',       azimuth:  22 },
  { label: 'SW',        azimuth:  45 },
  { label: 'WSW',       azimuth:  68 },
  { label: 'West',      azimuth:  90 },
  { label: 'East',      azimuth: -90 },
  { label: 'ESE',       azimuth: -68 },
  { label: 'SE',        azimuth: -45 },
  { label: 'SSE',       azimuth: -22 },
  { label: 'NW',        azimuth: 135 },
  { label: 'NE',        azimuth:-135 },
  { label: 'North',     azimuth: 180 },
];

// ── Cost model ─────────────────────────────────────────────────────────
const BASE_SYSTEM_KWP = 4;
const BASE_COST = 5000;
const COST_PER_KWP_BASE = BASE_COST / BASE_SYSTEM_KWP;
const COST_PER_KWP_INCREMENTAL = COST_PER_KWP_BASE * 0.50;
const PANEL_WP = 440;
const PANEL_KWP = PANEL_WP / 1000;

// ── Helper: look up PVGIS profile and get annual kWh/kWp ───────────────
function getProfile(azimuth: number, tilt: number): PvgisProfileEntry {
  return findProfile(pvgisData, { azimuthDeg: azimuth, tiltDeg: tilt });
}

// ── Helper: run the engine with a PVGIS profile ────────────────────────
function simulate(
  profile: PvgisProfileEntry,
  systemKwp: number,
  installCost: number,
) {
  const annualKwh = profile.annualKwhPerKwp * systemKwp;
  const config: SystemConfiguration = {
    annualProductionKwh: annualKwh,
    systemSizeKwp: systemKwp,
    numberOfPanels: Math.round(systemKwp / PANEL_KWP),
    batterySizeKwh: 0,
    installationCost: installCost,
    location: 'Dublin',
    businessType: 'house',
    orientation: { azimuthDeg: profile.azimuthDeg, tiltDeg: profile.tiltDeg },
  };

  return runCalculation(
    config,
    domesticGrant,
    financing,
    tariff,
    trading,
    historicalSolar,
    [],
    25,
    undefined,
    solarData,
    undefined,
    hourlyConsumption,
    profile,
  );
}

// ── Run ────────────────────────────────────────────────────────────────
const southProfile = getProfile(0, TILT);
const southResult = simulate(southProfile, BASE_SYSTEM_KWP, BASE_COST);

console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║  SOLAR ORIENTATION PAYBACK — Dublin · PVGIS hourly profiles · 4 kWp · 4,200 kWh/yr consumption · TOU tariff · No battery         ║');
console.log('╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`  South-facing baseline: ${southProfile.annualKwhPerKwp.toFixed(0)} kWh/kWp/yr (PVGIS 2005-2023 average, ${TILT}° tilt)`);
console.log('');

// Header
const hdr = [
  'Orientation'.padEnd(12),
  'kWh/kWp'.padStart(8),
  'vs South'.padStart(9),
  '4kW Gen'.padStart(9),
  'Self-Use'.padStart(10),
  'Export'.padStart(9),
  'Yr1 Save'.padStart(10),
  'Payback'.padStart(9),
  '25yr NPV'.padStart(10),
  '│',
  '+1 panel'.padStart(10),
  '+Save'.padStart(8),
  '+Payback'.padStart(10),
];
console.log(hdr.join('  '));
console.log('─'.repeat(hdr.join('  ').length));

for (const orient of ORIENTATIONS) {
  const profile = getProfile(orient.azimuth, TILT);
  const pct = (profile.annualKwhPerKwp / southProfile.annualKwhPerKwp * 100).toFixed(0);

  // ── (A) Full 4 kWp array at this orientation ──
  const full = simulate(profile, BASE_SYSTEM_KWP, BASE_COST);

  // ── (B) Incremental panel: 4 kWp south + 0.44 kWp at this orientation ──
  // We can't perfectly blend two PVGIS profiles in a single simulation,
  // but we can approximate: the incremental panel's marginal value is
  // (combined savings - south-only savings).
  // For the combined system, use the south profile (dominant) and add
  // the incremental panel's production at this orientation's kWh/kWp.
  const incrementalCost = PANEL_KWP * COST_PER_KWP_INCREMENTAL;
  const combinedKwp = BASE_SYSTEM_KWP + PANEL_KWP;

  // For incremental analysis: run with south profile but add the extra kWh
  // The temporal shape of the extra panel matters, but it's only 10% of total.
  // Use the oriented profile's kWh/kWp for the marginal production.
  const combinedAnnualKwh = (BASE_SYSTEM_KWP * southProfile.annualKwhPerKwp) + (PANEL_KWP * profile.annualKwhPerKwp);

  // Run combined with south profile shape (dominant panel) + extra kWh
  const combinedConfig: SystemConfiguration = {
    annualProductionKwh: combinedAnnualKwh,
    systemSizeKwp: combinedKwp,
    numberOfPanels: Math.round(combinedKwp / PANEL_KWP),
    batterySizeKwh: 0,
    installationCost: BASE_COST + incrementalCost,
    location: 'Dublin',
    businessType: 'house',
    orientation: { azimuthDeg: 0, tiltDeg: TILT },
  };

  const combined = runCalculation(
    combinedConfig,
    domesticGrant,
    financing,
    tariff,
    trading,
    historicalSolar,
    [],
    25,
    undefined,
    solarData,
    undefined,
    hourlyConsumption,
    southProfile,  // Use south profile shape for combined (dominant)
  );

  const marginalSavings = combined.annualSavings - southResult.annualSavings;
  const marginalPayback = marginalSavings > 0 ? incrementalCost / marginalSavings : Infinity;

  const row = [
    orient.label.padEnd(12),
    `${profile.annualKwhPerKwp.toFixed(0)}`.padStart(8),
    `${pct}%`.padStart(9),
    `${full.annualGeneration.toFixed(0)} kWh`.padStart(9),
    `${full.annualSelfConsumption.toFixed(0)} kWh`.padStart(10),
    `${full.annualExport.toFixed(0)} kWh`.padStart(9),
    `€${full.annualSavings.toFixed(0)}`.padStart(10),
    `${full.simplePayback.toFixed(1)} yr`.padStart(9),
    `€${full.npv.toFixed(0)}`.padStart(10),
    '│',
    `€${incrementalCost.toFixed(0)}`.padStart(10),
    `€${marginalSavings.toFixed(0)}`.padStart(8),
    marginalPayback < 99 ? `${marginalPayback.toFixed(1)} yr`.padStart(10) : 'never'.padStart(10),
  ];
  console.log(row.join('  '));
}

console.log('');
console.log('Notes:');
console.log('  • PVGIS profiles: 8760-hourly generation shapes from EU JRC PVGIS (2005-2023 TMY average).');
console.log('  • Each orientation uses its TRUE hourly generation curve — west panels peak at 3-5pm,');
console.log('    east panels peak at 9-11am. This correctly captures peak tariff alignment.');
console.log('  • Base array: 4 kWp at €5,000. SEAI grant of €1,800 applied.');
console.log('  • Incremental panel: 0.44 kWp at 50% marginal cost = €275/panel.');
console.log('  • Consumption: 4,200 kWh/yr (SEAI "Small Traditional" profile).');
console.log('  • Tariff: TOU reference (day €0.30, peak €0.38, night €0.18, export €0.21/kWh).');
console.log('');
