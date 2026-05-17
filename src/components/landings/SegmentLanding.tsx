import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { LeadFormModal } from './LeadFormModal';
import { FiveWaysGrid } from './FiveWaysGrid';
import { Faq } from './Faq';
import { LoadGenerationDay } from './LoadGenerationDay';
import { SEGMENT_CHART_DATA } from './segmentChartData';
import { CTAModal } from '../CTAModal';
import { usePageMeta } from '../../hooks/usePageMeta';
import { DAIRY_META, HOTEL_META } from '../../data/routeMeta';
import type { FunnelSegment } from './funnelConstants';

interface SegmentCopy {
  /** "{Irish hotels|Irish dairy farms} make half what they should from solar." */
  headlineLead: string;
  /** First paragraph of the subhead, the positioning. */
  subheadIntro: string;
  /** Second paragraph of the subhead, the methodology. */
  subheadBody: string;
  /** Small credibility line just before the CTA. */
  baselineLine: string;
  /** First-person CTA label, segment-specific. */
  ctaLabel: string;
}

const COPY: Record<FunnelSegment, SegmentCopy> = {
  hotel: {
    headlineLead: 'Irish hotels make half what they should from solar.',
    subheadIntro:
      'We don\'t sell panels. We\'re independent solar advice, brokerage and management for Irish hotels.',
    subheadBody:
      'We model your hotel using your real consumption profile, daytime occupancy, real sunlight, real export rates through 2033, and every grant and capital allowance you\'re entitled to. Most quotes oversell batteries and undersize panels. We fix that before you spend a euro.',
    baselineLine:
      'Built on a real 20-bed Cavan hotel, scaled to your bill. Not a brochure.',
    ctaLabel: 'Get my hotel\'s payback year',
  },
  dairy: {
    headlineLead: 'Irish dairy farms make half what they should from solar.',
    subheadIntro:
      'We don\'t sell panels. We\'re independent solar advice, brokerage and management for Irish dairy farms.',
    subheadBody:
      'We model your farm using your real milking parlour load, real sunlight, real export rates through 2033, and full TAMS 3 grant treatment. Most quotes oversell batteries and undersize panels. We fix that before you spend a euro.',
    baselineLine:
      'Built on a real 100-head Longford dairy farm, scaled to your bill. Not a brochure.',
    ctaLabel: 'Get my dairy\'s payback year',
  },
};

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

const ARROW = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);

const GRID_LIGHT: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '48px 48px',
};

interface SegmentLandingProps {
  segment: FunnelSegment;
}

export function SegmentLanding({ segment }: SegmentLandingProps) {
  usePageMeta(segment === 'hotel' ? HOTEL_META : DAIRY_META);
  const copy = COPY[segment];
  const posthog = usePostHog();
  const [ctaOpen, setCtaOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const source = segment === 'hotel' ? 'hotels_landing' : 'dairy_landing';

  function openCta(buttonSource: string) {
    posthog?.capture('cta_modal_opened', { source: `${source}:${buttonSource}` });
    setCtaOpen(true);
  }

  function openContact(buttonSource: string) {
    posthog?.capture('contact_modal_opened', { source: `${source}:${buttonSource}` });
    setContactOpen(true);
  }

  return (
    <main>
      <LeadFormModal
        open={ctaOpen}
        onClose={() => setCtaOpen(false)}
        fixedSegment={segment}
        source={source}
      />
      <CTAModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        leadContext={{ segment }}
      />

      {/* Hero */}
      <section className="relative" style={{ backgroundColor: '#3A7A5C' }}>
        <div className="pointer-events-none absolute inset-0" style={GRID_LIGHT} />
        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8">
          {/* Top nav */}
          <header className="flex items-center justify-between pt-6 pb-2">
            <Link to="/" className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: '#FDEAB4' }}
              >
                {SUN_ICON}
              </div>
              <span className="text-sm font-bold tracking-widest uppercase text-white">
                Watt <span style={{ color: '#FDEAB4' }}>Profit</span>
              </span>
            </Link>
            <span
              className="hidden md:block text-sm font-semibold"
              style={{ color: 'rgba(255,255,255,0.6)' }}
            >
              Independent of every installer in Ireland
            </span>
          </header>

          {/* Hero copy + CTA, single column to mirror the homepage */}
          <div className="pt-10 pb-14 md:pt-14 md:pb-20 max-w-3xl">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-serif font-bold text-white leading-[1.08] tracking-tight mb-7">
              {copy.headlineLead}{' '}
              <span style={{ color: '#FDEAB4' }}>We fix that.</span>
            </h1>

            <p
              className="text-lg sm:text-xl font-light leading-relaxed mb-4"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              {copy.subheadIntro}
            </p>
            <p
              className="text-lg sm:text-xl font-light leading-relaxed"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              {copy.subheadBody}
            </p>

            <p
              className="text-sm sm:text-base font-light leading-relaxed mt-6"
              style={{ color: 'rgba(255,255,255,0.78)' }}
            >
              {copy.baselineLine}
            </p>

            <div className="flex flex-wrap items-center gap-4 mt-8">
              <button
                type="button"
                onClick={() => openCta('hero_button')}
                className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base sm:text-lg font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                style={{ backgroundColor: '#1A4A35' }}
                aria-label={copy.ctaLabel}
              >
                {copy.ctaLabel} {ARROW}
              </button>
            </div>
          </div>
        </div>
      </section>

      <LoadGenerationDay data={SEGMENT_CHART_DATA[segment]} />

      {/* Mid-page CTA so visitors who read the chart can act without scrolling
          all the way to the bottom contact band. */}
      <section className="bg-white pb-12 md:pb-16 px-5 md:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <button
            type="button"
            onClick={() => openCta('post_chart')}
            className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base sm:text-lg font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: '#1A4A35' }}
            aria-label={copy.ctaLabel}
          >
            {copy.ctaLabel} {ARROW}
          </button>
        </div>
      </section>

      <FiveWaysGrid />
      <Faq />

      {/* Contact band, opens the CTAModal (email + WhatsApp) for visitors who
          want to chat without going through the lead form. */}
      <section className="bg-white py-14 md:py-20 border-t border-slate-100" aria-labelledby="contact-heading">
        <div className="max-w-3xl mx-auto px-5 md:px-8 text-center">
          <h2
            id="contact-heading"
            className="text-2xl md:text-3xl font-serif font-bold text-tines-dark mb-3"
          >
            Want to chat first?
          </h2>
          <p className="text-base text-slate-600 mb-7">
            Email or WhatsApp. We&rsquo;ll come back to you.
          </p>
          <button
            type="button"
            onClick={() => openContact('bottom_contact')}
            className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            style={{ backgroundColor: '#1A4A35', color: '#FDEAB4' }}
          >
            Contact us
          </button>
        </div>
      </section>
    </main>
  );
}

export function HotelsLanding() {
  return <SegmentLanding segment="hotel" />;
}

export function DairyLanding() {
  return <SegmentLanding segment="dairy" />;
}
