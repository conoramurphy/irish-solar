import type { BuildingTypeSelection } from '../../types';
import { usePostHog } from '@posthog/react';

interface Step0BuildingTypeProps {
  onNext: (data: { buildingType: BuildingTypeSelection }) => void;
  currentSelection?: BuildingTypeSelection | null;
}

export function Step0BuildingType({ onNext, currentSelection }: Step0BuildingTypeProps) {
  const posthog = usePostHog();
  const buildingTypes: Array<{
    id: BuildingTypeSelection;
    title: string;
    description: string;
    icon: React.ReactNode;
    enabled: boolean;
  }> = [
    {
      id: 'hotel-year-round',
      title: 'Hotel / Business',
      description: 'Year-round commercial operation. Uses commercial tariffs, business-specific consumption curves, and SEAI non-domestic grant eligibility.',
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
      description: 'Agricultural operation. Upload your ESB Networks file for an exact load profile based on your actual milking and water heating schedules. TAMS 3 SCIS and SEAI Non-Domestic Microgen grant eligibility.',
      enabled: true,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12 12 2.25 21.75 12M4.5 9.75V19.5c0 .621.504 1.125 1.125 1.125h4.125V15h4.5v5.625h4.125c.621 0 1.125-.504 1.125-1.125V9.75" />
        </svg>
      )
    },
  ];

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg border" style={{ background: '#ECFDF5', borderColor: 'rgba(30,138,94,0.2)', color: '#145735' }}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          </span>
          Who is this analysis for?
        </h2>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed max-w-2xl">
          The model adapts its consumption curves, tariff structure, and grant eligibility to match your building type.
        </p>
      </div>

      {/* Building Type Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {buildingTypes.map((type) => {
          const isSelected = currentSelection === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => {
                if (!type.enabled) return;
                posthog?.capture('building_type_selected', { building_type: type.id });
                onNext({ buildingType: type.id });
              }}
              disabled={!type.enabled}
              className={`relative group rounded-[24px] border p-8 text-left transition-all duration-300 flex flex-col ${
                type.enabled
                  ? isSelected
                    ? 'bg-white cursor-pointer shadow-[0_8px_30px_rgba(30,138,94,0.12)]'
                    : 'border-slate-200/80 bg-white hover:shadow-[0_8px_30px_rgba(30,138,94,0.07)] hover:-translate-y-0.5 cursor-pointer'
                  : 'border-slate-100 bg-slate-50/50 cursor-not-allowed'
              }`}
              style={
                type.enabled && isSelected
                  ? { border: '2px solid #1E8A5E', outline: '2px solid #1E8A5E', outlineOffset: '2px' }
                  : type.enabled
                  ? { border: '1px solid rgba(203,213,225,0.8)' }
                  : {}
              }
            >
              {/* Coming Soon / Selected Badge */}
              {!type.enabled ? (
                <div className="absolute top-6 right-6 bg-white border border-slate-200/60 text-slate-400 text-[10px] uppercase font-bold px-3 py-1.5 rounded-full tracking-wider shadow-sm">
                  Coming soon
                </div>
              ) : isSelected ? (
                <div className="absolute top-6 right-6 text-white text-[10px] uppercase font-bold px-3 py-1.5 rounded-full tracking-wider shadow-sm flex items-center gap-1" style={{ background: '#1E8A5E' }}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                  Selected
                </div>
              ) : null}

              {/* Icon */}
              <div
                className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-8 transition-transform duration-300 ${
                  type.enabled ? 'group-hover:scale-105' : 'bg-slate-100 text-slate-400'
                } ${!type.enabled ? '' : ''}`}
                style={
                  type.enabled
                    ? isSelected
                      ? { background: '#1E8A5E', color: '#D97706', transform: 'scale(1.05)' }
                      : { background: '#ECFDF5', color: '#145735' }
                    : {}
                }
              >
                {type.icon}
              </div>

              {/* Content */}
              <h3
                className={`text-xl font-semibold mb-3 transition-colors tracking-tight ${
                  type.enabled ? isSelected ? '' : 'text-slate-900' : 'text-slate-400'
                }`}
                style={type.enabled && isSelected ? { color: '#1E8A5E' } : {}}
              >
                {type.title}
              </h3>
              <p className={`text-sm leading-relaxed flex-grow ${type.enabled ? isSelected ? 'text-slate-600' : 'text-slate-500' : 'text-slate-400/80'}`}>
                {type.description}
              </p>

              {/* CTA for enabled cards */}
              {type.enabled && !isSelected && (
                <div className="mt-8 flex items-center gap-2 font-medium text-sm group-hover:gap-3 transition-all duration-300" style={{ color: '#145735' }}>
                  Get started
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              )}
              {type.enabled && isSelected && (
                <div className="mt-8 flex items-center gap-2 font-medium text-sm" style={{ color: '#1E8A5E' }}>
                  Adjusting this profile
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}

export default Step0BuildingType;
