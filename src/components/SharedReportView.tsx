import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { migrateReport } from '../utils/migrateReport';
import { ResultsSection } from './ResultsSection';
import { CTAModal } from './CTAModal';
import type { SavedReport } from '../types/savedReports';
import type { CalculationResult } from '../types';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; report: SavedReport; locked: boolean; name: string | null; description: string | null };

export function SharedReportView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isAdmin = searchParams.get('mode') === 'admin';
  const posthog = usePostHog();

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [ctaOpen, setCtaOpen] = useState(false);

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
        return res.json() as Promise<{
          payload: Record<string, unknown>;
          locked?: boolean;
          name?: string | null;
          description?: string | null;
        }>;
      })
      .then(({ payload, locked, name, description }) => {
        if (cancelled) return;
        const report = migrateReport(payload);
        setState({
          status: 'ready',
          report,
          locked: locked === true,
          name: name ?? null,
          description: description ?? null,
        });
        posthog?.capture('shared_report_viewed', {
          report_id: id,
          report_name: name ?? null,
          is_admin: isAdmin,
          locked: locked === true,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Unknown error';
        setState({ status: 'error', message });
      });

    return () => { cancelled = true; };
  }, [id]);

  const patch = async (fields: { locked?: boolean; name?: string; description?: string }) => {
    if (!id) return;
    const res = await fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`);
  };

  const handleLockToggle = async (locked: boolean) => {
    await patch({ locked });
    setState((prev) => prev.status === 'ready' ? { ...prev, locked } : prev);
  };

  const handleTitleChange = async (name: string) => {
    await patch({ name });
    setState((prev) => prev.status === 'ready' ? { ...prev, name } : prev);
  };

  const handleDescriptionChange = async (description: string) => {
    await patch({ description });
    setState((prev) => prev.status === 'ready' ? { ...prev, description } : prev);
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

  const { report, locked, name, description } = state;
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
      {reportMode === 'locked' && (
        <>
          <CTAModal open={ctaOpen} onClose={() => setCtaOpen(false)} />
          <button
            type="button"
            onClick={() => setCtaOpen(true)}
            className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            style={{ backgroundColor: '#2D6A4F' }}
            aria-label="Get your profit model"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
            </svg>
            <span className="hidden sm:inline">Get your profit model</span>
          </button>
        </>
      )}
      <ResultsSection
        standardResult={result}
        config={report.config}
        reportMode={reportMode}
        reportLocked={locked}
        reportTitle={name}
        reportDescription={description}
        onLockToggle={isAdmin ? handleLockToggle : undefined}
        onTitleChange={isAdmin ? handleTitleChange : undefined}
        onDescriptionChange={isAdmin ? handleDescriptionChange : undefined}
      />
    </div>
  );
}
