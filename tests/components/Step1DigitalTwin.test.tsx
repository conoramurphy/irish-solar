import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step1DigitalTwin from '../../src/components/steps/Step1DigitalTwin';

describe('Step1DigitalTwin', () => {
  it('renders location dropdown', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    expect(screen.getByText(/County.*Solar Region/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('renders consumption and tariff profile section', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    expect(screen.getByText(/Consumption.*Tariff Profile/i)).toBeInTheDocument();
  });


  it('validates location is required before proceeding', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    expect(continueButton).toBeDisabled();
  });

  it('calls onNext with complete data when form is valid', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Select location (Cavan is the only available location)
    const selects = screen.getAllByRole('combobox');
    const locationSelect = selects[0];
    await user.selectOptions(locationSelect, 'Cavan');

    // Load example data to satisfy validation (consumption > 0)
    const loadExampleButton = screen.getByRole('button', { name: /Load Example Data/i });
    await user.click(loadExampleButton);

    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    expect(continueButton).not.toBeDisabled();

    await user.click(continueButton);

    expect(onNext).toHaveBeenCalledTimes(1);
    const callData = onNext.mock.calls[0][0];
    expect(callData.location).toBe('Cavan');
    expect(Array.isArray(callData.exampleMonths)).toBe(true);
    expect(Array.isArray(callData.curvedMonthlyKwh)).toBe(true);
    // tariffConfig is now included in Step 1
    expect(callData.tariffConfig).toBeDefined();
    expect(callData.tariffConfig.type).toBe('flat');
  });

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    const backButton = screen.getByRole('button', { name: /^Back$/ });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

});
