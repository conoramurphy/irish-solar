import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step1DigitalTwin from '../../src/components/steps/Step1DigitalTwin';

describe('Step1DigitalTwin', () => {
  it('renders location dropdown', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} onBack={onBack} />);

    expect(screen.getByText(/County.*Solar Region/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('renders consumption and tariff profile section', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} onBack={onBack} />);

    expect(screen.getByText(/Consumption.*Tariff Profile/i)).toBeInTheDocument();
  });


  it('validates location is required before proceeding', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} onBack={onBack} />);

    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    expect(continueButton).toBeDisabled();
  });

  it('calls onNext with complete data when form is valid', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} onBack={onBack} />);

    // Select location (Cavan is the only available location)
    const selects = screen.getAllByRole('combobox');
    const locationSelect = selects[0];
    await user.selectOptions(locationSelect, 'Cavan');

    // Switch to Custom Tariff Builder to satisfy validation without uploading file
    await user.click(screen.getByRole('button', { name: /Custom Tariff Builder/i }));
    await user.click(screen.getByRole('button', { name: /\+ Add Tariff Slot/i }));
    
    const kwhInputs = screen.getAllByRole('spinbutton', { name: /Time Slot 1 \(kWh\)/i });
    if (kwhInputs.length >= 2) {
      await user.clear(kwhInputs[0]);
      await user.type(kwhInputs[0], '1000');
      await user.clear(kwhInputs[1]);
      await user.type(kwhInputs[1], '1000');
    }

    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    expect(continueButton).not.toBeDisabled();

    await user.click(continueButton);

    expect(onNext).toHaveBeenCalledTimes(1);
    const callData = onNext.mock.calls[0][0];
    expect(callData.location).toBe('Cavan');
    expect(Array.isArray(callData.exampleMonths)).toBe(true);
    expect(Array.isArray(callData.curvedMonthlyKwh)).toBe(true);
    expect(callData.tariffConfig).toBeDefined();
    expect(callData.tariffConfig.type).toBe('custom');
  });

  // This test is obsolete now as there's no back button in Step 1
  /* it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} />);

    const backButton = screen.getByRole('button', { name: /^Back$/ });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  }); */

});
