interface HeroProps {
  compact?: boolean;
  rightContent?: React.ReactNode;
}

export function Hero({ compact = false, rightContent }: HeroProps) {
  if (compact) {
    return (
      <header className="relative z-30 bg-slate-950 text-white border-b border-indigo-900/50">
        <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-serif font-bold tracking-tight">
              Solar, Battery & Tariff <span className="text-indigo-300">Modeller</span>
            </h1>
          </div>
          {rightContent && <div>{rightContent}</div>}
        </div>
      </header>
    );
  }

  return (
    <header className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="py-12 md:py-20">
          <div className="flex flex-col items-center text-center gap-3">
            <h1 className="text-3xl md:text-5xl font-serif font-bold tracking-tight">
              Solar, Battery & Tariff <span className="text-indigo-300">Modeller</span>
            </h1>
            <p className="mt-2 text-base md:text-lg text-indigo-100/70 max-w-3xl font-light">
              Hourly, audit-friendly energy modelling (ROI + tariff comparison).
            </p>
          </div>
        </div>
      </div>

      {/* subtle highlight */}
      <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: 'radial-gradient(circle at top, rgba(99,102,241,0.25), transparent 60%)' }} />
    </header>
  );
}
