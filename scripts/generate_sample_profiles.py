"""
Generate synthetic ESB HDF half-hourly CSV usage profiles for three sample building types.

Sources & methodology:
  Dairy farm : Teagasc / SEAI DSSED study (58 Irish farms, 2014-2017).
               Spring-calving system; ~27,100 kWh/yr for 100 cows.
               Twin daily peaks at morning milking (06:00-08:00) and
               evening milking (17:30-19:30).

  Beef farm  : Teagasc beef infrastructure + Darling Downs case study
               extrapolated to Irish suckler system; ~4,050 kWh/yr for
               100 cows (no milking/cooling equipment).
               Flat daily profile, peaks Nov-Feb (winter housing).

  Hotel      : UK Utility Bidder benchmark (100 kWh/m² electricity,
               60 m² per room) scaled to 20 beds for Irish context;
               ~70,500 kWh/yr.
               Morning peak (07:00-10:00, breakfast/checkout) and
               evening peak (18:00-23:00, dinner/bar).

Output: ESB Networks HDF (Historical Data File) CSV format, year 2025.
  MPRN, Meter Serial Number, Read Value, Read Type, Read Date and End Time
  Read Value is kW average power over the 30-minute interval.
  Timestamp is the END of each interval.
  ±8% Gaussian noise added to each slot to avoid an artificially smooth curve.
"""

import csv
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

YEAR = 2025
SEED = 42
NOISE_SIGMA = 0.08  # ±8% standard deviation

random.seed(SEED)

# ---------------------------------------------------------------------------
# Monthly kWh targets (index 0 = January)
# ---------------------------------------------------------------------------

MONTHLY_KWH = {
    "dairy": [450, 600, 1900, 2800, 3400, 3200, 2800, 2400, 2100, 1800, 1200, 450],
    "beef":  [480, 480,  380,  280,  220,  200,  200,  200,  260,  360,  450, 540],
    "hotel": [4500, 4200, 4800, 5400, 6000, 7200, 7800, 7600, 6200, 5600, 5400, 5800],
}

# ---------------------------------------------------------------------------
# Normalised 24-hour shape (index 0 = 00:00-00:30 interval)
# Values are relative weights; they are renormalised per slot inside the code.
# ---------------------------------------------------------------------------

def _dairy_shape():
    """Twin-peak: morning milking 06:00-08:00, evening milking 17:30-19:30."""
    shape = []
    for h in range(24):
        for half in range(2):
            t = h + half * 0.5  # fractional hour
            if 6.0 <= t < 8.0:
                w = 2.8
            elif 17.5 <= t < 19.5:
                w = 2.6
            elif 8.0 <= t < 10.0:
                # post-morning-milking cooling taper
                w = 1.2 - 0.1 * (t - 8.0)
            elif 19.5 <= t < 21.0:
                # post-evening-milking cooling taper
                w = 1.1 - 0.1 * (t - 19.5)
            elif 4.5 <= t < 6.0:
                # warm-up before morning milking
                w = 0.9
            elif 0.0 <= t < 4.5:
                w = 0.45  # overnight base (refrigeration, water heating timer)
            else:
                w = 0.55  # daytime base
            shape.append(w)
    return shape


def _beef_shape():
    """Mostly flat; modest bumps at morning feed (06:00-08:00) and evening check (16:00-18:00)."""
    shape = []
    for h in range(24):
        for half in range(2):
            t = h + half * 0.5
            if 6.0 <= t < 8.0:
                w = 1.7
            elif 16.0 <= t < 18.0:
                w = 1.4
            elif 0.0 <= t < 5.5:
                w = 0.65  # overnight (auto-lighting off, minimal pumping)
            else:
                w = 0.9
            shape.append(w)
    return shape


def _hotel_shape():
    """
    Morning breakfast/checkout peak 07:00-10:00.
    Evening dinner/bar peak 18:00-23:00.
    Low overnight base 01:00-06:00.
    """
    shape = []
    for h in range(24):
        for half in range(2):
            t = h + half * 0.5
            if 7.0 <= t < 10.0:
                w = 2.0
            elif 18.0 <= t < 23.0:
                w = 1.8
            elif 10.0 <= t < 14.0:
                # housekeeping, laundry
                w = 1.3
            elif 14.0 <= t < 18.0:
                # check-ins, afternoon lull
                w = 1.1
            elif 6.0 <= t < 7.0:
                # early staff / kitchen warm-up
                w = 0.75
            elif 23.0 <= t < 24.0:
                # last guests
                w = 0.9
            else:
                # 01:00-06:00 overnight base (security, fridges, standby)
                w = 0.45
            shape.append(w)
    return shape


SHAPES = {
    "dairy": _dairy_shape(),
    "beef":  _beef_shape(),
    "hotel": _hotel_shape(),
}

MPRNS = {
    "dairy": ("99999999901", "000000000000000001"),
    "beef":  ("99999999902", "000000000000000002"),
    "hotel": ("99999999903", "000000000000000003"),
}

FILENAMES = {
    "dairy": "sample_dairy_farm_100cow_2025.csv",
    "beef":  "sample_beef_farm_100cow_2025.csv",
    "hotel": "sample_hotel_20bed_2025.csv",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def days_in_month(year: int, month: int) -> int:
    """Return the number of days in a given month (1-based)."""
    if month == 12:
        return 31
    return (datetime(year, month + 1, 1) - datetime(year, month, 1)).days


def normalise(shape: list[float]) -> list[float]:
    """Normalise a 48-element daily shape so it sums to 48 (preserves mean=1)."""
    total = sum(shape)
    return [v * 48 / total for v in shape]


def add_noise(value: float, sigma: float = NOISE_SIGMA) -> float:
    """Multiply value by (1 + N(0, sigma)), clamped to ≥ 0."""
    factor = 1.0 + random.gauss(0, sigma)
    return max(0.0, value * factor)


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

def generate_profile(profile_type: str, year: int) -> list[tuple[str, str, float]]:
    """
    Returns a list of (date_str, read_value_kw) tuples for every half-hour slot
    in the given year, in chronological order (timestamps are interval END times).
    """
    monthly_kwh = MONTHLY_KWH[profile_type]
    shape_norm = normalise(SHAPES[profile_type])  # 48-element daily shape, mean=1

    rows: list[tuple[str, str, float]] = []
    mprn, serial = MPRNS[profile_type]

    # Build slot-by-slot, month by month
    for month_idx in range(12):
        month_num = month_idx + 1
        n_days = days_in_month(year, month_num)
        target_kwh = monthly_kwh[month_idx]

        # Average kWh per slot for this month
        slots_in_month = n_days * 48
        mean_kwh_per_slot = target_kwh / slots_in_month

        # Pre-generate noisy weights for every slot so we can rescale to hit
        # the exact monthly total
        raw_slots: list[float] = []
        for day in range(n_days):
            for slot in range(48):
                weight = shape_norm[slot]
                raw = mean_kwh_per_slot * weight
                raw_slots.append(add_noise(raw))

        # Rescale so that the monthly sum exactly matches target_kwh
        actual_total = sum(raw_slots)
        scale = target_kwh / actual_total if actual_total > 0 else 1.0
        scaled_slots = [v * scale for v in raw_slots]

        # Build timestamp strings and convert kWh → kW (÷0.5 since 30-min intervals)
        slot_idx = 0
        for day in range(n_days):
            date = datetime(year, month_num, day + 1)
            for slot in range(48):
                # End time of interval: slot 0 ends at 00:30, slot 47 ends at 24:00
                minutes_end = (slot + 1) * 30
                end_time = date + timedelta(minutes=minutes_end)
                ts = end_time.strftime("%d-%m-%Y %H:%M")
                kwh = scaled_slots[slot_idx]
                kw = kwh / 0.5  # kWh to average kW over 30 min
                rows.append((mprn, serial, ts, round(kw, 3)))
                slot_idx += 1

    return rows


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    script_dir = Path(__file__).parent
    output_dir = script_dir.parent / "public" / "data" / "usages"
    output_dir.mkdir(parents=True, exist_ok=True)

    for profile_type, filename in FILENAMES.items():
        out_path = output_dir / filename
        rows = generate_profile(profile_type, YEAR)

        with open(out_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([
                "MPRN",
                "Meter Serial Number",
                "Read Value",
                "Read Type",
                "Read Date and End Time",
            ])
            for mprn, serial, ts, kw in rows:
                writer.writerow([mprn, serial, kw, "Active Import Interval (kW)", ts])

        total_kwh = sum(kw * 0.5 for _, _, _, kw in rows)
        print(f"[{profile_type:6s}] {filename}  —  {len(rows):,} slots  —  {total_kwh:,.0f} kWh/yr")

    print("\nDone. Files written to:", output_dir)


if __name__ == "__main__":
    main()
