/**
 * AdminBar tests.
 *
 * AdminBar is a private (non-exported) component defined inside ResultsSection.tsx.
 * We test it indirectly by rendering ResultsSection with reportMode="edit",
 * which is the only code path that renders AdminBar.
 *
 * To avoid pulling in the entire ResultsSection render tree (EnergyAnalyticsChart,
 * MarketAnalysis, etc.) we mock all heavy child components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { CalculationResult } from '../../src/types';

// ── module mocks ────────────────────────────────────────────────────────────

vi.mock('../../src/components/AuditModal', () => ({
  AuditModal: () => null,
}));

vi.mock('../../src/components/EnergyAnalyticsChart', () => ({
  EnergyAnalyticsChart: () => <div data-testid="energy-analytics-chart" />,
}));

vi.mock('../../src/components/MarketAnalysis', () => ({
  MarketAnalysis: () => <div data-testid="market-analysis" />,
}));

vi.mock('../../src/components/InputsUsedPanel', () => ({
  InputsUsedPanel: () => <div data-testid="inputs-used-panel" />,
}));

vi.mock('../../src/components/SaveReportModal', () => ({
  SaveReportModal: () => null,
}));

vi.mock('../../src/components/TariffComparisonTab', () => ({
  TariffComparisonTab: () => <div data-testid="tariff-comparison-tab" />,
}));

vi.mock('../../src/components/SavingsBreakdownChart', () => ({
  SavingsBreakdownChart: () => <div data-testid="savings-breakdown-chart" />,
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

// ── actual component import (after mocks are set up) ───────────────────────

const { ResultsSection } = await import('../../src/components/ResultsSection');

// ── tests ──────────────────────────────────────────────────────────────────

describe('AdminBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AdminBar is not rendered when reportMode is not "edit"', () => {
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="view"
        reportLocked={false}
        onLockToggle={vi.fn()}
      />
    );
    // The amber admin bar should not be present in view mode
    expect(screen.queryByText(/admin view/i)).not.toBeInTheDocument();
  });

  it('AdminBar is not rendered when reportMode is undefined (wizard mode)', () => {
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportLocked={false}
        onLockToggle={vi.fn()}
      />
    );
    expect(screen.queryByText(/admin view/i)).not.toBeInTheDocument();
  });

  it('AdminBar renders "Lock Report" button when reportLocked=false', () => {
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={false}
        onLockToggle={vi.fn()}
      />
    );
    expect(screen.getByText(/admin view/i)).toBeInTheDocument();
    expect(screen.getByText(/lock report/i)).toBeInTheDocument();
    expect(screen.queryByText(/unlock report/i)).not.toBeInTheDocument();
  });

  it('AdminBar renders "Unlock Report" button when reportLocked=true', () => {
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={true}
        onLockToggle={vi.fn()}
      />
    );
    expect(screen.getByText(/admin view/i)).toBeInTheDocument();
    expect(screen.getByText(/unlock report/i)).toBeInTheDocument();
    // "Lock Report" button should NOT be present (only "Unlock Report" is shown)
    // Use exact string check to avoid matching "Unlock Report" via /lock report/i
    expect(screen.queryByText(/🔒 lock report/i)).not.toBeInTheDocument();
  });

  it('Clicking "Lock Report" calls onLockToggle(true)', async () => {
    const onLockToggle = vi.fn().mockResolvedValue(undefined);
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={false}
        onLockToggle={onLockToggle}
      />
    );
    fireEvent.click(screen.getByText(/lock report/i));
    await waitFor(() => {
      expect(onLockToggle).toHaveBeenCalledWith(true);
    });
  });

  it('Clicking "Unlock Report" calls onLockToggle(false)', async () => {
    const onLockToggle = vi.fn().mockResolvedValue(undefined);
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={true}
        onLockToggle={onLockToggle}
      />
    );
    fireEvent.click(screen.getByText(/unlock report/i));
    await waitFor(() => {
      expect(onLockToggle).toHaveBeenCalledWith(false);
    });
  });

  it('Button shows "Locking…" while request is in flight', async () => {
    // onLockToggle never resolves during this test
    const onLockToggle = vi.fn().mockReturnValue(new Promise<void>(() => undefined));
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={false}
        onLockToggle={onLockToggle}
      />
    );
    fireEvent.click(screen.getByText(/lock report/i));
    await waitFor(() => {
      expect(screen.getByText(/locking…/i)).toBeInTheDocument();
    });
  });

  it('Button shows "Unlocking…" while request is in flight', async () => {
    const onLockToggle = vi.fn().mockReturnValue(new Promise<void>(() => undefined));
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={true}
        onLockToggle={onLockToggle}
      />
    );
    fireEvent.click(screen.getByText(/unlock report/i));
    await waitFor(() => {
      expect(screen.getByText(/unlocking…/i)).toBeInTheDocument();
    });
  });

  it('Button is disabled during request', async () => {
    const onLockToggle = vi.fn().mockReturnValue(new Promise<void>(() => undefined));
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={false}
        onLockToggle={onLockToggle}
      />
    );
    const btn = screen.getByText(/lock report/i);
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText(/locking…/i)).toBeDisabled();
    });
  });

  it('Error message appears when onLockToggle rejects', async () => {
    const onLockToggle = vi.fn().mockRejectedValue(new Error('Lock toggle failed: HTTP 500'));
    render(
      <ResultsSection
        standardResult={makeMinimalResult()}
        reportMode="edit"
        reportLocked={false}
        onLockToggle={onLockToggle}
      />
    );
    fireEvent.click(screen.getByText(/lock report/i));
    await waitFor(() => {
      expect(screen.getByText(/lock toggle failed/i)).toBeInTheDocument();
    });
  });
});
