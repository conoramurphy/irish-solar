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
 * Pre-warm the cache by loading data in the background
 * Useful for common locations to provide instant UX
 * 
 * @param locations Array of {location, year} to pre-load
 */
export async function preloadSolarData(
  locations: Array<{ location: string; year: number }>
): Promise<void> {
  // Load in parallel but don't wait for completion
  const promises = locations.map(({ location, year }) =>
    loadSolarData(location, year).catch((err) => {
      console.warn(`Failed to preload ${location} ${year}:`, err);
    })
  );

  // Fire and forget - don't block on completion
  Promise.all(promises).catch(() => {
    // Silently fail - preloading is optimization, not critical
  });
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
