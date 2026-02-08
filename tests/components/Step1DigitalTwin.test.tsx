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

  it('renders example months section', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Look for "Example Months" heading or similar
    expect(screen.getByText(/Example Month/i)).toBeInTheDocument();
  });

  it('renders tariff configuration section', () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Look for tariff type toggle (Flat Rate / Time of Use)
    expect(screen.getByText(/Flat Rate/i)).toBeInTheDocument();
    expect(screen.getByText(/Time of Use/i)).toBeInTheDocument();
  });

  it('validates location is required before proceeding', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Try to proceed without selecting location - button should be disabled
    const continueButtons = screen.getAllByRole('button').filter(btn => 
      btn.textContent?.includes('Continue to Solar')
    );
    expect(continueButtons.length).toBe(1);
    expect(continueButtons[0]).toBeDisabled();
  });

  it('calls onNext with complete data when form is valid', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Select location (Cavan is the default available location)
    const selects = screen.getAllByRole('combobox');
    const locationSelect = selects[0]; // First combobox is location
    await user.selectOptions(locationSelect, 'Cavan');

    // Click next
    const continueButtons = screen.getAllByRole('button').filter(btn => 
      btn.textContent?.includes('Continue to Solar')
    );
    await user.click(continueButtons[0]);

    // onNext should be called with data object
    expect(onNext).toHaveBeenCalledTimes(1);
    const callData = onNext.mock.calls[0][0];
    expect(callData).toHaveProperty('location');
    expect(callData.location).toBe('Cavan');
    expect(callData).toHaveProperty('exampleMonths');
    expect(callData).toHaveProperty('tariffConfig');
  });

  it('calls onBack when back button is clicked', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    const backButton = screen.getByRole('button', { name: /Back/i });
    await user.click(backButton);

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('supports flat rate tariff configuration', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onBack = vi.fn();
    render(<Step1DigitalTwin onNext={onNext} onBack={onBack} />);

    // Flat rate should be default - check for the button
    const buttons = screen.getAllByRole('button');
    const flatRateButton = buttons.find(btn => btn.textContent === 'Flat Rate');
    expect(flatRateButton).toBeInTheDocument();
    
    // Should show flat rate info (calculated from example months)
    expect(screen.getByText(/Using flat rate calculated/i)).toBeInTheDocument();
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
