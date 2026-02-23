/**
 * Solar location discovery utility.
 * 
 * Discovers available locations from solar data files in public/data/solar/.
 * File naming convention: {Location}_{Year}.csv
 * Example: Cavan_2020.csv -> location: "Cavan"
 */

const SOLAR_DATA_BASE_PATH = '/data/solar/';

/**
 * Fetch the list of available solar data files and extract unique locations.
 * 
 * This function makes runtime requests to discover what CSV files exist.
 * In production, this could be replaced with a manifest file or build-time generation.
 * 
 * @returns Promise resolving to array of location names (e.g., ["Cavan", "Dublin"])
 */
export async function discoverAvailableLocations(): Promise<string[]> {
  // For now, we'll use a known list since we can't easily list directory contents
  // from the browser without a directory listing endpoint or manifest file.
  // 
  // In a production setup, you would either:
  // 1. Generate a manifest.json at build time listing all files
  // 2. Have an API endpoint that lists available locations
  // 3. Hardcode the known locations in a config file
  
  // Try to fetch a manifest file if it exists
  try {
    const response = await fetch(`${SOLAR_DATA_BASE_PATH}manifest.json`);
    if (response.ok) {
      const manifest = await response.json() as { files: string[] };
      return extractLocationsFromFilenames(manifest.files);
    }
  } catch {
    // Manifest doesn't exist, fall back to known list
  }
  
  // Fallback: known locations
  // TODO: Generate manifest.json at build time
  return ['Cavan'];
}

/**
 * Extract unique location names from filenames.
 * 
 * @param filenames - Array of filenames (e.g., ["Cavan_2020.csv", "Cavan_2021.csv", "Dublin_2020.csv"])
 * @returns Array of unique location names (e.g., ["Cavan", "Dublin"])
 */
function extractLocationsFromFilenames(filenames: string[]): string[] {
  const locations = new Set<string>();
  
  for (const filename of filenames) {
    // Match pattern: {Location}_{Year}.csv
    const match = filename.match(/^([^_]+)_\d{4}\.csv$/);
    if (match) {
      locations.add(match[1]);
    }
  }
  
  return Array.from(locations).sort();
}

/**
 * Get a static list of known locations (synchronous fallback).
 * 
 * @returns Array of known location names
 */
export function getKnownLocations(): string[] {
  return ['Cavan'];
}
