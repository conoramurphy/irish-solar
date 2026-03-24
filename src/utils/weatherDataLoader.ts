/**
 * Runtime loader for real weather (temperature) CSV data.
 *
 * Fetches half-hourly temperature CSVs from /data/weather/{Location}_2025.csv
 * and returns a flat array of outdoor temperatures (°C) — one per half-hour slot.
 *
 * Pattern mirrors solarDataLoader.ts: in-memory cache, async fetch, same
 * location names as the solar data.
 */

/** Parsed weather data: flat array of half-hourly temperatures (°C) */
export interface ParsedWeatherData {
  /** Location name (e.g. 'Dublin', 'Cork_North') */
  location: string;
  /** Half-hourly outdoor temperature values (°C), one per 30-min slot */
  temperatureC: number[];
  /** Number of half-hourly slots */
  slotCount: number;
}

const cache: Record<string, ParsedWeatherData> = {};

/**
 * Parse a weather CSV string into a ParsedWeatherData object.
 *
 * Expected format (same header style as solar CSVs):
 *   Latitude (decimal degrees):\t53.3498
 *   Longitude (decimal degrees):\t-6.2603
 *   Source:\t...
 *   Location:\tDublin
 *
 *   time,temperature_2m
 *   20250101:0000,8.0
 *   ...
 */
export function parseWeatherCSV(csv: string, location: string): ParsedWeatherData {
  const lines = csv.split('\n');
  const temperatures: number[] = [];

  let pastHeader = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip header lines (tab-separated metadata and the column header)
    if (!pastHeader) {
      if (trimmed === 'time,temperature_2m') {
        pastHeader = true;
      }
      continue;
    }

    const parts = trimmed.split(',');
    if (parts.length >= 2) {
      const temp = parseFloat(parts[1]);
      if (!isNaN(temp)) {
        temperatures.push(temp);
      }
    }
  }

  return {
    location,
    temperatureC: temperatures,
    slotCount: temperatures.length,
  };
}

/**
 * Load real weather data for a given location (2025 only).
 *
 * @param location - Location name matching solar locations (e.g. 'Dublin', 'Cork_North')
 * @returns Parsed weather data with half-hourly temperatures
 * @throws Error if data cannot be loaded
 */
export async function loadWeatherData(location: string): Promise<ParsedWeatherData> {
  const cacheKey = `${location}_2025`;

  if (cache[cacheKey]) {
    return cache[cacheKey];
  }

  const url = `/data/weather/${location}_2025.csv`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const csvContent = await response.text();
    const parsed = parseWeatherCSV(csvContent, location);

    cache[cacheKey] = parsed;
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to load weather data for ${location}: ${message}`);
  }
}

/**
 * Clear the weather data cache.
 */
export function clearWeatherDataCache(): void {
  Object.keys(cache).forEach((key) => delete cache[key]);
}
