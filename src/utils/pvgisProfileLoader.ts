/**
 * Loads and parses pre-baked PVGIS hourly PV generation profiles.
 *
 * Each county has a .bin file in /data/pvgis/ containing 8760-hourly
 * generation profiles for multiple orientation (azimuth) × tilt combinations.
 *
 * Binary format (see scripts/fetch-pvgis-profiles.ts for encoder):
 *   Header (4 bytes): [version, numAzimuths, numTilts, reserved]
 *   Index (N × 7 bytes): [azimuthInt16LE, tiltUint8, annualKwhX10 uint16LE, maxHourlyW uint16LE]
 *   Data (N × 8760 bytes): uint8 values normalized 0-255 relative to peak hour
 */

import type { PanelOrientation } from '../types';

export const HOURS_PER_YEAR = 8760;

export interface PvgisProfileEntry {
  azimuthDeg: number;
  tiltDeg: number;
  /** Annual production in kWh/kWp */
  annualKwhPerKwp: number;
  /** Peak hourly output in watts for 1 kWp system */
  maxHourlyWatts: number;
  /** 8760 hourly watts for 1 kWp system (reconstructed from uint8) */
  hourlyWatts: Float32Array;
}

export interface PvgisCountyData {
  numAzimuths: number;
  numTilts: number;
  profiles: PvgisProfileEntry[];
}

/**
 * Parse a county .bin file into structured profile data.
 */
export function parsePvgisBinary(buffer: ArrayBuffer): PvgisCountyData {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header
  const version = view.getUint8(0);
  if (version !== 1) {
    throw new Error(`Unsupported PVGIS profile version: ${version}`);
  }
  const numAzimuths = view.getUint8(1);
  const numTilts = view.getUint8(2);
  const numCombos = numAzimuths * numTilts;

  const headerSize = 4;
  const indexEntrySize = 7;
  const indexSize = numCombos * indexEntrySize;
  const dataStart = headerSize + indexSize;

  const profiles: PvgisProfileEntry[] = [];

  for (let i = 0; i < numCombos; i++) {
    const indexOffset = headerSize + i * indexEntrySize;

    const azimuthDeg = view.getInt16(indexOffset, true);
    const tiltDeg = view.getUint8(indexOffset + 2);
    const annualKwhX10 = view.getUint16(indexOffset + 3, true);
    const maxHourlyW = view.getUint16(indexOffset + 5, true);

    const annualKwhPerKwp = annualKwhX10 / 10;

    // Reconstruct hourly watts from normalized uint8
    const hourlyWatts = new Float32Array(HOURS_PER_YEAR);
    const profileDataOffset = dataStart + i * HOURS_PER_YEAR;

    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const normalized = bytes[profileDataOffset + h];
      hourlyWatts[h] = (normalized / 255) * maxHourlyW;
    }

    profiles.push({ azimuthDeg, tiltDeg, annualKwhPerKwp, maxHourlyWatts: maxHourlyW, hourlyWatts });
  }

  return { numAzimuths, numTilts, profiles };
}

/**
 * Find the best matching profile for a given orientation.
 * Uses nearest-neighbour on azimuth and tilt independently.
 */
export function findProfile(
  data: PvgisCountyData,
  orientation: PanelOrientation
): PvgisProfileEntry {
  let bestDist = Infinity;
  let best = data.profiles[0];

  for (const p of data.profiles) {
    // Azimuth distance wraps around 360°
    const azDiff = Math.abs(angleDiffDeg(p.azimuthDeg, orientation.azimuthDeg));
    const tiltDiff = Math.abs(p.tiltDeg - orientation.tiltDeg);
    // Weight azimuth and tilt equally (both in degrees)
    const dist = azDiff + tiltDiff;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }

  return best;
}

/**
 * Bilinear interpolation between the four nearest profiles (two azimuths × two tilts).
 * Falls back to nearest-neighbour if exact bracket cannot be found.
 */
export function interpolateProfile(
  data: PvgisCountyData,
  orientation: PanelOrientation
): PvgisProfileEntry {
  const targetAz = orientation.azimuthDeg;
  const targetTilt = orientation.tiltDeg;

  // Get sorted unique azimuths and tilts
  const azimuths = [...new Set(data.profiles.map(p => p.azimuthDeg))].sort((a, b) => a - b);
  const tilts = [...new Set(data.profiles.map(p => p.tiltDeg))].sort((a, b) => a - b);

  // Find bracketing tilts
  const tiltBelow = tilts.filter(t => t <= targetTilt).pop() ?? tilts[0];
  const tiltAbove = tilts.filter(t => t >= targetTilt).shift() ?? tilts[tilts.length - 1];
  const tiltFrac = tiltAbove === tiltBelow ? 0 : (targetTilt - tiltBelow) / (tiltAbove - tiltBelow);

  // Find bracketing azimuths (handle wrap-around)
  const azBelow = findBracketBelow(azimuths, targetAz);
  const azAbove = findBracketAbove(azimuths, targetAz);
  const azSpan = angleDiffDeg(azAbove, azBelow);
  const azFrac = azSpan === 0 ? 0 : angleDiffDeg(targetAz, azBelow) / azSpan;

  // Get four corner profiles
  const getP = (az: number, tilt: number) =>
    data.profiles.find(p => p.azimuthDeg === az && p.tiltDeg === tilt);

  const p00 = getP(azBelow, tiltBelow);
  const p01 = getP(azBelow, tiltAbove);
  const p10 = getP(azAbove, tiltBelow);
  const p11 = getP(azAbove, tiltAbove);

  if (!p00 || !p01 || !p10 || !p11) {
    // Fallback to nearest-neighbour
    return findProfile(data, orientation);
  }

  // Bilinear interpolation
  const hourlyWatts = new Float32Array(HOURS_PER_YEAR);
  for (let h = 0; h < HOURS_PER_YEAR; h++) {
    const v00 = p00.hourlyWatts[h];
    const v01 = p01.hourlyWatts[h];
    const v10 = p10.hourlyWatts[h];
    const v11 = p11.hourlyWatts[h];

    const vTilt0 = v00 + (v01 - v00) * tiltFrac;
    const vTilt1 = v10 + (v11 - v10) * tiltFrac;
    hourlyWatts[h] = vTilt0 + (vTilt1 - vTilt0) * azFrac;
  }

  const annualKwhPerKwp = hourlyWatts.reduce((s, w) => s + w, 0) / 1000;
  const maxHourlyWatts = Math.max(...hourlyWatts);

  return {
    azimuthDeg: targetAz,
    tiltDeg: targetTilt,
    annualKwhPerKwp,
    maxHourlyWatts,
    hourlyWatts,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Signed angular difference in degrees, result in [-180, 180]. */
function angleDiffDeg(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Find the largest azimuth ≤ target (with wrap).
 *
 * Input is sorted ascending. The candidate with the smallest positive
 * `angleDiffDeg(target, a)` is always the largest such element in the
 * filtered list — so we can pop the last one. If nothing matches, wrap
 * to the largest stored value.
 */
function findBracketBelow(sorted: number[], target: number): number {
  let bracket: number | undefined;
  for (const a of sorted) {
    if (angleDiffDeg(target, a) >= 0) bracket = a;
  }
  return bracket ?? sorted[sorted.length - 1];
}

/**
 * Find the smallest azimuth ≥ target (with wrap).
 *
 * Input is sorted ascending. The first element with `angleDiffDeg(a, target) >= 0`
 * is always the closest. If nothing matches, wrap to the smallest stored value.
 */
function findBracketAbove(sorted: number[], target: number): number {
  for (const a of sorted) {
    if (angleDiffDeg(a, target) >= 0) return a;
  }
  return sorted[0];
}

// ── Browser-side fetch with cache ──────────────────────────────────────

const profileCache = new Map<string, PvgisCountyData>();

/**
 * Fetch and parse a county's PVGIS profile data.
 * Results are cached in memory for the session.
 */
export async function loadPvgisProfile(countySlug: string): Promise<PvgisCountyData> {
  const cached = profileCache.get(countySlug);
  if (cached) return cached;

  const url = `/data/pvgis/${countySlug}.bin`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load PVGIS profile for ${countySlug}: ${resp.status}`);
  }

  const buffer = await resp.arrayBuffer();
  const data = parsePvgisBinary(buffer);
  profileCache.set(countySlug, data);
  return data;
}
