# Heat Pump Modelling — Implementation Plan

Branch: `heat-pump-model`
Worktree: `../solar-roi-heat-pump-model`
Last updated: 2026-03-24

---

## What We're Building

A heat pump scenario modelling system that slots into the existing solar ROI calculator.
It generates realistic half-hourly electricity consumption profiles for heat pumps,
then runs them through the **unchanged** existing simulation engine (solar dispatch,
battery, tariff billing) to produce accurate annual bills and ROI figures.

### Two outputs

**Output A — Waterfall payback table**
Starting from a poorly-installed heat pump, shows the marginal cost and payback of
each upgrade measure in sequence:
1. Mediocre HP (baseline for the table)
2. → Good install: proper heat loss survey + correctly-sized/upgraded radiators + weather compensation set correctly (~€4,500 pessimistic premium)
3. → + Attic insulation
4. → + Cavity wall fill (skipped if no cavity — pre-1940s solid-wall homes)
5. → + Air sealing / draught-proofing
6. → + 4 kWp solar
7. → + 10 kWh battery
8. → + EWI (expected to show terrible payback — proves the point)

Each row: `incrementalNetCost / (previousAnnualBill - thisAnnualBill) = payback years`

**Output B — Solar maximalist scenario**
Minimum insulation (attic + cavity if available + air sealing only) + good HP install +
maximum practical solar (8–10 kWp) + 10 kWh battery. No EWI, no floor, no windows.
Runs through the same simulation engine. Compared head-to-head against full waterfall
end-state (deep retrofit path) to show similar or better economics at lower capital cost.

---

## Architecture

### Key constraint
Heat pump electricity is just another `hourlyConsumptionOverride` array (17,568
half-hourly slots). The existing `prepareSimulationContext()` and
`simulateHourlyEnergyFlow()` run unchanged. No engine modifications.

### New files

```
src/data/heatPumpArchetypes.ts      # 5 Irish house archetypes (TABULA IE-based)
src/data/irishWeatherProfiles.ts    # Monthly mean temps + daily amplitude by location
src/utils/heatPumpModel.ts          # Core: HLC → flow temp → COP → half-hourly profile
src/utils/heatPumpScenarios.ts      # Scenario runner: generates payback tables
tests/utils/heatPumpModel.test.ts   # Unit tests
tests/utils/heatPumpScenarios.test.ts
```

UI comes later (separate branch/PR) — this PR is engine + data only.

---

## Calculation Method

### 1. House archetype → HLC

```
HLC (W/K) = HLI (W/m²K) × floor_area_m2
```

5 archetypes (from TABULA Ireland + SEAI BER data):

| ID | Description | Floor area | Default HLI | HLC | Has cavity? |
|----|-------------|-----------|-------------|-----|-------------|
| `pre1940_solid` | Pre-1940 stone/solid-wall (cottage/terrace) | 90 m² | 4.5 | 405 W/K | No |
| `pre1978_semi` | 1940–1978 hollow block, uninsulated cavity | 100 m² | 3.5 | 350 W/K | Yes |
| `1980s_semi` | 1979–1995 cavity (unfilled or partial) | 108 m² | 2.5 | 270 W/K | Yes |
| `1990s_semi` | 1996–2008 cavity with partial fill | 110 m² | 2.0 | 220 W/K | Yes |
| `modern` | 2010+ TGD-L compliant | 150 m² | 1.2 | 180 W/K | Yes |

User can override floor area. Archetype provides the HLI starting point.

### 2. Insulation measures → adjust HLI

| Measure | HLI delta | Applicable to | Net cost after SEAI grant (2026) |
|---------|-----------|--------------|----------------------------------|
| Attic insulation | −0.70 | All | €0–300 |
| Cavity wall fill | −0.55 | Has-cavity archetypes only | €0–200 |
| Air sealing / draught-proofing | −0.22 | All | €300–600 (no grant) |
| External wall insulation (EWI) | −0.30 | All | €9,000–19,000 net |
| Floor insulation | −0.15 | All | €0–2,500 net |
| Windows (double→triple) | −0.12 | All | €1,000–11,000 net |

**Minimum package** (Output B): attic + cavity (if available) + air sealing only.

### 3. Installation quality → flow temperature offset

Installation quality shifts the weather compensation curve:

| Quality | Flow temp offset | Description | Incremental cost |
|---------|-----------------|-------------|-----------------|
| `poor` | +10°C | No weather comp, oversized, fixed curve | baseline (€0) |
| `good` | +0°C | Proper heat loss survey, radiators sized/upgraded, weather comp calibrated | +€4,500 (pessimistic) |
| `heatgeek` | −5°C | Radiators checked+upgraded all rooms, finely calibrated | +€7,000 (pessimistic) |

The €4,500 good install premium breaks down as:
- Heat loss survey: €800
- Radiator upgrades (2–3 rooms, larger panels): €3,000
- Commissioning + weather comp calibration: €700

### 4. HLI → design flow temperature

```
T_flow_design (at outdoor -3°C, Dublin design day):
  HLI < 1.0  → 35°C
  HLI 1.0–1.5 → 40°C
  HLI 1.5–2.0 → 45°C
  HLI 2.0–2.5 → 50°C
  HLI 2.5–3.5 → 55°C
  HLI > 3.5  → 60°C
```

Then apply installation quality offset to get actual operating flow temp.

### 5. Per-slot COP (Carnot approximation)

Calibrated against hplib/Keymark data — within ~5–8% of EN14511 spot values:

```typescript
// T_flow varies with weather compensation curve and outdoor temp
const T_cond_K = T_flow_C + 273 + 3      // +3K condenser delta
const T_evap_K = T_out_C + 273 - 6       // -6K evaporator delta
const COP = 0.52 * T_cond_K / (T_cond_K - T_evap_K)
// Clamp: COP 1.0–6.0
```

η_carnot = 0.52 calibrated against:
- Vaillant aroTHERM plus: A7/W35 → COP ~4.5 ✓ (model gives 4.48)
- Mitsubishi Ecodan: A7/W55 → COP ~3.0 ✓ (model gives 2.97)
- At A-7/W45: model gives 2.83, measured ~2.9 ✓

### 6. Weather compensation curve per slot

```typescript
// Linear heating curve between outdoor design temp (-3°C) and cutoff (15.5°C)
const T_flow = T_flow_design - slope * (T_out - T_design_outdoor)
// Clamp between T_flow_min (25°C) and T_flow_design
// slope = (T_flow_design - 25) / (15.5 - (-3))
```

### 7. Irish temperature profiles

Monthly mean temperatures (Met Éireann 1991–2020 normals):

| Location | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
|----------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| Dublin | 7.1 | 7.1 | 8.6 | 10.5 | 13.3 | 15.8 | 17.8 | 17.7 | 15.3 | 12.4 | 9.0 | 7.7 |
| Cork | 8.0 | 8.0 | 9.4 | 11.2 | 13.8 | 16.1 | 17.9 | 17.8 | 15.6 | 12.9 | 9.8 | 8.4 |
| Galway | 7.4 | 7.3 | 8.8 | 10.5 | 13.1 | 15.4 | 17.2 | 17.2 | 15.0 | 12.2 | 9.1 | 7.8 |
| Donegal | 6.5 | 6.5 | 7.8 | 9.5 | 12.2 | 14.5 | 16.2 | 16.3 | 14.1 | 11.3 | 8.2 | 7.0 |
| default (Dublin) | — | — | — | — | — | — | — | — | — | — | — | — |

Daily amplitude (°C swing from mean): sinusoidal, ±2.5°C winter, ±4.0°C summer.
Min at 06:00, max at 15:00.

Heating cutoff: T_out ≥ 15.5°C → zero space heat demand.

### 8. DHW profile

Annual DHW thermal demand = 55 × occupants × 365 / 1000 kWh (occupants default from floor area / 30).
Distributed as:
- 40% morning peak (06:00–09:00)
- 35% evening peak (18:00–21:00)
- 25% spread across remaining hours

DHW COP uses same Carnot equation but T_flow_dhw = 52°C fixed (storage temp).

### 9. Merge with base house electricity

```typescript
const totalProfile = baseProfileKwh.map((v, i) => v + hpProfileKwh[i])
```

This `totalProfile` becomes `hourlyConsumptionOverride` passed to `prepareSimulationContext()`.

**Calibration check**: existing `sample_house_heat_pump_2025.csv` (9,320 kWh/yr, BER B2, 115 m²)
should be reproducible: HLI ≈ 1.3, good install, floor area 115 → HLC 150 W/K →
annual HP electricity ≈ 2,080 kWh + base ≈ 7,240 kWh = 9,320 kWh ✓

---

## Scenario Definitions

### Waterfall sequence (Output A)

Archetype: `1980s_semi` (100 m², HLI 2.5), Dublin, gas baseline.
Each scenario is cumulative (measures stack).

```typescript
const WATERFALL_SCENARIOS = [
  { id: 'hp_poor',    label: 'Heat pump (poor install)',      quality: 'poor',    insulation: [],                       incrementalCost: 0 },
  { id: 'hp_good',    label: '+ Good installation',          quality: 'good',    insulation: [],                       incrementalCost: 4500 },
  { id: 'attic',      label: '+ Attic insulation',           quality: 'good',    insulation: ['attic'],                 incrementalCost: 200 },
  { id: 'cavity',     label: '+ Cavity wall fill',           quality: 'good',    insulation: ['attic','cavity'],        incrementalCost: 150 },
  { id: 'airseal',    label: '+ Air sealing',                quality: 'good',    insulation: ['attic','cavity','air'],  incrementalCost: 450 },
  { id: 'solar',      label: '+ Solar 4 kWp',                quality: 'good',    insulation: ['attic','cavity','air'],  incrementalCost: 3400 },
  { id: 'battery',    label: '+ Battery 10 kWh',             quality: 'good',    insulation: ['attic','cavity','air'],  incrementalCost: 3500 },
  { id: 'ewi',        label: '+ EWI (external wall insul.)', quality: 'good',    insulation: ['attic','cavity','air','ewi'], incrementalCost: 14000 },
]
```

Gas baseline (no HP) runs separately to anchor the table.

### Solar maximalist (Output B)

```typescript
const SOLAR_MAX_SCENARIO = {
  label: 'Solar maximalist',
  quality: 'good',
  insulation: ['attic', 'cavity', 'air'],   // cavity skipped if no-cavity archetype
  solarKwp: 10,       // max practical roof
  batteryKwh: 10,
}
```

---

## SEAI Grant Amounts (Feb 2026, used in cost calculations)

| Measure | Semi-D net cost after grant | Source |
|---------|----------------------------|--------|
| Heat pump system | ~€0 net (€12,500 grant covers most installs) | SEAI Feb 2026 |
| Attic insulation | ~€0–300 net | SEAI Better Energy Homes |
| Cavity wall fill | ~€0–200 net | SEAI Better Energy Homes |
| Air sealing | ~€300–600 (no grant) | No grant programme |
| Solar PV 4 kWp | ~€3,400 net (€1,800 grant) | SEAI Solar |
| Battery 10 kWh | ~€3,500 (no grant in 2026) | No grant |
| EWI | ~€12,000–19,000 net (€6,000 grant) | SEAI Better Energy Homes |

---

## Fuel price assumptions (Ireland, March 2026)

Used for gas/oil baseline bill calculations:
- **Gas**: 13.7 c/kWh, boiler efficiency 90% → 15.2 c/kWh delivered heat
- **Oil (kerosene)**: 10.5 c/kWh delivered heat (€0.95/L, 90% efficient)
- **Electricity**: modelled via existing tariff engine (real tariffs from `domesticTariffs.json`)
- **Night rate**: key for HP economics — Energia EV Smart Drive 9.42 c/kWh off-peak

---

## Testing Requirements (per CLAUDE.md)

Every new function needs:
- Happy path test
- Edge cases (HLI = 0, T_out > heating cutoff, no cavity archetype, etc.)
- Calibration test: `1980s_semi` + good install must produce SCOP in range 3.0–3.8
- Calibration test: `modern` + heatgeek must produce SCOP in range 4.0–4.5
- Annual total kWh must be within 10% of published field trial benchmarks

---

## HLI as direct input

Users who have a BER certificate can input their HLI directly (it appears on all certs).
Users without a cert pick an archetype as an estimator.

`HeatPumpProfileParams` accepts `hliOverride?: number`. When set, it replaces the
archetype's `defaultHLI` before insulation measures are applied.
Archetype is still required for `hasCavity` (determines cavity fill applicability)
and for the default floor area.

## Future work — NOT in this PR

- UI / HeatPumpScenarios component (separate PR)
- Mode selection integration (separate PR)
- HLI threshold research report (one-off, separate deliverable — not a calculator feature)
- Per-model COP lookup from hplib (future enhancement — Carnot is sufficient for v1)
- Cooling season (irrelevant for Ireland)
- Ground source heat pump (future)
- Commercial / hotel heat pump (future)

---

## Task Checklist

See task list in session. Tasks are numbered and broken into ~1–2 hour chunks.

## Key data sources

- TABULA Ireland: https://episcope.eu/fileadmin/tabula/public/docs/brochure/IE_TABULA_TypologyBrochure_EnergyAction.pdf
- hplib (COP regression): https://github.com/FZJ-IEK3-VSA/hplib
- When2Heat (hourly Irish heat demand): https://data.open-power-system-data.org/when2heat/
- SEAI BER Research Tool: https://data.gov.ie/dataset/ber-research-tool
- SEAI DEAP HP Methodology: https://www.seai.ie/sites/default/files/publications/DEAP-Heat-pump-methodology-2020-V1.0.pdf
- Met Éireann climate normals: https://www.met.ie/climate/available-data
- MCS MIS 3005-D: https://mcscertified.com/wp-content/uploads/2025/02/MIS-3005-D-2025-V1.0.pdf
- RAP Ireland HLI report: https://www.raponline.org/wp-content/uploads/2023/09/RAP-Lowes-Ireland-HLI-Requirements-2022-Nov-29-FINAL-properties.pdf
- ESRI Lynch 2026 paper: https://doi.org/10.26504/QEC2026SPR_SA_Lynch
