/**
 * Dynamic solar data loader with in-memory caching
 * 
 * This replaces the static import approach to avoid bundling large CSV files.
 * CSVs are now served as static assets from /data/solar/ and fetched on demand.
 */

import { parseSolarTimeseriesCSV, type ParsedSolarData } from './solarTimeseriesParser';

/**
 * In-memory cache for loaded solar data
 * Key format: "{location}_{year}"
 */
const cache: Record<string, ParsedSolarData> = {};

/** Years for which solar CSV data exists under public/data/solar/ (e.g. Dublin_2025.csv). */
export const SOLAR_AVAILABLE_YEARS = [2020, 2021, 2022, 2023, 2024, 2025] as const;

/**
 * Load solar data for a given location and year
 * 
 * @param location Location name (e.g., "Cavan", "Dublin")
 * @param year Year of the data (e.g., 2020)
 * @returns Parsed solar data
 * @throws Error if data cannot be loaded
 */
export async function loadSolarData(
  location: string,
  year: number
): Promise<ParsedSolarData> {
  const cacheKey = `${location}_${year}`;

  // Check cache first
  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  // Fetch from server
  const url = `/data/solar/${location}_${year}.csv`;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to load solar data: ${response.status} ${response.statusText}`);
    }

    const csvContent = await response.text();
    const parsed = parseSolarTimeseriesCSV(csvContent, location);

    // Store in cache
    cache[cacheKey] = parsed;

    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load solar data for ${location} ${year}: ${message}`);
  }
}

/**
 * Pre-warm the cache by loading data in the background.
 * Individual failures are swallowed so one bad location doesn't block the rest.
 * 
 * @param locations Array of {location, year} to pre-load
 */
export async function preloadSolarData(
  locations: Array<{ location: string; year: number }>
): Promise<void> {
  const promises = locations.map(({ location, year }) =>
    loadSolarData(location, year).catch((err) => {
      console.warn(`Failed to preload ${location} ${year}:`, err);
    })
  );

  await Promise.all(promises);
}

/**
 * Clear the cache (useful for testing or memory management)
 */
export function clearSolarDataCache(): void {
  Object.keys(cache).forEach(key => delete cache[key]);
}

/**
 * Get cache status (useful for debugging)
 */
export function getSolarDataCacheStatus(): {
  size: number;
  keys: string[];
} {
  return {
    size: Object.keys(cache).length,
    keys: Object.keys(cache)
  };
}
