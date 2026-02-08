import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../src/App';

// Mock all step components
vi.mock('../../src/components/steps/Step0BuildingType', () => ({
  Step0BuildingType: ({ onNext }: { onNext: (data: { buildingType: string }) => void }) => (
    <div data-testid="step0">
      <button onClick={() => onNext({ buildingType: 'hotel-year-round' })}>Select Hotel</button>
    </div>
  ),
}));

vi.mock('../../src/components/steps/Step1DigitalTwin', () => ({
  Step1DigitalTwin: ({ onNext, onBack }: any) => (
    <div data-testid="step1">
      <button onClick={onBack}>Back</button>
      <button onClick={() => onNext({
        location: 'Cavan',
        exampleMonths: [],
        tariffConfig: { type: 'flat', unitRate: 0.20 },
        curvedMonthlyKwh: Array.from({ length: 12 }, () => 1000),
        estimatedMonthlyBills: Array.from({ length: 12 }, () => 200),
      })}>Next</button>
    </div>
  ),
}));

vi.mock('../../src/components/steps/Step2Solar', () => ({
  Step2Solar: ({ onNext, onBack }: any) => (
    <div data-testid="step2">
      <button onClick={onBack}>Back</button>
      <button onClick={() => onNext({ annualProductionKwh: 10000 })}>Next</button>
    </div>
  ),
}));

vi.mock('../../src/components/steps/Step3ComingSoon', () => ({
  Step3ComingSoon: () => (
    <div data-testid="step3-should-never-render">
      Step 3 Coming Soon
    </div>
  ),
}));

vi.mock('../../src/components/steps/Step4Finance', () => ({
  Step4Finance: ({ onBack, onGenerateReport }: any) => (
    <div data-testid="step4">
      <button onClick={onBack}>Back</button>
      <button onClick={() => onGenerateReport({
        grants: [],
        upfrontCost: 15000,
        businessType: 'hotel',
        loanDetails: null,
      })}>Generate Report</button>
    </div>
  ),
}));

// Mock other dependencies
vi.mock('../../src/utils/solarTimeseriesParser', () => ({
  parseSolarTimeseries: vi.fn(() => ({ parsedRows: [], warnings: [] })),
  normalizeSolarTimeseriesYear: vi.fn(() => ({ 
    normalizedRows: [], 
    corrections: { missingCount: 0, duplicateCount: 0, outsideYearCount: 0 },
    warnings: [],
  })),
  distributeAnnualProductionTimeseries: vi.fn(() => []),
}));

vi.mock('../../src/utils/calculations', () => ({
  runCalculation: vi.fn(() => ({
    annualSummary: { 
      totalCost: 1000, 
      totalSavings: 500, 
      netCost: 500,
      roi: 5,
      paybackYears: 20,
      totalConsumption: 10000,
      totalGeneration: 5000,
      totalSelfConsumption: 3000,
      totalImport: 7000,
      totalExport: 2000,
    },
    monthlySummaries: [],
  })),
}));

vi.mock('../../src/components/StepIndicator', () => ({
  StepIndicator: ({ steps, currentStep }: any) => (
    <div data-testid="step-indicator">
      {steps.map((step: any, index: number) => (
        <div 
          key={index}
          data-testid={`indicator-step-${index}`}
          data-active={currentStep === index}
          data-disabled={step.disabled}
        >
          {step.label}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../../src/components/ResultsSection', () => ({
  ResultsSection: () => <div data-testid="results">Results</div>,
}));

describe('Step Skip Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates from Step 2 directly to Step 4 (skips Step 3)', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Start at Step 0
    expect(screen.getByTestId('step0')).toBeInTheDocument();

    // Click through Step 0
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    // Click through Step 1
    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step2')).toBeInTheDocument());

    // Click through Step 2
    await user.click(screen.getAllByText('Next')[0]);

    // Should skip Step 3 and land on Step 4
    await waitFor(() => {
      expect(screen.getByTestId('step4')).toBeInTheDocument();
      expect(screen.queryByTestId('step3-should-never-render')).not.toBeInTheDocument();
    });
  });

  it('navigates back from Step 4 to Step 2 (skips Step 3)', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Step 4
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step2')).toBeInTheDocument());

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step4')).toBeInTheDocument());

    // Click back from Step 4
    const backButtons = screen.getAllByText('Back');
    await user.click(backButtons[backButtons.length - 1]);

    // Should skip Step 3 and land back on Step 2
    await waitFor(() => {
      expect(screen.getByTestId('step2')).toBeInTheDocument();
      expect(screen.queryByTestId('step3-should-never-render')).not.toBeInTheDocument();
    });
  });

  it('navigates back from Step 1 to Step 0', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Step 1
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    // Click back
    const backButtons = screen.getAllByText('Back');
    await user.click(backButtons[0]);

    // Should go back to Step 0
    await waitFor(() => {
      expect(screen.getByTestId('step0')).toBeInTheDocument();
    });
  });

  it('shows Step 3 as disabled in stepper', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate past Step 0 to show stepper
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step-indicator')).toBeInTheDocument());

    // Check that Step 3 (index 2 in the 4-step array) is marked as disabled
    const step3Indicator = screen.getByTestId('indicator-step-2');
    expect(step3Indicator).toHaveAttribute('data-disabled', 'true');
  });

  it('Step3ComingSoon component is never mounted during navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate through all steps
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    expect(screen.queryByTestId('step3-should-never-render')).not.toBeInTheDocument();

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step2')).toBeInTheDocument());

    expect(screen.queryByTestId('step3-should-never-render')).not.toBeInTheDocument();

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step4')).toBeInTheDocument());

    // Step 3 should never have been rendered
    expect(screen.queryByTestId('step3-should-never-render')).not.toBeInTheDocument();

    // Navigate back
    const backButtons = screen.getAllByText('Back');
    await user.click(backButtons[backButtons.length - 1]);
    await waitFor(() => expect(screen.getByTestId('step2')).toBeInTheDocument());

    // Still should not have rendered Step 3
    expect(screen.queryByTestId('step3-should-never-render')).not.toBeInTheDocument();
  });

  it('stepper is hidden on Step 0', () => {
    render(<App />);

    // Step 0 should be visible
    expect(screen.getByTestId('step0')).toBeInTheDocument();

    // Stepper should not be visible
    expect(screen.queryByTestId('step-indicator')).not.toBeInTheDocument();
  });

  it('stepper becomes visible after Step 0', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Step 1
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    // Stepper should now be visible
    expect(screen.getByTestId('step-indicator')).toBeInTheDocument();
  });
});
