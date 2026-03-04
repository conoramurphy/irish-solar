# Solar Timeseries Data Format

## Overview

The solar ROI calculator uses **CSV timeseries files** containing **half-hourly** solar irradiance data (CAMS Radiation Service, 2020-2025) to distribute annual PV production across time with high fidelity.

Legacy hourly PVGIS files (24 slots/day) are still accepted for backward compatibility.

## Data Format

### File Naming
- Pattern: `{Location}_{Year}.csv`
- Examples: `Cavan_2020.csv`, `Cork_North_2022.csv`
- Location: Place files in `public/data/solar/`

### CAMS CSV Structure (current — half-hourly)

```csv
Latitude (decimal degrees):	53.835
Longitude (decimal degrees):	-7.072
Radiation database:	CAMS
Representative town:	Cavan

time,GHI,DHI,BHI,BNI
20200101:0000,0.0,0.0,0.0,0.0
20200101:0030,0.0,0.0,0.0,0.0
20200101:0100,3.2,1.1,2.1,4.5
...
```

### Legacy PVGIS CSV Structure (hourly, backward-compatible)

```csv
Latitude (decimal degrees):	53.835
Longitude (decimal degrees):	-7.072
Elevation (m):	101
Radiation database:	PVGIS-SARAH3

Slope: 0 deg. 
Azimuth: 100 deg. 
time,G(i),H_sun,T2m,WS10m,Int
20200101:0011,0.0,0.0,5.63,1.45,0.0
20200101:0111,0.0,0.0,5.85,1.52,0.0
...
```

### Key Columns

1. **Header Metadata** (Tab-separated key: value pairs):
   - Latitude, Longitude
   - Radiation database source (`CAMS` or `PVGIS-SARAH3`)
   - Representative town (CAMS files)

2. **CAMS Data Columns** (Comma-separated):
   - `time`: Format `YYYYMMdd:HHMM` (e.g., `20200101:0030`)
   - `GHI`: **Global Horizontal Irradiance (W/m²)** — primary column
   - `DHI`: Diffuse Horizontal Irradiance (W/m²)
   - `BHI`: Beam (Direct) Horizontal Irradiance (W/m²)
   - `BNI`: Beam Normal Irradiance (W/m²)

3. **PVGIS Data Columns** (Comma-separated):
   - `time`: Format `YYYYMMdd:HHmm`
   - `G(i)`: Global Horizontal Irradiance (W/m²)

### Resolution Detection

The parser auto-detects resolution from the data header line:
- Header contains `time,GHI` → **CAMS half-hourly** (48 slots/day, 17 520/17 568 per year)
- Header contains `time,G(i)` → **PVGIS hourly** (24 slots/day, 8 760/8 784 per year)

## Distribution Algorithm

### Core Principle
The irradiance data represents "sun on the ground" (horizontal plane, tilt=0°) and serves as a **pure daylight/seasonality profile** to distribute energy, not to model panel specifics.

### Steps

1. **Parse CSV**:
   ```typescript
   const data = parseSolarTimeseriesCSV(csvContent, locationName);
   ```

2. **Clamp Negatives**:
   ```typescript
   I_t = max(0, GHI_t)
   ```

3. **Calculate Weights**:
   ```typescript
   W_t = I_t / sum(I_all)  // Ensures sum(W_t) = 1
   ```

4. **Distribute Annual Production**:
   ```typescript
   kWh_t = Annual_kWh * W_t
   ```

### Aggregation

**Daily**:
```typescript
I_day = sum(I_t within day)
W_day = I_day / sum(I_all)
kWh_day = Annual_kWh * W_day
```

**Monthly**:
```typescript
const monthlyProduction = aggregateToMonthly(hourlyProduction, solarData);
```

## Usage in Application

### 1. User Input
User provides:
- **Total Annual Production (kWh/year)**: Pre-calculated from external design tool
- **Location**: Selected from dropdown (determines which CSV to load)

### 2. Processing
```typescript
// Load CSV (served from public/data/solar/ and fetched from /data/solar at runtime)
const solarData = await loadSolarData(location, year);

// Distribute
const hourlyProduction = distributeAnnualProductionTimeseries(
  annualProductionKwh,
  solarData
);

// Aggregate to monthly for display
const monthlyProduction = aggregateToMonthly(hourlyProduction, solarData);
```

### 3. Display
- Shows monthly breakdown with realistic seasonal variation
- Indicates number of timesteps loaded and detected resolution
- Peak month identification

## Important Notes

### What This Does
✅ Distributes annual PV energy proportionally to ground irradiance  
✅ Preserves realistic dawn/dusk patterns at half-hourly resolution  
✅ Captures seasonal day length variations  
✅ Provides half-hourly resolution for accurate time-of-use matching  
✅ Includes cloud cover (CAMS all-sky GHI)  

### What This Does NOT Do
❌ Model PV module efficiency  
❌ Account for panel tilt/azimuth  
❌ Include inverter losses  
❌ Calculate system sizing  

**Why**: The annual production value is pre-calculated from external design tools. This file only provides the **temporal shape** to distribute that energy.

## Adding New Locations

1. Download CAMS data using `scripts/download_cams.py` for the desired location
2. Save as `{LocationName}_{Year}.csv` in `public/data/solar/`
3. Add location name to `ALL_LOCATIONS` in `src/utils/solarLocationDiscovery.ts`
4. The system will automatically load and process the file via `loadSolarData()`

## Data Source

Current: [CAMS Radiation Service](https://www.soda-pro.com/web-services/radiation/cams-radiation-service)  
accessed via `pvlib.iotools.get_cams()` — 15-min data aggregated to 30-min.

Legacy: [PVGIS (Photovoltaic Geographical Information System)](https://re.jrc.ec.europa.eu/pvgis/)
- Database: PVGIS-SARAH3
- Configuration: Horizontal plane (Slope: 0°)
- Output: Hourly irradiance data
