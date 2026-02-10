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

  it('renders consumption profile section', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    expect(screen.getByText(/Consumption Profile/i)).toBeInTheDocument();
  });

  it('renders tariff configuration section', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    expect(screen.getByRole('button', { name: 'Flat Rate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Time-of-Use' })).toBeInTheDocument();
    expect(screen.getByText(/Current Tariff Structure/i)).toBeInTheDocument();
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

    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    expect(continueButton).not.toBeDisabled();

    await user.click(continueButton);

    expect(onNext).toHaveBeenCalledTimes(1);
    const callData = onNext.mock.calls[0][0];
    expect(callData.location).toBe('Cavan');
    expect(Array.isArray(callData.exampleMonths)).toBe(true);
    expect(callData).toHaveProperty('tariffConfig');
    expect(Array.isArray(callData.curvedMonthlyKwh)).toBe(true);
    expect(Array.isArray(callData.estimatedMonthlyBills)).toBe(true);
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

  it('supports flat rate tariff configuration', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    expect(screen.getByRole('button', { name: 'Flat Rate' })).toBeInTheDocument();
    expect(screen.getByText(/Using flat rate calculated from your example months/i)).toBeInTheDocument();
  });

  it('supports time-of-use tariff configuration', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Switch to time-of-use
    const buttons = screen.getAllByRole('button');
    const touButton = buttons.find(btn => btn.textContent === 'Time-of-Use');
    expect(touButton).toBeInTheDocument();
    await user.click(touButton!);

    // Should show message about adding tariff slots
    expect(screen.getByText(/No tariff slots defined yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Your First Tariff Slot/i)).toBeInTheDocument();
  });
});
