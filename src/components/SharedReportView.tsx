import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { migrateReport } from '../utils/migrateReport';
import { ResultsSection } from './ResultsSection';
import type { SavedReport } from '../types/savedReports';
import type { CalculationResult } from '../types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: SavedReport; locked: boolean };

export function SharedReportView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('mode') === 'admin';

  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!id) {
      setState({ status: 'error', message: 'No report ID in URL.' });
      return;
    }

    let cancelled = false;

    fetch(`/api/reports/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ payload: Record<string, unknown>; locked?: boolean }>;
      })
      .then(({ payload, locked }) => {
        if (cancelled) return;
        const report = migrateReport(payload);
        setState({ status: 'ready', report, locked: locked === true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        setState({ status: 'error', message });
      });

    return () => { cancelled = true; };
  }, [id]);

  const handleLockToggle = async (locked: boolean) => {
    if (!id) return;
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locked }),
    });
    if (!res.ok) throw new Error(`Lock toggle failed: HTTP ${res.status}`);
    setState((prev) =>
      prev.status === 'ready' ? { ...prev, locked } : prev
    );
  };

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">
          <svg className="animate-spin h-8 w-8 mx-auto mb-3 text-green-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm">Loading report…</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-slate-800 mb-2">Report not found</p>
          <p className="text-sm text-slate-500 mb-6">{state.message}</p>
          <Link to="/" className="text-sm text-green-700 underline underline-offset-2 hover:text-green-900">
            Go to calculator
          </Link>
        </div>
      </div>
    );
  }

  const { report, locked } = state;
  const result = report.result as CalculationResult | undefined;

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-slate-800 mb-2">Report has no results snapshot</p>
          <p className="text-sm text-slate-500 mb-6">This report was saved without a results snapshot and cannot be displayed.</p>
          <Link to="/" className="text-sm text-green-700 underline underline-offset-2 hover:text-green-900">
            Go to calculator
          </Link>
        </div>
      </div>
    );
  }

  // reportMode: admin → 'edit', locked report → 'locked', otherwise → 'view'
  const reportMode = isAdmin ? 'edit' : locked ? 'locked' : 'view';

  return (
    <div className="min-h-screen bg-slate-50">
      <ResultsSection
        standardResult={result}
        config={report.config}
        reportMode={reportMode}
        reportLocked={locked}
        onLockToggle={isAdmin ? handleLockToggle : undefined}
      />
    </div>
  );
}
