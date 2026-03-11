import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSavedReports } from '../../src/hooks/useSavedReports';
import { clearAllSavedReports, listSavedReports } from '../../src/db/savedReportsDb';

// Mock localStorage (used for one-time migration behaviour)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true
});

describe('useSavedReports', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();
    await clearAllSavedReports();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockReport = {
    name: 'Test Report',
    config: {
      annualProductionKwh: 10000,
      batterySizeKwh: 5,
      installationCost: 15000,
      location: 'Test Location',
      businessType: 'hotel'
    },
    financing: {
      equity: 5000,
      interestRate: 0.05,
      termYears: 5
    },
    selectedGrantIds: [],
    trading: { enabled: false },
    tariffId: 'test-tariff',
    exampleMonths: [],
    tariffConfig: null,
    curvedMonthlyKwh: [],
    estimatedMonthlyBills: [],
  };

  it('should initialize with empty reports if localStorage is empty', async () => {
    const { result } = renderHook(() => useSavedReports());

    await waitFor(() => {
      expect(result.current.reports).toEqual([]);
    });
  });

  it('should save a new report (IndexedDB)', async () => {
    const { result } = renderHook(() => useSavedReports());

    act(() => {
      // @ts-expect-error -- partial mock for test (intentionally omits id/createdAt)
      result.current.saveReport(mockReport);
    });

    await waitFor(() => {
      expect(result.current.reports).toHaveLength(1);
    });

    expect(result.current.reports[0].name).toBe('Test Report');
    expect(result.current.reports[0].id).toBeDefined();
    expect(result.current.reports[0].createdAt).toBeDefined();

    const stored = await listSavedReports();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Test Report');
  });

  it('should overwrite a report with the same name (preserve ID)', async () => {
    const { result } = renderHook(() => useSavedReports());

    act(() => {
      // @ts-expect-error -- partial mock for test (intentionally omits id/createdAt)
      result.current.saveReport(mockReport);
    });

    await waitFor(() => {
      expect(result.current.reports).toHaveLength(1);
    });

    const firstId = result.current.reports[0].id;

    act(() => {
      // @ts-expect-error -- partial mock for test (intentionally omits id/createdAt)
      result.current.saveReport({ ...mockReport, config: { ...mockReport.config, annualProductionKwh: 20000 } });
    });

    await waitFor(() => {
      expect(result.current.reports).toHaveLength(1);
      expect(result.current.reports[0].id).toBe(firstId);
      expect(result.current.reports[0].config.annualProductionKwh).toBe(20000);
    });

    const stored = await listSavedReports();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(firstId);
  });

  it('should delete a report (IndexedDB)', async () => {
    const { result } = renderHook(() => useSavedReports());

    act(() => {
      // @ts-expect-error -- partial mock for test (intentionally omits id/createdAt)
      result.current.saveReport(mockReport);
    });

    await waitFor(() => {
      expect(result.current.reports).toHaveLength(1);
    });

    const reportId = result.current.reports[0].id;

    act(() => {
      result.current.deleteReport(reportId);
    });

    await waitFor(() => {
      expect(result.current.reports).toEqual([]);
    });

    const stored = await listSavedReports();
    expect(stored).toEqual([]);
  });

  it('should preserve uploadSummary when saving and reloading a report', async () => {
    const { result } = renderHook(() => useSavedReports());

    const reportWithUpload = {
      ...mockReport,
      hourlyConsumptionOverride: Array.from({ length: 8760 }, (_, i) => i * 0.1),
      uploadSummary: {
        filename: 'my-esb-meter.csv',
        year: 2024,
        totalKwh: 12500,
        slotsPerDay: 24 as const
      }
    };

    act(() => {
      // @ts-expect-error -- partial mock for test (intentionally omits id/createdAt)
      result.current.saveReport(reportWithUpload);
    });

    await waitFor(() => {
      expect(result.current.reports).toHaveLength(1);
    });

    const stored = await listSavedReports();
    expect(stored[0].uploadSummary).toEqual({
      filename: 'my-esb-meter.csv',
      year: 2024,
      totalKwh: 12500,
      slotsPerDay: 24
    });
    expect(stored[0].hourlyConsumptionOverride).toHaveLength(8760);
  });

  it('should migrate legacy reports from localStorage on mount', async () => {
    const existingReports = [{ ...mockReport, id: '123', createdAt: '2023-01-01' }];
    localStorage.setItem('solar-roi-saved-reports', JSON.stringify(existingReports));

    const { result } = renderHook(() => useSavedReports());

    await waitFor(() => {
      expect(result.current.reports).toHaveLength(1);
      expect(result.current.reports[0].id).toBe('123');
    });

    // Migration should remove the legacy key.
    expect(localStorage.removeItem).toHaveBeenCalledWith('solar-roi-saved-reports');

    const stored = await listSavedReports();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('123');
  });
});
