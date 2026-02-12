import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedReports } from '../../src/hooks/useSavedReports';


// Mock localStorage
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
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('useSavedReports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
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

  it('should initialize with empty reports if localStorage is empty', () => {
    const { result } = renderHook(() => useSavedReports());
    expect(result.current.reports).toEqual([]);
  });

  it('should save a new report', () => {
    const { result } = renderHook(() => useSavedReports());

    act(() => {
      // @ts-ignore - partial mock for test
      result.current.saveReport(mockReport);
    });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0].name).toBe('Test Report');
    expect(result.current.reports[0].id).toBeDefined();
    expect(result.current.reports[0].createdAt).toBeDefined();
    
    // Check localStorage
    const stored = JSON.parse(localStorage.getItem('solar-roi-saved-reports') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Test Report');
  });

  it('should overwrite a report with the same name', () => {
    const { result } = renderHook(() => useSavedReports());

    act(() => {
       // @ts-ignore
      result.current.saveReport(mockReport);
    });

    const firstId = result.current.reports[0].id;

    act(() => {
       // @ts-ignore
      result.current.saveReport({ ...mockReport, config: { ...mockReport.config, annualProductionKwh: 20000 } });
    });

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0].id).toBe(firstId); // ID should be preserved
    expect(result.current.reports[0].config.annualProductionKwh).toBe(20000);
  });

  it('should delete a report', () => {
    const { result } = renderHook(() => useSavedReports());

    act(() => {
       // @ts-ignore
      result.current.saveReport(mockReport);
    });

    const reportId = result.current.reports[0].id;

    act(() => {
      result.current.deleteReport(reportId);
    });

    expect(result.current.reports).toEqual([]);
    expect(localStorage.getItem('solar-roi-saved-reports')).toBe('[]');
  });

  it('should load reports from localStorage on mount', () => {
    const existingReports = [{ ...mockReport, id: '123', createdAt: '2023-01-01' }];
    localStorage.setItem('solar-roi-saved-reports', JSON.stringify(existingReports));

    const { result } = renderHook(() => useSavedReports());

    expect(result.current.reports).toHaveLength(1);
    expect(result.current.reports[0].id).toBe('123');
  });
});
