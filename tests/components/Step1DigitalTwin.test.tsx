import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Step1DigitalTwin from '../../src/components/steps/Step1DigitalTwin';
import { domesticTariffs } from '../../src/utils/domesticTariffParser';

// A real tariff from the parsed list so we don't have to hand-craft the full type
const sampleTariff = domesticTariffs[0];

// Minimal valid ESB CSV — parser fills missing slots with 0
const MINIMAL_ESB_CSV = `MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time
10013715764,000000000024641939,10.0,Active Import Interval (kW),01-01-2024 00:30
10013715764,000000000024641939,10.0,Active Import Interval (kW),01-07-2024 00:30`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Step1DigitalTwin', () => {
  it('renders location dropdown', () => {
    const onNext = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} />);

    expect(screen.getByText(/County.*Solar Region/i)).toBeInTheDocument();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('renders energy use and tariff sections', () => {
    const onNext = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} />);

    // The consumption & tariff section is now split into two clearly labelled parts
    expect(screen.getByRole('heading', { name: /Energy use/i })).toBeInTheDocument();
    // "Tariff" heading (h3 level) identifies the rates section
    const tariffHeadings = screen.getAllByRole('heading', { name: /Tariff/i });
    expect(tariffHeadings.length).toBeGreaterThanOrEqual(1);
  });

  it('validates location is required before proceeding', () => {
    const onNext = vi.fn();
    render(<Step1DigitalTwin businessType="hotel" onNext={onNext} />);

    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    expect(continueButton).toBeDisabled();
  });

  it('calls onNext with correct shape after loading a sample profile (preset tariff)', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();

    // Mock fetch so the "20-Bed Hotel" sample button succeeds
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => MINIMAL_ESB_CSV,
    }));

    // Pre-select a business tariff via initialSelectedDomesticTariff so we don't
    // have to interact with the BusinessTariffSelector in this test.
    render(
      <Step1DigitalTwin
        businessType="hotel"
        onNext={onNext}
        initialSelectedDomesticTariff={sampleTariff}
      />
    );

    // Select location
    const selects = screen.getAllByRole('combobox');
    await user.selectOptions(selects[0], 'Cavan');

    // Load sample profile
    await user.click(screen.getByRole('button', { name: /20-Bed Hotel/i }));

    // Wait for the profile confirmation banner to appear (distinct from the button label)
    await waitFor(() => {
      expect(screen.getByText(/File: 20-Bed Hotel/i)).toBeInTheDocument();
    });

    // Continue button should now be enabled
    const continueButton = screen.getByRole('button', { name: /Continue to Solar Configuration/i });
    await waitFor(() => expect(continueButton).not.toBeDisabled());

    await user.click(continueButton);

    expect(onNext).toHaveBeenCalledTimes(1);
    const callData = onNext.mock.calls[0][0];
    expect(callData.location).toBe('Cavan');
    expect(Array.isArray(callData.exampleMonths)).toBe(true);
    // curvedMonthlyKwh is present when hourly data was freshly parsed
    expect(Array.isArray(callData.curvedMonthlyKwh)).toBe(true);
    expect(callData.tariffConfig).toBeDefined();
    expect(callData.tariffConfig.type).toBe('preset');
  });
});
