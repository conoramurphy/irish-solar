"""
Generate synthetic ESB HDF half-hourly CSV usage profiles for three Irish domestic house types.

Sources & methodology:

  Small traditional house (~80 m²):
    3-bed semi-detached, pre-2000 build, BER D rating. Gas-heated — electricity covers
    lighting, appliances, cooking, immersion back-up.
    ~4,200 kWh/yr electricity.
    Source: SEAI "Energy in Ireland 2024"; CSO Household Energy Survey 2020;
            SEAI BER Database (stock average for pre-2000 semi-d).

  Large traditional house (~165 m²):
    4-bed detached, pre-1990 build, BER D/E rating. Oil/solid-fuel heated.
    Larger footprint → more lighting circuits, larger appliances, second immersion.
    ~6,800 kWh/yr electricity.
    Source: SEAI "Energy in Ireland 2024"; SEAI Monitoring & Reporting Programme;
            Irish BER stock analysis (SEAI 2022, Table 5.3).

  Heat pump house (~115 m²):
    3–4 bed semi-detached, well-insulated retrofit or post-2015 new build, BER B2.
    Air-to-water ASHP replaces gas/oil boiler for space heat and hot water.
    Heat demand ~8,500 kWh thermal at SCOP 3.0 → ~2,833 kWh electric for heat.
    Background appliances/lighting add ~2,900 kWh; off-peak DHW cylinder ~1,200 kWh.
    Hot water top-up run overnight on off-peak rate (00:00–03:00).
    Space heating mainly 08:00–16:00 when COP is highest.
    ~9,350 kWh/yr electricity.
    Source: SEAI "Heat Pump Monitoring Report 2023"; SEAI EXEED programme;
            Tipperary Energy Agency deep-retrofit monitoring data.

Output: ESB Networks HDF (Historical Data File) CSV format, year 2025.
  Columns: MPRN, Meter Serial Number, Read Value (kW), Read Type, Read Date and End Time
  Read Value is average power in kW over the 30-minute interval.
  Timestamp is the END of each 30-minute interval.
  ±8% Gaussian noise added per slot for realism.
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

YEAR = 2025
SEED = 43
NOISE_SIGMA = 0.08

random.seed(SEED)

# ---------------------------------------------------------------------------
# Monthly kWh targets — index 0 = January
# ---------------------------------------------------------------------------

MONTHLY_KWH = {
    # 3-bed semi-d, ~80 m², BER D, gas-heated, ~4,200 kWh/yr
    "house_small": [530, 450, 390, 310, 270, 230, 230, 240, 280, 370, 440, 460],

    # 4-bed detached, ~165 m², BER D/E, oil-heated, ~6,800 kWh/yr
    "house_large": [860, 730, 630, 500, 430, 370, 370, 390, 450, 600, 710, 780],

    # 3-4 bed, ~115 m², BER B2, ASHP, ~9,350 kWh/yr
    # Winter HP peaks heavily; summer barely runs for heat, but DHW stays
    "house_heat_pump": [1500, 1230, 950, 660, 480, 340, 290, 300, 460, 720, 1030, 1360],
}


# ---------------------------------------------------------------------------
# Normalised 24-hour shapes (48 half-hourly slots, index 0 = 00:00–00:30)
# ---------------------------------------------------------------------------

def _traditional_shape():
    """
    Typical Irish residential without heat pump.
    Morning kettle/shower peak 07:00–09:00.
    Evening cooking/TV/lights peak 17:00–22:00.
    Low overnight base 23:00–06:00.
    Daytime lull (occupants at work/school) 09:00–17:00.
    """
    shape = []
    for h in range(24):
        for half in range(2):
            t = h + half * 0.5
            if 7.0 <= t < 9.0:
                w = 2.2   # morning rush: kettle, toaster, shower pump
            elif 17.0 <= t < 22.0:
                w = 2.4   # evening: hob, oven, TV, lighting
            elif 22.0 <= t < 23.0:
                w = 1.3   # wind-down: dishwasher, chargers
            elif 9.0 <= t < 17.0:
                w = 0.9   # daytime lull (fridge, standby, occasional use)
            elif 6.0 <= t < 7.0:
                w = 1.0   # early riser warm-up
            else:
                w = 0.4   # overnight (fridge, standby only)
            shape.append(w)
    return shape


def _heat_pump_shape():
    """
    Air-to-water ASHP house, well-insulated (BER B2).
    Overnight (00:00–03:00): off-peak DHW cylinder charge.
    Morning (07:00–09:00): HP boost + occupant activity peak.
    Daytime (09:00–16:00): HP runs for space heating (best outdoor COP).
    Evening (16:00–22:00): cooking/TV/appliances + HP tops up.
    Late night (22:00–00:00): HP winds down, standby.
    """
    shape = []
    for h in range(24):
        for half in range(2):
            t = h + half * 0.5
            if 0.0 <= t < 3.0:
                w = 1.6   # DHW cylinder off-peak top-up
            elif 3.0 <= t < 6.5:
                w = 0.5   # quiet overnight
            elif 6.5 <= t < 7.0:
                w = 1.2   # HP pre-heat start
            elif 7.0 <= t < 9.0:
                w = 2.5   # HP + kettle + shower: highest peak
            elif 9.0 <= t < 16.0:
                w = 1.9   # HP daytime space heating (high COP window)
            elif 16.0 <= t < 22.0:
                w = 2.3   # evening: cooking, TV, HP maintaining temp
            elif 22.0 <= t < 23.5:
                w = 0.9   # wind-down, HP setback
            else:
                w = 0.6   # 23:30–00:00 transition
            shape.append(w)
    return shape


SHAPES = {
    "house_small":     _traditional_shape(),
    "house_large":     _traditional_shape(),   # same shape, different monthly totals
    "house_heat_pump": _heat_pump_shape(),
}

MPRNS = {
    "house_small":     ("99999999904", "000000000000000004"),
    "house_large":     ("99999999905", "000000000000000005"),
    "house_heat_pump": ("99999999906", "000000000000000006"),
}

FILENAMES = {
    "house_small":     "sample_house_small_traditional_2025.csv",
    "house_large":     "sample_house_large_traditional_2025.csv",
    "house_heat_pump": "sample_house_heat_pump_2025.csv",
}

DESCRIPTIONS = {
    "house_small":     "3-bed semi-detached, ~80 m², BER D, gas-heated",
    "house_large":     "4-bed detached, ~165 m², BER D/E, oil-heated",
    "house_heat_pump": "3-4 bed semi-d, ~115 m², BER B2, air-to-water heat pump",
}

# ---------------------------------------------------------------------------
# Helpers (identical to generate_sample_profiles.py)
# ---------------------------------------------------------------------------

def days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (datetime(year, month + 1, 1) - datetime(year, month, 1)).days


def normalise(shape: list) -> list:
    """Normalise 48-slot shape so its sum == 48 (mean == 1)."""
    total = sum(shape)
    return [v * 48 / total for v in shape]


def add_noise(value: float, sigma: float = NOISE_SIGMA) -> float:
    return max(0.0, value * (1.0 + random.gauss(0, sigma)))


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------

def generate_profile(profile_type: str, year: int) -> list:
    monthly_kwh = MONTHLY_KWH[profile_type]
    shape_norm = normalise(SHAPES[profile_type])
    mprn, serial = MPRNS[profile_type]
    rows = []

    for month_idx in range(12):
        month_num = month_idx + 1
        n_days = days_in_month(year, month_num)
        target_kwh = monthly_kwh[month_idx]
        slots_in_month = n_days * 48
        mean_kwh_per_slot = target_kwh / slots_in_month

        # Generate noisy slots
        raw_slots = []
        for _day in range(n_days):
            for slot in range(48):
                raw_slots.append(add_noise(mean_kwh_per_slot * shape_norm[slot]))

        # Rescale to hit exact monthly target
        actual = sum(raw_slots)
        scale = target_kwh / actual if actual > 0 else 1.0
        scaled = [v * scale for v in raw_slots]

        slot_idx = 0
        for day in range(n_days):
            date = datetime(year, month_num, day + 1)
            for slot in range(48):
                minutes_end = (slot + 1) * 30
                end_time = date + timedelta(minutes=minutes_end)
                ts = end_time.strftime("%d-%m-%Y %H:%M")
                kwh = scaled[slot_idx]
                kw = kwh / 0.5   # convert kWh → average kW over 30 min
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

    print("Generating Irish domestic house sample profiles...\n")

    for profile_type, filename in FILENAMES.items():
        out_path = output_dir / filename
        rows = generate_profile(profile_type, YEAR)
        total_kwh = sum(kw * 0.5 for _, _, _, kw in rows)
        monthly = MONTHLY_KWH[profile_type]

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

        print(f"[{profile_type}]")
        print(f"  File   : {filename}")
        print(f"  Profile: {DESCRIPTIONS[profile_type]}")
        print(f"  Slots  : {len(rows):,}  |  Total: {total_kwh:,.0f} kWh/yr")
        print(f"  Monthly: {[f'{k} kWh' for k in monthly]}")
        print()

    print(f"Done. Files written to: {output_dir}")


if __name__ == "__main__":
    main()
