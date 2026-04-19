/**
 * Centroids (approximate) for all 32 Irish counties.
 *
 * Used to fetch PVGIS orientation profiles and to look up the nearest
 * pre-computed profile at runtime.
 *
 * Sources: OSi / OSM county boundary centroids, rounded to 2 decimal places.
 */

export interface CountyCoordinate {
  /** Display name used in UI and file naming */
  name: string;
  /** ISO-style slug used for file paths (lowercase, hyphens) */
  slug: string;
  lat: number;
  lon: number;
}

export const COUNTY_COORDINATES: CountyCoordinate[] = [
  // Connacht
  { name: 'Galway',       slug: 'galway',       lat: 53.35, lon: -8.85 },
  { name: 'Leitrim',      slug: 'leitrim',      lat: 54.12, lon: -8.00 },
  { name: 'Mayo',          slug: 'mayo',          lat: 53.90, lon: -9.50 },
  { name: 'Roscommon',    slug: 'roscommon',    lat: 53.75, lon: -8.27 },
  { name: 'Sligo',        slug: 'sligo',        lat: 54.18, lon: -8.47 },

  // Leinster
  { name: 'Carlow',       slug: 'carlow',       lat: 52.72, lon: -6.83 },
  { name: 'Dublin',       slug: 'dublin',       lat: 53.35, lon: -6.26 },
  { name: 'Kildare',      slug: 'kildare',      lat: 53.16, lon: -6.91 },
  { name: 'Kilkenny',     slug: 'kilkenny',     lat: 52.58, lon: -7.26 },
  { name: 'Laois',        slug: 'laois',        lat: 52.99, lon: -7.56 },
  { name: 'Longford',     slug: 'longford',     lat: 53.73, lon: -7.80 },
  { name: 'Louth',        slug: 'louth',        lat: 53.92, lon: -6.49 },
  { name: 'Meath',        slug: 'meath',        lat: 53.61, lon: -6.66 },
  { name: 'Offaly',       slug: 'offaly',       lat: 53.23, lon: -7.60 },
  { name: 'Westmeath',    slug: 'westmeath',    lat: 53.53, lon: -7.42 },
  { name: 'Wexford',      slug: 'wexford',      lat: 52.47, lon: -6.58 },
  { name: 'Wicklow',      slug: 'wicklow',      lat: 52.98, lon: -6.36 },

  // Munster
  { name: 'Clare',        slug: 'clare',        lat: 52.84, lon: -8.99 },
  { name: 'Cork',         slug: 'cork',         lat: 51.90, lon: -8.49 },
  { name: 'Kerry',        slug: 'kerry',        lat: 52.06, lon: -9.85 },
  { name: 'Limerick',     slug: 'limerick',     lat: 52.59, lon: -8.62 },
  { name: 'Tipperary',    slug: 'tipperary',    lat: 52.67, lon: -7.83 },
  { name: 'Waterford',    slug: 'waterford',    lat: 52.19, lon: -7.51 },

  // Ulster (Republic)
  { name: 'Cavan',        slug: 'cavan',        lat: 53.98, lon: -7.36 },
  { name: 'Donegal',      slug: 'donegal',      lat: 54.83, lon: -7.87 },
  { name: 'Monaghan',     slug: 'monaghan',     lat: 54.15, lon: -6.97 },

  // Northern Ireland
  { name: 'Antrim',       slug: 'antrim',       lat: 54.72, lon: -6.21 },
  { name: 'Armagh',       slug: 'armagh',       lat: 54.35, lon: -6.65 },
  { name: 'Derry',        slug: 'derry',        lat: 54.99, lon: -6.95 },
  { name: 'Down',         slug: 'down',         lat: 54.33, lon: -5.89 },
  { name: 'Fermanagh',    slug: 'fermanagh',    lat: 54.34, lon: -7.64 },
  { name: 'Tyrone',       slug: 'tyrone',       lat: 54.56, lon: -7.14 },
];

/** Find the nearest county to a given lat/lon (Euclidean approximation, fine for Ireland). */
export function findNearestCounty(lat: number, lon: number): CountyCoordinate {
  let best = COUNTY_COORDINATES[0];
  let bestDist = Infinity;
  for (const c of COUNTY_COORDINATES) {
    const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}
