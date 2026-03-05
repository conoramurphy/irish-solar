import React from 'react';

interface HeroProps {
  compact?: boolean;
  rightContent?: React.ReactNode;
}

const stats = [
  { value: '36', label: 'Irish locations' },
  { value: '17,520', label: 'Slots per year' },
  { value: '2020–25', label: 'Solar data range' },
];

export function Hero({ compact = false, rightContent }: HeroProps) {
  if (compact) {
    return (
      <header className="relative z-30 border-b border-[#0D4027]/15" style={{ background: '#74C69D' }}>
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* Sun icon */}
            <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: '#D97706' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </div>
            <h1 className="text-sm font-serif font-bold tracking-tight" style={{ color: '#0D4027' }}>
              Solar & Battery <span style={{ color: '#B45309' }}>Modeller</span>
            </h1>
          </div>
          {rightContent && <div>{rightContent}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className="relative overflow-hidden dot-grid-bg" style={{ background: 'linear-gradient(135deg, #0D4027 0%, #1A6644 55%, #1E8A5E 100%)' }}>
      {/* Subtle radial glow from top */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(217,119,6,0.18), transparent 70%)' }}
      />

      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="pt-16 pb-12 md:pt-24 md:pb-16">
          {/* Eyebrow */}
          <div className="flex justify-center mb-6">
            <span
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-4 py-1.5 rounded-full border"
              style={{ color: '#D97706', borderColor: 'rgba(217,119,6,0.35)', background: 'rgba(217,119,6,0.08)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block animate-pulse" />
              Irish Solar Intelligence
            </span>
          </div>

          {/* Headline */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-6xl font-serif font-bold text-white leading-tight tracking-tight">
              Solar, Battery &{' '}
              <span style={{ color: '#D97706' }}>Tariff Modeller</span>
            </h1>
            <p className="mt-5 text-base md:text-lg max-w-2xl mx-auto font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Hourly dispatch simulation on real Irish irradiance data. ROI, payback, and tariff comparison — built for hotels, farms, and homes.
            </p>
          </div>

          {/* Tines-style stat bento strip */}
          <div className="flex justify-center gap-3 md:gap-4 flex-wrap mt-10">
            {stats.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center px-6 py-4 rounded-2xl min-w-[110px]"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
              >
                <span className="text-2xl md:text-3xl font-serif font-bold" style={{ color: '#D97706' }}>
                  {s.value}
                </span>
                <span className="text-xs mt-1 font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
