import type { BuildingTypeSelection } from '../../types';

interface Step0BuildingTypeProps {
  onNext: (data: { buildingType: BuildingTypeSelection }) => void;
}

export function Step0BuildingType({ onNext }: Step0BuildingTypeProps) {
  const buildingTypes: Array<{
    id: BuildingTypeSelection;
    title: string;
    description: string;
    icon: React.ReactNode;
    enabled: boolean;
  }> = [
    {
      id: 'hotel-year-round',
      title: 'Hotel',
      description: 'Year-round commercial operation. Uses commercial tariffs, hotel-specific consumption curves, and SEAI non-domestic grant eligibility.',
      enabled: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819" />
        </svg>
      )
    },
    {
      id: 'house',
      title: 'House',
      description: 'Residential home. Upload your ESB Networks file for an exact hourly profile, or use a standard domestic consumption curve with your chosen tariff.',
      enabled: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      )
    },
    {
      id: 'farm',
      title: 'Farm',
      description: 'Agricultural operation with daytime-heavy and seasonal demand patterns.',
      // TODO [farm-mode]: To enable, wire up: farm-specific tariff selection in Step1,
      // farm grants in src/data/grants.json, and validate Step3 battery + Step4 finance paths.
      // Engine support exists (daily consumption curve in hourlyConsumption.ts).
      enabled: false,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12 12 2.25 21.75 12M4.5 9.75V19.5c0 .621.504 1.125 1.125 1.125h4.125V15h4.5v5.625h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
        </svg>
      )
    },
    {
      id: 'hotel-seasonal',
      title: 'Seasonal hotel',
      description: 'Hotel operating during peak season only, with extended periods of near-zero demand.',
      enabled: false,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      )
    }
  ];

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="text-center mb-14">
        <h2 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 tracking-tight">
          Who is this analysis for?
        </h2>
        <p className="mt-4 text-base text-slate-500 max-w-xl mx-auto font-light leading-relaxed">
          The model adapts its consumption curves, tariff structure, and grant eligibility to match your building type.
        </p>
      </div>

      {/* Building Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {buildingTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => type.enabled && onNext({ buildingType: type.id })}
            disabled={!type.enabled}
            className={`relative group rounded-[24px] border p-8 text-left transition-all duration-300 flex flex-col ${
              type.enabled
                ? 'border-slate-200/80 bg-white hover:border-indigo-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:-translate-y-0.5 cursor-pointer'
                : 'border-slate-100 bg-slate-50/50 cursor-not-allowed'
            }`}
          >
            {/* Coming Soon Badge */}
            {!type.enabled && (
              <div className="absolute top-6 right-6 bg-white border border-slate-200/60 text-slate-400 text-[10px] uppercase font-bold px-3 py-1.5 rounded-full tracking-wider shadow-sm">
                Coming soon
              </div>
            )}

            {/* Icon */}
            <div
              className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-8 transition-transform duration-300 ${
                type.enabled
                  ? 'bg-indigo-50 text-indigo-600 group-hover:scale-105'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {type.icon}
            </div>

            {/* Content */}
            <h3
              className={`text-xl font-semibold mb-3 transition-colors tracking-tight ${
                type.enabled ? 'text-slate-900 group-hover:text-indigo-600' : 'text-slate-400'
              }`}
            >
              {type.title}
            </h3>
            <p className={`text-sm leading-relaxed flex-grow ${type.enabled ? 'text-slate-500' : 'text-slate-400/80'}`}>
              {type.description}
            </p>

            {/* CTA for enabled cards */}
            {type.enabled && (
              <div className="mt-8 flex items-center gap-2 text-indigo-600 font-medium text-sm group-hover:gap-3 transition-all duration-300">
                Get started
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Footer note */}
      <div className="mt-12 text-center">
        <p className="text-sm text-slate-400">
          Farm and seasonal hotel modes are in development.
        </p>
      </div>
    </div>
  );
}

export default Step0BuildingType;
