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
- Single normalisation entry point: `prepareSimulationContext()` in `simulationContext.ts`
- Tariff rates: always via `getTariffRateForHour()` in `tariffRate.ts` — no inline rate logic
- Formatting: `src/utils/format.ts` (`formatCurrency`, `formatKwh`, etc.) — no local helpers in components
- Month/day constants: `src/constants/calendar.ts` — no inline month arrays
- Domestic tariffs: import via `domesticTariffParser.ts`, never directly from `domesticTariffs.json`
- Missing required inputs must throw a visible error — no silent fallback

## Full rules (Cursor / detailed contracts)
- Architecture contracts: `.cursor/rules/architecture.mdc`
- Workflow & commits: `.cursor/rules/workflow.mdc`
- Unit standards (`src/**/*.ts`): `.cursor/rules/unit-standards.mdc`

## Work tree setup
- Cursor worktrees: automatically run `npm ci` via `.cursor/worktrees.json`
- Other agents / humans: run `npm ci` in the repo root before starting
- Full layout: `docs/AGENT_AND_WORKTREE_SETUP.md`
