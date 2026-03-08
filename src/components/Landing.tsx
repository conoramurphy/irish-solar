interface LandingProps {
  onSelectSolarBattery: () => void;
  onSelectTariff: () => void;
}

// Tines-style grid: fine horizontal + vertical lines at low opacity
const GRID_BG = {
  backgroundImage: [
    'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '48px 48px',
};

const BG = '#74C69D';

export { BG as LANDING_BG };

export function Landing({ onSelectSolarBattery, onSelectTariff }: LandingProps) {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: BG }}
    >
      {/* Line grid overlay */}
      <div className="pointer-events-none fixed inset-0" style={GRID_BG} />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-5xl mx-auto px-5 md:px-8">

        {/* ── Brand strip ── */}
        <header className="flex items-center justify-between pt-6 pb-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#FDEAB4' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="#145735" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </div>
            <span className="text-base font-bold text-white tracking-widest uppercase">
              Watt <span style={{ color: '#FDEAB4' }}>Profit</span>
            </span>
          </div>
          <span className="hidden md:block text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            36 Irish locations · 2020–25
          </span>
        </header>

        {/* ── Headline ── */}
        <div className="mt-12 mb-12 md:mt-20 md:mb-16">
          <h1 className="text-5xl sm:text-6xl md:text-[5rem] font-serif font-bold text-white leading-[1.05] tracking-tight">
            Make the perfect<br />
            energy choice for<br />
            your Irish business.
          </h1>
          <div className="mt-8 max-w-2xl space-y-5">
            <p className="text-lg md:text-xl font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)' }}>
              With current SEAI grants, rising energy prices, and declining export tariffs set to continue over the next decade, there has never been a more profitable moment to switch to solar and batteries.
            </p>
            <p className="text-lg md:text-xl font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Delaying even 1 month can easily cost you thousands. Yet the country is littered with mis-sized systems — too small, too many batteries, or simply a system that was never matched to how a building actually uses energy. We model your exact half-hour-by-half-hour consumption profile so your system is sized precisely for you.
            </p>
          </div>
        </div>

        {/* ── Mode buttons ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-16 max-w-3xl w-full">

          {/* Solar & Battery ROI */}
          <button
            type="button"
            onClick={onSelectSolarBattery}
            className="landing-card group flex items-center gap-4 rounded-2xl px-5 py-4 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
            style={{ backgroundColor: '#FEF3C7', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
          >
            <div
              className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-transform duration-200 group-hover:scale-105"
              style={{ backgroundColor: '#92400E' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#FEF3C7" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </div>
            <div className="flex-grow min-w-0">
              <div className="font-semibold text-sm tracking-tight" style={{ color: '#92400E' }}>Solar &amp; Battery ROI</div>
              <div className="text-xs mt-0.5 leading-snug" style={{ color: '#A16207' }}>Size your system on real Irish irradiance data with SEAI grants</div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" style={{ color: '#92400E' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>

          {/* Tariff Comparer */}
          <button
            type="button"
            onClick={onSelectTariff}
            className="landing-card group flex items-center gap-4 rounded-2xl px-5 py-4 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
            style={{ backgroundColor: '#DBEAFE', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
          >
            <div
              className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-transform duration-200 group-hover:scale-105"
              style={{ backgroundColor: '#1E3A8A' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#DBEAFE" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
              </svg>
            </div>
            <div className="flex-grow min-w-0">
              <div className="font-semibold text-sm tracking-tight" style={{ color: '#1E3A8A' }}>Electricity Tariff Comparer</div>
              <div className="text-xs mt-0.5 leading-snug" style={{ color: '#1E40AF' }}>Rank every Irish tariff against your actual hourly usage</div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 shrink-0 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" style={{ color: '#1E3A8A' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </button>

        </div>

        {/* Mobile data badge */}
        <div className="md:hidden text-center pb-10">
          <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            36 Irish locations · 2020–25
          </span>
        </div>

      </div>
    </div>
  );
}

