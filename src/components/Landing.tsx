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

const GRID_DARK: React.CSSProperties = {
  backgroundImage: [
    'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
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
  { name: 'Longford dairy farm', size: '65–97.5 kWp', grant: 'TAMS 3', payback: '4.4 yrs', savingLabel: '10-yr return', saving: '+€122,887', reportId: 'WZ9EWvHnXsJsk8gH7GUQN' },
  { name: 'Cavan hotel, 20 beds', size: '150–1,200 kWp', grant: 'SEAI', payback: '2.9 yrs', savingLabel: '10-yr return', saving: '+€391,143', reportId: 'GXz4-_lMwsjVbgc3GzBww' },
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

      {/* Floating CTA */}
      <button
        type="button"
        onClick={() => openCta('floating_button')}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white hover:-translate-y-0.5 transition-all duration-200"
        style={{ backgroundColor: '#3A7A5C', boxShadow: '0 0 0 6px rgba(58,122,92,0.18), 0 4px 16px rgba(0,0,0,0.25)' }}
        aria-label="Get your solar profit model"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <span className="hidden sm:inline">Get your model</span>
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
            <div className="pt-14 pb-10 md:pt-20 md:pb-14 max-w-3xl">
              <h1
                id="hero-heading"
                className="text-5xl sm:text-6xl md:text-7xl font-serif font-bold text-white leading-[1.05] tracking-tight mb-7"
              >
                What profit will<br />solar make you?
              </h1>
              <p className="text-xl font-light leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Your bills{' '}
                <a href="https://www.thejournal.ie/esri-electricity-prices-7011725-Apr2026/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity">are</a>
                {' '}
                <a href="https://www.irishtimes.com/business/2026/04/17/households-face-electricity-bill-increases-in-weeks-industry-warns/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity">rising</a>
                {' '}
                <a href="https://www.irishtimes.com/business/2026/04/17/ireland-faces-higher-electricity-bills-even-if-peace-breaks-out-tomorrow/" target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:opacity-80 transition-opacity">again</a>
                .
              </p>
              <p className="text-xl font-light leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Most solar installations in Ireland are wrongly sized, overpriced, or both. Installers get paid either way. You don't.
              </p>
              <p className="text-xl font-light leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
                We're your partner. We model your business in 48 hours — real usage, real roof, real export rates through 2033 — then size it right with the installer you pick.
              </p>
              <p className="text-xl font-light" style={{ color: 'rgba(255,255,255,0.9)' }}>
                A mistake costs 200k+ over 10 years. A 15-minute chat is free.
              </p>

              {/* CTA */}
              <div className="mt-8 flex flex-wrap items-center gap-4 mb-2">
                <button
                  type="button"
                  onClick={() => openCta('hero_button')}
                  className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: '#1A4A35' }}
                  aria-label="Get your solar profit model"
                >
                  Get your model {ARROW}
                </button>
              </div>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                2 min to submit · results in 24 hrs
              </p>

            </div>

            {/* Example model cards */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl"
              role="list"
              aria-label="Example solar profit models"
            >
              {EXAMPLE_MODELS.map(m => (
                <div
                  key={m.name}
                  role="button"
                  tabIndex={0}
                  aria-label={`${m.name}: ${m.size} system, payback ${m.payback}, 10-yr return ${m.saving}. See the real savings.`}
                  onClick={() => {
                    posthog?.capture('example_model_opened', { report_id: m.reportId, model_name: m.name });
                    navigate(`/r/${m.reportId}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      posthog?.capture('example_model_opened', { report_id: m.reportId, model_name: m.name });
                      navigate(`/r/${m.reportId}`);
                    }
                  }}
                  className="rounded-2xl p-5 cursor-pointer hover:scale-[1.02] active:scale-[0.99] transition-transform"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-sm font-semibold text-white leading-snug">{m.name}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {m.size} · {m.grant} grant
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-6 mb-4">
                    <div className="min-w-0">
                      <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Payback</p>
                      <p className="text-2xl font-semibold font-sans tabular-nums text-white leading-none">{m.payback}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>{m.savingLabel}</p>
                      <p className="text-2xl font-semibold font-sans tabular-nums leading-none" style={{ color: '#FDEAB4' }}>{m.saving}</p>
                    </div>
                  </div>
                  <span
                    className="inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: '#FDEAB4' }}
                    aria-hidden="true"
                  >
                    See the real savings {ARROW}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Process steps — merged into hero, compressed ── */}
            <div className="mt-14 pb-16 border-t" style={{ borderColor: 'rgba(255,255,255,0.2)' }}>
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
            SECTION 2 — TARIFF MODELLER  (navy)
        ───────────────────────────────────────────── */}
        <section
          aria-labelledby="tariff-heading"
          className="relative py-20 md:py-28"
          style={{ backgroundColor: '#1B3A72' }}
        >
          <div className="pointer-events-none absolute inset-0" style={GRID_LIGHT} />
          <div className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8">
            <p className="text-xs font-medium tracking-widest uppercase mb-5" style={{ color: 'rgba(219,234,254,0.6)' }}>
              Business electricity
            </p>
            <h2
              id="tariff-heading"
              className="text-4xl md:text-5xl font-serif font-bold text-white leading-[1.08] tracking-tight mb-7 max-w-xl"
            >
              Are you on the right tariff?
            </h2>
            <p className="text-xl font-light leading-relaxed mb-10 max-w-2xl" style={{ color: 'rgba(219,234,254,0.85)' }}>
              Most Irish businesses overpay by switching at the wrong time or on the wrong contract.
              Find your best rate in two minutes.
            </p>
            <button
              type="button"
              onClick={() => { posthog?.capture('tariff_tool_started'); navigate('/tariffs'); }}
              className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: '#DBEAFE', color: '#1E3A8A' }}
              aria-label="Check your electricity tariff"
            >
              Check your tariff {ARROW}
            </button>
          </div>
        </section>

        {/* ─────────────────────────────────────────────
            SECTION 3 — HEAT PUMP  (amber)
        ───────────────────────────────────────────── */}
        <section
          id="heatpump"
          aria-labelledby="heatpump-heading"
          className="relative py-20 md:py-28"
          style={{ backgroundColor: '#FEF3C7' }}
        >
          <div className="pointer-events-none absolute inset-0" style={GRID_DARK} />
          <div className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8">
            <p className="text-xs font-medium tracking-widest uppercase mb-5" style={{ color: 'rgba(146,64,14,0.6)' }}>
              Coming soon
            </p>
            <h2
              id="heatpump-heading"
              className="text-4xl md:text-5xl font-serif font-bold leading-[1.08] tracking-tight mb-7 max-w-xl"
              style={{ color: '#78350F' }}
            >
              Domestic and business heat pump modelling.
            </h2>
            <p className="text-xl font-light leading-relaxed mb-10 max-w-2xl" style={{ color: 'rgba(120,53,15,0.8)' }}>
              The same approach — half-hourly data, real costs, independent numbers.
              Register your interest and we'll let you know when it's live.
            </p>
            <button
              type="button"
              onClick={() => openCta('heat_pump_section')}
              className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: '#92400E' }}
              aria-label="Register your interest in heat pump modelling"
            >
              Register interest {ARROW}
            </button>
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
