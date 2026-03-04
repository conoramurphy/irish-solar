import { describe, expect, it } from 'vitest';
import { prepareSimulationContext } from '../../src/utils/simulationContext';
import type { ParsedPriceData } from '../../src/utils/priceTimeseriesParser';
import type { ParsedSolarData } from '../../src/utils/solarTimeseriesParser';
import type { SystemConfiguration, Tariff, TradingConfig } from '../../src/types';

function makeSolar(year: number, hours: number): ParsedSolarData {
  return {
    location: 'Test',
    latitude: 0,
    longitude: 0,
    elevation: 0,
    year,
    slotsPerDay: 24,
    timesteps: Array.from({ length: hours }, (_, i) => ({
      timestamp: new Date(Date.UTC(year, 0, 1, 0, 0, 0)),
      stamp: { year, monthIndex: 0, day: 1, hour: i % 24, minute: 0 },
      hourKey: `${year}-01-01T${String(i % 24).padStart(2, '0')}`,
      irradianceWm2: 1,
      sourceIndex: i
    })),
    totalIrradiance: hours
  };
}

const tariff: Tariff = {
  id: 't',
  supplier: 'Test',
  product: 'Test',
  type: '24-hour',
  standingCharge: 0,
  rates: [{ period: 'all-day', rate: 0.25 }],
  exportRate: 0.1,
  psoLevy: 0
};

const baseConfig: SystemConfiguration = {
  annualProductionKwh: 5000,
  batterySizeKwh: 0,
  installationCost: 1000,
  location: 'Test',
  businessType: 'hotel'
};

describe('prepareSimulationContext diagnostics', () => {
  it('returns consumption normalization corrections when leap/non-leap mismatch', () => {
    const solar = makeSolar(2020, 8784); // leap
    const override = new Array(8760).fill(1);

    const ctx = prepareSimulationContext(baseConfig, tariff, { enabled: false }, solar, undefined, undefined, override);

    expect(ctx.consumptionSource).toBe('override');
    expect(ctx.hourlyConsumption.length).toBe(8784);
    expect(ctx.consumptionNormalization?.warnings?.length).toBeGreaterThan(0);
  });

  it('returns price normalization corrections when filling missing hours', () => {
    const solar = makeSolar(2021, 8760);

    const price: ParsedPriceData = {
      year: 2021,
      timesteps: [
        {
          timestamp: new Date(Date.UTC(2021, 0, 1, 0, 0, 0)),
          stamp: { year: 2021, monthIndex: 0, day: 1, hour: 0, minute: 0 },
          hourKey: '2021-01-01T00',
          priceEur: 100,
          sourceIndex: 0
        }
      ]
    };

    const trading: TradingConfig = { enabled: true, importMargin: 0.05, exportMargin: 0, hoursWindow: 4 };

    const ctx = prepareSimulationContext(baseConfig, tariff, trading, solar, undefined, price, undefined);

    expect(ctx.priceNormalization).toBeDefined();
    expect(ctx.priceNormalization?.hoursMissingFilled).toBeGreaterThan(0);
    expect(ctx.priceNormalization?.warnings?.[0]).toMatch(/Filled/);
  });
});
