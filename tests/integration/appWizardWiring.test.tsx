import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock heavy UI components that aren't relevant to the wiring test.
vi.mock('../../src/components/Hero', () => ({ Hero: () => <div data-testid="hero" /> }));
vi.mock('../../src/components/StepIndicator', () => ({ StepIndicator: () => <div data-testid="stepper" /> }));
vi.mock('../../src/components/ResultsSection', () => ({ ResultsSection: () => <div data-testid="results" /> }));

// Mock steps so we can deterministically drive the wizard.
vi.mock('../../src/components/steps/Step1ConsumptionBilling', () => ({
  Step1ConsumptionBilling: ({ onNext }: { onNext: (data: any) => void }) => (
    <button
      type="button"
      onClick={() =>
        onNext({
          exampleMonths: [],
          tariffConfig: { type: 'flat', flatRate: 0.25 },
          curvedMonthlyKwh: Array.from({ length: 12 }, () => 1000),
          estimatedMonthlyBills: Array.from({ length: 12 }, () => 250)
        })
      }
    >
      next-step-1
    </button>
  )
}));

vi.mock('../../src/components/steps/Step2SolarInstallation', () => ({
  Step2SolarInstallation: ({ onNext }: { onNext: (data: any) => void }) => {
    const year = 2022;
    const t0 = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const t1 = new Date(Date.UTC(year, 0, 1, 1, 0, 0));

    const solarData = {
      year,
      location: 'Test',
      latitude: 0,
      longitude: 0,
      elevation: 0,
      totalIrradiance: 200,
      timesteps: [
        {
          timestamp: t0,
          stamp: { year, monthIndex: 0, day: 1, hour: 0 },
          hourKey: `${year}-01-01T00`,
          irradianceWm2: 100,
          sourceIndex: 0
        },
        {
          timestamp: t1,
          stamp: { year, monthIndex: 0, day: 1, hour: 1 },
          hourKey: `${year}-01-01T01`,
          irradianceWm2: 100,
          sourceIndex: 1
        }
      ]
    };

    return (
      <button type="button" onClick={() => onNext({ solarData })}>
        next-step-2
      </button>
    );
  }
}));

vi.mock('../../src/components/steps/Step3CostsAndFinancing', () => ({
  Step3CostsAndFinancing: ({ onGenerateReport }: { onGenerateReport: () => void }) => (
    <button type="button" onClick={onGenerateReport}>
      generate
    </button>
  )
}));

const runCalculationMock = vi.fn(() => ({
  systemCost: 0,
  netCost: 0,
  annualGeneration: 0,
  annualSelfConsumption: 0,
  annualExport: 0,
  annualSavings: 0,
  simplePayback: Infinity,
  irr: NaN,
  npv: 0,
  cashFlows: [{ year: 1, netCashFlow: 0, cumulativeCashFlow: 0 }]
}));

vi.mock('../../src/utils/calculations', () => ({
  runCalculation: (...args: any[]) => runCalculationMock(...args)
}));

import App from '../../src/App';

describe('App wizard wiring', () => {
  it('passes Step 2 solarData through to runCalculation', async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'next-step-1' }));
    await user.click(screen.getByRole('button', { name: 'next-step-2' }));
    await user.click(screen.getByRole('button', { name: 'generate' }));

    expect(runCalculationMock).toHaveBeenCalledTimes(1);

    // App passes solarTimeseriesData as the last argument.
    const lastCallArgs = runCalculationMock.mock.calls[0] ?? [];
    const solarArg = lastCallArgs.at(-1);

    expect(solarArg).toMatchObject({ year: 2022 });
    expect(Array.isArray(solarArg.timesteps)).toBe(true);
  });
});
