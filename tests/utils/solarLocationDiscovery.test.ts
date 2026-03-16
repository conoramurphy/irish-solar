import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  discoverAvailableLocations,
  getKnownLocations,
} from '../../src/utils/solarLocationDiscovery';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getKnownLocations', () => {
  it('returns an array of strings', () => {
    const locations = getKnownLocations();
    expect(Array.isArray(locations)).toBe(true);
    expect(locations.length).toBeGreaterThan(0);
    for (const loc of locations) {
      expect(typeof loc).toBe('string');
    }
  });

  it('contains expected Irish county locations', () => {
    const locations = getKnownLocations();
    expect(locations).toContain('Dublin');
    expect(locations).toContain('Cork_North');
    expect(locations).toContain('Antrim');
    expect(locations).toContain('Galway');
    expect(locations).toContain('Kerry');
    expect(locations).toContain('Donegal_North');
  });

  it('contains all 36 locations', () => {
    const locations = getKnownLocations();
    expect(locations).toHaveLength(36);
  });

  it('returns a new copy each call (not the same reference)', () => {
    const a = getKnownLocations();
    const b = getKnownLocations();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('discoverAvailableLocations', () => {
  it('extracts unique locations from manifest filenames when fetch succeeds', async () => {
    const manifest = {
      files: [
        'Dublin_2020.csv',
        'Dublin_2021.csv',
        'Cork_North_2020.csv',
        'Galway_2020.csv',
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manifest),
      }),
    );

    const locations = await discoverAvailableLocations();
    expect(locations).toEqual(['Cork_North', 'Dublin', 'Galway']);
  });

  it('falls back to known locations when fetch response is not OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false }),
    );

    const locations = await discoverAvailableLocations();
    expect(locations).toEqual(getKnownLocations());
  });

  it('falls back to known locations when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network error')),
    );

    const locations = await discoverAvailableLocations();
    expect(locations).toEqual(getKnownLocations());
  });

  it('handles filenames that do not match the expected pattern', async () => {
    const manifest = {
      files: [
        'Dublin_2020.csv',
        'readme.txt',
        'notes.csv',
        '',
        'Cork_North_2021.csv',
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manifest),
      }),
    );

    const locations = await discoverAvailableLocations();
    expect(locations).toEqual(['Cork_North', 'Dublin']);
  });

  it('returns empty array when manifest has no matching files', async () => {
    const manifest = { files: ['readme.txt', 'notes.md'] };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manifest),
      }),
    );

    const locations = await discoverAvailableLocations();
    expect(locations).toEqual([]);
  });

  it('returns sorted locations', async () => {
    const manifest = {
      files: [
        'Wicklow_2020.csv',
        'Antrim_2020.csv',
        'Dublin_2020.csv',
      ],
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(manifest),
      }),
    );

    const locations = await discoverAvailableLocations();
    expect(locations).toEqual(['Antrim', 'Dublin', 'Wicklow']);
  });
});
