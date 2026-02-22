import { describe, it, expect } from 'vitest';
import { parseDomesticTariffsCsv } from '../../src/utils/domesticTariffParser';

describe('parseDomesticTariffsCsv', () => {
  it('parses a simple flat rate tariff', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Yuno Energy,12m Fixed (Flat),31.33c,20.64c,N/A,N/A,N/A,€219.22`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]).toMatchObject({
      supplier: 'Yuno Energy',
      product: '12m Fixed (Flat)',
      type: 'time-of-use', // Has night rate
      standingCharge: expect.closeTo(219.22 / 365, 3),
    });

    // Day rate
    expect(tariffs[0].rates.find(r => r.period === 'day')?.rate).toBeCloseTo(0.3133, 4);
    // Night rate
    expect(tariffs[0].rates.find(r => r.period === 'night')?.rate).toBeCloseTo(0.2064, 4);
  });

  it('parses an EV tariff with time window', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Electric Ireland,Night Boost (EV),30.53c,15.05c,N/A,8.84c,2am – 4am,€328.58`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]).toMatchObject({
      supplier: 'Electric Ireland',
      product: 'Night Boost (EV)',
      type: 'ev',
      evRate: expect.closeTo(0.0884, 4),
    });

    // EV time window
    expect(tariffs[0].evTimeWindow).toBeDefined();
    expect(tariffs[0].evTimeWindow?.description).toBe('2am – 4am');
    expect(tariffs[0].evTimeWindow?.hourRanges).toEqual([{ start: 2, end: 4 }]);
  });

  it('parses a free electricity window tariff', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Electric Ireland,Weekend Free (Smart),35.27c,17.49c,N/A,0.00c,Sat/Sun 8-11,€250.77`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]).toMatchObject({
      supplier: 'Electric Ireland',
      product: 'Weekend Free (Smart)',
      type: 'ev', // Has EV rate (even though it's 0)
    });

    // Free electricity window
    expect(tariffs[0].freeElectricityWindow).toBeDefined();
    expect(tariffs[0].freeElectricityWindow?.description).toBe('Sat/Sun 8-11');
    expect(tariffs[0].freeElectricityWindow?.hourRanges).toEqual([{ start: 8, end: 11 }]);
    expect(tariffs[0].freeElectricityWindow?.daysOfWeek).toEqual([0, 6]); // Sun, Sat
  });

  it('parses a time-of-use tariff with peak rates', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Yuno Energy,Standard Smart,37.51c,23.64c,43.19c,N/A,N/A,€264.72`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    expect(tariffs[0]).toMatchObject({
      supplier: 'Yuno Energy',
      product: 'Standard Smart',
      type: 'time-of-use',
      nightRate: expect.closeTo(0.2364, 4),
      peakRate: expect.closeTo(0.4319, 4),
    });

    // Should have night, peak, and day rates
    expect(tariffs[0].rates).toHaveLength(3);
    expect(tariffs[0].rates.find(r => r.period === 'night')).toBeDefined();
    expect(tariffs[0].rates.find(r => r.period === 'peak')).toBeDefined();
    expect(tariffs[0].rates.find(r => r.period === 'day')).toBeDefined();
  });

  it('handles N/A values correctly', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Flogas,Fixed Electricity,24.09c,16.50c*,N/A,N/A,N/A,€275.39`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    expect(tariffs[0].evRate).toBeUndefined();
    expect(tariffs[0].evTimeWindow).toBeUndefined();
    expect(tariffs[0].peakRate).toBeUndefined();
  });

  it('handles asterisks in rates', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Flogas,Fixed Electricity,24.09c,16.50c*,N/A,N/A,N/A,€275.39`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    // Asterisk should be stripped
    expect(tariffs[0].nightRate).toBeCloseTo(0.1650, 4);
  });

  it('generates valid IDs from supplier and plan name', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Bord Gáis,Smart All Day (32%),28.36c,22.30c,36.86c,N/A,N/A,€244.78`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    // Should handle special characters and generate slug
    expect(tariffs[0].id).toBe('bord-g-is-smart-all-day-32');
  });

  it('parses multiple tariffs from CSV', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Yuno Energy,12m Fixed (Flat),31.33c,20.64c,N/A,N/A,N/A,€219.22
Electric Ireland,Home Electric+ (Smart),28.14c,14.79c,30.02c,N/A,N/A,€250.77
Energia,Smart Drive (EV),38.93c,23.99c,51.08c,9.42c,2am – 6am,€265.01`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(3);
    expect(tariffs[0].supplier).toBe('Yuno Energy');
    expect(tariffs[1].supplier).toBe('Electric Ireland');
    expect(tariffs[2].supplier).toBe('Energia');
  });

  it('skips malformed rows', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
Valid,Plan A,30c,20c,N/A,N/A,N/A,€240
Invalid Row With Too Few Columns
Valid,Plan B,25c,15c,N/A,N/A,N/A,€200`;

    const tariffs = parseDomesticTariffsCsv(csv);

    // Should only parse the 2 valid rows
    expect(tariffs).toHaveLength(2);
    expect(tariffs[0].product).toBe('Plan A');
    expect(tariffs[1].product).toBe('Plan B');
  });
});
