# Solar Timeseries Data Format

## Overview

The solar ROI calculator now uses **CSV timeseries files** containing hourly solar irradiance data to distribute annual PV production across time with high fidelity.

## Data Format

### File Naming
- Pattern: `{Location}_{Year}.csv`
- Example: `Cavan_2020.csv`
- Location: Place files in `public/data/solar/`

### CSV Structure

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

1. **Header Metadata** (Tab-separated):
   - Latitude, Longitude, Elevation
   - Radiation database source

2. **Data Columns** (Comma-separated):
   - `time`: Format `YYYYMMdd:HHmm` (e.g., `20200101:0011`)
   - `G(i)`: **Global Horizontal Irradiance (W/m²)** - This is the primary column used
   - `H_sun`: Sun height (degrees)
   - `T2m`: Temperature at 2m (°C)
   - `WS10m`: Wind speed at 10m (m/s)
   - `Int`: Irradiance interpolation flag

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
- Indicates number of hourly timesteps loaded
- Peak month identification

## Important Notes

### What This Does
✅ Distributes annual PV energy proportionally to ground irradiance  
✅ Preserves realistic dawn/dusk patterns  
✅ Captures seasonal day length variations  
✅ Provides hourly resolution for future time-of-use matching  

### What This Does NOT Do
❌ Model PV module efficiency  
❌ Account for panel tilt/azimuth  
❌ Include inverter losses  
❌ Calculate system sizing  

**Why**: The annual production value is designed elsewhere with proper modeling tools. This file only provides the **temporal shape** to distribute that pre-calculated energy.

## Adding New Locations

1. Obtain PVGIS CSV file for location (horizontal plane, tilt=0°)
2. Save as `{LocationName}_{Year}.csv` in `public/data/solar/`
3. Add location name to `availableLocations` array in `src/components/steps/Step1DigitalTwin.tsx`
4. The system will automatically load and process the file via `loadSolarData()`

## Data Source

Recommended: [PVGIS (Photovoltaic Geographical Information System)](https://re.jrc.ec.europa.eu/pvgis/)
- Database: PVGIS-SARAH3
- Configuration: Horizontal plane (Slope: 0°)
- Output: Hourly irradiance data
