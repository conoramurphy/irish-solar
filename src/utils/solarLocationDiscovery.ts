/**
 * Solar location discovery utility.
 * 
 * Discovers available locations from solar data files in public/data/solar/.
 * File naming convention: {Location}_{Year}.csv
 * Examples: Cavan_2020.csv, Cork_North_2020.csv
 */

const SOLAR_DATA_BASE_PATH = '/data/solar/';

const ALL_LOCATIONS: string[] = [
  // Republic of Ireland (26 counties, 30 points)
  'Carlow', 'Cavan', 'Clare',
  'Cork_North', 'Cork_East', 'Cork_West',
  'Donegal_North', 'Donegal_South',
  'Dublin', 'Galway', 'Kerry', 'Kildare', 'Kilkenny',
  'Laois', 'Leitrim', 'Limerick', 'Longford', 'Louth',
  'Mayo', 'Meath', 'Monaghan', 'Offaly', 'Roscommon', 'Sligo',
  'Tipperary_North', 'Tipperary_South',
  'Waterford', 'Westmeath', 'Wexford', 'Wicklow',
  // Northern Ireland (6 counties)
  'Antrim', 'Armagh', 'Down', 'Fermanagh', 'Derry', 'Tyrone',
];

/**
 * Fetch the list of available solar data files and extract unique locations.
 */
export async function discoverAvailableLocations(): Promise<string[]> {
  try {
    const response = await fetch(`${SOLAR_DATA_BASE_PATH}manifest.json`);
    if (response.ok) {
      const manifest = await response.json() as { files: string[] };
      return extractLocationsFromFilenames(manifest.files);
    }
  } catch {
    // Manifest doesn't exist, fall back to known list
  }
  
  return getKnownLocations();
}

/**
 * Extract unique location names from filenames.
 * Handles multi-part names with underscores (e.g. Cork_North_2020.csv -> Cork_North).
 */
function extractLocationsFromFilenames(filenames: string[]): string[] {
  const locations = new Set<string>();
  
  for (const filename of filenames) {
    // Match everything before the final _YYYY.csv
    const match = filename.match(/^(.+)_\d{4}\.csv$/);
    if (match) {
      locations.add(match[1]);
    }
  }
  
  return Array.from(locations).sort();
}

/**
 * Get the static list of all known Irish county locations.
 */
export function getKnownLocations(): string[] {
  return [...ALL_LOCATIONS];
}
