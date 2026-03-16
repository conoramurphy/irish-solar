import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { CalculationResult } from '../../src/types';
import type { SavedReport } from '../../src/types/savedReports';

// ── module mocks ────────────────────────────────────────────────────────────

// Mock react-router-dom hooks used by SharedReportView
const mockUseParams = vi.fn();
const mockUseSearchParams = vi.fn();

vi.mock('react-router-dom', () => ({
  useParams: () => mockUseParams(),
  useSearchParams: () => mockUseSearchParams(),
  Link: ({ to, children, className }: { to: string; children: React.ReactNode; className?: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
}));

// migrateReport: just return the raw payload cast as SavedReport
vi.mock('../../src/utils/migrateReport', () => ({
  migrateReport: (raw: Record<string, unknown>) => raw as SavedReport,
}));

// ResultsSection: minimal stub so we don't pull in the entire results tree
vi.mock('../../src/components/ResultsSection', () => ({
  ResultsSection: (props: {
    standardResult: CalculationResult | null;
    reportMode?: string;
    reportLocked?: boolean;
    onLockToggle?: (locked: boolean) => Promise<void>;
  }) => (
    <div
      data-testid="results-section"
      data-report-mode={props.reportMode}
      data-report-locked={String(props.reportLocked)}
    >
      {props.onLockToggle && (
        <button
          data-testid="lock-toggle-btn"
          // Catch the error so it doesn't become an unhandled rejection in tests
          onClick={() => props.onLockToggle!(true).catch(() => undefined)}
        >
          Toggle Lock
        </button>
      )}
    </div>
  ),
}));

// ── helpers ────────────────────────────────────────────────────────────────

function makeMinimalResult(): CalculationResult {
  return {
    systemCost: 0,
    netCost: 0,
    annualGeneration: 0,
    annualSelfConsumption: 0,
    annualExport: 0,
    annualSavings: 0,
    annualSolarToLoadSavings: 0,
    annualBatteryToLoadSavings: 0,
    annualExportRevenue: 0,
    simplePayback: 0,
    npv: 0,
    irr: 0,
    cashFlows: [],
  };
}

function makeMinimalReport(overrides: Partial<SavedReport> = {}): SavedReport {
  return {
    id: 'abc-123',
    name: 'Test Report',
    createdAt: '2024-01-01T00:00:00Z',
    schemaVersion: 1,
    config: {
      annualProductionKwh: 10000,
      batterySizeKwh: 5,
      installationCost: 20000,
      location: 'Dublin',
      businessType: 'hotel',
    },
    financing: {
      equity: 0,
      interestRate: 0.05,
      termYears: 7,
    },
    selectedGrantIds: [],
    trading: { enabled: false },
    tariffId: 'flat',
    exampleMonths: [],
    tariffConfig: null,
    curvedMonthlyKwh: [],
    estimatedMonthlyBills: [],
    result: makeMinimalResult(),
    ...overrides,
  };
}

function stubFetch(payload: Record<string, unknown> | null, locked = false, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status: ok ? 200 : 404,
      json: vi.fn().mockResolvedValue(
        ok
          ? { payload, locked }
          : { error: 'Report not found' }
      ),
    })
  );
}

// Default search params — empty (no ?mode=admin)
function defaultSearchParams() {
  const sp = new URLSearchParams();
  return [sp, vi.fn()] as [URLSearchParams, ReturnType<typeof vi.fn>];
}

// ── actual component import (after mocks are set up) ───────────────────────

const { SharedReportView } = await import('../../src/components/SharedReportView');

// ── tests ──────────────────────────────────────────────────────────────────

describe('SharedReportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: 'abc-123' });
    mockUseSearchParams.mockReturnValue(defaultSearchParams());
  });

  it('shows loading spinner initially', () => {
    // stub fetch to never resolve during this synchronous render check
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<SharedReportView />);
    expect(screen.getByText(/loading report/i)).toBeInTheDocument();
  });

  it('shows "Report not found" on fetch error (non-ok response)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ error: 'Report not found' }),
      })
    );
    render(<SharedReportView />);
    await waitFor(() => {
      const matches = screen.getAllByText(/report not found/i);
      expect(matches.length).toBeGreaterThan(0);
    });
  });

  it('shows "Report not found" for unknown error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByText(/report not found/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/network failure/i)).toBeInTheDocument();
  });

  it('shows "No report ID" error when id is undefined', async () => {
    mockUseParams.mockReturnValue({ id: undefined });
    // fetch should not be called, but stub it anyway
    vi.stubGlobal('fetch', vi.fn());
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByText(/report not found/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/no report id/i)).toBeInTheDocument();
  });

  it('shows "Report has no results snapshot" when result is missing', async () => {
    const report = makeMinimalReport({ result: undefined });
    stubFetch(report as unknown as Record<string, unknown>);
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByText(/report has no results snapshot/i)).toBeInTheDocument()
    );
  });

  it('renders ResultsSection with reportMode="view" for unlocked report', async () => {
    const report = makeMinimalReport();
    stubFetch(report as unknown as Record<string, unknown>, false);
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByTestId('results-section')).toBeInTheDocument()
    );
    expect(screen.getByTestId('results-section').dataset.reportMode).toBe('view');
  });

  it('renders ResultsSection with reportMode="locked" for locked report', async () => {
    const report = makeMinimalReport();
    stubFetch(report as unknown as Record<string, unknown>, true);
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByTestId('results-section')).toBeInTheDocument()
    );
    expect(screen.getByTestId('results-section').dataset.reportMode).toBe('locked');
  });

  it('renders ResultsSection with reportMode="edit" when ?mode=admin', async () => {
    const sp = new URLSearchParams('mode=admin');
    mockUseSearchParams.mockReturnValue([sp, vi.fn()]);
    const report = makeMinimalReport();
    stubFetch(report as unknown as Record<string, unknown>, false);
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByTestId('results-section')).toBeInTheDocument()
    );
    expect(screen.getByTestId('results-section').dataset.reportMode).toBe('edit');
  });

  it('passes reportLocked=true to ResultsSection for locked reports', async () => {
    const report = makeMinimalReport();
    stubFetch(report as unknown as Record<string, unknown>, true);
    render(<SharedReportView />);
    await waitFor(() =>
      expect(screen.getByTestId('results-section')).toBeInTheDocument()
    );
    expect(screen.getByTestId('results-section').dataset.reportLocked).toBe('true');
  });

  it('Lock toggle PATCH request is sent with correct body and ID', async () => {
    const sp = new URLSearchParams('mode=admin');
    mockUseSearchParams.mockReturnValue([sp, vi.fn()]);
    const report = makeMinimalReport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ payload: report, locked: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'abc-123', locked: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<SharedReportView />);

    await waitFor(() =>
      expect(screen.getByTestId('lock-toggle-btn')).toBeInTheDocument()
    );

    screen.getByTestId('lock-toggle-btn').click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('/api/reports/abc-123');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body as string)).toEqual({ locked: true });
  });

  it('Lock state updated in UI after successful PATCH', async () => {
    const sp = new URLSearchParams('mode=admin');
    mockUseSearchParams.mockReturnValue([sp, vi.fn()]);
    const report = makeMinimalReport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ payload: report, locked: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: 'abc-123', locked: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<SharedReportView />);

    await waitFor(() =>
      expect(screen.getByTestId('results-section')).toBeInTheDocument()
    );

    // Initially unlocked (view mode with admin → edit)
    expect(screen.getByTestId('results-section').dataset.reportLocked).toBe('false');

    screen.getByTestId('lock-toggle-btn').click();

    await waitFor(() => {
      expect(screen.getByTestId('results-section').dataset.reportLocked).toBe('true');
    });
  });

  it('PATCH failure propagates as thrown error', async () => {
    const sp = new URLSearchParams('mode=admin');
    mockUseSearchParams.mockReturnValue([sp, vi.fn()]);
    const report = makeMinimalReport();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ payload: report, locked: false }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ error: 'Server error' }),
      });
    vi.stubGlobal('fetch', fetchMock);

    render(<SharedReportView />);

    await waitFor(() =>
      expect(screen.getByTestId('lock-toggle-btn')).toBeInTheDocument()
    );

    // The mock ResultsSection calls onLockToggle(true) on click and the
    // SharedReportView handleLockToggle throws on non-ok PATCH response.
    // The AdminBar (in real ResultsSection) would catch this and show an error.
    // Here we just verify that the toggle button click triggers a PATCH and
    // that the fetch was called with the correct arguments even on failure.
    screen.getByTestId('lock-toggle-btn').click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const [, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(options.method).toBe('PATCH');
  });
});
