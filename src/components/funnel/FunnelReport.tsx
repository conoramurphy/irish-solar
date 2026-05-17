import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { LEAD_CONVERSION_VALUE_EUR } from '../../utils/conversionValue';
import { AccuracyBar } from './AccuracyBar';
import { PathCard } from './PathCard';
import { ResultsSection } from '../ResultsSection';
import { CTAModal } from '../CTAModal';
import { migrateReport } from '../../utils/migrateReport';
import { findDefaultDetailPick } from '../../utils/funnelSubmit';
import type { PathRecommendation } from '../../utils/pickPathsFromSensitivity';
import type { FunnelSegment } from '../landings/funnelConstants';
import type { SavedReport } from '../../types/savedReports';
import type { CalculationResult } from '../../types';

// Funnel reports stash lead details + the picked paths in `description`
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

interface ReadyData {
  funnel: FunnelDescription;
  report: SavedReport;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ReadyData };

const WHATSAPP_HREF =
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

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

const MAIL_ICON = (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

interface ContactCTAsProps {
  source: 'top' | 'bottom';
  onEmailClick: () => void;
}

function ContactCTAs({ source, onEmailClick }: ContactCTAsProps) {
  const posthog = usePostHog();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => {
          posthog?.capture('funnel_report_contact_email_clicked', { source });
          onEmailClick();
        }}
        className="inline-flex items-center gap-2.5 rounded-2xl px-6 py-3.5 text-sm md:text-base font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
        style={{ backgroundColor: '#1A4A35', color: '#FDEAB4' }}
      >
        {MAIL_ICON}
        Contact me
      </button>
      <a
        href={WHATSAPP_HREF}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          posthog?.capture('funnel_report_contact_whatsapp_clicked', { source });
          if (typeof window !== 'undefined' && window.gtag) {
            window.gtag('event', 'conversion', {
              send_to: 'AW-18091029484/zYnrCKi2xKMcEOznvLJD',
              value: LEAD_CONVERSION_VALUE_EUR,
              currency: 'EUR',
            });
          }
        }}
        className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm md:text-base font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <span className="text-emerald-600">{WHATSAPP_ICON}</span>
        WhatsApp
      </a>
    </div>
  );
}

interface WalkthroughFloaterProps {
  onContactClick: () => void;
}

/**
 * Sticky bottom-right (desktop) / bottom-strip (mobile) CTA panel that follows
 * the user as they scroll the funnel report. Single CTA — opens the contact
 * modal which itself offers email + WhatsApp. Keeps the page free of
 * channel-specific buttons floating around.
 */
function WalkthroughFloater({ onContactClick }: WalkthroughFloaterProps) {
  const posthog = usePostHog();
  return (
    <div
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-6 sm:bottom-6 z-30 max-w-md sm:max-w-sm"
      role="region"
      aria-label="Get a free detailed walkthrough"
    >
      <div className="rounded-2xl bg-white shadow-2xl border border-slate-200 p-4 sm:p-5">
        <p className="text-sm sm:text-base font-serif font-bold text-slate-900 mb-3 leading-snug">
          Get a free detailed walkthrough
        </p>
        <button
          type="button"
          onClick={() => {
            posthog?.capture('funnel_walkthrough_contact_clicked');
            onContactClick();
          }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5"
          style={{ backgroundColor: '#1A4A35', color: '#FDEAB4' }}
        >
          {MAIL_ICON}
          Contact me
        </button>
      </div>
    </div>
  );
}

// Tailwind needs literal class names at build time, so map count → grid class.
const CARD_GRID_BY_COUNT: Record<number, string> = {
  1: 'grid grid-cols-1 gap-4 max-w-md',
  2: 'grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl',
  3: 'grid grid-cols-1 md:grid-cols-3 gap-4',
};

// Total cells the sensitivity sweep models (9 scale factors × 4 battery options).
// `pickPathsFromSensitivity` walks all 36 to choose the picks; the heading
// surfaces this so the user knows we didn't pick 3 at random.
const MODELLED_CELL_COUNT = 36;

function FunnelPathCardsTrio({ paths }: { paths: PathRecommendation[] }) {
  const cardGridClass = CARD_GRID_BY_COUNT[paths.length] ?? CARD_GRID_BY_COUNT[3];
  const optionsLabel = paths.length === 1 ? 'option' : 'options';
  const defaultPick = findDefaultDetailPick(paths);
  return (
    <section aria-labelledby="funnel-paths-heading" className="mb-8">
      <div className="mb-6">
        <h3
          id="funnel-paths-heading"
          className="text-2xl font-serif font-bold text-tines-dark mb-2"
        >
          {paths.length} savings {optionsLabel} from {MODELLED_CELL_COUNT} modelled
        </h3>
        <p className="text-sm text-slate-600">
          Each option is the cheapest system in our sweep that hits its bill-reduction target.
        </p>
      </div>
      <div className={cardGridClass} role="list" aria-label="Recommended setups">
        {paths.map((path) => (
          <div key={path.targetReductionPct} role="listitem">
            <PathCard
              path={path}
              isDefault={defaultPick?.targetReductionPct === path.targetReductionPct}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export function FunnelReport({ segment }: FunnelReportProps) {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>(() =>
    id ? { status: 'loading' } : { status: 'error', message: 'Missing report id.' }
  );
  const [contactOpen, setContactOpen] = useState(false);

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
          payload: Record<string, unknown>;
        }>;
      })
      .then((body) => {
        if (cancelled) return;
        if (!body.description) {
          throw new Error('Report is missing personalisation data. Please call us.');
        }
        if (!body.payload) {
          throw new Error('Report payload not found. Please call us.');
        }
        let funnel: FunnelDescription;
        try {
          funnel = JSON.parse(body.description) as FunnelDescription;
        } catch {
          throw new Error('Report personalisation data is corrupt. Please call us.');
        }
        if (!funnel.paths || funnel.paths.length === 0) {
          throw new Error('Report has no recommended paths. Please call us.');
        }
        const report = migrateReport(body.payload);
        setState({ status: 'ready', data: { funnel, report } });
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
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-green-800 underline underline-offset-2 hover:text-green-900"
          >
            Contact me on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  const { funnel, report } = state.data;
  const { leadName, leadEircode, paths } = funnel;
  const segmentNoun = segment === 'hotel' ? 'hotel' : 'dairy farm';
  const standardResult = report.result as CalculationResult | undefined;

  return (
    <div className="min-h-screen bg-slate-50 pb-32 sm:pb-24">
      <AccuracyBar onContact={() => setContactOpen(true)} />
      <CTAModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        leadContext={{
          name: leadName,
          eircode: leadEircode,
          segment,
          reportId: id,
        }}
      />
      <WalkthroughFloater onContactClick={() => setContactOpen(true)} />

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

      <main>
        {standardResult && (
          <ResultsSection
            standardResult={standardResult}
            config={report.config}
            reportMode="view"
            reportLocked={false}
            reportTitle={`${leadName}, here's your independent ROI`}
            reportDescription={`${segment === 'hotel' ? 'Hotel' : 'Dairy farm'} · ${leadEircode}. Your usage patterns will differ from this ${segmentNoun}'s.`}
            topPicksOverride={<FunnelPathCardsTrio paths={paths} />}
            detailBannerOverride={
              <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-slate-800">
                <span className="font-semibold text-emerald-900">
                  We detail the 50% option here as it&rsquo;s often what people go for.
                </span>{' '}
                We can break out the detail on whatever suits your financial goals.
              </div>
            }
          />
        )}

        <footer className="border-t border-slate-100 pt-10 md:pt-14 pb-14 px-5 md:px-8">
          <div className="max-w-5xl mx-auto flex flex-col items-start gap-5">
            <p className="text-sm md:text-base text-slate-700 leading-relaxed max-w-xl">
              These paths come from a real model of an Irish {segmentNoun}, scaled to your
              bill. The call sharpens it: your real load shape, your real tariff, your real
              site. ±5% accurate, free, no sales pressure.
            </p>
            <ContactCTAs source="bottom" onEmailClick={() => setContactOpen(true)} />
          </div>
        </footer>
      </main>
    </div>
  );
}
