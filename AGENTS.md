# AGENTS.md

This file is the single source of truth for agent guidance in this repo.
**Update this file whenever an execute command changes something directly relevant to these sections.**

## Commands
All commands assume cwd is `solar-roi-calculator/`.

- Install: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- All tests (CI): `npm run test:run`
- Watch: `npm run test`
- Coverage: `npm run test:coverage`
- Single file: `npm run test:run -- tests/utils/calculations.test.ts`
- Single test by name: `npx vitest run tests/utils/calculations.test.ts -t "produces a result"`

## Architecture: two independent app modes

`ModeSelect` routes the user to one of two completely separate experiences:

1. **Solar-battery wizard** (`src/App.tsx`, steps 0–4): Step 0 selects building type (hotel / house / farm-stub), Steps 1–4 collect inputs, `runCalculation()` produces an ROI report.
2. **Tariff modeller** (`src/components/TariffModeller.tsx`): Standalone tool — upload an ESB CSV, compare all domestic tariffs. Uses `compareDomesticTariffsForUsage()` from `src/utils/tariffComparison.ts`.

These share the hourly engine (`simulateHourlyEnergyFlow`) but nothing else.

## Architecture: key contracts an agent must not break

### Input unification point
`prepareSimulationContext()` in `src/utils/simulationContext.ts` is where house mode (ESB CSV → `hourlyConsumptionOverride`) and commercial mode (example months → monthly profile) are normalised into an identical `hourlyConsumption: number[]`. All new consumption sources must go through this function. Do not add mode-specific branches downstream in the engine.

### Tariff rate single source of truth
`getTariffRateForHour()` in `src/utils/tariffRate.ts` is the only place that resolves what rate applies at a given hour (flat / TOU / EV / free windows). The tariff comparison tool and the main engine both call this. Do not inline rate logic elsewhere.

### Calendar/month constants single source of truth
`src/constants/calendar.ts` exports `DAYS_PER_MONTH_NON_LEAP`, `DAYS_PER_MONTH_LEAP`, and `getDaysPerMonthFromHours()`. Do not define inline month arrays in engine files.

### Domestic tariff data single source of truth
`src/utils/domesticTariffParser.ts` exports `domesticTariffs: Tariff[]`. All components must import from here, not directly from `src/data/domesticTariffs.json`.

### Shared formatting
`src/utils/format.ts` exports `formatCurrency`, `formatCurrencyPrecise`, `formatNumber`, `formatKwh`. Do not define local formatting functions in components.

## Hourly simulation invariants (do not break)

- Hour-of-day and month attribution must come from canonical timestamps (`stamp` / `hourKey`), not from `index % 24` or fixed block math.
- Never "slide" or trim/pad a dataset in a way that reassigns hours to the wrong time-of-day.
- Any normalisation (missing fills, deduplication, leap year padding) must be captured as warnings surfaced in the audit, not silently applied.
- Monthly figures in the audit must be strict sums of hourly rows grouped by `timeStamps[i].monthIndex`, never recomputed independently.

## No silent failure / no silent fallback

- If required inputs are missing (e.g. no solar timeseries), throw a visible error — do not fall back silently to a lower-fidelity approximation.
- Prefer a user-visible error state in the wizard over a `console.warn`.
- If a fallback is genuinely unreachable (UI enforces valid selection), remove it rather than leaving dead code that obscures intent.

## Active stubs — do not assume these are wired

- **Farm mode**: gated by a disabled button in Step 0. The engine has a farm daily consumption curve (`src/utils/hourlyConsumption.ts`) but Steps 1–4 UI, grants, and tariffs are not wired for farm. See `TODO [farm-mode]` comments.
- **Seasonal hotel**: disabled in Step 0, no engine support yet.

## Data

- Solar timeseries CSVs: `public/data/solar/{Location}_{Year}.csv`, fetched at runtime via `src/utils/solarDataLoader.ts`.
- Domestic tariffs: `src/data/domesticTariffs.json`, accessed via `src/utils/domesticTariffParser.ts`.
- Grants / commercial tariffs: `src/data/grants.json`, `src/data/tariffs.json`.
- Historical data: `src/data/historical/solar-irradiance.json`, `src/data/historical/tariff-history.json`.
- See `SOLAR_DATA_FORMAT.md` for PVGIS CSV format details.

## Workflow

### Testing (apply aggressively)
- Run `npm run test:run` after every change. All tests must pass before committing.
- Write tests for **all** new functionality: unit tests for logic, integration tests for new user flows, edge cases for boundary conditions (leap years, zero consumption, missing data, mode switches).
- New utility functions → test file in `tests/utils/`.
- New model functions → test file in `tests/models/`.
- New wizard flows or mode behaviour → test file in `tests/integration/`.
- If a bug is fixed, add a regression test that would have caught it.
- Do not leave new code without test coverage.

### Keeping this file current
After any execute command, update AGENTS.md if you:
- Add a new shared utility, constant, or data access pattern
- Change an architectural contract (e.g. a new single source of truth)
- Add or remove an active stub
- Change a key invariant
- Add new data files or change how they are accessed

### Commits
One commit per logical chunk with a descriptive message.
