# AGENTS.md

## Commands
- Install: `npm ci`
- Dev server: `npm run dev`
- Build: `npm run build`
- Lint: `npm run lint`
- All tests: `npm run test:run`
- Single file: `npm run test:run -- tests/utils/calculations.test.ts`
- Single test: `npx vitest run tests/utils/calculations.test.ts -t "test name"`
- Coverage: `npm run test:coverage`

## Definition of done
A task is complete when **all** of the following pass:
1. `npm run lint` exits 0
2. `npm run test:run` exits 0 with no failures
3. Changes are committed with a descriptive message (one commit per logical chunk)

## When writing code
- Run `npm run test:run` after every change — all tests must pass before committing
- Every new function needs tests: unit (happy path + edge cases), integration for new flows
- New utility → `tests/utils/`, new model → `tests/models/`, new wizard flow → `tests/integration/`
- Bug fixes require a regression test that would have caught the bug

## When blocked
- If tests fail after 3 attempts: stop and report the failing test with full output
- If a type error can't be resolved: stop and show the error — do not cast to `any` to silence it
- Never: delete files to resolve errors, force push, skip tests, or use `// @ts-ignore`

## Architecture (key contracts — never bypass)

### Two app modes
`ModeSelect` routes to either the **solar-battery wizard** (`src/App.tsx`, steps 0–4) or the **tariff modeller** (`src/components/TariffModeller.tsx`). Do not couple their computation engines.

**Permitted shared UI** (display-only, no engine coupling):
- `SampleHouseSelector` (`src/components/SampleHouseSelector.tsx`) — sample house buttons used by both Step1 (house mode) and TariffModeller.
- `src/data/sampleHouses.ts` — metadata for Irish domestic sample profiles; CSV files live in `public/data/usages/sample_house_*.csv`.

### Single sources of truth — never bypass these
- **Consumption normalisation**: `prepareSimulationContext()` in `simulationContext.ts`. All new consumption sources go through here; no mode-specific branches downstream.
- **Tariff rate resolution**: `getTariffRateForHour()` in `tariffRate.ts`. Do not inline rate logic anywhere else.
- **Month/day constants**: `src/constants/calendar.ts`. Do not define inline month arrays in engine files.
- **Domestic tariff data**: import from `domesticTariffParser.ts`, never directly from `domesticTariffs.json`.
- **Formatting**: `src/utils/format.ts` (`formatCurrency`, `formatKwh`, etc.). No local formatting functions in components.

### Hourly simulation invariants
- Hour-of-day and month attribution must use canonical `stamp`/`hourKey`, never `index % 24` or fixed block math.
- Monthly figures must be strict sums of hourly rows grouped by `timeStamps[i].monthIndex` — never recomputed independently.
- Display components only read from `result.audit`; they never recalculate costs or bills.
- Normalisation (missing fills, deduplication) must surface as audit warnings, not silent changes.

### No silent failure
- Missing required inputs (e.g. no solar timeseries) must throw a visible error — no silent fallback to lower-fidelity.
- Prefer a user-visible error state over `console.warn`.
- If a fallback is unreachable because the UI enforces valid state, delete it rather than leaving dead code.

### Active stubs (not wired — do not assume otherwise)
- **Farm mode**: disabled in Step 0. Engine has a daily curve but Steps 1–4, grants, and tariffs are not wired. See `TODO [farm-mode]`.
- **Seasonal hotel**: disabled in Step 0, no engine support.

### Data locations
- Solar CSVs: `public/data/solar/{Location}_{Year}.csv` — fetched at runtime via `solarDataLoader.ts`
- Domestic tariffs: `src/data/domesticTariffs.json` (access via `domesticTariffParser.ts`)
- Grants / commercial tariffs: `src/data/grants.json`, `src/data/tariffs.json`
- Solar data format details: `SOLAR_DATA_FORMAT.md`

## Unit standards (for `src/**/*.ts`)

### Internal representations
- Energy: **kWh**
- Power ratings: **kW** (e.g. `maxChargeRateKw`, `systemSizeKwp`)
- Prices / rates: **€/kWh**
- Standing charges: **€/day** — divide by 24 for hourly use
- Efficiency / SoC: **decimal 0–1**

### Conversion points
- Market prices arrive as **€/MWh** → divide by 1000 in `simulationContext.ts` before use
- Display of market prices converts back to €/MWh (×1000) in `MarketAnalysis.tsx` for readability only

### Naming
Include the unit in parameter and variable names:
- ✅ `annualProductionKwh`, `batterySizeKwh`, `ratePerKwh`, `standingChargePerDay`
- ❌ `annualProduction`, `batterySize`, `rate`

Document units in JSDoc for all energy/power/price parameters.

### Never mix without conversion
```typescript
// ❌ Wrong
const cost = consumption * marketPriceInMwh; // kWh × €/MWh

// ✅ Correct
const pricePerKwh = marketPriceInMwh / 1000;
const cost = consumption * pricePerKwh;
```

## Keeping rules current
Update `AGENTS.md` (and `.cursor/rules/architecture.mdc`) when you: add a shared utility/constant/data pattern, change an architectural contract, add/remove a stub, or change how data files are accessed.

## Cursor-specific rules
Cursor also reads `.cursor/rules/*.mdc` which mirror the architecture, workflow, and unit-standards sections above.

## Work tree setup

**Cursor** — worktrees are created and managed automatically. Setup runs via `.cursor/worktrees.json`.

**Claude Code and other agents** — for any non-trivial or multi-step task, create a worktree first:

```bash
# from inside the repo root
git worktree add -b <branch-name> ../solar-roi-<branch-name>
cd ../solar-roi-<branch-name>
npm ci
```

Work in the worktree. When done, commit there, then either:
- Merge the branch into main from the original tree, or
- Ask the user to review and merge

Clean up when finished:
```bash
cd ../solar-roi-calculator          # back to main tree
git worktree remove ../solar-roi-<branch-name>
git branch -d <branch-name>         # if no longer needed
```

**When to use a worktree:** multi-file refactors, new features, anything where partial changes would break tests. Skip it for single-file fixes or doc edits.

**Full layout:** `docs/AGENT_AND_WORKTREE_SETUP.md`
