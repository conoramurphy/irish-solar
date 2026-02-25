interface ModeSelectProps {
  onSelectSolarBattery: () => void;
  onSelectTariff: () => void;
}

export function ModeSelect({ onSelectSolarBattery, onSelectTariff }: ModeSelectProps) {
  return (
    <section className="max-w-5xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-tines-dark">Choose a modeller</h2>
        <p className="mt-2 text-slate-600">Pick what you want to analyse. You can switch modes later.</p>
      </div>

      <div className="space-y-6">
        {/* Solar & Battery (primary) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h3 className="text-2xl font-serif font-bold text-tines-dark">Solar & Battery Modeller</h3>
              <p className="mt-2 text-slate-600">
                Full ROI modelling: consumption profile, solar timeseries, battery dispatch, grants, finance, and an audit-friendly report.
              </p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={onSelectSolarBattery}
                className="px-6 py-3 bg-tines-purple text-white font-medium rounded-lg shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 transition-colors"
              >
                Start Solar & Battery
              </button>
            </div>
          </div>
        </div>

        {/* Tariff */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <h3 className="text-2xl font-serif font-bold text-tines-dark">Tariff Modeller</h3>
              <p className="mt-2 text-slate-600">
                Upload your ESB Networks usage file and rank domestic tariffs by estimated annual bill (usage-only).
              </p>
            </div>
            <div className="shrink-0">
              <button
                type="button"
                onClick={onSelectTariff}
                className="px-6 py-3 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Start Tariff Modeller
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
