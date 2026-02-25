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
      title: 'Hotel (open all year round)',
      description: 'Operating 365 days with consistent energy patterns',
      enabled: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205 3 1m1.5.5-1.5-.5M6.75 7.364V3h-3v18m3-13.636 10.5-3.819" />
        </svg>
      )
    },
    {
      id: 'house',
      title: 'House',
      description: 'Residential property with family living patterns',
      enabled: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
        </svg>
      )
    },
    {
      id: 'farm',
      title: 'Farm',
      description: 'Agricultural operation with seasonal patterns',
      // TODO [farm-mode]: To enable, wire up: farm-specific tariff selection in Step1,
      // farm grants in src/data/grants.json, and validate Step3 battery + Step4 finance paths.
      // Engine support exists (daily consumption curve in hourlyConsumption.ts).
      enabled: false,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5 10.5 6.75m6.75 10.5L24 10.5m-7.5-3.75L10.5 13.5m-6.75 3L10.5 24m0-17.25v10.5m6.75-3.75-6.75 6.75M3 9.75V6a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 6v3.75M3 13.5h18" />
        </svg>
      )
    },
    {
      id: 'hotel-seasonal',
      title: 'Seasonal hotel',
      description: 'Open during peak season with variable demand',
      enabled: false,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 flex items-center justify-center py-12 px-6">
      <div className="max-w-6xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-tines-dark mb-4">
            We're building this for...
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Select your building type to get started with a tailored energy analysis
          </p>
        </div>

        {/* Building Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {buildingTypes.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => type.enabled && onNext({ buildingType: type.id })}
              disabled={!type.enabled}
              className={`relative group rounded-2xl border-2 p-8 text-left transition-all duration-200 ${
                type.enabled
                  ? 'border-slate-200 bg-white hover:border-tines-purple hover:shadow-xl hover:-translate-y-1 cursor-pointer'
                  : 'border-slate-100 bg-slate-50 cursor-not-allowed opacity-60'
              }`}
            >
              {/* Coming Soon Badge */}
              {!type.enabled && (
                <div className="absolute top-4 right-4 bg-slate-200 text-slate-600 text-xs font-semibold px-3 py-1 rounded-full">
                  Coming soon
                </div>
              )}

              {/* Icon */}
              <div
                className={`inline-flex items-center justify-center w-20 h-20 rounded-xl mb-6 transition-all ${
                  type.enabled
                    ? 'bg-gradient-to-br from-tines-purple to-indigo-600 text-white group-hover:scale-110'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                {type.icon}
              </div>

              {/* Content */}
              <h3
                className={`text-2xl font-serif font-bold mb-2 ${
                  type.enabled ? 'text-tines-dark group-hover:text-tines-purple' : 'text-slate-500'
                }`}
              >
                {type.title}
              </h3>
              <p className={`text-sm ${type.enabled ? 'text-slate-600' : 'text-slate-400'}`}>
                {type.description}
              </p>

              {/* Arrow indicator for enabled cards */}
              {type.enabled && (
                <div className="mt-6 flex items-center gap-2 text-tines-purple font-medium text-sm group-hover:gap-3 transition-all">
                  Get started
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-12 text-center">
          <p className="text-sm text-slate-500">
            More building types coming soon. Currently optimized for hotels operating year-round.
          </p>
        </div>
      </div>
    </div>
  );
}

export default Step0BuildingType;
