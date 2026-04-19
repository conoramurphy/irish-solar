import { describe, it, expect } from 'vitest';
import {
  pvgisProfileToWeights,
  interpolateToHalfHourly,
  getOrientationWeights,
  distributeProductionWithOrientation,
} from '../../src/utils/orientationWeights';
import { HOURS_PER_YEAR, type PvgisProfileEntry } from '../../src/utils/pvgisProfileLoader';

// ── Test helpers ───────────────────────────────────────────────────────

function makeProfile(peakWatts: number): PvgisProfileEntry {
  const hourlyWatts = new Float32Array(HOURS_PER_YEAR);
  for (let d = 0; d < 365; d++) {
    for (let h = 6; h < 20; h++) {
      const factor = Math.sin(((h - 6) / 14) * Math.PI);
      hourlyWatts[d * 24 + h] = peakWatts * factor;
    }
  }
  const annualKwhPerKwp = hourlyWatts.reduce((s, w) => s + w, 0) / 1000;
  return {
    azimuthDeg: 0,
    tiltDeg: 30,
    annualKwhPerKwp,
    maxHourlyWatts: peakWatts,
    hourlyWatts,
  };
}

function makeZeroProfile(): PvgisProfileEntry {
  return {
    azimuthDeg: 0,
    tiltDeg: 30,
    annualKwhPerKwp: 0,
    maxHourlyWatts: 0,
    hourlyWatts: new Float32Array(HOURS_PER_YEAR),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('pvgisProfileToWeights', () => {
  it('returns weights that sum to 1.0', () => {
    const profile = makeProfile(800);
    const weights = pvgisProfileToWeights(profile);

    expect(weights.length).toBe(HOURS_PER_YEAR);
    const sum = weights.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('has zero weights during nighttime hours', () => {
    const profile = makeProfile(800);
    const weights = pvgisProfileToWeights(profile);

    // Hour 0-5 on day 0 should be zero
    for (let h = 0; h < 6; h++) {
      expect(weights[h]).toBe(0);
    }
  });

  it('has peak weight at midday', () => {
    const profile = makeProfile(800);
    const weights = pvgisProfileToWeights(profile);

    // Hour 13 (1pm) should be close to peak on day 0
    const middayWeight = weights[13];
    const morningWeight = weights[8];
    expect(middayWeight).toBeGreaterThan(morningWeight);
  });

  it('handles zero-irradiance profile with uniform weights', () => {
    const profile = makeZeroProfile();
    const weights = pvgisProfileToWeights(profile);

    const expected = 1 / HOURS_PER_YEAR;
    expect(weights[0]).toBeCloseTo(expected, 10);
    expect(weights[5000]).toBeCloseTo(expected, 10);
  });
});

describe('interpolateToHalfHourly', () => {
  it('doubles the length', () => {
    const hourly = new Array(HOURS_PER_YEAR).fill(1 / HOURS_PER_YEAR);
    const halfHourly = interpolateToHalfHourly(hourly);
    expect(halfHourly.length).toBe(HOURS_PER_YEAR * 2);
  });

  it('preserves sum of 1.0', () => {
    const profile = makeProfile(800);
    const hourly = pvgisProfileToWeights(profile);
    const halfHourly = interpolateToHalfHourly(hourly);

    const sum = halfHourly.reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('preserves zero during nighttime', () => {
    const profile = makeProfile(800);
    const hourly = pvgisProfileToWeights(profile);
    const halfHourly = interpolateToHalfHourly(hourly);

    // Hours 0-5 (slots 0-11) should be zero or near-zero
    for (let s = 0; s < 10; s++) {
      expect(halfHourly[s]).toBeCloseTo(0, 10);
    }
  });

  it('handles all-zero input without dividing by zero', () => {
    const allZero = new Array(HOURS_PER_YEAR).fill(0);
    const halfHourly = interpolateToHalfHourly(allZero);
    expect(halfHourly.length).toBe(HOURS_PER_YEAR * 2);
    // All values should remain zero (no NaN from divide-by-zero)
    for (let i = 0; i < halfHourly.length; i++) {
      expect(halfHourly[i]).toBe(0);
    }
  });
});

describe('getOrientationWeights', () => {
  it('returns 8760 values for hourly data', () => {
    const profile = makeProfile(800);
    const weights = getOrientationWeights(profile, 24);
    expect(weights.length).toBe(8760);
  });

  it('returns 17520 values for half-hourly data', () => {
    const profile = makeProfile(800);
    const weights = getOrientationWeights(profile, 48);
    expect(weights.length).toBe(17520);
  });

  it('both resolutions sum to 1.0', () => {
    const profile = makeProfile(800);
    const hourly = getOrientationWeights(profile, 24);
    const halfHourly = getOrientationWeights(profile, 48);

    expect(hourly.reduce((s, w) => s + w, 0)).toBeCloseTo(1.0, 6);
    expect(halfHourly.reduce((s, w) => s + w, 0)).toBeCloseTo(1.0, 6);
  });
});

describe('distributeProductionWithOrientation', () => {
  it('distributes annual production preserving total', () => {
    const profile = makeProfile(800);
    const annualKwh = 3800;
    const generation = distributeProductionWithOrientation(annualKwh, profile, 24);

    expect(generation.length).toBe(8760);
    const total = generation.reduce((s, g) => s + g, 0);
    expect(total).toBeCloseTo(annualKwh, 3);
  });

  it('distributes to half-hourly preserving total', () => {
    const profile = makeProfile(800);
    const annualKwh = 3800;
    const generation = distributeProductionWithOrientation(annualKwh, profile, 48);

    expect(generation.length).toBe(17520);
    const total = generation.reduce((s, g) => s + g, 0);
    expect(total).toBeCloseTo(annualKwh, 3);
  });

  it('has zero generation during nighttime', () => {
    const profile = makeProfile(800);
    const generation = distributeProductionWithOrientation(3800, profile, 24);

    // First 6 hours of day 0 should be zero
    for (let h = 0; h < 6; h++) {
      expect(generation[h]).toBe(0);
    }
  });
});
