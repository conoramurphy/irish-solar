import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDomesticTariffsCsv, loadDomesticTariffs } from '../../src/utils/domesticTariffParser';

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

  it('throws when CSV has only a header (no data rows)', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)`;

    expect(() => parseDomesticTariffsCsv(csv)).toThrow(
      'CSV file must contain header and at least one data row',
    );
  });

  it('throws when CSV is empty (single blank line)', () => {
    expect(() => parseDomesticTariffsCsv('')).toThrow(
      'CSV file must contain header and at least one data row',
    );
  });

  it('parses pm-to-am EV time windows correctly (12-hour conversion)', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
TestCo,EV Night,30c,20c,N/A,8c,7pm – 12am,€200`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    // 7pm → 19, 12am → 0
    expect(tariffs[0].evTimeWindow).toBeDefined();
    expect(tariffs[0].evTimeWindow?.hourRanges).toEqual([{ start: 19, end: 0 }]);
  });

  it('parses 12pm start correctly (noon edge case)', () => {
    const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
TestCo,Midday Boost,30c,20c,N/A,5c,12pm – 3pm,€200`;

    const tariffs = parseDomesticTariffsCsv(csv);

    expect(tariffs).toHaveLength(1);
    // 12pm → 12 (noon), 3pm → 15
    expect(tariffs[0].evTimeWindow?.hourRanges).toEqual([{ start: 12, end: 15 }]);
  });

  it('logs console.error and continues when parseRow throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Use a standing charge value that will cause parseFloat to be called on a
    // value whose .replace() returns a poison string. We can't easily make
    // parseRow throw with normal CSV input, so we monkey-patch parseFloat
    // to throw only for a sentinel value.
    const origParseFloat = globalThis.parseFloat;
    globalThis.parseFloat = ((val: string) => {
      if (val === '__THROW__') throw new Error('forced parseRow failure');
      return origParseFloat(val);
    }) as typeof parseFloat;

    try {
      // The standing charge field goes through: value.replace(/[€,\s]/g, '')
      // If we put '__THROW__' it stays '__THROW__' after replace, then parseFloat('__THROW__')
      // will trigger our monkey-patched version.
      const csv = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
TestCo,Plan A,30c,20c,N/A,N/A,N/A,__THROW__`;

      const tariffs = parseDomesticTariffsCsv(csv);

      expect(tariffs).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalledWith(
        'Error parsing row:',
        expect.any(String),
        expect.any(Error),
      );
    } finally {
      globalThis.parseFloat = origParseFloat;
      errorSpy.mockRestore();
    }
  });
});

describe('loadDomesticTariffs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and parses CSV when response is OK', async () => {
    const csvContent = `Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
TestCo,Flat Plan,25c,N/A,N/A,N/A,N/A,€200`;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(csvContent),
      }),
    );

    const tariffs = await loadDomesticTariffs();

    expect(fetch).toHaveBeenCalledWith('/data/tarrifs/domestic-tarrifs.csv');
    expect(tariffs).toHaveLength(1);
    expect(tariffs[0].supplier).toBe('TestCo');
    expect(tariffs[0].type).toBe('flat');
    expect(tariffs[0].flatRate).toBeCloseTo(0.25, 4);
  });

  it('throws when fetch response is not OK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Not Found',
      }),
    );

    await expect(loadDomesticTariffs()).rejects.toThrow(
      'Failed to load domestic tariffs: Not Found',
    );
  });
});
