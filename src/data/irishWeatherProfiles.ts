/**
 * Irish weather profiles for heat pump modelling.
 *
 * Temperature data: approximate regional groupings based on Met Éireann climate normals.
 * ⚠️  VERIFICATION NEEDED: These values should be checked against exact station data at
 *     https://www.met.ie/climate/available-data before use in published reports.
 *
 * Location names match the solar data location strings used throughout the app
 * (e.g. 'Cork_North', 'Donegal_South') — see solarLocationDiscovery.ts.
 */

/** Outdoor temperature above which space heating demand is assumed zero (°C) */
export const HEATING_CUTOFF_TEMP_C = 15.5;

/** Design outdoor temperature for Dublin/most of Ireland (°C) — used for design heat load */
export const DESIGN_OUTDOOR_TEMP_C = -3;

// ---------------------------------------------------------------------------
// Regional temperature profiles (monthly mean °C, Jan–Dec)
// ---------------------------------------------------------------------------

// East coast / Dublin region (Dublin, Wicklow, Kildare, Meath, Louth, Wexford, Carlow)
const TEMPS_EAST =    [7.1, 7.1, 8.6, 10.5, 13.3, 15.8, 17.8, 17.7, 15.3, 12.4,  9.0,  7.7];
// South / Cork region (Cork_*, Kerry, Waterford, Tipperary_South, Kilkenny)
const TEMPS_SOUTH =   [8.0, 8.0, 9.4, 11.2, 13.8, 16.1, 17.9, 17.8, 15.6, 12.9,  9.8,  8.4];
// West / Galway region (Galway, Clare, Limerick, Mayo, Roscommon, Sligo, Leitrim)
const TEMPS_WEST =    [7.4, 7.3, 8.8, 10.5, 13.1, 15.4, 17.2, 17.2, 15.0, 12.2,  9.1,  7.8];
// Northwest / Donegal region (Donegal_*, Cavan, Monaghan, NI west)
const TEMPS_NORTH =   [6.5, 6.5, 7.8,  9.5, 12.2, 14.5, 16.2, 16.3, 14.1, 11.3,  8.2,  7.0];
// Midlands (Offaly, Laois, Westmeath, Longford, Tipperary_North) — slightly cooler inland
const TEMPS_MIDLAND = [6.8, 6.9, 8.4, 10.3, 13.0, 15.4, 17.3, 17.2, 14.8, 11.8,  8.5,  7.2];
// Northern Ireland east coast (Antrim, Armagh, Down) — similar to Dublin
const TEMPS_NI_EAST = [6.8, 6.9, 8.3, 10.2, 13.0, 15.3, 17.0, 16.9, 14.5, 11.5,  8.5,  7.3];

/**
 * Maps solar location strings to regional temperature profiles.
 * All 36 solar locations from solarLocationDiscovery.ts are covered.
 */
const LOCATION_TO_TEMPS: Record<string, number[]> = {
  // East
  Dublin:          TEMPS_EAST,
  Wicklow:         TEMPS_EAST,
  Kildare:         TEMPS_EAST,
  Meath:           TEMPS_EAST,
  Louth:           TEMPS_EAST,
  Wexford:         TEMPS_EAST,
  Carlow:          TEMPS_EAST,
  // South
  Cork_North:      TEMPS_SOUTH,
  Cork_East:       TEMPS_SOUTH,
  Cork_West:       TEMPS_SOUTH,
  Kerry:           TEMPS_SOUTH,
  Waterford:       TEMPS_SOUTH,
  Kilkenny:        TEMPS_SOUTH,
  Tipperary_South: TEMPS_SOUTH,
  // West
  Galway:          TEMPS_WEST,
  Clare:           TEMPS_WEST,
  Limerick:        TEMPS_WEST,
  Mayo:            TEMPS_WEST,
  Roscommon:       TEMPS_WEST,
  Sligo:           TEMPS_WEST,
  Leitrim:         TEMPS_WEST,
  // Northwest / North
  Donegal_North:   TEMPS_NORTH,
  Donegal_South:   TEMPS_NORTH,
  Cavan:           TEMPS_NORTH,
  Monaghan:        TEMPS_NORTH,
  // Midlands
  Offaly:          TEMPS_MIDLAND,
  Laois:           TEMPS_MIDLAND,
  Westmeath:       TEMPS_MIDLAND,
  Longford:        TEMPS_MIDLAND,
  Tipperary_North: TEMPS_MIDLAND,
  // Northern Ireland
  Antrim:          TEMPS_NI_EAST,
  Down:            TEMPS_NI_EAST,
  Armagh:          TEMPS_NI_EAST,
  Derry:           TEMPS_NORTH,
  Tyrone:          TEMPS_NORTH,
  Fermanagh:       TEMPS_NORTH,
};

/**
 * Daily temperature amplitude (±°C from monthly mean) by month.
 * Sinusoidal variation: minimum at 06:00, maximum at 15:00.
 * Smaller swings in winter (maritime), larger in summer.
 */
const DAILY_AMPLITUDE_BY_MONTH: number[] = [
  2.5, 2.5, 3.0, 3.5, 4.0, 4.0, 4.0, 4.0, 3.5, 3.0, 2.5, 2.5,
];

/**
 * Returns the monthly mean temperature for a given location and month.
 * Falls back to Dublin (TEMPS_EAST) if location is not recognised.
 */
export function getMonthlyMeanTemp(location: string, monthIndex: number): number {
  const temps = LOCATION_TO_TEMPS[location] ?? TEMPS_EAST;
  return temps[monthIndex];
}

/**
 * Returns estimated outdoor temperature (°C) for a half-hourly slot.
 *
 * @param location     - Solar location string (e.g. 'Cork_North'). Falls back to Dublin.
 * @param monthIndex   - 0=Jan … 11=Dec
 * @param halfHourSlot - 0–47 within the day (slot 0 = 00:00, slot 12 = 06:00, slot 30 = 15:00)
 */
export function getHalfHourlyTemperature(
  location: string,
  monthIndex: number,
  halfHourSlot: number,
): number {
  const mean = getMonthlyMeanTemp(location, monthIndex);
  const amplitude = DAILY_AMPLITUDE_BY_MONTH[monthIndex];

  // Sinusoidal: min at slot 12 (06:00), max at slot 30 (15:00)
  // T = mean - amplitude × cos(2π × (slot - 12) / 48)
  const phase = (halfHourSlot - 12) / 48;
  return mean - amplitude * Math.cos(2 * Math.PI * phase);
}

/**
 * Generates a full array of outdoor temperatures for a year.
 * Matches the half-hourly slot structure used throughout the simulation engine.
 *
 * @param location              - Solar location string
 * @param year                  - Calendar year (handles leap years: 17568 vs 17664 slots)
 * @param monthIndexPerSlot     - Optional: pre-computed month index per slot from solar timestamps.
 *                                If omitted, uses built-in calendar approximation.
 * @param realTemperaturesC     - Optional: real half-hourly temperature data (°C) from
 *                                weatherDataLoader. When provided, pads/trims to expected
 *                                slot count and returns directly — synthetic model is bypassed.
 */
export function generateYearlyTemperatureProfile(
  location: string,
  year: number,
  monthIndexPerSlot?: number[],
  realTemperaturesC?: number[],
): number[] {
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const totalSlots = isLeap ? 17664 : 17568;

  // Use real temperature data when available
  if (realTemperaturesC && realTemperaturesC.length > 0) {
    const real = [...realTemperaturesC];
    // Pad with last value if data is shorter than expected (partial year)
    while (real.length < totalSlots) real.push(real[real.length - 1]);
    return real.slice(0, totalSlots);
  }

  if (monthIndexPerSlot) {
    return monthIndexPerSlot.map((monthIndex, slotIndex) => {
      const halfHourSlot = slotIndex % 48;
      return getHalfHourlyTemperature(location, monthIndex, halfHourSlot);
    });
  }

  const daysInMonth = isLeap
    ? [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const result: number[] = [];
  for (let m = 0; m < 12; m++) {
    const slotsInMonth = daysInMonth[m] * 48;
    for (let s = 0; s < slotsInMonth; s++) {
      result.push(getHalfHourlyTemperature(location, m, s % 48));
    }
  }

  while (result.length < totalSlots) result.push(result[result.length - 1]);
  return result.slice(0, totalSlots);
}
