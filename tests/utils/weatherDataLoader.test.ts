import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseWeatherCSV, loadWeatherData, clearWeatherDataCache } from '../../src/utils/weatherDataLoader';
import { generateYearlyTemperatureProfile } from '../../src/data/irishWeatherProfiles';

// ---------------------------------------------------------------------------
// parseWeatherCSV
// ---------------------------------------------------------------------------

describe('parseWeatherCSV', () => {
  const SAMPLE_CSV = [
    'Latitude (decimal degrees):\t53.3498',
    'Longitude (decimal degrees):\t-6.2603',
    'Source:\tOpen-Meteo Historical Weather API (ERA5/ECMWF)',
    'Location:\tDublin',
    '',
    'time,temperature_2m',
    '20250101:0000,8.0',
    '20250101:0030,7.8',
    '20250101:0100,7.7',
    '20250101:0130,7.3',
    '20250101:0200,6.9',
  ].join('\n');

  it('parses header and data rows correctly', () => {
    const result = parseWeatherCSV(SAMPLE_CSV, 'Dublin');
    expect(result.location).toBe('Dublin');
    expect(result.temperatureC).toEqual([8.0, 7.8, 7.7, 7.3, 6.9]);
    expect(result.slotCount).toBe(5);
  });

  it('handles empty CSV gracefully', () => {
    const csv = 'time,temperature_2m\n';
    const result = parseWeatherCSV(csv, 'Dublin');
    expect(result.temperatureC).toEqual([]);
    expect(result.slotCount).toBe(0);
  });

  it('skips malformed lines', () => {
    const csv = [
      'time,temperature_2m',
      '20250101:0000,8.0',
      'badline',
      '20250101:0100,7.7',
    ].join('\n');
    const result = parseWeatherCSV(csv, 'Dublin');
    expect(result.temperatureC).toEqual([8.0, 7.7]);
  });
});

// ---------------------------------------------------------------------------
// generateYearlyTemperatureProfile with real data
// ---------------------------------------------------------------------------

describe('generateYearlyTemperatureProfile — real temperature data', () => {
  it('uses real temperatures when provided', () => {
    const realTemps = new Array(17568).fill(0).map((_, i) => 5.0 + (i % 48) * 0.1);
    const result = generateYearlyTemperatureProfile('Dublin', 2025, undefined, realTemps);
    expect(result.length).toBe(17568);
    expect(result[0]).toBe(5.0);
    expect(result[1]).toBeCloseTo(5.1, 5);
  });

  it('pads short real data to full year', () => {
    const shortData = [10.0, 11.0, 12.0];
    const result = generateYearlyTemperatureProfile('Dublin', 2025, undefined, shortData);
    expect(result.length).toBe(17568);
    expect(result[0]).toBe(10.0);
    expect(result[1]).toBe(11.0);
    expect(result[2]).toBe(12.0);
    // Padded with last value
    expect(result[3]).toBe(12.0);
    expect(result[17567]).toBe(12.0);
  });

  it('trims overly long real data', () => {
    const longData = new Array(20000).fill(7.5);
    const result = generateYearlyTemperatureProfile('Dublin', 2025, undefined, longData);
    expect(result.length).toBe(17568);
  });

  it('falls back to synthetic model when real data is not provided', () => {
    const synthetic = generateYearlyTemperatureProfile('Dublin', 2025);
    const withUndefined = generateYearlyTemperatureProfile('Dublin', 2025, undefined, undefined);
    expect(synthetic).toEqual(withUndefined);
    expect(synthetic.length).toBe(17568);
  });

  it('falls back to synthetic model when real data is empty', () => {
    const synthetic = generateYearlyTemperatureProfile('Dublin', 2025);
    const withEmpty = generateYearlyTemperatureProfile('Dublin', 2025, undefined, []);
    expect(synthetic).toEqual(withEmpty);
  });
});

// ---------------------------------------------------------------------------
// loadWeatherData (async fetch with cache)
// ---------------------------------------------------------------------------

describe('loadWeatherData', () => {
  const SAMPLE_CSV = [
    'Latitude (decimal degrees):\t53.35',
    'Longitude (decimal degrees):\t-6.26',
    'Source:\tOpen-Meteo',
    'Location:\tDublin',
    '',
    'time,temperature_2m',
    '20250101:0000,8.0',
    '20250101:0030,7.5',
  ].join('\n');

  beforeEach(() => {
    clearWeatherDataCache();
    vi.restoreAllMocks();
  });

  it('fetches and parses weather data for a location', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SAMPLE_CSV),
    }));

    const result = await loadWeatherData('Dublin');
    expect(result.location).toBe('Dublin');
    expect(result.temperatureC).toEqual([8.0, 7.5]);
    expect(result.slotCount).toBe(2);
  });

  it('caches results on second call', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SAMPLE_CSV),
    });
    vi.stubGlobal('fetch', mockFetch);

    await loadWeatherData('Dublin');
    await loadWeatherData('Dublin');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }));

    await expect(loadWeatherData('Nowhere')).rejects.toThrow('Failed to load weather data');
  });

  it('throws on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    await expect(loadWeatherData('Dublin')).rejects.toThrow('Network error');
  });

  it('clearWeatherDataCache forces re-fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(SAMPLE_CSV),
    });
    vi.stubGlobal('fetch', mockFetch);

    await loadWeatherData('Dublin');
    clearWeatherDataCache();
    await loadWeatherData('Dublin');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
