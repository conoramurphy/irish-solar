# Solar ROI Calculator (Ireland SME)

This is a **calculation/test-first** ROI calculator for Irish SME solar projects.

## Philosophy
- The calculation engine is the product.
- UI is intentionally minimal until the engine is stable.
- No "fancy battery" simulation for now (battery only influences self-consumption via a heuristic).

## Key code locations
- Types: `src/types/index.ts`
- Engine entrypoint: `src/utils/calculations.ts`
- Models: `src/models/*`
- Tests: `tests/*`

## Commands
From the repo root:

```bash
npm --prefix solar-roi-calculator run dev
```

```bash
npm --prefix solar-roi-calculator run test:run
```

```bash
npm --prefix solar-roi-calculator run test:coverage
```

```bash
npm --prefix solar-roi-calculator run build
```

## Notes for future agents
- IRR is numerically fragile. See `src/models/financial.ts` for the Newton-Raphson + bisection approach.
- Tariff modeling is simplified (TOU uses an unweighted average import rate).
