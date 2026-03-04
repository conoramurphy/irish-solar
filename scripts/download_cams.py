#!/usr/bin/env python3
"""
Download half-hourly solar irradiance data for all 32 Irish counties
from the CAMS Radiation Service via pvlib.

Source: CAMS (Copernicus Atmosphere Monitoring Service) via SoDa
Resolution: 15-min download, aggregated to 30-min output
Years: 2020-2025
Locations: 36 points (32 counties + Cork N/E/W, Tipperary N/S, Donegal N/S)

Prerequisites:
  pip install pvlib pandas
  Register free at https://soda-pro.com and set SODA_EMAIL env var.

Usage:
  SODA_EMAIL=you@example.com python scripts/download_cams.py
"""

import os
import sys
import time
import datetime
import argparse
import pandas as pd

try:
    from pvlib.iotools import get_cams
except ImportError:
    sys.exit("pvlib is required: pip install pvlib pandas")

LOCATIONS = [
    # Republic of Ireland (26 counties, 30 points)
    {"name": "Carlow",           "lat": 52.8408, "lon": -6.9261, "town": "Carlow"},
    {"name": "Cavan",            "lat": 53.9908, "lon": -7.3606, "town": "Cavan"},
    {"name": "Clare",            "lat": 52.8432, "lon": -8.9867, "town": "Ennis"},
    {"name": "Cork_North",       "lat": 52.1416, "lon": -8.6536, "town": "Mallow"},
    {"name": "Cork_East",        "lat": 51.9144, "lon": -8.1753, "town": "Midleton"},
    {"name": "Cork_West",        "lat": 51.6806, "lon": -9.4536, "town": "Bantry"},
    {"name": "Donegal_North",    "lat": 54.9533, "lon": -7.7342, "town": "Letterkenny"},
    {"name": "Donegal_South",    "lat": 54.6539, "lon": -8.1103, "town": "Donegal Town"},
    {"name": "Dublin",           "lat": 53.3498, "lon": -6.2603, "town": "Dublin"},
    {"name": "Galway",           "lat": 53.2707, "lon": -9.0568, "town": "Galway"},
    {"name": "Kerry",            "lat": 52.2713, "lon": -9.6995, "town": "Tralee"},
    {"name": "Kildare",          "lat": 53.2159, "lon": -6.6686, "town": "Naas"},
    {"name": "Kilkenny",         "lat": 52.6541, "lon": -7.2448, "town": "Kilkenny"},
    {"name": "Laois",            "lat": 53.0343, "lon": -7.2993, "town": "Portlaoise"},
    {"name": "Leitrim",          "lat": 53.9468, "lon": -8.0898, "town": "Carrick-on-Shannon"},
    {"name": "Limerick",         "lat": 52.6680, "lon": -8.6305, "town": "Limerick"},
    {"name": "Longford",         "lat": 53.7276, "lon": -7.7933, "town": "Longford"},
    {"name": "Louth",            "lat": 54.0037, "lon": -6.4181, "town": "Dundalk"},
    {"name": "Mayo",             "lat": 53.7611, "lon": -9.2985, "town": "Castlebar"},
    {"name": "Meath",            "lat": 53.6524, "lon": -6.6815, "town": "Navan"},
    {"name": "Monaghan",         "lat": 54.2492, "lon": -6.9683, "town": "Monaghan"},
    {"name": "Offaly",           "lat": 53.2743, "lon": -7.4932, "town": "Tullamore"},
    {"name": "Roscommon",        "lat": 53.6316, "lon": -8.1890, "town": "Roscommon"},
    {"name": "Sligo",            "lat": 54.2766, "lon": -8.4761, "town": "Sligo"},
    {"name": "Tipperary_North",  "lat": 52.8622, "lon": -8.1969, "town": "Nenagh"},
    {"name": "Tipperary_South",  "lat": 52.3553, "lon": -7.7110, "town": "Clonmel"},
    {"name": "Waterford",        "lat": 52.2593, "lon": -7.1101, "town": "Waterford"},
    {"name": "Westmeath",        "lat": 53.5269, "lon": -7.3428, "town": "Mullingar"},
    {"name": "Wexford",          "lat": 52.3369, "lon": -6.4633, "town": "Wexford"},
    {"name": "Wicklow",          "lat": 52.9808, "lon": -6.0446, "town": "Wicklow"},
    # Northern Ireland (6 counties, 6 points)
    {"name": "Antrim",           "lat": 54.7210, "lon": -6.2074, "town": "Antrim"},
    {"name": "Armagh",           "lat": 54.3503, "lon": -6.6528, "town": "Armagh"},
    {"name": "Down",             "lat": 54.3285, "lon": -5.7178, "town": "Downpatrick"},
    {"name": "Fermanagh",        "lat": 54.3449, "lon": -7.6415, "town": "Enniskillen"},
    {"name": "Derry",            "lat": 54.9966, "lon": -7.3086, "town": "Derry"},
    {"name": "Tyrone",           "lat": 54.5982, "lon": -7.3002, "town": "Omagh"},
]

YEARS = list(range(2020, 2026))  # 2020-2025 inclusive

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "data", "solar"
)

DELAY_BETWEEN_REQUESTS = 2  # seconds


def aggregate_15min_to_30min(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate 15-minute data to 30-minute by averaging pairs."""
    df = df.copy()
    numeric_cols = df.select_dtypes(include="number").columns
    df = df[numeric_cols]
    df.index = pd.DatetimeIndex(df.index)
    resampled = df.resample("30min").mean()
    return resampled


def format_timestamp(dt: datetime.datetime) -> str:
    """Format datetime to PVGIS-like timestamp: YYYYMMdd:HHmm"""
    return dt.strftime("%Y%m%d:%H%M")


def write_csv(df: pd.DataFrame, location: dict, year: int, filepath: str):
    """Write a single-year CSV in PVGIS-compatible format."""
    with open(filepath, "w") as f:
        f.write(f"Latitude (decimal degrees):\t{location['lat']}\n")
        f.write(f"Longitude (decimal degrees):\t{location['lon']}\n")
        f.write(f"Radiation database:\tCAMS\n")
        f.write(f"Representative town:\t{location['town']}\n")
        f.write(f"\n")
        f.write("time,GHI,DHI,BHI,BNI\n")

        for ts, row in df.iterrows():
            time_str = format_timestamp(ts)
            ghi = max(0.0, round(row.get("ghi", row.get("GHI", 0.0)), 1))
            dhi = max(0.0, round(row.get("dhi", row.get("DHI", 0.0)), 1))
            bhi = max(0.0, round(row.get("bhi", row.get("BHI", 0.0)), 1))
            bni = max(0.0, round(row.get("dni", row.get("BNI", 0.0)), 1))
            f.write(f"{time_str},{ghi},{dhi},{bhi},{bni}\n")


def download_location_year(location: dict, year: int, email: str) -> bool:
    """Download and save data for one location and one year. Returns True on success."""
    filename = f"{location['name']}_{year}.csv"
    filepath = os.path.join(OUTPUT_DIR, filename)

    if os.path.exists(filepath):
        print(f"  SKIP {filename} (already exists)")
        return True

    start = datetime.date(year, 1, 1)
    end = datetime.date(year, 12, 31)

    # Don't request future dates
    today = datetime.date.today()
    two_days_ago = today - datetime.timedelta(days=2)
    if start > two_days_ago:
        print(f"  SKIP {filename} (year {year} not yet available)")
        return False
    if end > two_days_ago:
        end = two_days_ago
        print(f"  NOTE: {year} data truncated to {end} (CAMS lag)")

    try:
        data, meta = get_cams(
            latitude=location["lat"],
            longitude=location["lon"],
            start=start,
            end=end,
            email=email,
            identifier="cams_radiation",
            time_step="15min",
            time_ref="UT",
            integrated=False,
            map_variables=True,
        )

        df_30 = aggregate_15min_to_30min(data)

        # Filter to just the target year
        df_year = df_30[df_30.index.year == year]

        if len(df_year) == 0:
            print(f"  ERROR {filename}: no data returned for year {year}")
            return False

        write_csv(df_year, location, year, filepath)
        slots = len(df_year)
        print(f"  OK    {filename} ({slots} half-hour slots)")
        return True

    except Exception as e:
        print(f"  ERROR {filename}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download CAMS solar data for Ireland")
    parser.add_argument("--email", default=os.environ.get("SODA_EMAIL"),
                        help="SoDa account email (or set SODA_EMAIL env var)")
    parser.add_argument("--location", default=None,
                        help="Download only this location name (for testing)")
    parser.add_argument("--year", type=int, default=None,
                        help="Download only this year (for testing)")
    args = parser.parse_args()

    if not args.email:
        sys.exit(
            "SoDa email required. Set SODA_EMAIL env var or pass --email.\n"
            "Register free at https://soda-pro.com"
        )

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    locations = LOCATIONS
    if args.location:
        locations = [l for l in LOCATIONS if l["name"] == args.location]
        if not locations:
            names = [l["name"] for l in LOCATIONS]
            sys.exit(f"Unknown location '{args.location}'. Available: {names}")

    years = YEARS
    if args.year:
        years = [args.year]

    total = len(locations) * len(years)
    success = 0
    fail = 0
    skipped = 0

    print(f"CAMS Solar Data Download for Ireland")
    print(f"Locations: {len(locations)}, Years: {years[0]}-{years[-1]}, Total requests: {total}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"{'='*60}")

    for i, loc in enumerate(locations):
        print(f"\n[{i+1}/{len(locations)}] {loc['name']} ({loc['town']}, {loc['lat']}, {loc['lon']})")
        for year in years:
            result = download_location_year(loc, year, args.email)
            if result:
                success += 1
            else:
                fail += 1
            time.sleep(DELAY_BETWEEN_REQUESTS)

    print(f"\n{'='*60}")
    print(f"Done. Success: {success}, Failed: {fail}, Total: {total}")
    print(f"Files in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
