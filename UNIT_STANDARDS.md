# Unit Standards & Consistency

This document defines the standard units used throughout the solar ROI calculator codebase.

## Core Unit Standards

### Energy
- **Internal representation**: kWh (kilowatt-hours)
- **All calculations**: kWh
- **Storage in types/interfaces**: kWh
- **Examples**:
  - `annualProductionKwh` - Annual solar generation
  - `batterySizeKwh` - Battery capacity
  - `totalKwh` - Monthly consumption
  - `gridImport` - Hourly grid import
  - `gridExport` - Hourly grid export

### Power
- **Internal representation**: kW (kilowatts) for rates
- **Examples**:
  - `maxChargeRateKw` - Battery charge rate
  - `maxDischargeRateKw` - Battery discharge rate
  - `systemSizeKwp` - Solar system size (kWp = kilowatt-peak)

### Prices & Costs
- **Internal representation**: €/kWh (euros per kilowatt-hour)
- **All calculations**: €/kWh
- **Examples**:
  - `tariff.rates[].rate` - Electricity rate
  - `tariff.exportRate` - Export rate
  - `hourlyPrices` - Market prices (after conversion)
  - `importMargin` - Trading margin
  - `exportMargin` - Trading margin

### Standing Charges
- **Internal representation**: €/day (euros per day)
- **Conversion**: Divided by 24 for hourly calculations
- **Examples**:
  - `tariff.standingCharge` - Daily standing charge
  - `tariffConfig.standingChargePerDay` - User input

### Efficiency
- **Internal representation**: Decimal (0-1)
- **Examples**:
  - `battery.efficiency` - 0.9 = 90%
  - `initialSoC` - Initial state of charge (0-1)

## External Data Conversion Points

### PVGIS Solar Data
- **Input format**: kWh/kWp (from CSV)
- **Internal usage**: kWh/kWp (no conversion needed)
- **Location**: `src/utils/solarTimeseriesParser.ts`

### Market Price Data
- **Input format**: €/MWh (megawatt-hours)
- **Conversion**: Divided by 1000 to get €/kWh
- **Location**: `src/utils/simulationContext.ts` line 62
```typescript
hourlyPrices = normalized.timesteps.map(ts => ts.priceEur / 1000);
```

## Display Conversion Points

### Market Analysis Component
- **Internal storage**: €/kWh
- **Display format**: €/MWh (multiplied by 1000 for user readability)
- **Location**: `src/components/MarketAnalysis.tsx` line 42
```typescript
// Convert internal €/kWh to €/MWh for analysis
priceMwh: (h.marketPrice ?? 0) * 1000
```
- **Rationale**: Market prices are conventionally displayed in €/MWh

### UI Display
- All displayed values should clearly indicate units
- Currency formatted with locale: `new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })`
- Energy formatted with "kWh" suffix
- Rates displayed as "€/kWh" or "€/MWh" as appropriate

## Validation Rules

### Data Import
1. **Always validate** external data units on import
2. **Convert immediately** to internal standard units
3. **Document** conversion factors in code comments
4. **Log warnings** if unexpected units are detected

### Calculations
1. **Never mix** kW and MW without explicit conversion
2. **Never mix** kWh and MWh without explicit conversion
3. **Always use** the same unit within a single calculation
4. **Comment** any unit conversions with rationale

### Function Signatures
1. **Include units** in parameter/return names where possible
   - ✅ Good: `annualProductionKwh`, `batterySizeKwh`, `ratePerKwh`
   - ❌ Bad: `annualProduction`, `batterySize`, `rate`
2. **Document units** in JSDoc comments for all energy/power/price values
3. **Use TypeScript branded types** (future enhancement) to enforce unit safety

## Key Files & Responsibilities

### Energy Flow Simulation
- **File**: `src/utils/hourlyEnergyFlow.ts`
- **Units**: kWh for energy, €/kWh for prices
- **Standing charge**: Divided by 24 (hourly from daily)

### Billing Calculations
- **File**: `src/utils/billingCalculations.ts`
- **Units**: kWh for energy, €/kWh for rates, €/day for standing charges
- **Monthly aggregation**: Standing charge × days in month

### Simulation Context
- **File**: `src/utils/simulationContext.ts`
- **Responsibility**: Converts market prices from €/MWh to €/kWh
- **Critical line**: Line 62

### Solar Timeseries
- **File**: `src/utils/solarTimeseriesParser.ts`
- **Units**: kWh/kWp (normalized irradiance)
- **No conversion needed**: PVGIS output matches internal standard

## Testing Requirements

### Unit Tests
1. **Verify** all conversions with explicit test cases
2. **Test boundaries**: 0, small values, large values
3. **Test consistency**: Input kWh → Output kWh (no unit drift)
4. **Document** expected units in test descriptions

### Integration Tests
1. **End-to-end validation**: Energy conservation (generation + import = consumption + export + battery charge)
2. **Bill verification**: Ensure bills match expected values given known rates
3. **Cross-check**: Compare hourly aggregation to monthly totals

## Common Pitfalls to Avoid

### ❌ WRONG
```typescript
// Mixing units without conversion
const price = marketPriceInMwh; // €/MWh
const cost = consumption * price; // WRONG: kWh * €/MWh
```

### ✅ CORRECT
```typescript
// Explicit conversion
const pricePerKwh = marketPriceInMwh / 1000; // €/MWh → €/kWh
const cost = consumption * pricePerKwh; // CORRECT: kWh * €/kWh = €
```

### ❌ WRONG
```typescript
// Standing charge applied per hour without scaling
const hourlyCost = consumption * rate + standingCharge; // standingCharge is €/day!
```

### ✅ CORRECT
```typescript
// Standing charge properly scaled to hourly
const hourlyCost = consumption * rate + (standingCharge / 24); // €/day → €/hour
```

## Audit Checklist

When reviewing code for unit consistency:

- [ ] All energy values are in kWh
- [ ] All rates/prices are in €/kWh (or explicitly converted)
- [ ] Standing charges are in €/day and divided by 24 for hourly use
- [ ] Power ratings (charge/discharge rates) are in kW
- [ ] Market price imports are divided by 1000 (€/MWh → €/kWh)
- [ ] Display conversions are clearly commented
- [ ] Variable names include unit suffixes where appropriate
- [ ] JSDoc comments document units for all energy/power/price parameters
- [ ] Tests verify unit consistency end-to-end

## Future Enhancements

### Branded Types (TypeScript)
Consider implementing branded types to enforce unit safety at compile time:

```typescript
type kWh = number & { __brand: 'kWh' };
type EuroPerKwh = number & { __brand: '€/kWh' };
type EuroPerDay = number & { __brand: '€/day' };

function toKwh(value: number): kWh {
  return value as kWh;
}

function calcCost(energy: kWh, rate: EuroPerKwh): number {
  return energy * rate; // Type-safe multiplication
}
```

This would make unit errors impossible to compile, catching issues at development time.
