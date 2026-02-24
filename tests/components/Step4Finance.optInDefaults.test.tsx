import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SetStateAction } from 'react';
import { Step4Finance } from '../../src/components/steps/Step4Finance';
import type { Financing, Grant, SystemConfiguration } from '../../src/types';

function applySetConfigArg(arg: SetStateAction<SystemConfiguration>, prev: SystemConfiguration): SystemConfiguration {
  if (typeof arg === 'function') return arg(prev);
  return arg;
}

describe('Step4Finance (house mode) opt-in defaults', () => {
  const financing: Financing = {
    equity: 0,
    interestRate: 0.05,
    termYears: 10
  };

  it('does not silently overwrite user-entered system/battery sizing', async () => {
    const user = userEvent.setup();

    const config: SystemConfiguration = {
      annualProductionKwh: 12000,
      systemSizeKwp: 12,
      batterySizeKwh: 12,
      installationCost: 0,
      location: 'Cavan',
      businessType: 'house'
    };

    const setConfig = vi.fn<[SetStateAction<SystemConfiguration>], void>();

    render(
      <Step4Finance
        config={config}
        setConfig={setConfig as unknown as (c: SystemConfiguration) => void}
        eligibleGrants={[] as Grant[]}
        selectedGrantIds={[]}
        setSelectedGrantIds={vi.fn()}
        financing={financing}
        setFinancing={vi.fn()}
        onGenerateReport={vi.fn()}
        onBack={vi.fn()}
      />
    );

    // Banner exists (defaults are opt-in)
    expect(screen.getByText(/Domestic mode: defaults are opt-in/i)).toBeInTheDocument();

    // Let effects run
    await user.keyboard('{Escape}');

    // Ensure none of the setConfig calls resolve to the HOUSE_MODE_DEFAULTS sizing.
    const resolvedConfigs = setConfig.mock.calls.map(([arg]) => applySetConfigArg(arg, config));
    const hasDefaultSizing = resolvedConfigs.some(
      (c) => c.systemSizeKwp === 6.4 || c.batterySizeKwh === 8 || c.numberOfPanels === 16
    );

    expect(hasDefaultSizing).toBe(false);
  });

  it('applies domestic defaults only when user clicks the button', async () => {
    const user = userEvent.setup();

    const config: SystemConfiguration = {
      annualProductionKwh: 12000,
      systemSizeKwp: 12,
      batterySizeKwh: 12,
      installationCost: 0,
      location: 'Cavan',
      businessType: 'house'
    };

    const setConfig = vi.fn<[SetStateAction<SystemConfiguration>], void>();

    render(
      <Step4Finance
        config={config}
        setConfig={setConfig as unknown as (c: SystemConfiguration) => void}
        eligibleGrants={[] as Grant[]}
        selectedGrantIds={[]}
        setSelectedGrantIds={vi.fn()}
        financing={financing}
        setFinancing={vi.fn()}
        onGenerateReport={vi.fn()}
        onBack={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Apply typical domestic defaults/i }));

    // UI acknowledgement
    expect(screen.getByText(/Applied\. You can still edit Solar\/Battery steps/i)).toBeInTheDocument();

    const resolvedConfigs = setConfig.mock.calls.map(([arg]) => applySetConfigArg(arg, config));
    const hasDefaultSizing = resolvedConfigs.some(
      (c) => c.systemSizeKwp === 6.4 && c.batterySizeKwh === 8 && c.installationCost === 10000 && c.numberOfPanels === 16
    );

    expect(hasDefaultSizing).toBe(true);
  });
});
