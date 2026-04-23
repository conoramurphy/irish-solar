import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CTAModal } from './CTAModal';
import { usePostHog } from '@posthog/react';

// Grid overlay styles — white lines for dark sections, dark lines for light sections
const GRID_LIGHT: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '48px 48px',
};


const SUN_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-5 h-5">
    <circle cx="16" cy="16" r="5.5" fill="#145735"/>
    <rect x="14.75" y="2.5" width="2.5" height="5" rx="1.25" fill="#145735"/>
    <rect x="14.75" y="24.5" width="2.5" height="5" rx="1.25" fill="#145735"/>
    <rect x="2.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735"/>
    <rect x="24.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735"/>
    <rect x="14.75" y="2.5" width="2.5" height="5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
    <rect x="14.75" y="24.5" width="2.5" height="5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
    <rect x="2.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
    <rect x="24.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
  </svg>
);

const LOGO = (
  <div className="flex items-center gap-2.5">
    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#FDEAB4' }}>
      {SUN_ICON}
    </div>
    <span className="text-sm font-bold tracking-widest uppercase text-white">
      Watt <span style={{ color: '#FDEAB4' }}>Profit</span>
    </span>
  </div>
);

const STEPS = [
  {
    n: '01',
    title: 'We model it',
    time: '48 hrs',
    body: 'Your smart meter data becomes a digital twin, simulated against 20 solar and battery configurations.',
  },
  {
    n: '02',
    title: 'We walk you through it',
    time: '1 hr',
    body: 'One call to talk through the real trade-offs — no jargon, no pressure.',
  },
  {
    n: '03',
    title: 'We shop it',
    time: '~3 weeks',
    body: 'We get quotes from installers on your behalf, or you can go direct — either way, against a specification built around the systems that pay you the most.',
  },
  {
    n: '04',
    title: 'We verify it',
    time: '1 hr',
    body: 'Real quotes run back through the digital twin. Every number is confirmed before you commit.',
  },
];

const EXAMPLE_MODELS = [
  {
    type: 'Hotel, 20 beds',
    spec: '150–1,200 kWp · SEAI grant',
    payback: '2.9 yrs',
    savingLabel: '10-yr return',
    saving: '+€391,143',
    reportId: 'GXz4-_lMwsjVbgc3GzBww',
    // Navy scheme — exact match to old tariff section
    theme: {
      cardBg: '#1B3A72',
      titleColor: '#FFFFFF',
      mutedColor: 'rgba(219,234,254,0.6)',
      primaryColor: '#FFFFFF',
      savingColor: '#DBEAFE',
      ctaBg: '#DBEAFE',
      ctaText: '#1E3A8A',
    },
  },
  {
    type: 'Dairy Farm',
    spec: '65–97.5 kWp · TAMS 3 grant',
    payback: '4.4 yrs',
    savingLabel: '10-yr return',
    saving: '+€122,887',
    reportId: 'WZ9EWvHnXsJsk8gH7GUQN',
    // Amber scheme — exact match to old heat pump section
    theme: {
      cardBg: '#FEF3C7',
      titleColor: '#78350F',
      mutedColor: 'rgba(146,64,14,0.6)',
      primaryColor: '#78350F',
      savingColor: '#92400E',
      ctaBg: '#92400E',
      ctaText: '#FFFFFF',
    },
  },
];

const ARROW = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);

export function Landing() {
  const navigate = useNavigate();
  const posthog = usePostHog();
  const [ctaOpen, setCtaOpen] = useState(false);

  function openCta(source: string) {
    posthog?.capture('cta_modal_opened', { source });
    setCtaOpen(true);
  }

  return (
    <>
      <CTAModal open={ctaOpen} onClose={() => setCtaOpen(false)} />

      {/* Floating CTA — hidden on mobile */}
      <button
        type="button"
        onClick={() => openCta('floating_button')}
        className="hidden sm:inline-flex fixed bottom-6 right-6 z-40 items-center gap-3 rounded-2xl px-8 py-4 text-base font-semibold shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-200"
        style={{ backgroundColor: '#1A4A35', color: '#FDEAB4' }}
        aria-label="Get your own solar ROI"
      >
        Get your own solar ROI
      </button>

      <div>

        {/* ─────────────────────────────────────────────
            SECTION 1 — HERO + PROCESS  (green)
        ───────────────────────────────────────────── */}
        <section aria-labelledby="hero-heading" className="relative" style={{ backgroundColor: '#3A7A5C' }}>

          {/* Grid overlay */}
          <div className="pointer-events-none absolute inset-0" style={GRID_LIGHT} />

          <div className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8">

            {/* Nav */}
            <header className="flex items-center justify-between pt-6 pb-2" role="banner">
              {LOGO}
              <span className="hidden md:block text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Irish energy advisor · Independent advice · 2020–25
              </span>
            </header>

            {/* Hero copy */}
            <div className="pt-10 pb-7 md:pt-14 md:pb-10 max-w-3xl">
              <h1
                id="hero-heading"
                className="text-4xl sm:text-6xl md:text-7xl font-serif font-bold text-white leading-[1.05] tracking-tight mb-7"
              >
                Your bills{' '}
                <a href="https://www.thejournal.ie/esri-electricity-prices-7011725-Apr2026/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity">are</a>
                {' '}
                <a href="https://www.irishtimes.com/business/2026/04/17/households-face-electricity-bill-increases-in-weeks-industry-warns/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity">rising</a>
                ,<br />solar can halve them.
              </h1>
              <p className="text-base sm:text-xl font-light leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
                However, most solar jobs are wrongly sized, losing your business up to €200k over 10 years.
              </p>
              <p className="text-base sm:text-xl font-light leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
                We don't sell panels, we're your partner. We model your real business data in 48 hours — real usage, real sunlight, real export rates through 2033 — then size it right with the installer we pick together.
              </p>
              <p className="text-base sm:text-xl font-light" style={{ color: 'rgba(255,255,255,0.9)' }}>
                A mistake costs €200k+. A 15-minute chat is free.
              </p>

            </div>

            {/* Example model cards label */}
            <p className="text-xs font-semibold tracking-widest uppercase mb-3 max-w-2xl" style={{ color: 'rgba(253,234,180,0.75)' }}>
              Review our real anonymised reports for free
            </p>

            {/* Example model cards */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl"
              role="list"
              aria-label="Example solar profit models"
            >
              {EXAMPLE_MODELS.map(m => (
                <div
                  key={m.type}
                  role="button"
                  tabIndex={0}
                  aria-label={`${m.type}: ${m.spec}, payback ${m.payback}, 10-yr return ${m.saving}. See the solar ROI.`}
                  onClick={() => {
                    posthog?.capture('example_model_opened', { report_id: m.reportId, model_name: m.type });
                    navigate(`/r/${m.reportId}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      posthog?.capture('example_model_opened', { report_id: m.reportId, model_name: m.type });
                      navigate(`/r/${m.reportId}`);
                    }
                  }}
                  className="group rounded-2xl p-5 cursor-pointer hover:-translate-y-1 active:translate-y-0 transition-all duration-200 shadow-xl hover:shadow-2xl flex flex-col"
                  style={{ backgroundColor: m.theme.cardBg }}
                >
                  <div className="mb-4 flex-1">
                    <p className="text-lg sm:text-2xl font-serif font-bold leading-snug mb-1" style={{ color: m.theme.titleColor }}>{m.type}</p>
                    <p className="text-xs font-medium" style={{ color: m.theme.mutedColor }}>
                      {m.spec}
                    </p>
                  </div>
                  <div className="flex gap-6 mb-5">
                    <div className="min-w-0">
                      <p className="text-xs font-medium mb-1" style={{ color: m.theme.mutedColor }}>Payback</p>
                      <p className="text-xl font-semibold font-sans tabular-nums leading-none" style={{ color: m.theme.primaryColor }}>{m.payback}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium mb-1" style={{ color: m.theme.mutedColor }}>{m.savingLabel}</p>
                      <p className="text-xl font-semibold font-sans tabular-nums leading-none" style={{ color: m.theme.savingColor }}>{m.saving}</p>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold self-start transition-all duration-200 group-hover:gap-3 shadow-md"
                    style={{ backgroundColor: m.theme.ctaBg, color: m.theme.ctaText }}
                    aria-hidden="true"
                  >
                    See the solar ROI {ARROW}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="mt-8 flex flex-wrap items-center gap-4 mb-2">
              <button
                type="button"
                onClick={() => openCta('hero_button')}
                className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                style={{ backgroundColor: '#1A4A35' }}
                aria-label="Get your own solar ROI"
              >
                Get your own solar ROI {ARROW}
              </button>
            </div>
            <p className="text-sm font-medium mb-8" style={{ color: 'rgba(255,255,255,0.55)' }}>
              2 min to submit · results in 48 hrs
            </p>

            {/* ── Process steps — merged into hero, compressed ── */}
            <div className="mt-8 pb-14 border-t" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
              <p className="text-xs font-medium tracking-widest uppercase mt-10 mb-8" style={{ color: 'rgba(255,255,255,0.6)' }}>
                The process
              </p>
              <ol
                className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-7"
                aria-label="How our process works"
              >
                {STEPS.map(s => (
                  <li key={s.n} className="flex gap-4">
                    <span
                      className="text-xs font-medium leading-none shrink-0 mt-1 select-none w-5"
                      style={{ color: 'rgba(255,255,255,0.35)' }}
                      aria-hidden="true"
                    >
                      {s.n}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-base font-semibold text-white">{s.title}</h3>
                        {s.time && (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.75)' }}
                          >
                            {s.time}
                          </span>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {s.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-10 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Most clients have a start date within 4 weeks of today.
              </p>
            </div>

          </div>
        </section>

        {/* ─────────────────────────────────────────────
            FOOTER
        ───────────────────────────────────────────── */}
        <footer style={{ backgroundColor: '#1A4A35' }} role="contentinfo">

          {/* ── References section ── */}
          <div className="w-full max-w-5xl mx-auto px-5 md:px-8 pt-14 pb-10">

            {/* Section heading */}
            <div style={{ borderTop: '1px solid rgba(253,234,180,0.25)', paddingTop: '2rem', marginBottom: '1.75rem' }}>
              <p className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: 'rgba(253,234,180,0.5)', fontVariant: 'small-caps', letterSpacing: '0.18em' }}>
                Methodology &amp; Data Sources
              </p>
              <h3 className="font-serif text-xl font-semibold leading-snug" style={{ color: 'rgba(255,255,255,0.9)' }}>
                References
              </h3>
            </div>

            {/* Reference grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-0">

              {/* ── Grants & Policy ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
                <p className="text-xs font-semibold mb-3 tracking-widest" style={{ color: 'rgba(253,234,180,0.6)', fontVariant: 'small-caps', letterSpacing: '0.15em' }}>
                  Grants &amp; Policy
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[1]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Sustainable Energy Authority of Ireland. <span className="italic">Solar PV Grant — Domestic.</span>{' '}
                      <a href="https://www.seai.ie/grants/home-energy-grants/solar-electricity-grant/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>seai.ie</a>.
                      {' '}<span style={{ color: 'rgba(255,255,255,0.4)' }}>Last verified 22 Feb 2025.</span>
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[2]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Sustainable Energy Authority of Ireland. <span className="italic">Non-Domestic Microgen Grant (Solar PV).</span>{' '}
                      <a href="https://www.seai.ie/grants/business-grants/commercial-solar-pv/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>seai.ie</a>.
                      {' '}<span style={{ color: 'rgba(255,255,255,0.4)' }}>Last verified 8 Feb 2026.</span>
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[3]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Department of Agriculture, Food and the Marine. <span className="italic">TAMS 3 Solar Capital Investment Scheme (SCIS).</span>{' '}
                      <a href="https://www.gov.ie/en/service/f8cb3-solar-capital-investment-scheme-scis/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>gov.ie</a>.
                      {' '}<span style={{ color: 'rgba(255,255,255,0.4)' }}>Last verified 8 Feb 2026.</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Solar Irradiance ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
                <p className="text-xs font-semibold mb-3 tracking-widest" style={{ color: 'rgba(253,234,180,0.6)', fontVariant: 'small-caps', letterSpacing: '0.15em' }}>
                  Solar Irradiance
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[4]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Copernicus Atmosphere Monitoring Service. <span className="italic">CAMS Radiation Service — Global Horizontal Irradiance, 36 Irish locations, 2020–2025.</span>{' '}
                      <a href="https://www.soda-pro.com/web-services/radiation/cams-radiation-service" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>soda-pro.com</a>.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[5]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      European Commission Joint Research Centre. <span className="italic">PVGIS — Photovoltaic Geographical Information System (PVGIS-SARAH3).</span>{' '}
                      <a href="https://re.jrc.ec.europa.eu/pvgis/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>re.jrc.ec.europa.eu</a>.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Electricity Prices ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
                <p className="text-xs font-semibold mb-3 tracking-widest" style={{ color: 'rgba(253,234,180,0.6)', fontVariant: 'small-caps', letterSpacing: '0.15em' }}>
                  Electricity Prices
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[6]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Single Electricity Market Operator. <span className="italic">SEMOpx Day-Ahead Market Reports — ROI-DA, 30-minute intervals, 2021–present.</span>{' '}
                      <a href="https://reports.semopx.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>reports.semopx.com</a>.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Consumption Benchmarks ── */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
                <p className="text-xs font-semibold mb-3 tracking-widest" style={{ color: 'rgba(253,234,180,0.6)', fontVariant: 'small-caps', letterSpacing: '0.15em' }}>
                  Consumption Benchmarks
                </p>
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[7]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Sustainable Energy Authority of Ireland. <span className="italic">Energy in Ireland 2024.</span>{' '}
                      <a href="https://www.seai.ie/data-and-insights/seai-statistics/key-publications/energy-in-ireland/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>seai.ie</a>.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right" style={{ color: 'rgba(253,234,180,0.45)' }}>[8]</span>
                    <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      Central Statistics Office Ireland. <span className="italic">Household Energy Survey 2020.</span>{' '}
                      <a href="https://www.cso.ie" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted hover:opacity-100 transition-opacity" style={{ color: 'rgba(253,234,180,0.7)' }}>cso.ie</a>.
                    </p>
                  </div>
                </div>
              </div>

            </div>

            {/* Disclaimer line */}
            <p className="text-xs mt-2 italic" style={{ color: 'rgba(255,255,255,0.35)' }}>
              All grant values, tariff rates, and irradiance data are subject to change. This tool provides modelling estimates only and does not constitute financial or investment advice.
            </p>
          </div>

          {/* ── Branding row ── */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-full max-w-5xl mx-auto px-5 md:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div>
                {LOGO}
                <p className="mt-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  Independent energy analysis for Irish businesses.
                </p>
              </div>
              <div className="flex flex-col sm:items-end gap-2">
                <Link
                  to="/privacy"
                  className="text-xs font-semibold underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-80"
                  style={{ color: 'rgba(253,234,180,0.75)' }}
                >
                  Privacy policy
                </Link>
                <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  2020–25 · Not financial advice
                </p>
              </div>
            </div>
          </div>

        </footer>

      </div>
    </>
  );
}
