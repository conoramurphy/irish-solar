#!/usr/bin/env python3
"""
Download hourly temperature data for all 36 Irish county locations from the
Open-Meteo Historical Weather API.

Source: Open-Meteo Archive API (ERA5 / ECMWF IFS, 9 km resolution)
Resolution: hourly (interpolated to half-hourly in the output CSV)
Year: 2025 only
Locations: same 36 points as download_cams.py (1 per county)

No API key or registration needed.

Usage:
    python scripts/download_weather.py
    python scripts/download_weather.py --location Dublin
"""

import os
import sys
import time
import json
import datetime
import argparse
import urllib.request
import urllib.error

# Same locations as download_cams.py
LOCATIONS = [
    {"name": "Carlow",           "lat": 52.8408, "lon": -6.9261},
    {"name": "Cavan",            "lat": 53.9908, "lon": -7.3606},
    {"name": "Clare",            "lat": 52.8432, "lon": -8.9867},
    {"name": "Cork_North",       "lat": 52.1416, "lon": -8.6536},
    {"name": "Cork_East",        "lat": 51.9144, "lon": -8.1753},
    {"name": "Cork_West",        "lat": 51.6806, "lon": -9.4536},
    {"name": "Donegal_North",    "lat": 54.9533, "lon": -7.7342},
    {"name": "Donegal_South",    "lat": 54.6539, "lon": -8.1103},
    {"name": "Dublin",           "lat": 53.3498, "lon": -6.2603},
    {"name": "Galway",           "lat": 53.2707, "lon": -9.0568},
    {"name": "Kerry",            "lat": 52.2713, "lon": -9.6995},
    {"name": "Kildare",          "lat": 53.2159, "lon": -6.6686},
    {"name": "Kilkenny",         "lat": 52.6541, "lon": -7.2448},
    {"name": "Laois",            "lat": 53.0343, "lon": -7.2993},
    {"name": "Leitrim",          "lat": 53.9468, "lon": -8.0898},
    {"name": "Limerick",         "lat": 52.6680, "lon": -8.6305},
    {"name": "Longford",         "lat": 53.7276, "lon": -7.7933},
    {"name": "Louth",            "lat": 54.0037, "lon": -6.4181},
    {"name": "Mayo",             "lat": 53.7611, "lon": -9.2985},
    {"name": "Meath",            "lat": 53.6524, "lon": -6.6815},
    {"name": "Monaghan",         "lat": 54.2492, "lon": -6.9683},
    {"name": "Offaly",           "lat": 53.2743, "lon": -7.4932},
    {"name": "Roscommon",        "lat": 53.6316, "lon": -8.1890},
    {"name": "Sligo",            "lat": 54.2766, "lon": -8.4761},
    {"name": "Tipperary_North",  "lat": 52.8622, "lon": -8.1969},
    {"name": "Tipperary_South",  "lat": 52.3553, "lon": -7.7110},
    {"name": "Waterford",        "lat": 52.2593, "lon": -7.1101},
    {"name": "Westmeath",        "lat": 53.5269, "lon": -7.3428},
    {"name": "Wexford",          "lat": 52.3369, "lon": -6.4633},
    {"name": "Wicklow",          "lat": 52.9808, "lon": -6.0446},
    {"name": "Antrim",           "lat": 54.7210, "lon": -6.2074},
    {"name": "Armagh",           "lat": 54.3503, "lon": -6.6528},
    {"name": "Down",             "lat": 54.3285, "lon": -5.7178},
    {"name": "Fermanagh",        "lat": 54.3449, "lon": -7.6415},
    {"name": "Derry",            "lat": 54.9966, "lon": -7.3086},
    {"name": "Tyrone",           "lat": 54.5982, "lon": -7.3002},
]

YEAR = 2025
API_BASE = "https://archive-api.open-meteo.com/v1/archive"
DELAY_BETWEEN_REQUESTS = 0.5  # seconds — Open-Meteo is generous but be polite

OUTPUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "data", "weather"
)


def interpolate_hourly_to_half_hourly(hourly_temps: list[float]) -> list[float]:
    """
    Interpolate hourly temperature values to half-hourly by linear interpolation.
    8760 hourly values → 17520 half-hourly values.
    Each hourly value becomes two half-hourly values:
      - the value itself (on the hour)
      - the midpoint to the next hour
    Last hour wraps to first hour for interpolation.
    """
    result = []
    n = len(hourly_temps)
    for i in range(n):
        result.append(hourly_temps[i])
        next_val = hourly_temps[(i + 1) % n]
        result.append((hourly_temps[i] + next_val) / 2)
    return result


def download_location(location: dict) -> bool:
    """Download 2025 hourly temperature data for one location. Returns True on success."""
    filename = f"{location['name']}_2025.csv"
    filepath = os.path.join(OUTPUT_DIR, filename)

    if os.path.exists(filepath):
        print(f"  SKIP {filename} (already exists)")
        return True

    # Build API URL
    end_date = "2025-12-31"
    today = datetime.date.today()
    two_days_ago = today - datetime.timedelta(days=2)
    if datetime.date(2025, 12, 31) > two_days_ago:
        end_date = two_days_ago.isoformat()
        print(f"  NOTE: data truncated to {end_date} (API lag)")

    url = (
        f"{API_BASE}"
        f"?latitude={location['lat']}&longitude={location['lon']}"
        f"&start_date=2025-01-01&end_date={end_date}"
        f"&hourly=temperature_2m"
    )

    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())

        times = data["hourly"]["time"]
        temps = data["hourly"]["temperature_2m"]

        if not times or not temps:
            print(f"  ERROR {filename}: empty response")
            return False

        # Handle nulls (rare, but possible at data boundaries)
        for i in range(len(temps)):
            if temps[i] is None:
                # Fill from nearest non-null
                if i > 0 and temps[i - 1] is not None:
                    temps[i] = temps[i - 1]
                else:
                    temps[i] = 10.0  # safe fallback for Ireland

        # Interpolate to half-hourly
        half_hourly_temps = interpolate_hourly_to_half_hourly(temps)

        # Build half-hourly timestamps
        half_hourly_times = []
        for t in times:
            dt = datetime.datetime.fromisoformat(t)
            half_hourly_times.append(dt.strftime("%Y%m%d:%H%M"))
            dt_half = dt + datetime.timedelta(minutes=30)
            half_hourly_times.append(dt_half.strftime("%Y%m%d:%H%M"))

        # Write CSV
        with open(filepath, "w") as f:
            f.write(f"Latitude (decimal degrees):\t{location['lat']}\n")
            f.write(f"Longitude (decimal degrees):\t{location['lon']}\n")
            f.write(f"Source:\tOpen-Meteo Historical Weather API (ERA5/ECMWF)\n")
            f.write(f"Location:\t{location['name']}\n")
            f.write(f"\n")
            f.write("time,temperature_2m\n")
            for ts, temp in zip(half_hourly_times, half_hourly_temps):
                f.write(f"{ts},{temp:.1f}\n")

        print(f"  OK    {filename} ({len(half_hourly_temps)} half-hour slots)")
        return True

    except urllib.error.URLError as e:
        print(f"  ERROR {filename}: {e}")
        return False
    except Exception as e:
        print(f"  ERROR {filename}: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Download Open-Meteo weather data for Ireland")
    parser.add_argument("--location", default=None,
                        help="Download only this location name (for testing)")
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    locations = LOCATIONS
    if args.location:
        locations = [l for l in LOCATIONS if l["name"] == args.location]
        if not locations:
            names = [l["name"] for l in LOCATIONS]
            sys.exit(f"Unknown location '{args.location}'. Available: {names}")

    total = len(locations)
    success = 0
    fail = 0

    print(f"Open-Meteo Weather Data Download for Ireland")
    print(f"Locations: {total}, Year: {YEAR}")
    print(f"Output: {OUTPUT_DIR}")
    print(f"{'=' * 60}")

    for i, loc in enumerate(locations):
        print(f"\n[{i+1}/{total}] {loc['name']} ({loc['lat']}, {loc['lon']})")
        result = download_location(loc)
        if result:
            success += 1
        else:
            fail += 1
        time.sleep(DELAY_BETWEEN_REQUESTS)

    print(f"\n{'=' * 60}")
    print(f"Done. Success: {success}, Failed: {fail}, Total: {total}")
    print(f"Files in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
