import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadSolarData,
  clearSolarDataCache,
  getSolarDataCacheStatus,
  preloadSolarData
} from '../../src/utils/solarDataLoader';

// Minimal valid PVGIS CSV that parseSolarTimeseriesCSV can handle
const VALID_CSV = `Latitude (decimal degrees):\t53.835
Longitude (decimal degrees):\t-7.072
Elevation (m):\t101
Radiation database:\tPVGIS-SARAH3

time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,0.0,0.0,5.63,1.45,0.0
20200101:0111,0.0,0.0,5.85,1.52,0.0
20200101:0211,10.5,10.0,6.00,1.60,0.0
`;

function mockFetchOk(body: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(body)
  } as unknown as Response);
}

function mockFetch404() {
  return vi.fn().mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    text: () => Promise.resolve('')
  } as unknown as Response);
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
}

describe('solarDataLoader', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearSolarDataCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Happy path ────────────────────────────────────────────

  it('loads and parses CSV on first call', async () => {
    globalThis.fetch = mockFetchOk(VALID_CSV);

    const data = await loadSolarData('Cavan', 2020);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/solar/Cavan_2020.csv');
    expect(data.location).toBe('Cavan');
    expect(data.timesteps).toHaveLength(3);
    expect(data.latitude).toBeCloseTo(53.835, 2);
  });

  // ── Cache behaviour ───────────────────────────────────────

  it('returns cached data on second call without re-fetching', async () => {
    globalThis.fetch = mockFetchOk(VALID_CSV);

    const first = await loadSolarData('Cavan', 2020);
    const second = await loadSolarData('Cavan', 2020);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Only one fetch
    expect(second).toBe(first); // Same object reference
  });

  it('caches different location/year keys separately', async () => {
    globalThis.fetch = mockFetchOk(VALID_CSV);

    await loadSolarData('Cavan', 2020);
    await loadSolarData('Cavan', 2021);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/solar/Cavan_2020.csv');
    expect(globalThis.fetch).toHaveBeenCalledWith('/data/solar/Cavan_2021.csv');

    const status = getSolarDataCacheStatus();
    expect(status.size).toBe(2);
    expect(status.keys).toContain('Cavan_2020');
    expect(status.keys).toContain('Cavan_2021');
  });

  it('clearSolarDataCache causes next call to re-fetch', async () => {
    globalThis.fetch = mockFetchOk(VALID_CSV);

    await loadSolarData('Cavan', 2020);
    expect(getSolarDataCacheStatus().size).toBe(1);

    clearSolarDataCache();
    expect(getSolarDataCacheStatus().size).toBe(0);

    await loadSolarData('Cavan', 2020);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  // ── Error handling ────────────────────────────────────────

  it('throws on HTTP 404 with descriptive message', async () => {
    globalThis.fetch = mockFetch404();

    await expect(loadSolarData('Dublin', 2020)).rejects.toThrow(
      /Failed to load solar data.*Dublin.*2020/
    );

    // Failed request should NOT populate cache
    expect(getSolarDataCacheStatus().size).toBe(0);
  });

  it('throws on network failure with descriptive message', async () => {
    globalThis.fetch = mockFetchNetworkError();

    await expect(loadSolarData('Cavan', 2020)).rejects.toThrow(
      /Failed to load solar data.*Cavan.*2020/
    );

    // Failed request should NOT populate cache
    expect(getSolarDataCacheStatus().size).toBe(0);
  });

  it('does not cache a failed request', async () => {
    // First call fails
    globalThis.fetch = mockFetch404();
    await loadSolarData('Cavan', 2020).catch(() => {});

    // Second call should retry
    globalThis.fetch = mockFetchOk(VALID_CSV);
    const data = await loadSolarData('Cavan', 2020);

    expect(data.location).toBe('Cavan');
    expect(data.timesteps).toHaveLength(3);
  });

  // ── URL construction ──────────────────────────────────────

  it('constructs correct URL for different locations and years', async () => {
    globalThis.fetch = mockFetchOk(VALID_CSV);

    await loadSolarData('Cork', 2023);

    expect(globalThis.fetch).toHaveBeenCalledWith('/data/solar/Cork_2023.csv');
  });

  // ── preloadSolarData ──────────────────────────────────────

  it('preloads multiple locations in parallel', async () => {
    globalThis.fetch = mockFetchOk(VALID_CSV);

    await preloadSolarData([
      { location: 'Cavan', year: 2020 },
      { location: 'Dublin', year: 2020 }
    ]);

    // Both should now be cached
    expect(getSolarDataCacheStatus().size).toBe(2);
  });

  it('preload does not throw when some locations fail', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(VALID_CSV) });
      }
      return Promise.resolve({ ok: false, status: 404, statusText: 'Not Found' });
    }) as any;

    // Should not throw even though second location fails
    await expect(
      preloadSolarData([
        { location: 'Cavan', year: 2020 },
        { location: 'Missing', year: 2020 }
      ])
    ).resolves.toBeUndefined();

    // Only the successful one should be cached
    expect(getSolarDataCacheStatus().size).toBe(1);
    expect(getSolarDataCacheStatus().keys).toContain('Cavan_2020');
  });

  // ── getSolarDataCacheStatus ───────────────────────────────

  it('reports empty cache correctly', () => {
    const status = getSolarDataCacheStatus();
    expect(status.size).toBe(0);
    expect(status.keys).toEqual([]);
  });
});
