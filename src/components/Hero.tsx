export function Hero() {
  return (
    <header className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6">
        <div className="py-8 md:py-9">
          <div className="flex flex-col items-center text-center gap-2">
            <h1 className="text-2xl md:text-3xl font-serif font-bold tracking-tight">
              Solar & Battery <span className="text-indigo-200">ROI Calculator</span>
            </h1>
            <p className="text-sm md:text-base text-indigo-100/80 max-w-3xl">
              Hourly, audit-friendly ROI modelling for Irish SMEs.
            </p>
          </div>
        </div>
      </div>

      {/* subtle highlight */}
      <div className="pointer-events-none absolute inset-0 opacity-25" style={{ background: 'radial-gradient(circle at top, rgba(99,102,241,0.35), transparent 55%)' }} />
    </header>
  );
}
