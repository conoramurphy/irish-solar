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
      <button
        onClick={() =>
          onNext({
            solarData: {
              year: 2020,
              timesteps: Array.from({ length: 8760 }, (_, i) => ({
                stamp: { year: 2020, monthIndex: 0, day: 1, hour: 0 },
                hourKey: `2020-01-01T00`,
                irradianceWm2: 0,
                sourceIndex: i
              })),
              totalIrradiance: 0
            }
          })
        }
      >
        Next
      </button>
    </div>
  ),
}));

vi.mock('../../src/components/steps/Step3Battery', () => ({
  Step3Battery: ({ onNext, onBack }: any) => (
    <div data-testid="step3">
      <button onClick={onBack}>Back</button>
      <button onClick={onNext}>Next</button>
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
  listSolarTimeseriesYears: vi.fn(() => [2020]),
  normalizeSolarTimeseriesYear: vi.fn((parsed: any) => ({
    normalized: parsed,
    corrections: { warnings: [] }
  })),
  distributeAnnualProductionTimeseries: vi.fn(() => []),
  aggregateToMonthly: vi.fn(() => []),
}));

vi.mock('../../src/utils/solarDataLoader', () => ({
  loadSolarData: vi.fn(async (location: string, year: number) => ({
    location,
    latitude: 0,
    longitude: 0,
    elevation: 0,
    year,
    timesteps: Array.from({ length: 8760 }, (_, i) => ({
      timestamp: new Date(Date.UTC(year, 0, 1, 0, 0, 0)),
      stamp: { year, monthIndex: 0, day: 1, hour: 0 },
      hourKey: `${year}-01-01T00`,
      irradianceWm2: 0,
      sourceIndex: i
    })),
    totalIrradiance: 0
  }))
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

  it('navigates from Step 2 to Step 3, then Step 4', async () => {
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
    
    // Should go to Step 3
    await waitFor(() => expect(screen.getByTestId('step3')).toBeInTheDocument());
    
    // Click through Step 3
    await user.click(screen.getAllByText('Next')[0]);

    // Should land on Step 4
    await waitFor(() => {
      expect(screen.getByTestId('step4')).toBeInTheDocument();
    });
  });

  it('navigates back from Step 4 to Step 3', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate to Step 4
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step2')).toBeInTheDocument());

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step3')).toBeInTheDocument());
    
    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step4')).toBeInTheDocument());

    // Click back from Step 4
    const backButtons = screen.getAllByText('Back');
    await user.click(backButtons[backButtons.length - 1]);

    // Should land back on Step 3
    await waitFor(() => {
      expect(screen.getByTestId('step3')).toBeInTheDocument();
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

  it('Step 3 is enabled in stepper', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate past Step 0 to show stepper
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step-indicator')).toBeInTheDocument());

    // Check that Step 3 (index 2) is NOT disabled
    const step3Indicator = screen.getByTestId('indicator-step-2');
    expect(step3Indicator).not.toHaveAttribute('data-disabled', 'true');
  });

  it('Step3Battery is rendered during navigation', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Navigate through all steps
    await user.click(screen.getByText('Select Hotel'));
    await waitFor(() => expect(screen.getByTestId('step1')).toBeInTheDocument());

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step2')).toBeInTheDocument());

    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step3')).toBeInTheDocument());
    
    await user.click(screen.getAllByText('Next')[0]);
    await waitFor(() => expect(screen.getByTestId('step4')).toBeInTheDocument());

    // Navigate back
    const backButtons = screen.getAllByText('Back');
    await user.click(backButtons[backButtons.length - 1]);
    await waitFor(() => expect(screen.getByTestId('step3')).toBeInTheDocument());
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
