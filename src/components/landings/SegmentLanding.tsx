import { Link } from 'react-router-dom';
import { LeadForm } from './LeadForm';
import { FiveWaysGrid } from './FiveWaysGrid';
import { Faq } from './Faq';
import type { FunnelSegment } from './funnelConstants';

interface SegmentCopy {
  heroSubhead: string;
  baselineLine: string;
  formIntro: string;
  formSubmitLabel: string;
}

const COPY: Record<FunnelSegment, SegmentCopy> = {
  hotel: {
    heroSubhead:
      'Your installer\'s free model is a sales tool. Get an independent one instantly.',
    baselineLine:
      'Built on a real 20-bed Irish hotel model, scaled to your bill. Not a brochure.',
    formIntro:
      'Tell us four things and we\'ll build your independent ROI right now.',
    formSubmitLabel: 'Get your free Solar ROI',
  },
  dairy: {
    heroSubhead:
      'Your installer\'s free model is a sales tool. Get an independent one instantly.',
    baselineLine:
      'Built on a real 100-head Longford dairy farm model, scaled to your bill. Not a brochure.',
    formIntro:
      'Tell us four things and we\'ll build your independent ROI right now.',
    formSubmitLabel: 'Get your free Solar ROI',
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
  const copy = COPY[segment];
  const segmentDisplay = segment === 'hotel' ? 'hotel' : 'dairy farm';

  return (
    <main>
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
              Independent Irish energy advice · 2020–25
            </span>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 pt-8 pb-12 md:pt-12 md:pb-16 items-start">
            <div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold text-white leading-[1.05] tracking-tight mb-6">
                Get your free{' '}
                <span style={{ color: '#FDEAB4' }}>independent of installer</span>
                {' '}solar ROI for your {segmentDisplay}.
              </h1>
              <p
                className="text-lg sm:text-xl font-light leading-relaxed mb-4"
                style={{ color: 'rgba(255,255,255,0.92)' }}
              >
                {copy.heroSubhead}
              </p>
              <p
                className="text-sm sm:text-base font-light leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.78)' }}
              >
                {copy.baselineLine}
              </p>
            </div>

            {/* Form column */}
            <div className="lg:pt-2">
              <p
                className="text-xs font-semibold tracking-widest uppercase mb-3"
                style={{ color: 'rgba(253,234,180,0.85)' }}
              >
                {copy.formIntro}
              </p>
              <LeadForm
                fixedSegment={segment}
                source={segment === 'hotel' ? 'hotels_landing' : 'dairy_landing'}
                submitLabel={copy.formSubmitLabel}
              />
            </div>
          </div>
        </div>
      </section>

      <FiveWaysGrid />
      <Faq />
    </main>
  );
}

export function HotelsLanding() {
  return <SegmentLanding segment="hotel" />;
}

export function DairyLanding() {
  return <SegmentLanding segment="dairy" />;
}
