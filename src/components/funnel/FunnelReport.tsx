import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { AccuracyBar } from './AccuracyBar';
import { PathCard } from './PathCard';
import type { PathRecommendation } from '../../utils/pickPathsFromSensitivity';
import type { FunnelSegment } from '../landings/funnelConstants';

// Funnel reports stash lead details + the three picked paths in `description`
// as JSON so the existing reports API can serve them without schema changes.
interface FunnelDescription {
  leadName: string;
  leadEircode: string;
  leadSegment: FunnelSegment;
  paths: PathRecommendation[];
}

interface FunnelReportProps {
  segment: FunnelSegment;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: FunnelDescription };

const PHONE_HREF =
  'https://wa.me/353858082080?text=Hey%2C%20I%20just%20got%20my%20Watt%20Profit%20independent%20ROI%20and%20want%20to%20chat%20through%20it.%20What%20time%20works%3F';

const SUN_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-5 h-5">
    <circle cx="16" cy="16" r="5.5" fill="#145735" />
    <rect x="14.75" y="2.5" width="2.5" height="5" rx="1.25" fill="#145735" />
    <rect x="14.75" y="24.5" width="2.5" height="5" rx="1.25" fill="#145735" />
    <rect x="2.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" />
    <rect x="24.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" />
    <rect x="14.75" y="2.5" width="2.5" height="5" rx="1.25" fill="#145735" transform="rotate(45 16 16)" />
    <rect x="14.75" y="24.5" width="2.5" height="5" rx="1.25" fill="#145735" transform="rotate(45 16 16)" />
    <rect x="2.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" transform="rotate(45 16 16)" />
    <rect x="24.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" transform="rotate(45 16 16)" />
  </svg>
);

function CallCTA({ source }: { source: 'top' | 'mid' | 'bottom' }) {
  const posthog = usePostHog();
  return (
    <a
      href={PHONE_HREF}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        posthog?.capture('funnel_report_cta_clicked', { source });
        if (typeof window !== 'undefined' && window.gtag) {
          window.gtag('event', 'conversion', {
            send_to: 'AW-18091029484/zYnrCKi2xKMcEOznvLJD',
            value: 25.0,
            currency: 'EUR',
          });
        }
      }}
      className="inline-flex items-center gap-3 rounded-2xl px-6 py-3.5 text-sm md:text-base font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
      style={{ backgroundColor: '#1A4A35', color: '#FDEAB4' }}
    >
      Talk to me — let&rsquo;s walk through your model on a quick call
    </a>
  );
}

export function FunnelReport({ segment }: FunnelReportProps) {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>(() =>
    id ? { status: 'loading' } : { status: 'error', message: 'Missing report id.' }
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`/api/reports/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Couldn't load your report (HTTP ${res.status}).`);
        }
        return res.json() as Promise<{
          description?: string | null;
          payload: { config?: { businessType?: string } };
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.description) {
          throw new Error('Report is missing personalisation data. Please call us.');
        }
        let parsed: FunnelDescription;
        try {
          parsed = JSON.parse(body.description) as FunnelDescription;
        } catch {
          throw new Error('Report personalisation data is corrupt. Please call us.');
        }
        if (!parsed.paths || parsed.paths.length === 0) {
          throw new Error('Report has no recommended paths. Please call us.');
        }
        setState({ status: 'ready', data: parsed });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Couldn\'t load your report.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">
          <svg
            className="animate-spin h-8 w-8 mx-auto mb-3 text-green-700"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-sm">Building your report…</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-5">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-slate-800 mb-2">We hit a snag</p>
          <p className="text-sm text-slate-500 mb-6">{state.message}</p>
          <a
            href={PHONE_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-green-800 underline underline-offset-2 hover:text-green-900"
          >
            Talk to me on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  const { leadName, leadEircode, paths } = state.data;
  const segmentNoun = segment === 'hotel' ? 'hotel' : 'dairy farm';

  return (
    <div className="min-h-screen bg-slate-50">
      <AccuracyBar />

      <nav
        className="flex items-center px-5 md:px-8 py-4 bg-white border-b border-slate-100"
        aria-label="Back to home"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 text-sm font-semibold text-slate-700 hover:text-slate-900 transition-colors"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: '#FDEAB4' }}
          >
            {SUN_ICON}
          </div>
          <span>
            Watt <span style={{ color: '#1A4A35' }}>Profit</span>
          </span>
        </Link>
      </nav>

      <main className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
        <header className="mb-10 md:mb-12">
          <h1 className="text-3xl md:text-5xl font-serif font-bold text-slate-900 leading-tight tracking-tight mb-3">
            {leadName}, here&rsquo;s your{' '}
            <span className="text-green-800">independent</span> ROI.
          </h1>
          <p className="text-sm text-slate-500 mb-3">
            {segment === 'hotel' ? 'Hotel' : 'Dairy farm'} · {leadEircode}
          </p>
          <p className="text-sm md:text-base text-slate-700 leading-relaxed">
            Your usage patterns <span className="underline decoration-amber-500 decoration-2 underline-offset-2 font-semibold">will</span> differ from this {segmentNoun}&rsquo;s.
          </p>
        </header>

        <div className="mb-8">
          <CallCTA source="top" />
        </div>

        <section aria-labelledby="paths-heading" className="mb-10 md:mb-12">
          <h2 id="paths-heading" className="sr-only">
            Three paths to lower bills
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {paths.map((path) => (
              <PathCard key={path.targetReductionPct} path={path} />
            ))}
          </div>
        </section>

        <div className="text-center mb-10">
          <CallCTA source="mid" />
        </div>

        <footer className="border-t border-slate-100 pt-8 md:pt-10 text-center">
          <p className="text-sm md:text-base text-slate-700 leading-relaxed mb-5 max-w-xl mx-auto">
            These three paths come from a real model of an Irish {segmentNoun}, scaled to
            your bill. The call sharpens it: your real load shape, your real tariff, your
            real site. ±5% accurate, free, no sales pressure.
          </p>
          <CallCTA source="bottom" />
        </footer>
      </main>
    </div>
  );
}
