import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { migrateReport } from '../utils/migrateReport';
import { ResultsSection } from './ResultsSection';
import { CTAModal } from './CTAModal';
import { ReportGateModal } from './ReportGateModal';
import type { SavedReport } from '../types/savedReports';
import type { CalculationResult } from '../types';

const EXAMPLE_REPORT_IDS = new Set([
  'WZ9EWvHnXsJsk8gH7GUQN', // Longford dairy farm
  'GXz4-_lMwsjVbgc3GzBww', // Cavan hotel
]);

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
  const [gateCleared, setGateCleared] = useState(false);

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
      {EXAMPLE_REPORT_IDS.has(id!) && !gateCleared && !isAdmin && (
        <ReportGateModal reportId={id!} onComplete={() => setGateCleared(true)} />
      )}
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
      {EXAMPLE_REPORT_IDS.has(id!) && gateCleared && (
        <a
          href="https://wa.me/353858082080?text=Hey%2C%20I%20just%20want%20to%20chat%20through%20my%20business%27s%20potential%20solar%20and%20energy%20savings%20with%20you.%20What%20time%20works%3F"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => posthog?.capture('meeting_booking_started', { source: 'report_floating_cta' })}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold shadow-xl hover:shadow-2xl transition-all duration-200 whitespace-nowrap"
          style={{ backgroundColor: '#1A4A35', color: '#FDEAB4' }}
          aria-label="Book your free call on WhatsApp"
        >
          <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Book your free call
        </a>
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
