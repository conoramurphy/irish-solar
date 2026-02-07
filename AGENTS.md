# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common commands
All commands below assume you are in `solar-roi-calculator/`.

### Install
- `npm install`

### Dev server
- `npm run dev`

### Build
- `npm run build`

### Lint
- `npm run lint`

### Tests
- Run all tests (CI-style): `npm run test:run`
- Watch mode: `npm run test`
- Coverage: `npm run test:coverage`

Run a single test file:
- `npm run test:run -- tests/utils/calculations.test.ts`

Run a single test by name (substring match):
- `npx vitest run tests/utils/calculations.test.ts -t "produces a result"`

## High-level architecture
This is a Vite + React + TypeScript app where the “product” is the calculation engine (see README.md).

### UI flow
The UI is a step-based wizard in `src/components/steps/`:
- Step 1 builds a monthly consumption/billing profile.
- Step 2 loads PVGIS solar irradiance timeseries CSV from `src/data/` and requires selecting a year if the file contains multiple years.
- Step 3 collects costs/financing and triggers report generation.

Results render in `src/components/ResultsSection.tsx`. Auditor Mode is a full-screen modal (`src/components/AuditModal.tsx`) that surfaces the hourly dataset and a monthly aggregation.

### Calculation engine (single entrypoint)
- Engine entrypoint: `src/utils/calculations.ts` exports `runCalculation(...)`.
- The engine is designed to run an hour-by-hour simulation over a single-year solar timeseries (8760/8784 timesteps) and produce an ROI report.
- The engine returns a `CalculationResult` (types in `src/types/index.ts`). When audit data is present, `result.audit` contains:
  - hourly rows (source of truth)
  - monthly rollup (strict aggregation of hourly rows)
  - provenance strings for traceability

### Hourly “source of truth” pipeline
At a high level, the hourly pipeline is:
1) Parse PVGIS CSV -> `src/utils/solarTimeseriesParser.ts`
   - Parses PVGIS `time` strings into a stable `{year, monthIndex, day, hour}` stamp and `hourKey`.
   - Uses UTC timestamps to avoid local timezone/DST shifts.
2) Normalize to a canonical single-year grid -> `normalizeSolarTimeseriesYear(...)` in `src/utils/solarTimeseriesParser.ts`
   - Produces an exact canonical hourly grid for the selected year (8760/8784).
   - Fills missing hours with 0 irradiance and dedupes duplicate hour keys deterministically.
   - Returns a corrections/warnings summary; UI should surface these warnings.
3) Convert annual production to hourly generation -> `distributeAnnualProductionTimeseries(...)` (same file)
   - Uses irradiance weights so `sum(hourlyGeneration) == annualProductionKwh`.
4) Generate hourly site consumption from monthly profile -> `src/utils/hourlyConsumption.ts`
   - Distributes monthly kWh into hours using tariff-hour bucket definitions.
5) Simulate energy flow + costs hourly -> `src/utils/hourlyEnergyFlow.ts`
   - Computes import/export/self-consumption, optional battery dispatch, and costs.
   - Accepts optional `timeStamps` so TOU bucket selection uses the stamp’s hour-of-day (not `index % 24`).
6) Aggregate hourly -> monthly (audit only) -> `aggregateHourlyResultsToMonthly(...)` in `src/utils/hourlyEnergyFlow.ts`
   - Monthly view must be derived from hourly outputs, not recomputed separately.
   - Prefer grouping by `timeStamps[i].monthIndex` instead of splitting by fixed hour blocks.

### Invariants (do not break)
- Hour-of-day and month attribution must come from the canonical timestamps (`stamp`/`hourKey`), not from array index math.
- Never “slide” or best-fit a shifted dataset by trimming/padding in a way that reassigns hours to the wrong time-of-day.
- Any normalization (missing fills, duplicate drops, outside-year drops) must be captured as warnings/corrections and remain audit-visible.

### No silent failure / no silent fallback
- If required inputs are missing (e.g., no solar timeseries), throw a visible error and/or surface it in the UI state.
- If the app would otherwise fall back to a lower-fidelity approximation, it must be explicit to the user (UI copy) and ideally disabled entirely.
- Log to console only as a secondary channel; prefer a user-visible error banner/state in the wizard step or results area.

### Data
- Solar timeseries CSVs live under `src/data/` with naming `timeseries_solar_{Location}.csv`.
- See `SOLAR_DATA_FORMAT.md` for the PVGIS CSV format assumptions and distribution algorithm.

### Tests
Tests are organized under `tests/`:
- `tests/models/`: pure financial/solar/tariff helpers
- `tests/utils/`: hourly consumption/energy-flow/calculation utilities
- `tests/integration/`: end-to-end hourly simulation scenarios

Vitest config is in `vite.config.ts` (jsdom environment, coverage includes `src/models/**` and `src/utils/**`).

## Workflow requirements (for Warp/agents)
- Run tests after changes (use `npm run test:run` for CI-style runs).
- Write tests for all new functionality.
- Make git commits as you go: one commit per logical chunk with a descriptive message.
- Include this co-author line at the end of commit messages:
  - `Co-Authored-By: Warp <agent@warp.dev>`

## Repo-specific notes
- This file (`AGENTS.md`) is the single source of truth for agent workflow guidance in this repo (replaces `.agent-preferences.md`).
