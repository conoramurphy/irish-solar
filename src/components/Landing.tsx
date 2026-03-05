import React from 'react';

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
            <span className="text-base font-semibold text-white tracking-tight">
              Solar &amp; Battery Modeller
            </span>
          </div>
          <span className="hidden md:block text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            36 Irish locations · 2020–25
          </span>
        </header>

        {/* ── Headline ── */}
        <div className="text-center mt-16 mb-16 md:mt-24 md:mb-20">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif font-bold text-white leading-[1.1] tracking-tight">
            Make the perfect<br />
            energy choice.
          </h1>
          <p className="mt-6 text-base md:text-lg max-w-2xl mx-auto font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
            Use your real energy history, real weather, real tariffs to see exactly the right solar, batteries, and tariff for you. No guessing. True half-hour by half-hour calculations for the whole year.
          </p>
        </div>

        {/* ── Mode cards — Tines pastel style ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 pb-16 max-w-4xl mx-auto w-full">

          {/* Solar & Battery ROI - Amber/gold */}
          <button
            type="button"
            onClick={onSelectSolarBattery}
            className="landing-card group text-left rounded-3xl p-8 md:p-10 flex flex-col cursor-pointer"
            style={{ backgroundColor: '#FEF3C7', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-8 transition-transform duration-200 group-hover:scale-105"
              style={{ backgroundColor: '#92400E' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#FEF3C7" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </div>

            <h3 className="text-xl md:text-2xl font-semibold mb-3 tracking-tight" style={{ color: '#92400E' }}>
              Solar &amp; Battery ROI
            </h3>
            <p className="text-base leading-relaxed flex-grow" style={{ color: '#A16207' }}>
              See exactly how solar and batteries will perform on your farm or business. Our engine runs year-round, half-hourly simulations using your real-world data to find your ideal setup.
            </p>

            <div
              className="mt-8 flex items-center gap-2 text-base font-semibold group-hover:gap-3 transition-all duration-200"
              style={{ color: '#92400E' }}
            >
              Get started
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </button>

          {/* Tariff Comparer - Pastel blue */}
          <button
            type="button"
            onClick={onSelectTariff}
            className="landing-card group text-left rounded-3xl p-8 md:p-10 flex flex-col cursor-pointer"
            style={{ backgroundColor: '#DBEAFE', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
          >
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-8 transition-transform duration-200 group-hover:scale-105"
              style={{ backgroundColor: '#1E3A8A' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="#DBEAFE" className="w-6 h-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
              </svg>
            </div>

            <h3 className="text-xl md:text-2xl font-semibold mb-3 tracking-tight" style={{ color: '#1E3A8A' }}>
              Electricity Tariff Comparer
            </h3>
            <p className="text-base leading-relaxed flex-grow" style={{ color: '#1E40AF' }}>
              Upload your ESB Networks usage file and see every Irish electricity tariff ranked by estimated annual bill, applied to your actual usage.
            </p>

            <div
              className="mt-8 flex items-center gap-2 text-base font-semibold group-hover:gap-3 transition-all duration-200"
              style={{ color: '#1E3A8A' }}
            >
              Get started
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
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

