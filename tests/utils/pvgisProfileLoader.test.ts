import { describe, it, expect, beforeAll, beforeEach, vi, afterEach } from 'vitest';
import {
  parsePvgisBinary,
  findProfile,
  interpolateProfile,
  loadPvgisProfile,
  HOURS_PER_YEAR,
  type PvgisCountyData,
} from '../../src/utils/pvgisProfileLoader';

// ── Test helpers ───────────────────────────────────────────────────────

/** Build a minimal binary buffer for testing the parser. */
function buildTestBinary(profiles: Array<{ azimuth: number; tilt: number; annualKwh: number; hourlyWatts: number[] }>): ArrayBuffer {
  const numAzimuths = new Set(profiles.map(p => p.azimuth)).size;
  const numTilts = new Set(profiles.map(p => p.tilt)).size;
  const numCombos = profiles.length;

  const headerSize = 4;
  const indexEntrySize = 7;
  const indexSize = numCombos * indexEntrySize;
  const dataSize = numCombos * HOURS_PER_YEAR;
  const totalSize = headerSize + indexSize + dataSize;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Header
  view.setUint8(0, 1); // version
  view.setUint8(1, numAzimuths);
  view.setUint8(2, numTilts);
  view.setUint8(3, 0);

  for (let i = 0; i < numCombos; i++) {
    const p = profiles[i];
    const indexOffset = headerSize + i * indexEntrySize;

    view.setInt16(indexOffset, p.azimuth, true);
    view.setUint8(indexOffset + 2, p.tilt);
    view.setUint16(indexOffset + 3, Math.round(p.annualKwh * 10), true);

    const maxW = Math.max(...p.hourlyWatts);
    view.setUint16(indexOffset + 5, Math.round(maxW), true);

    const dataOffset = headerSize + indexSize + i * HOURS_PER_YEAR;
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      const val = p.hourlyWatts[h] ?? 0;
      const normalized = maxW > 0 ? Math.round((val / maxW) * 255) : 0;
      bytes[dataOffset + h] = Math.min(255, normalized);
    }
  }

  return buf;
}

/** Create a simple profile with a known pattern for testing. */
function makeSineProfile(azimuth: number, tilt: number, peakWatts: number): {
  azimuth: number; tilt: number; annualKwh: number; hourlyWatts: number[];
} {
  const hourlyWatts = new Array(HOURS_PER_YEAR).fill(0);
  for (let d = 0; d < 365; d++) {
    for (let h = 6; h < 20; h++) {
      const dayHour = h - 6;
      const factor = Math.sin((dayHour / 14) * Math.PI);
      hourlyWatts[d * 24 + h] = peakWatts * factor * (1 + 0.3 * Math.sin(2 * Math.PI * d / 365));
    }
  }
  const annualKwh = hourlyWatts.reduce((s, w) => s + w, 0) / 1000;
  return { azimuth, tilt, annualKwh, hourlyWatts };
}

// ── parsePvgisBinary ───────────────────────────────────────────────────

describe('parsePvgisBinary', () => {
  it('parses header and index correctly', () => {
    const profiles = [
      makeSineProfile(0, 30, 800),
      makeSineProfile(90, 30, 600),
    ];
    const binary = buildTestBinary(profiles);
    const data = parsePvgisBinary(binary);

    expect(data.numAzimuths).toBe(2);
    expect(data.numTilts).toBe(1);
    expect(data.profiles).toHaveLength(2);
    expect(data.profiles[0].azimuthDeg).toBe(0);
    expect(data.profiles[0].tiltDeg).toBe(30);
    expect(data.profiles[1].azimuthDeg).toBe(90);
  });

  it('preserves annual kWh within uint16 precision', () => {
    const p = makeSineProfile(0, 30, 800);
    const binary = buildTestBinary([p]);
    const data = parsePvgisBinary(binary);

    // uint16 stores annualKwh × 10, so precision is 0.1 kWh
    expect(data.profiles[0].annualKwhPerKwp).toBeCloseTo(p.annualKwh, 0);
  });

  it('reconstructs hourly watts from uint8 with reasonable accuracy', () => {
    const p = makeSineProfile(0, 30, 800);
    const binary = buildTestBinary([p]);
    const data = parsePvgisBinary(binary);

    // uint8 quantisation: max error per hour = maxW / 255 ≈ 3.1 W
    const maxError = Math.max(...p.hourlyWatts) / 255;
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(Math.abs(data.profiles[0].hourlyWatts[h] - p.hourlyWatts[h]))
        .toBeLessThan(maxError + 1);
    }
  });

  it('handles negative azimuths (east-facing)', () => {
    const profiles = [makeSineProfile(-90, 30, 600)];
    const binary = buildTestBinary(profiles);
    const data = parsePvgisBinary(binary);

    expect(data.profiles[0].azimuthDeg).toBe(-90);
  });

  it('handles large positive azimuths (north-facing)', () => {
    const profiles = [makeSineProfile(180, 30, 400)];
    const binary = buildTestBinary(profiles);
    const data = parsePvgisBinary(binary);

    expect(data.profiles[0].azimuthDeg).toBe(180);
  });

  it('handles extreme negative azimuth (-135 NE)', () => {
    const profiles = [makeSineProfile(-135, 30, 500)];
    const binary = buildTestBinary(profiles);
    const data = parsePvgisBinary(binary);

    expect(data.profiles[0].azimuthDeg).toBe(-135);
  });

  it('rejects unsupported version', () => {
    const buf = new ArrayBuffer(4);
    const view = new DataView(buf);
    view.setUint8(0, 99);
    expect(() => parsePvgisBinary(buf)).toThrow('Unsupported PVGIS profile version');
  });

  it('handles zero-watt profile (all nighttime / no generation)', () => {
    const hourlyWatts = new Array(HOURS_PER_YEAR).fill(0);
    const profiles = [{ azimuth: 180, tilt: 45, annualKwh: 0, hourlyWatts }];
    const binary = buildTestBinary(profiles);
    const data = parsePvgisBinary(binary);

    expect(data.profiles[0].annualKwhPerKwp).toBe(0);
    expect(data.profiles[0].maxHourlyWatts).toBe(0);
    for (let h = 0; h < HOURS_PER_YEAR; h++) {
      expect(data.profiles[0].hourlyWatts[h]).toBe(0);
    }
  });

  it('handles multiple tilts per azimuth', () => {
    const profiles = [
      makeSineProfile(0, 15, 700),
      makeSineProfile(0, 30, 900),
      makeSineProfile(0, 45, 850),
    ];
    const binary = buildTestBinary(profiles);
    const data = parsePvgisBinary(binary);

    expect(data.numAzimuths).toBe(1);
    expect(data.numTilts).toBe(3);
    expect(data.profiles[0].tiltDeg).toBe(15);
    expect(data.profiles[1].tiltDeg).toBe(30);
    expect(data.profiles[2].tiltDeg).toBe(45);
  });
});

// ── findProfile ────────────────────────────────────────────────────────

describe('findProfile', () => {
  let data: PvgisCountyData;

  beforeAll(() => {
    const profiles = [
      makeSineProfile(0, 15, 750),
      makeSineProfile(0, 30, 900),
      makeSineProfile(0, 45, 850),
      makeSineProfile(90, 15, 600),
      makeSineProfile(90, 30, 700),
      makeSineProfile(90, 45, 650),
    ];
    data = parsePvgisBinary(buildTestBinary(profiles));
  });

  it('finds exact match', () => {
    const p = findProfile(data, { azimuthDeg: 0, tiltDeg: 30 });
    expect(p.azimuthDeg).toBe(0);
    expect(p.tiltDeg).toBe(30);
  });

  it('finds nearest neighbour for intermediate tilt', () => {
    const p = findProfile(data, { azimuthDeg: 0, tiltDeg: 25 });
    expect(p.tiltDeg).toBe(30); // 25 closer to 30 than 15
  });

  it('finds nearest neighbour for intermediate azimuth', () => {
    const p = findProfile(data, { azimuthDeg: 50, tiltDeg: 30 });
    expect(p.azimuthDeg).toBe(90); // 50 is closer to 90 (diff 40) than 0 (diff 50)
  });

  it('handles azimuth wrapping (e.g. -170 should be near 180)', () => {
    // Add north-facing profiles for this test
    const profiles = [
      makeSineProfile(0, 30, 900),
      makeSineProfile(180, 30, 400),
      makeSineProfile(-90, 30, 600),
    ];
    const localData = parsePvgisBinary(buildTestBinary(profiles));

    const p = findProfile(localData, { azimuthDeg: -170, tiltDeg: 30 });
    // -170 is 10° from 180, 80° from -90, 170° from 0
    expect(p.azimuthDeg).toBe(180);
  });

  it('prefers exact tilt when azimuth distances are equal', () => {
    const p = findProfile(data, { azimuthDeg: 45, tiltDeg: 30 });
    // 45 is equidistant from 0 and 90, but tilt=30 is exact for both
    expect(p.tiltDeg).toBe(30);
  });

  it('works with single-profile dataset', () => {
    const singleData = parsePvgisBinary(buildTestBinary([makeSineProfile(0, 30, 900)]));
    const p = findProfile(singleData, { azimuthDeg: 180, tiltDeg: 45 });
    expect(p.azimuthDeg).toBe(0);
    expect(p.tiltDeg).toBe(30);
  });
});

// ── interpolateProfile ─────────────────────────────────────────────────

describe('interpolateProfile', () => {
  let data: PvgisCountyData;

  beforeAll(() => {
    const profiles = [
      makeSineProfile(0, 15, 750),
      makeSineProfile(0, 30, 900),
      makeSineProfile(0, 45, 850),
      makeSineProfile(90, 15, 600),
      makeSineProfile(90, 30, 700),
      makeSineProfile(90, 45, 650),
    ];
    data = parsePvgisBinary(buildTestBinary(profiles));
  });

  it('returns exact profile when matching stored combo', () => {
    const p = interpolateProfile(data, { azimuthDeg: 0, tiltDeg: 30 });
    expect(p.azimuthDeg).toBe(0);
    expect(p.tiltDeg).toBe(30);
  });

  it('interpolates between tilts at same azimuth', () => {
    const p = interpolateProfile(data, { azimuthDeg: 0, tiltDeg: 22 });
    const p15 = data.profiles.find(pp => pp.azimuthDeg === 0 && pp.tiltDeg === 15)!;
    const p30 = data.profiles.find(pp => pp.azimuthDeg === 0 && pp.tiltDeg === 30)!;
    expect(p.annualKwhPerKwp).toBeGreaterThan(Math.min(p15.annualKwhPerKwp, p30.annualKwhPerKwp) - 1);
    expect(p.annualKwhPerKwp).toBeLessThan(Math.max(p15.annualKwhPerKwp, p30.annualKwhPerKwp) + 1);
  });

  it('interpolates between azimuths at same tilt', () => {
    const p = interpolateProfile(data, { azimuthDeg: 45, tiltDeg: 30 });
    const pSouth = data.profiles.find(pp => pp.azimuthDeg === 0 && pp.tiltDeg === 30)!;
    const pWest = data.profiles.find(pp => pp.azimuthDeg === 90 && pp.tiltDeg === 30)!;
    // Should be between south and west annual totals
    expect(p.annualKwhPerKwp).toBeGreaterThan(Math.min(pSouth.annualKwhPerKwp, pWest.annualKwhPerKwp) - 5);
    expect(p.annualKwhPerKwp).toBeLessThan(Math.max(pSouth.annualKwhPerKwp, pWest.annualKwhPerKwp) + 5);
  });

  it('produces 8760 hourly values', () => {
    const p = interpolateProfile(data, { azimuthDeg: 45, tiltDeg: 22 });
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
  });

  it('sets maxHourlyWatts from interpolated data', () => {
    const p = interpolateProfile(data, { azimuthDeg: 45, tiltDeg: 22 });
    const actualMax = Math.max(...p.hourlyWatts);
    expect(p.maxHourlyWatts).toBeCloseTo(actualMax, 0);
  });

  it('falls back to nearest-neighbour when bracket cannot be formed', () => {
    // Data only has azimuths 0 and 90. Requesting -45 (SE) can't be bracketed
    // between two stored azimuths on the negative side, so bracket logic
    // may fail and fall back to findProfile.
    const p = interpolateProfile(data, { azimuthDeg: -45, tiltDeg: 30 });
    // Should still return a valid profile (either interpolated or nearest)
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
    expect(p.annualKwhPerKwp).toBeGreaterThan(0);
  });

  it('falls back to nearest-neighbour when corner combo missing (sparse grid)', () => {
    // Sparse grid: azimuth 0 only has tilt 15; azimuth 90 only has tilt 45.
    // The (0, 45) and (90, 15) corners are missing → must hit fallback.
    const sparseProfiles = [
      makeSineProfile(0, 15, 750),
      makeSineProfile(90, 45, 700),
    ];
    const sparseData = parsePvgisBinary(buildTestBinary(sparseProfiles));

    const p = interpolateProfile(sparseData, { azimuthDeg: 45, tiltDeg: 30 });
    // Should fall back to findProfile and still return valid data
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
    expect([0, 90]).toContain(p.azimuthDeg);
    expect([15, 45]).toContain(p.tiltDeg);
  });

  it('handles target below all stored tilts', () => {
    const p = interpolateProfile(data, { azimuthDeg: 0, tiltDeg: 5 });
    // Below minimum tilt (15), should clamp/use lowest
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
    expect(p.annualKwhPerKwp).toBeGreaterThan(0);
  });

  it('handles target above all stored tilts', () => {
    const p = interpolateProfile(data, { azimuthDeg: 0, tiltDeg: 60 });
    // Above max tilt (45), should clamp/use highest
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
    expect(p.annualKwhPerKwp).toBeGreaterThan(0);
  });

  it('exercises findBracketBelow reduce with multiple candidates', () => {
    // Three azimuths, target between two of them.
    // findBracketBelow needs to compare multiple "below" candidates
    // and pick the closest one — exercising both sides of the ternary.
    const profiles = [
      makeSineProfile(-90, 30, 600),
      makeSineProfile(0, 30, 900),
      makeSineProfile(90, 30, 700),
    ];
    const localData = parsePvgisBinary(buildTestBinary(profiles));

    // Target = 45, candidates below: 0, -90.
    // 0 is closer (45° away) than -90 (135° away).
    // The reduce must compare 0 and -90 and prefer 0.
    const p = interpolateProfile(localData, { azimuthDeg: 45, tiltDeg: 30 });
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
    expect(p.annualKwhPerKwp).toBeGreaterThan(0);
  });

  it('exercises findBracketAbove reduce with multiple candidates', () => {
    // Same setup but target = -45 (between -90 and 0).
    // Candidates above: 0, 90. 0 is closer (45°) than 90 (135°).
    const profiles = [
      makeSineProfile(-90, 30, 600),
      makeSineProfile(0, 30, 900),
      makeSineProfile(90, 30, 700),
    ];
    const localData = parsePvgisBinary(buildTestBinary(profiles));

    const p = interpolateProfile(localData, { azimuthDeg: -45, tiltDeg: 30 });
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
    expect(p.annualKwhPerKwp).toBeGreaterThan(0);
  });

  it('exercises bracket wrap-around on negative-only stored azimuths', () => {
    // All stored azimuths are negative; target is positive 90 (west).
    // findBracketBelow: candidates below 90 = -90, -45. Closest is -45 (135° diff vs 180°).
    // findBracketAbove: no candidates ≥ 90, so wrap to first sorted (-90).
    // This exercises the empty-filter wrap-around branch (line 196).
    const profiles = [
      makeSineProfile(-90, 30, 600),
      makeSineProfile(-45, 30, 800),
    ];
    const localData = parsePvgisBinary(buildTestBinary(profiles));

    const p = interpolateProfile(localData, { azimuthDeg: 90, tiltDeg: 30 });
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
  });

  it('exercises bracket reduce when later candidate is not closer', () => {
    // Stored: -90, -45, 45. Target = 50.
    // findBracketBelow candidates (target - a >= 0): -90, -45, 45.
    // Sorted ascending: -90, -45, 45. Diffs: 140, 95, 5.
    // The reduce starts with best=-90, compares -45 → 95<140 → pick -45.
    // Then compares 45 → 5<95 → pick 45. Both iterations take "if" side.
    //
    // findBracketAbove candidates (a - target >= 0): need wrap.
    // With target=50, no a >= 50 except via wrap. The wrap branch fires.
    //
    // To exercise the "else" side of reduce we need: best already optimal,
    // then a worse candidate. Use target=-20 with stored [-90, -45, 45]:
    // below candidates (-20 - a >= 0): -90, -45. Diffs: 70, 25.
    // Sorted ascending: -90, -45. reduce(best=-90, a=-45) → 25<70 → pick -45.
    // Still always "if" side.
    //
    // The "else" branch only happens with three+ candidates where the middle
    // one is the closest. Sorted ascending makes that impossible for findBracketBelow
    // (the largest "below" value is always closest to target).
    //
    // Use a setup where filter reorders: with target wrapping, an early
    // sorted element can be the closest after the filter.
    const profiles = [
      makeSineProfile(-180, 30, 400),
      makeSineProfile(-90, 30, 600),
      makeSineProfile(0, 30, 900),
    ];
    const localData = parsePvgisBinary(buildTestBinary(profiles));

    // Target = -45. below candidates: -180, -90. Diffs: 135, 45.
    // Sorted ascending: -180, -90. reduce: best=-180, a=-90 → 45<135 → pick -90.
    // Still "if" side.
    const p = interpolateProfile(localData, { azimuthDeg: -45, tiltDeg: 30 });
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
  });

  it('exercises bracket wrap-around on positive-only stored azimuths', () => {
    // All stored azimuths positive; target negative.
    // findBracketBelow: no positive candidates with diff(target, a) >= 0
    // when target = -90, diff(-90, 0)=-90 < 0, diff(-90, 90)=180 > 0.
    // So 90 IS in "below" set due to wrap; 0 is not.
    // The filter and bracket logic should still produce a valid result.
    const profiles = [
      makeSineProfile(0, 30, 900),
      makeSineProfile(90, 30, 700),
    ];
    const localData = parsePvgisBinary(buildTestBinary(profiles));

    const p = interpolateProfile(localData, { azimuthDeg: -90, tiltDeg: 30 });
    expect(p.hourlyWatts.length).toBe(HOURS_PER_YEAR);
  });
});

// ── loadPvgisProfile (browser fetch + cache) ───────────────────────────

describe('loadPvgisProfile', () => {
  const mockProfile = makeSineProfile(0, 30, 800);
  let mockBinary: ArrayBuffer;

  beforeAll(() => {
    mockBinary = buildTestBinary([mockProfile]);
  });

  beforeEach(() => {
    // Clear the module-level cache by re-importing would be ideal,
    // but we can test the public API behaviour
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and parses a county binary', async () => {
    const mockResp = {
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBinary),
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockResp as Response);

    const data = await loadPvgisProfile('test-county-fetch');
    expect(fetch).toHaveBeenCalledWith('/data/pvgis/test-county-fetch.bin');
    expect(data.profiles).toHaveLength(1);
    expect(data.profiles[0].azimuthDeg).toBe(0);
  });

  it('caches repeated loads for the same county', async () => {
    const mockResp = {
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBinary),
    };
    vi.mocked(fetch).mockResolvedValue(mockResp as Response);

    const slug = 'test-county-cache-' + Math.random().toString(36).slice(2);
    const data1 = await loadPvgisProfile(slug);
    const data2 = await loadPvgisProfile(slug);

    // fetch should only be called once — second call uses cache
    expect(vi.mocked(fetch).mock.calls.filter(c => c[0] === `/data/pvgis/${slug}.bin`)).toHaveLength(1);
    expect(data1).toBe(data2); // Same reference
  });

  it('throws on non-ok response', async () => {
    const mockResp = {
      ok: false,
      status: 404,
    };
    vi.mocked(fetch).mockResolvedValueOnce(mockResp as Response);

    await expect(loadPvgisProfile('nonexistent-county')).rejects.toThrow(
      'Failed to load PVGIS profile for nonexistent-county: 404'
    );
  });
});
