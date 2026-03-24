import { describe, expect, it } from 'vitest';
import {
  calculateImpliedRate,
  curveConsumption,
  calculateMonthlyBill,
  deriveCustomTariffRates,
  estimateAnnualBills
} from '../../src/utils/billingCalculations';
import type { ExampleMonth, TariffConfiguration, TariffSlot } from '../../src/types/billing';

// --- Helpers ---
function makeExampleMonth(overrides: Partial<ExampleMonth> & Pick<ExampleMonth, 'monthIndex'>): ExampleMonth {
  return {
    monthName: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][overrides.monthIndex],
    totalKwh: 1000,
    totalBillEur: 200,
    tariffSlotUsage: {},
    ...overrides
  };
}

// --- calculateImpliedRate ---
describe('calculateImpliedRate', () => {
  it('returns bill / kWh for normal inputs', () => {
    expect(calculateImpliedRate(1000, 200)).toBeCloseTo(0.2);
  });

  it('returns 0 when kWh is 0', () => {
    expect(calculateImpliedRate(0, 200)).toBe(0);
  });

  it('returns 0 when kWh is negative', () => {
    expect(calculateImpliedRate(-500, 200)).toBe(0);
  });

  it('handles zero bill', () => {
    expect(calculateImpliedRate(1000, 0)).toBe(0);
  });
});

// --- curveConsumption ---
describe('curveConsumption', () => {
  it('returns 12 months with sinusoidal curve between two example months', () => {
    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 0, totalKwh: 2000 }), // Jan (winter)
      makeExampleMonth({ monthIndex: 6, totalKwh: 800 }),   // Jul (summer)
    ];

    const curved = curveConsumption(examples);
    expect(curved).toHaveLength(12);

    // Winter peak should be higher than summer trough
    const maxKwh = Math.max(...curved);
    const minKwh = Math.min(...curved);
    expect(maxKwh).toBeGreaterThan(minKwh);
    // Range should be within the input bounds
    expect(minKwh).toBeGreaterThanOrEqual(800);
    expect(maxKwh).toBeLessThanOrEqual(2000);
  });

  it('returns flat array when only one example month (fallback)', () => {
    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 3, totalKwh: 1500 })
    ];

    const curved = curveConsumption(examples);
    expect(curved).toHaveLength(12);
    curved.forEach(v => expect(v).toBe(1500));
  });

  it('returns 12 zeros when single example has 0 kWh', () => {
    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 0, totalKwh: 0 })
    ];

    const curved = curveConsumption(examples);
    expect(curved).toHaveLength(12);
    curved.forEach(v => expect(v).toBe(0));
  });

  it('returns flat line when both example months have equal kWh', () => {
    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 0, totalKwh: 1000 }),
      makeExampleMonth({ monthIndex: 6, totalKwh: 1000 }),
    ];

    const curved = curveConsumption(examples);
    expect(curved).toHaveLength(12);
    // All months should be the same (cosine amplitude = 0)
    curved.forEach(v => expect(v).toBeCloseTo(1000, 0));
  });

  it('handles reversed order (summer month before winter)', () => {
    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 6, totalKwh: 800 }),   // Jul first
      makeExampleMonth({ monthIndex: 0, totalKwh: 2000 }),  // Jan second
    ];

    const curved = curveConsumption(examples);
    expect(curved).toHaveLength(12);
    // Should still produce a valid curve
    expect(Math.max(...curved)).toBeGreaterThan(Math.min(...curved));
  });
});

// --- calculateMonthlyBill ---
describe('calculateMonthlyBill', () => {
  it('calculates bill with custom tariff slots', () => {
    const slots: TariffSlot[] = [
      { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.30 },
      { id: 'night', name: 'Night', startHour: 23, endHour: 8, ratePerKwh: 0.15 },
    ];
    const config: TariffConfiguration = { type: 'custom', customSlots: slots };
    const usage = { day: 0.6, night: 0.4 };

    const bill = calculateMonthlyBill(1000, config, usage);
    // 1000*0.6*0.30 + 1000*0.4*0.15 = 180 + 60 = 240
    expect(bill).toBeCloseTo(240);
  });

  it('returns 0 for custom tariff without slot usage', () => {
    const slots: TariffSlot[] = [
      { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.30 },
    ];
    const config: TariffConfiguration = { type: 'custom', customSlots: slots };
    // No tariffSlotUsage provided
    expect(calculateMonthlyBill(1000, config)).toBe(0);
  });

  it('returns 0 for unknown tariff type', () => {
    const config = { type: 'unknown' } as unknown as TariffConfiguration;
    expect(calculateMonthlyBill(1000, config)).toBe(0);
  });

  it('adds standing charge using getDaysInMonth for February (28 days)', () => {
    const config: TariffConfiguration = {
      type: 'custom',
      customSlots: [
        { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.30 },
      ],
      standingChargePerDay: 0.50,
    };
    const usage = { day: 1.0 };

    const bill = calculateMonthlyBill(100, config, usage, 1); // Feb = monthIndex 1
    // energy: 100 * 1.0 * 0.30 = 30
    // standing: 0.50 * 28 = 14
    expect(bill).toBeCloseTo(44);
  });

  it('adds standing charge using getDaysInMonth for July (31 days)', () => {
    const config: TariffConfiguration = {
      type: 'custom',
      customSlots: [
        { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.20 },
      ],
      standingChargePerDay: 1.00,
    };
    const usage = { day: 1.0 };

    const bill = calculateMonthlyBill(200, config, usage, 6); // Jul = monthIndex 6
    // energy: 200 * 1.0 * 0.20 = 40
    // standing: 1.00 * 31 = 31
    expect(bill).toBeCloseTo(71);
  });

  it('defaults to 30 days when monthIndex is not provided', () => {
    const config: TariffConfiguration = {
      type: 'custom',
      customSlots: [
        { id: 'flat', name: 'Flat', startHour: 0, endHour: 24, ratePerKwh: 0.25 },
      ],
      standingChargePerDay: 0.60,
    };
    const usage = { flat: 1.0 };

    const bill = calculateMonthlyBill(500, config, usage);
    // energy: 500 * 1.0 * 0.25 = 125
    // standing: 0.60 * 30 = 18
    expect(bill).toBeCloseTo(143);
  });
});

  it('uses 0 for slot usage when slot.id is not in tariffSlotUsage (|| 0 fallback)', () => {
    const slots: TariffSlot[] = [
      { id: 'known', name: 'Known', startHour: 0, endHour: 24, ratePerKwh: 0.25 },
      { id: 'unknown-slot', name: 'Unknown', startHour: 0, endHour: 24, ratePerKwh: 0.50 },
    ];
    const config: TariffConfiguration = { type: 'custom', customSlots: slots };
    // tariffSlotUsage only has 'known', not 'unknown-slot'
    const usage = { known: 0.8 };

    const bill = calculateMonthlyBill(1000, config, usage);
    // known: 1000 * 0.8 * 0.25 = 200
    // unknown-slot: tariffSlotUsage['unknown-slot'] is undefined -> || 0 -> contribution = 0
    expect(bill).toBeCloseTo(200);
  });

  it('falls back to 30 days when monthIndex is out-of-range (|| 30 fallback)', () => {
    const config: TariffConfiguration = {
      type: 'custom',
      customSlots: [
        { id: 'flat', name: 'Flat', startHour: 0, endHour: 24, ratePerKwh: 0.20 },
      ],
      standingChargePerDay: 1.0,
    };
    const usage = { flat: 1.0 };

    // monthIndex=999 is out of daysPerMonth array range -> daysPerMonth[999] is undefined -> || 30
    const bill = calculateMonthlyBill(500, config, usage, 999);
    // energy: 500 * 1.0 * 0.20 = 100
    // standing: 1.0 * 30 = 30
    expect(bill).toBeCloseTo(130);
  });

// --- deriveCustomTariffRates ---
describe('deriveCustomTariffRates', () => {
  it('derives rates from example months with slot usage', () => {
    const slots: TariffSlot[] = [
      { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.20 },
      { id: 'night', name: 'Night', startHour: 23, endHour: 8, ratePerKwh: 0.10 },
    ];

    const examples: ExampleMonth[] = [
      makeExampleMonth({
        monthIndex: 0,
        totalKwh: 1000,
        totalBillEur: 250,
        tariffSlotUsage: { day: 0.6, night: 0.4 }
      }),
    ];

    const derived = deriveCustomTariffRates(examples, slots);
    expect(derived).toHaveLength(2);
    // Each derived slot should have a ratePerKwh
    derived.forEach(s => {
      expect(s.ratePerKwh).toBeGreaterThan(0);
      expect(Number.isFinite(s.ratePerKwh)).toBe(true);
    });
  });

  it('keeps original rate when no slot usage data', () => {
    const slots: TariffSlot[] = [
      { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.25 },
    ];

    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 0, tariffSlotUsage: {} }),
    ];

    const derived = deriveCustomTariffRates(examples, slots);
    // No usage data => totalWeight = 0 => keeps original rate
    expect(derived[0].ratePerKwh).toBe(0.25);
  });
});

// --- estimateAnnualBills ---
describe('estimateAnnualBills', () => {
  it('uses closest example month tariff distribution for each month', () => {
    const curvedKwh = Array(12).fill(1000);
    const slots: TariffSlot[] = [
      { id: 'day', name: 'Day', startHour: 8, endHour: 23, ratePerKwh: 0.30 },
      { id: 'night', name: 'Night', startHour: 23, endHour: 8, ratePerKwh: 0.15 },
    ];
    const config: TariffConfiguration = { type: 'custom', customSlots: slots };

    const examples: ExampleMonth[] = [
      makeExampleMonth({ monthIndex: 0, tariffSlotUsage: { day: 0.7, night: 0.3 } }),  // winter
      makeExampleMonth({ monthIndex: 6, tariffSlotUsage: { day: 0.5, night: 0.5 } }),  // summer
    ];

    const bills = estimateAnnualBills(curvedKwh, config, examples);
    expect(bills).toHaveLength(12);

    // Jan (month 0) should use winter example (day=0.7)
    // Bill = 1000*0.7*0.30 + 1000*0.3*0.15 = 210 + 45 = 255
    expect(bills[0]).toBeCloseTo(255);

    // Jul (month 6) should use summer example (day=0.5)
    // Bill = 1000*0.5*0.30 + 1000*0.5*0.15 = 150 + 75 = 225
    expect(bills[6]).toBeCloseTo(225);
  });
});
