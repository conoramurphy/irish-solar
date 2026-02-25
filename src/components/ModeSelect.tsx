interface ModeSelectProps {
  onSelectSolarBattery: () => void;
  onSelectTariff: () => void;
}

export function ModeSelect({ onSelectSolarBattery, onSelectTariff }: ModeSelectProps) {
  const tools: Array<{
    title: string;
    description: string;
    onClick: () => void;
    icon: React.ReactNode;
  }> = [
    {
      title: 'Solar & Battery ROI',
      description:
        'Model the return on investment for solar panels and battery storage. Built on real Irish solar irradiance data, hourly dispatch simulation, your consumption profile, and available SEAI grants.',
      onClick: onSelectSolarBattery,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      ),
    },
    {
      title: 'Electricity Tariff Comparer',
      description:
        'Upload your ESB Networks usage file and see every Irish domestic electricity tariff ranked by estimated annual bill — applied to your actual hourly consumption.',
      onClick: onSelectTariff,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
        </svg>
      ),
    },
  ];

  return (
    <section className="max-w-4xl mx-auto py-8">
      <div className="text-center mb-14">
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 tracking-tight">
          What would you like to model?
        </h2>
        <p className="mt-4 text-base text-slate-500 max-w-xl mx-auto font-light leading-relaxed">
          Two independent tools, each built for a different question. Pick one to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {tools.map((tool) => (
          <button
            key={tool.title}
            type="button"
            onClick={tool.onClick}
            className="group relative rounded-[24px] border border-slate-200/80 bg-white p-8 text-left transition-all duration-300 hover:border-indigo-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-0.5 cursor-pointer flex flex-col"
          >
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-8 bg-indigo-50 text-indigo-600 group-hover:scale-105 transition-transform duration-300">
              {tool.icon}
            </div>

            {/* Content */}
            <h3 className="text-xl font-semibold text-slate-900 group-hover:text-indigo-600 mb-3 transition-colors tracking-tight">
              {tool.title}
            </h3>
            <p className="text-sm text-slate-500 leading-relaxed flex-grow">
              {tool.description}
            </p>

            {/* CTA */}
            <div className="mt-8 flex items-center gap-2 text-indigo-600 font-medium text-sm group-hover:gap-3 transition-all duration-300">
              Get started
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
