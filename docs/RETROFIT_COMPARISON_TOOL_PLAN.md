# Irish Home Retrofit Comparison Tool — Architectural Plan

## Purpose

A standalone tool that compares the 16 most realistic retrofit combinations for an Irish home, ranked by payback period. The core insight driving this tool: **basic insulation + heat pump + solar is systematically undersold in Ireland** despite offering excellent payback, while full deep retrofits are oversold and rarely completed.

---

## The 16 Combinations

| Insulation Level | Heating System | Solar Package |
|---|---|---|
| None (baseline) | Gas boiler | None |
| None | Gas boiler | Solar PV only |
| None | ASHP | None |
| None | ASHP | Solar PV only |
| Basic (attic + cavity, ~€0 net after grants) | Gas boiler | None |
| Basic | Gas boiler | Solar PV only |
| Basic | ASHP | None |
| Basic | ASHP | Solar PV only |
| Mid (+ doors/windows) | Gas boiler | None |
| Mid | Gas boiler | Solar PV only |
| Mid | ASHP | None |
| Mid | ASHP | Solar PV only |
| Deep retrofit (full fabric-first) | Gas boiler | None |
| Deep | Gas boiler | Solar PV only |
| Deep | ASHP | None |
| Deep | ASHP | Solar PV only |

*Note: Solar PV + battery is a variant, not a separate axis — modelled as a toggle on the solar rows.*

---

## Irish House Archetypes

Four archetypes calibrated against SEAI monitoring data:

| ID | Description | Floor area | Baseline heating demand | Archetype BER |
|---|---|---|---|---|
| `semi_d_80s` | 1980s semi-detached, uninsulated cavity | 110 m² | 18,000 kWh/yr | D1 |
| `terrace_70s` | 1970s mid-terrace, solid walls | 90 m² | 16,000 kWh/yr | E1 |
| `detached_90s` | 1990s detached, partial insulation | 150 m² | 20,000 kWh/yr | C3 |
| `new_build` | Post-2011 A-rated, already efficient | 130 m² | 6,000 kWh/yr | A2 |

---

## Fast Parametric Engine

Avoids full hourly simulation for the 16-combination grid. Uses a parametric model grounded in SEAI heat pump monitoring data.

### Heating demand after insulation

```typescript
const demandFactor: Record<InsulationLevel, number> = {
  none:  1.00,
  basic: 0.75,  // attic + cavity: ~25% reduction (SEAI monitoring)
  mid:   0.60,  // + doors/windows
  deep:  0.45,  // full fabric-first
};

const heatingDemandKwh = baselineHeatingDemandKwh * demandFactor[insulationLevel];
```

### Effective COP for ASHP

COP degrades with poor insulation (higher flow temperatures required):

```typescript
const copFactor: Record<InsulationLevel, number> = {
  none:  0.75,  // flow temp ~65°C — COP tanks
  basic: 0.90,
  mid:   1.00,
  deep:  1.10,  // low-temp underfloor, COP peaks
};

const effectiveCOP = 2.8 * copFactor[insulationLevel];
// e.g. basic insulation: 2.8 × 0.90 = 2.52
```

*2.8 is the Irish-climate median COP from SEAI's heat pump monitoring programme.*

### Annual electricity cost (ASHP)

```typescript
const ashpElecKwh = heatingDemandKwh / effectiveCOP;
const ashpAnnualCost = ashpElecKwh * electricityRatePerKwh;
```

### Annual gas cost (boiler, ~90% efficiency)

```typescript
const gasAnnualCost = (heatingDemandKwh / 0.90) * gasRatePerKwh;
```

### Solar PV offset

Reuse the existing solar engine's self-consumption ratio for the selected house size. For a parametric estimate:

```typescript
const solarSelfConsumptionKwh = systemSizeKwp * 950 * selfConsumptionFraction;
// 950 kWh/kWp is the Irish south-facing yield
// selfConsumptionFraction: ~0.45 without battery, ~0.70 with battery
```

---

## Cost Model

### Capital costs (2025 Irish market prices)

| Measure | Gross cost | SEAI grant | Net cost |
|---|---|---|---|
| Attic insulation | €1,500 | €1,500 | **€0** |
| Cavity wall insulation | €1,200 | €1,200 | **€0** |
| Basic (attic + cavity) | €2,700 | €2,700 | **~€0** |
| Mid (+ doors/windows) | €8,000 | €4,000 | €4,000 |
| Deep retrofit | €35,000 | €25,000 | €10,000 |
| ASHP (incl. install) | €14,000 | €6,500 | €7,500 |
| Solar PV 4 kWp | €7,000 | €2,400 | €4,600 |
| Solar PV + 5 kWh battery | €11,000 | €2,400 | €8,600 |

*Grant values from SEAI 2025 schedule. Basic insulation grants cover full cost for most homes.*

### Annual savings calculation

```typescript
const baselineAnnualCost = (baselineHeatingDemandKwh / 0.90) * gasRatePerKwh
  + baselineElectricityBill;

const retrofitAnnualCost = heatingSystemCost + electricityBill - solarSavings;

const annualSaving = baselineAnnualCost - retrofitAnnualCost;
const simplePayback = totalNetCapitalCost / annualSaving;
```

---

## UI Design

### Input panel (left / top)
- House archetype selector (4 options with BER badge)
- Current fuel: Gas / Oil / ESB-only
- Current annual energy bills (€)
- Location (for solar yield)

### Results: ranked combination table

| Rank | Combination | Net cost | Annual saving | Payback | CO₂ saved |
|---|---|---|---|---|---|
| 1 | Basic insulation + ASHP + Solar | €12,100 | €1,850 | **6.5 yrs** | 3.2 t/yr |
| 2 | Basic insulation + ASHP | €7,500 | €1,400 | 5.4 yrs | 2.8 t/yr |
| 3 | Solar PV only | €4,600 | €680 | 6.8 yrs | 0.6 t/yr |
| … | … | … | … | … | … |

**Sweet spot banner**: automatically highlighted on the combination with best payback that includes an ASHP (i.e., the one the tool is designed to surface).

### "Build Your Own" basket

Checkboxes for each measure; costs and savings update in real time as measures are toggled. Allows users to compose custom combinations beyond the 16 presets.

---

## Directory Structure

```
src/
  retrofit/
    engine/
      demandModel.ts        # insulationLevel → heating demand
      copModel.ts           # insulationLevel → effective COP
      costModel.ts          # capital costs, grants, annual costs
      combinations.ts       # generates all 16 combinations + payback
    data/
      archetypes.ts         # 4 Irish house archetypes
      grants.ts             # SEAI grant schedule 2025
      tariffs.ts            # gas/electricity rates (editable)
    components/
      RetrofitCalculator.tsx   # main entry point
      HouseArchetypeSelector.tsx
      ResultsTable.tsx
      SweetSpotBanner.tsx
      BuildYourOwn.tsx
    types.ts
    index.ts
```

Isolated from the solar engine — shares no computation code, only display utilities (`format.ts`).

---

## Key Insight This Tool Validates

> "Full deep retrofits are oversold in Ireland. Basic insulation (attic + cavity, effectively free after SEAI grants) combined with an ASHP and solar PV delivers excellent payback — typically 6–8 years — yet almost nobody does it."

The ranked table is designed to make this visible. The deep retrofit row will typically rank 8th–12th on payback despite having the best energy performance, because the €10,000+ net cost after grants means it takes 15–20 years to recoup.

---

## Implementation Phases

### Phase 1 — Core engine + table (MVP)
- 4 archetypes, gas baseline only
- 16 combinations ranked by payback
- Sweet spot banner
- No solar battery in Phase 1

### Phase 2 — Personalisation
- Custom bill entry → back-calculate baseline demand
- Oil and ESB-only baselines
- Solar + battery toggle
- Export to PDF

### Phase 3 — Integration
- Surface from ModeSelect alongside solar wizard and tariff modeller
- Share a saved retrofit comparison report (reuse existing report infrastructure)

---

## Open Questions

1. **Seasonal demand profile**: The parametric engine uses annual totals. A more accurate model would split heating demand by month and apply seasonal COP variations. Worth adding in Phase 2.
2. **Hot water**: ASHP can cover DHW; currently not modelled. Adds ~€150/yr saving and reduces payback by ~0.3 yrs.
3. **Grant eligibility**: Some grants require a BER assessment first (~€300). Should be surfaced in the cost model.
4. **Oil baseline**: Oil boilers need a separate price series (c/kWh for kerosene) — Irish kerosene is volatile and often more expensive than gas.
