import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CTAModal } from './CTAModal';

const GRID_BG = {
  backgroundImage: [
    'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '48px 48px',
};

const LOGO = (
  <div className="flex items-center gap-2.5">
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
      style={{ backgroundColor: '#FDEAB4' }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="#145735" className="w-4 h-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
      </svg>
    </div>
    <span className="text-base font-bold tracking-widest uppercase text-white">
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
    title: 'You shop it',
    time: null,
    body: 'We give you a specification to take directly to installers you trust. Three quotes, your choice. No referral, no commission.',
  },
  {
    n: '04',
    title: 'We verify it',
    time: '1 hr',
    body: 'Real quotes run back through the digital twin. Every number confirmed before you commit.',
  },
];

const EXAMPLE_MODELS = [
  {
    name: 'Longford dairy farm',
    size: '52 kWp',
    grant: 'TAMS 3',
    payback: '6.4 years',
    saving: '€28,400',
  },
  {
    name: 'Cavan hotel',
    size: '38 kWp',
    grant: 'SEAI',
    payback: '7.1 years',
    saving: '€19,800',
  },
];

export function Landing() {
  const navigate = useNavigate();
  const [ctaOpen, setCtaOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySent, setNotifySent] = useState(false);
  const [notifySending, setNotifySending] = useState(false);

  async function handleNotify(e: React.FormEvent) {
    e.preventDefault();
    if (!notifyEmail.trim() || notifySending) return;
    setNotifySending(true);
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: notifyEmail.trim(),
        role: 'heatpump-notify',
        message: 'Heat pump waitlist signup',
        closedEarly: false,
      }),
    }).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    setNotifySending(false);
    setNotifySent(true);
  }

  return (
    <>
      <CTAModal open={ctaOpen} onClose={() => setCtaOpen(false)} />

      {/* Floating CTA — landing page only */}
      <button
        type="button"
        onClick={() => setCtaOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
        style={{ backgroundColor: '#2D6A4F' }}
        aria-label="Get your free solar profit model"
      >
        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
        <span className="hidden sm:inline">Get your free model</span>
      </button>

      <div>

        {/* ─────────────────────────────────────────────
            SECTION 1 — HERO  (green)
        ───────────────────────────────────────────── */}
        <section
          aria-labelledby="hero-heading"
          style={{ backgroundColor: '#74C69D' }}
        >
          {/* Grid overlay */}
          <div className="pointer-events-none fixed inset-0" style={GRID_BG} />

          <div className="relative z-10 w-full max-w-5xl mx-auto px-5 md:px-8">

            {/* Nav */}
            <header className="flex items-center justify-between pt-6 pb-2" role="banner">
              {LOGO}
              <span className="hidden md:block text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
                36 Irish locations · 2020–25
              </span>
            </header>

            {/* Hero */}
            <div className="pt-14 pb-12 md:pt-20 md:pb-16 max-w-3xl">
              <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Irish solar · Independent advice
              </p>
              <h1
                id="hero-heading"
                className="text-5xl sm:text-6xl md:text-[5rem] font-serif font-bold text-white leading-[1.05] tracking-tight mb-7"
              >
                What profit will<br />solar make you?
              </h1>
              <p className="text-lg md:text-xl font-light leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.9)' }}>
                Half-hourly Irish consumption and irradiation data, with export rates modelled through 2033.
                The output is your capital cost, annual return, and exact payback year.
              </p>
              <p className="text-xl md:text-2xl font-semibold text-white mb-10">
                We give you the numbers.
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4 mb-3">
                <button
                  type="button"
                  onClick={() => setCtaOpen(true)}
                  className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: '#0D4027' }}
                  aria-label="Get your free solar profit model"
                >
                  Get your free model
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/full-model')}
                  className="inline-flex items-center gap-2 rounded-2xl px-7 py-4 text-base font-medium transition-all duration-200 hover:opacity-80"
                  style={{ color: 'rgba(255,255,255,0.85)', border: '1.5px solid rgba(255,255,255,0.35)' }}
                >
                  Run it yourself →
                </button>
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                2 min to submit · results in 24 hrs
              </p>
            </div>

            {/* Example model cards */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-16 max-w-2xl"
              role="list"
              aria-label="Example solar profit models"
            >
              {EXAMPLE_MODELS.map(m => (
                <article
                  key={m.name}
                  role="listitem"
                  aria-label={`${m.name}: ${m.size} system, payback ${m.payback}, year 1 saving ${m.saving}`}
                  className="rounded-2xl p-5"
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(4px)' }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="font-semibold text-white text-sm leading-snug">{m.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                        {m.size} · {m.grant} grant
                      </p>
                    </div>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.9)' }}
                    >
                      Open model
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>Payback</p>
                      <p className="text-2xl font-bold text-white leading-none">{m.payback}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>Year 1 saving</p>
                      <p className="text-2xl font-bold leading-none" style={{ color: '#FDEAB4' }}>{m.saving}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────
            HOW IT WORKS  (white)
        ───────────────────────────────────────────── */}
        <section
          aria-labelledby="process-heading"
          className="py-20 md:py-28"
          style={{ backgroundColor: '#F7FAF7' }}
        >
          <div className="w-full max-w-5xl mx-auto px-5 md:px-8">
            <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: '#74C69D' }}>
              The process
            </p>
            <h2
              id="process-heading"
              className="text-3xl md:text-4xl font-serif font-bold mb-14"
              style={{ color: '#0D4027' }}
            >
              From data to decision in four steps.
            </h2>

            <ol
              className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10"
              aria-label="How our process works"
            >
              {STEPS.map(s => (
                <li key={s.n} className="flex gap-5">
                  <span
                    className="text-4xl font-bold leading-none shrink-0 mt-0.5 select-none"
                    style={{ color: '#74C69D' }}
                    aria-hidden="true"
                  >
                    {s.n}
                  </span>
                  <div>
                    <div className="flex items-center gap-2.5 mb-2">
                      <h3 className="font-semibold text-base" style={{ color: '#0D4027' }}>
                        {s.title}
                      </h3>
                      {s.time && (
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#DCFCE7', color: '#166534' }}
                        >
                          {s.time}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-500">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-14 text-base font-medium" style={{ color: '#0D4027' }}>
              Most clients have a start date within 4 weeks of today.
            </p>
          </div>
        </section>

        {/* ─────────────────────────────────────────────
            SECTION 2 — TARIFF MODELLER  (navy)
        ───────────────────────────────────────────── */}
        <section
          aria-labelledby="tariff-heading"
          className="py-20 md:py-28"
          style={{ backgroundColor: '#0F2660' }}
        >
          <div className="w-full max-w-5xl mx-auto px-5 md:px-8">
            <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(219,234,254,0.6)' }}>
              Business electricity
            </p>
            <h2
              id="tariff-heading"
              className="text-4xl md:text-5xl font-serif font-bold text-white leading-[1.08] tracking-tight mb-7 max-w-xl"
            >
              Are you on the right tariff?
            </h2>
            <p className="text-lg md:text-xl font-light leading-relaxed mb-10 max-w-2xl" style={{ color: 'rgba(219,234,254,0.85)' }}>
              Most Irish businesses overpay by switching at the wrong time or on the wrong contract.
              Find your best rate in two minutes — then see how much of it solar would eliminate.
            </p>
            <button
              type="button"
              onClick={() => navigate('/tariffs')}
              className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
              style={{ backgroundColor: '#DBEAFE', color: '#1E3A8A' }}
              aria-label="Check your electricity tariff"
            >
              Check your tariff
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </button>
          </div>
        </section>

        {/* ─────────────────────────────────────────────
            SECTION 3 — HEAT PUMP  (amber)
        ───────────────────────────────────────────── */}
        <section
          id="heatpump"
          aria-labelledby="heatpump-heading"
          className="py-20 md:py-28"
          style={{ backgroundColor: '#FEF3C7' }}
        >
          <div className="w-full max-w-5xl mx-auto px-5 md:px-8">
            <p className="text-xs font-semibold tracking-widest uppercase mb-5" style={{ color: 'rgba(146,64,14,0.6)' }}>
              Coming soon
            </p>
            <h2
              id="heatpump-heading"
              className="text-4xl md:text-5xl font-serif font-bold leading-[1.08] tracking-tight mb-7 max-w-xl"
              style={{ color: '#78350F' }}
            >
              Domestic and business heat pump modelling.
            </h2>
            <p className="text-lg md:text-xl font-light leading-relaxed mb-10 max-w-2xl" style={{ color: 'rgba(120,53,15,0.8)' }}>
              The same approach — half-hourly data, real costs, independent numbers.
              Leave your email and we'll let you know when it's live.
            </p>

            {notifySent ? (
              <div className="inline-flex items-center gap-2.5 rounded-2xl px-7 py-4 text-base font-semibold" style={{ backgroundColor: '#FDE68A', color: '#78350F' }}>
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                We'll be in touch when it's live.
              </div>
            ) : (
              <form
                onSubmit={handleNotify}
                className="flex flex-col sm:flex-row gap-3 max-w-md"
                aria-label="Heat pump waitlist signup"
              >
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={e => setNotifyEmail(e.target.value)}
                  placeholder="your@email.ie"
                  required
                  className="flex-1 rounded-xl border-0 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  style={{ backgroundColor: 'rgba(255,255,255,0.7)', color: '#78350F' }}
                  aria-label="Email address for heat pump notifications"
                />
                <button
                  type="submit"
                  disabled={notifySending}
                  className="rounded-xl px-6 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60 whitespace-nowrap"
                  style={{ backgroundColor: '#92400E' }}
                >
                  {notifySending ? 'Saving…' : 'Notify me →'}
                </button>
              </form>
            )}
          </div>
        </section>

        {/* ─────────────────────────────────────────────
            FOOTER  (dark green)
        ───────────────────────────────────────────── */}
        <footer
          className="py-14"
          style={{ backgroundColor: '#0D4027' }}
          role="contentinfo"
        >
          <div className="w-full max-w-5xl mx-auto px-5 md:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              {LOGO}
              <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Independent energy analysis for Irish businesses.
              </p>
            </div>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              36 Irish locations · 2020–25 · Not financial advice
            </p>
          </div>
        </footer>

      </div>
    </>
  );
}
