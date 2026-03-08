interface ModeSelectProps {
  onSelectSolarBattery: () => void;
  onSelectTariff: () => void;
}

export function ModeSelect({ onSelectSolarBattery, onSelectTariff }: ModeSelectProps) {
  return (
    <section className="max-w-3xl mx-auto py-8">
      <p className="text-center text-sm font-medium mb-5 tracking-wide uppercase" style={{ color: '#6B7280' }}>
        Choose a tool to get started
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Button 1 — Solar & Battery ROI */}
        <button
          type="button"
          onClick={onSelectSolarBattery}
          className="group flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(180,83,9,0.16)]"
          style={{ background: '#FEF3C7', border: '1px solid rgba(180,83,9,0.18)' }}
        >
          <div
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-transform duration-200 group-hover:scale-105"
            style={{ background: '#92400E', color: '#FEF3C7' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
            </svg>
          </div>
          <div className="flex-grow min-w-0">
            <div className="font-semibold text-sm tracking-tight" style={{ color: '#92400E' }}>Solar & Battery ROI</div>
            <div className="text-xs mt-0.5 leading-snug" style={{ color: '#A16207' }}>Size your system on real Irish irradiance data with SEAI grants</div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" style={{ color: '#92400E' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>

        {/* Button 2 — Tariff Comparer */}
        <button
          type="button"
          onClick={onSelectTariff}
          className="group flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-all duration-200 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(30,58,138,0.14)]"
          style={{ background: '#DBEAFE', border: '1px solid rgba(30,58,138,0.15)' }}
        >
          <div
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl transition-transform duration-200 group-hover:scale-105"
            style={{ background: '#1E3A8A', color: '#DBEAFE' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
          </div>
          <div className="flex-grow min-w-0">
            <div className="font-semibold text-sm tracking-tight" style={{ color: '#1E3A8A' }}>Electricity Tariff Comparer</div>
            <div className="text-xs mt-0.5 leading-snug" style={{ color: '#1E40AF' }}>Rank every Irish tariff against your actual hourly usage</div>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 shrink-0 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" style={{ color: '#1E3A8A' }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>

      </div>
    </section>
  );
}
