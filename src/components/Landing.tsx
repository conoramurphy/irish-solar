import React from 'react';

interface LandingProps {
  onSelectSolarBattery: () => void;
  onSelectTariff: () => void;
}

// Deep, rich editorial green
const BG = '#0A2518';

// Subtle grid overlay
const GRID_BG = {
  backgroundImage: [
    'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '48px 48px',
};

export { BG as LANDING_BG };

export function Landing({ onSelectSolarBattery, onSelectTariff }: LandingProps) {
  return (
    <div className="min-h-screen flex flex-col relative" style={{ backgroundColor: BG }}>
      {/* Line grid overlay */}
      <div className="pointer-events-none absolute inset-0" style={GRID_BG} />
      
      {/* Subtle radial glow to give depth */}
      <div 
        className="pointer-events-none absolute inset-0 opacity-40" 
        style={{ background: 'radial-gradient(circle at 50% 0%, rgba(116, 198, 157, 0.15) 0%, transparent 70%)' }} 
      />

      <div className="relative z-10 flex flex-col flex-1 w-full max-w-6xl mx-auto px-6 md:px-12">
        
        {/* ── Brand strip ── */}
        <header className="flex items-center justify-between pt-8 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-white tracking-[0.2em] uppercase">
              Watt <span className="text-emerald-400">Profit</span>
            </span>
          </div>
          <span className="hidden md:block text-xs font-medium text-white/40 tracking-widest uppercase">
            36 Irish locations · 2020–25
          </span>
        </header>

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col justify-center py-12 md:py-20">
          
          {/* Headline (Left-aligned, editorial) */}
          <div className="max-w-3xl mb-12 md:mb-16">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-serif font-bold text-white leading-[1.05] tracking-tight">
              Make the perfect<br />
              energy choice.
            </h1>
            <p className="mt-6 text-lg md:text-xl font-light text-white/70 leading-relaxed max-w-2xl">
              Model your exact half-hourly consumption to size the perfect solar system, or compare every Irish electricity tariff against your actual usage.
            </p>
          </div>

          {/* ── Mode buttons (Glassmorphism / Dark UI) ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl w-full">
            
            {/* Solar & Battery ROI */}
            <button
              type="button"
              onClick={onSelectSolarBattery}
              className="group relative flex flex-col items-start gap-6 rounded-3xl p-8 text-left transition-all duration-300 hover:-translate-y-1 bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 backdrop-blur-sm"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-amber-500/10 text-amber-400 border border-amber-500/20 transition-transform duration-300 group-hover:scale-110">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white tracking-tight mb-2">Solar &amp; Battery ROI</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Size your system on real Irish irradiance data with SEAI grants.
                </p>
              </div>
              <div className="mt-auto pt-2 flex items-center gap-2 text-sm font-medium text-amber-400 group-hover:gap-3 transition-all duration-300">
                Get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </button>

            {/* Tariff Comparer */}
            <button
              type="button"
              onClick={onSelectTariff}
              className="group relative flex flex-col items-start gap-6 rounded-3xl p-8 text-left transition-all duration-300 hover:-translate-y-1 bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 backdrop-blur-sm"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-blue-500/10 text-blue-400 border border-blue-500/20 transition-transform duration-300 group-hover:scale-110">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white tracking-tight mb-2">Electricity Tariff Comparer</h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  Upload your ESB Networks usage file and see every Irish electricity tariff ranked by estimated annual bill.
                </p>
              </div>
              <div className="mt-auto pt-2 flex items-center gap-2 text-sm font-medium text-blue-400 group-hover:gap-3 transition-all duration-300">
                Get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
            </button>

          </div>

          {/* ── Context / "Why this matters" (Moved below the fold) ── */}
          <div className="mt-16 md:mt-24 pt-10 border-t border-white/10 max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
            <div>
              <h4 className="text-white font-medium mb-3 tracking-tight">The most profitable moment</h4>
              <p className="text-sm text-white/50 leading-relaxed">
                With current SEAI grants, rising energy prices, and declining export tariffs set to continue over the next decade, there has never been a better time to switch to solar and batteries.
              </p>
            </div>
            <div>
              <h4 className="text-white font-medium mb-3 tracking-tight">No more mis-sized systems</h4>
              <p className="text-sm text-white/50 leading-relaxed">
                The country is littered with mis-sized systems — too small, too many batteries, or simply never matched to how a building actually uses energy. We model your exact half-hour-by-half-hour consumption profile so your system is sized precisely for you.
              </p>
            </div>
          </div>

        </main>

        {/* Footer / Mobile data badge */}
        <footer className="py-8 flex flex-col md:flex-row items-center justify-between gap-4 border-t border-white/10">
          <div className="text-xs text-white/30 text-center md:text-left">
            MVP calculator — assumptions are simplified (especially self-consumption and trading).
          </div>
          <div className="md:hidden text-center">
            <span className="text-xs font-medium text-white/30 tracking-widest uppercase">
              36 Irish locations · 2020–25
            </span>
          </div>
        </footer>

      </div>
    </div>
  );
}
