/**
 * One-time build script: fetch hourly PV generation profiles from PVGIS
 * for all Irish counties × orientations × tilts.
 *
 * Writes one binary .bin file per county into public/data/pvgis/.
 *
 * Run:  npx tsx scripts/fetch-pvgis-profiles.ts
 *
 * PVGIS API: https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/
 * Rate limit: 30 req/sec. We use ~8 req/sec to be conservative.
 */

import fs from 'node:fs';
import path from 'node:path';
import { COUNTY_COORDINATES, type CountyCoordinate } from '../src/data/countyCoordinates.js';

// ── Configuration ──────────────────────────────────────────────────────

/** Azimuths in PVGIS convention: 0=south, 90=west, -90=east, ±180=north */
const AZIMUTHS = [0, 22, 45, 68, 90, -90, -68, -45, -22, 135, 157, 180] as const;

/** Tilts in degrees from horizontal */
const TILTS = [15, 30, 45] as const;

/** System losses (%) — PVGIS default for a well-maintained system */
const SYSTEM_LOSS = 14;

/** Delay between API requests (ms) */
const REQUEST_DELAY_MS = 125;

const OUTPUT_DIR = path.resolve('public/data/pvgis');

// ── Binary format constants ────────────────────────────────────────────

const HOURS_PER_YEAR = 8760;
const FORMAT_VERSION = 1;
const NUM_AZIMUTHS = AZIMUTHS.length;
const NUM_TILTS = TILTS.length;
const NUM_COMBOS = NUM_AZIMUTHS * NUM_TILTS;

// Header: 4 bytes
// Index: NUM_COMBOS × 7 bytes (int16LE azimuth, uint8 tilt, uint16LE annualKwhX10, uint16LE maxHourlyW)
// Data: NUM_COMBOS × 8760 bytes (uint8 normalized to peak)
const HEADER_SIZE = 4;
const INDEX_ENTRY_SIZE = 7;
const INDEX_SIZE = NUM_COMBOS * INDEX_ENTRY_SIZE;
const DATA_SIZE = NUM_COMBOS * HOURS_PER_YEAR;
const TOTAL_FILE_SIZE = HEADER_SIZE + INDEX_SIZE + DATA_SIZE;

// ── PVGIS API ──────────────────────────────────────────────────────────

interface PvgisHourlyRow {
  time: string;      // "20200101:0010"
  P: number;         // PV power output (W) for 1 kWp
  'G(i)': number;    // Global irradiance on panel plane (W/m²)
  'H_sun': number;   // Sun height (degrees)
  'T2m': number;     // Temperature (°C)
  'WS10m': number;   // Wind speed (m/s)
  Int: number;       // 1 = measured, 0 = reconstructed
}

async function fetchPvgisHourly(
  lat: number, lon: number, tilt: number, azimuth: number
): Promise<{ hourlyWatts: number[]; annualKwh: number }> {
  const url = new URL('https://re.jrc.ec.europa.eu/api/v5_3/seriescalc');
  url.searchParams.set('lat', lat.toFixed(4));
  url.searchParams.set('lon', lon.toFixed(4));
  url.searchParams.set('peakpower', '1');
  url.searchParams.set('loss', SYSTEM_LOSS.toString());
  url.searchParams.set('angle', tilt.toString());
  url.searchParams.set('aspect', azimuth.toString());
  url.searchParams.set('pvcalculation', '1');
  url.searchParams.set('outputformat', 'json');
  // Use a single full year from the TMY range
  url.searchParams.set('startyear', '2020');
  url.searchParams.set('endyear', '2020');

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PVGIS error ${resp.status} for lat=${lat},lon=${lon},tilt=${tilt},az=${azimuth}: ${text.slice(0, 200)}`);
  }

  const json = await resp.json() as {
    outputs: { hourly: PvgisHourlyRow[] };
    meta: Record<string, unknown>;
  };

  const rows = json.outputs.hourly;
  if (!rows || rows.length < HOURS_PER_YEAR) {
    throw new Error(`Expected ${HOURS_PER_YEAR} rows, got ${rows?.length ?? 0} for lat=${lat},lon=${lon},tilt=${tilt},az=${azimuth}`);
  }

  // P is in watts for 1 kWp system. Take first 8760 rows.
  const hourlyWatts = rows.slice(0, HOURS_PER_YEAR).map(r => Math.max(0, r.P ?? 0));
  // Annual kWh = sum of hourly watts / 1000
  const annualKwh = hourlyWatts.reduce((s, w) => s + w, 0) / 1000;

  return { hourlyWatts, annualKwh };
}

// ── Binary encoding ────────────────────────────────────────────────────

function encodeCountyBinary(
  profiles: Array<{
    azimuth: number;
    tilt: number;
    annualKwh: number;
    hourlyWatts: number[];
  }>
): Buffer {
  const buf = Buffer.alloc(TOTAL_FILE_SIZE);
  let offset = 0;

  // Header
  buf.writeUInt8(FORMAT_VERSION, offset++);
  buf.writeUInt8(NUM_AZIMUTHS, offset++);
  buf.writeUInt8(NUM_TILTS, offset++);
  buf.writeUInt8(0, offset++); // reserved

  // Index + Data
  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    const indexOffset = HEADER_SIZE + i * INDEX_ENTRY_SIZE;

    // Azimuth stored as int16LE (supports -180..180)
    buf.writeInt16LE(Math.round(p.azimuth), indexOffset);
    // Tilt as uint8
    buf.writeUInt8(p.tilt, indexOffset + 2);
    // Annual kWh as uint16 (×10 for 1 decimal place: 982.4 → 9824)
    buf.writeUInt16LE(Math.round(p.annualKwh * 10), indexOffset + 3);
    // Max hourly watts as uint16
    const maxW = Math.max(...p.hourlyWatts);
    buf.writeUInt16LE(Math.round(maxW), indexOffset + 5);

    // Data: normalize each hour to 0-255 relative to max
    const dataOffset = HEADER_SIZE + INDEX_SIZE + i * HOURS_PER_YEAR;
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const normalized = maxW > 0 ? Math.round((p.hourlyWatts[h] / maxW) * 255) : 0;
      buf.writeUInt8(Math.min(255, normalized), dataOffset + h);
    }
  }

  return buf;
}

// ── Main ───────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchCounty(county: CountyCoordinate): Promise<void> {
  const outPath = path.join(OUTPUT_DIR, `${county.slug}.bin`);

  console.log(`\n── ${county.name} (${county.lat}, ${county.lon}) ──`);

  const profiles: Array<{
    azimuth: number;
    tilt: number;
    annualKwh: number;
    hourlyWatts: number[];
  }> = [];

  for (const azimuth of AZIMUTHS) {
    for (const tilt of TILTS) {
      const label = `  az=${String(azimuth).padStart(4)} tilt=${tilt}`;
      try {
        const result = await fetchPvgisHourly(county.lat, county.lon, tilt, azimuth);
        profiles.push({ azimuth, tilt, ...result });
        console.log(`${label}  →  ${result.annualKwh.toFixed(1)} kWh/kWp`);
      } catch (err) {
        console.error(`${label}  FAILED: ${err instanceof Error ? err.message : err}`);
        // Push zeros so the file structure is consistent
        profiles.push({ azimuth, tilt, annualKwh: 0, hourlyWatts: new Array(HOURS_PER_YEAR).fill(0) });
      }
      await sleep(REQUEST_DELAY_MS);
    }
  }

  const binary = encodeCountyBinary(profiles);
  fs.writeFileSync(outPath, binary);
  console.log(`  → wrote ${outPath} (${binary.length} bytes)`);
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Fetching PVGIS profiles for ${COUNTY_COORDINATES.length} counties`);
  console.log(`Grid: ${NUM_AZIMUTHS} azimuths × ${NUM_TILTS} tilts = ${NUM_COMBOS} combos per county`);
  console.log(`Total API calls: ${COUNTY_COORDINATES.length * NUM_COMBOS}`);
  console.log(`Estimated time: ~${Math.round(COUNTY_COORDINATES.length * NUM_COMBOS * REQUEST_DELAY_MS / 1000 / 60)} minutes\n`);

  const startTime = Date.now();

  for (const county of COUNTY_COORDINATES) {
    await fetchCounty(county);
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\nDone. ${COUNTY_COORDINATES.length} files written to ${OUTPUT_DIR} in ${elapsed} minutes.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
