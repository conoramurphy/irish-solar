import { useState, useMemo, useRef, useEffect } from 'react';
import { logInfo, logError } from '../../utils/logger';
import { Field } from '../Field';
import { MONTH_LABELS } from '../../utils/consumption';
import { curveConsumption, calculateMonthlyBill } from '../../utils/billingCalculations';
import type { ExampleMonth, TariffConfiguration, TariffSlot } from '../../types/billing';
import type { BusinessType, Tariff, UploadSummary } from '../../types';
import { parseEsbUsageProfile } from '../../utils/usageProfileParser';
import { DomesticTariffSelector } from '../DomesticTariffSelector';
import { BusinessTariffSelector } from '../BusinessTariffSelector';
import { SampleHouseSelector } from '../SampleHouseSelector';
import { domesticTariffs } from '../../utils/domesticTariffParser';
import { DAYS_PER_MONTH_LEAP, DAYS_PER_MONTH_NON_LEAP, HOURS_PER_YEAR_LEAP } from '../../constants/calendar';
import { getKnownLocations } from '../../utils/solarLocationDiscovery';

interface Step1DigitalTwinProps {
  businessType: BusinessType;
  onNext: (data: {
    location: string;
    exampleMonths: ExampleMonth[];
    curvedMonthlyKwh: number[];
    tariffConfig: TariffConfiguration | null;
    hourlyConsumptionOverride?: number[];
    selectedDomesticTariff?: Tariff;
    uploadSummary?: UploadSummary;
  }) => void;
  onBack?: () => void;
  initialLocation?: string;
  initialExampleMonths?: ExampleMonth[];
  initialTariffConfig?: TariffConfiguration | null;
  initialSelectedDomesticTariff?: Tariff;
  initialUploadSummary?: UploadSummary;
}

const MONTHS = MONTH_LABELS.map((name, index) => ({ index, name }));

export function Step1DigitalTwin({
  businessType,
  onNext,
  initialLocation,
  initialExampleMonths,
  initialTariffConfig,
  initialSelectedDomesticTariff,
  initialUploadSummary
}: Step1DigitalTwinProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";
  const selectClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  // Available locations (data-driven from solar data files)
  const [availableLocations, setAvailableLocations] = useState<string[]>(getKnownLocations());
  
  // Discover available locations on mount
  useEffect(() => {
    // For now, we use the synchronous fallback. In the future, this could be enhanced
    // to fetch a manifest.json or query an API for available locations.
    const locations = getKnownLocations();
    setAvailableLocations(locations);
  }, []);

  // Location
  const [location, setLocation] = useState<string>(initialLocation ?? '');

  // --- HOUSE MODE STATE ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sampleLoading, setSampleLoading] = useState<string | null>(null);
  const [activeHouseId, setActiveHouseId] = useState<string | null>(null);
  const [parsedProfile, setParsedProfile] = useState<{
    hourly?: number[];
    year: number;
    totalKwh: number;
    warnings: string[];
    filename?: string;
  } | null>(initialUploadSummary ? {
    year: initialUploadSummary.year,
    totalKwh: initialUploadSummary.totalKwh,
    warnings: [],
    filename: initialUploadSummary.filename
  } : null);
  // Default to Electric Ireland Home Electric+ for domestic
  const [selectedDomesticTariff, setSelectedDomesticTariff] = useState<Tariff | null>(
    initialSelectedDomesticTariff || domesticTariffs.find(t => t.id === 'electric-ireland-home-electric-smart') || domesticTariffs[0] || null
  );

  // --- BUSINESS MODE STATE ---
  const [selectedBusinessTariff, setSelectedBusinessTariff] = useState<Tariff | null>(
    businessType !== 'house' ? (initialSelectedDomesticTariff || null) : null
  );

  // Example months (default: January and July, initially empty)
  const [exampleMonths, setExampleMonths] = useState<ExampleMonth[]>(
    (initialExampleMonths && initialExampleMonths.length > 0) ? initialExampleMonths : [
      { monthIndex: 0, monthName: 'January', totalKwh: 0, totalBillEur: 0, tariffSlotUsage: {} },
      { monthIndex: 6, monthName: 'July', totalKwh: 0, totalBillEur: 0, tariffSlotUsage: {} }
    ]
  );

  // Tariff configuration
  const [tariffType, setTariffType] = useState<'preset' | 'custom'>(initialTariffConfig?.type ?? 'preset');
  const [customSlots, setCustomSlots] = useState<TariffSlot[]>(initialTariffConfig?.customSlots ?? []);
  const [standingCharge, setStandingCharge] = useState<number>(initialTariffConfig?.standingChargePerDay ?? 0.9);

  // Curved consumption
  const curvedMonthlyKwh = useMemo(() => curveConsumption(exampleMonths), [exampleMonths]);

  // Build tariff config
  const tariffConfig: TariffConfiguration | null = useMemo(() => {
    if (businessType === 'house') return null;
    if (tariffType === 'preset') {
      return { type: 'preset' };
    }
    return { type: 'custom', customSlots, standingChargePerDay: standingCharge };
  }, [businessType, tariffType, customSlots, standingCharge]);
  
  const updateExampleMonth = (index: number, updates: Partial<ExampleMonth>) => {
    setExampleMonths(prev => prev.map((m, i) => i === index ? { ...m, ...updates } : m));
  };

  const addTariffSlot = () => {
    const newSlot: TariffSlot = {
      id: `slot-${Date.now()}`,
      name: `Time Slot ${customSlots.length + 1}`,
      startHour: 0,
      endHour: 23,
      ratePerKwh: 0.20
    };
    setCustomSlots([...customSlots, newSlot]);
  };

  const updateTariffSlot = (id: string, updates: Partial<TariffSlot>) => {
    setCustomSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeTariffSlot = (id: string) => {
    // 1. Remove the slot definition
    const newSlots = customSlots.filter(s => s.id !== id);
    setCustomSlots(newSlots);

    // 2. Remove usage from months and recalculate totals
    const newMonths = exampleMonths.map(m => {
      const newUsage = Object.fromEntries(
        Object.entries(m.tariffSlotUsage).filter(([slotId]) => slotId !== id)
      );
      
      // Recalculate totalKwh based on remaining slots
      const newTotal = newSlots.reduce((sum, slot) => {
        return sum + (newUsage[slot.id] || 0);
      }, 0);

      return {
        ...m,
        tariffSlotUsage: newUsage,
        totalKwh: newTotal
      };
    });
    setExampleMonths(newMonths);
  };

  const updateSlotUsage = (monthIndex: number, slotId: string, kwhValue: number) => {
    setExampleMonths(prev => prev.map(m => {
      if (m.monthIndex !== monthIndex) return m;
      
      const newUsage = { ...m.tariffSlotUsage, [slotId]: kwhValue };
      
      // Auto-update totalKwh when slot usage changes
      const newTotal = customSlots.reduce((sum, slot) => {
        return sum + (newUsage[slot.id] || 0);
      }, 0);

      return { 
        ...m, 
        tariffSlotUsage: newUsage,
        totalKwh: newTotal 
      };
    }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setParsedProfile(null);
    setActiveHouseId(null);

    try {
      const text = await file.text();
      const result = parseEsbUsageProfile(text);
      
      setParsedProfile({
        hourly: result.hourlyConsumption,
        year: result.year,
        totalKwh: result.totalKwh,
        warnings: result.warnings,
        filename: file.name
      });
      
      logInfo('ui', 'Usage profile uploaded', { year: result.year, totalKwh: result.totalKwh });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to parse file';
      setUploadError(msg);
      logError('ui', 'File upload failed', { error: msg });
    }
  };

  const loadSampleProfile = async (url: string, label: string) => {
    setSampleLoading(label);
    setUploadError(null);
    setParsedProfile(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Could not load sample (${response.status})`);
      const text = await response.text();
      const result = parseEsbUsageProfile(text);
      setParsedProfile({
        hourly: result.hourlyConsumption,
        year: result.year,
        totalKwh: result.totalKwh,
        warnings: result.warnings,
        filename: label,
      });
      logInfo('ui', 'Sample profile loaded', { label, year: result.year, totalKwh: result.totalKwh });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sample';
      setUploadError(msg);
      logError('ui', 'Sample profile load failed', { label, error: msg });
    } finally {
      setSampleLoading(null);
    }
  };

  const handleContinue = () => {
    // Branch A: Domestic / Real Usage
    if (businessType === 'house') {
      if (!parsedProfile) return;

      // Use either the newly parsed hourly data or the one passed in via props (if we just remounted)
      const hourlyData = parsedProfile.hourly || initialUploadSummary ? initialUploadSummary.filename === parsedProfile.filename ? undefined : undefined : undefined;
      // Wait, that logic is messy. Let's simplify.
      // If parsedProfile.hourly is missing, it means we restored from initialUploadSummary.
      // In that case, App.tsx already has the hourlyConsumptionOverride.
      
      // Create a monthly profile from the real hourly data for display in sidebar
      let monthlyKwh = new Array(12).fill(0);
      
      if (parsedProfile.hourly) {
        const isLeapYear = parsedProfile.hourly.length === HOURS_PER_YEAR_LEAP;
        const daysInMonth = isLeapYear ? DAYS_PER_MONTH_LEAP : DAYS_PER_MONTH_NON_LEAP;
        
        let hIdx = 0;
        for (let m = 0; m < 12; m++) {
          const hours = daysInMonth[m] * 24;
          for (let h = 0; h < hours; h++) {
            if (hIdx < parsedProfile.hourly.length) {
              monthlyKwh[m] += parsedProfile.hourly[hIdx++];
            }
          }
        }
      } else {
        // If we don't have hourly in local state, we must be restoring.
        // The App will keep its existing curvedMonthlyKwh.
        // We'll pass back what we have.
      }

      onNext({
        location,
        exampleMonths: [], // Not used for house mode
        curvedMonthlyKwh: parsedProfile.hourly ? monthlyKwh : [], // Only update if we have new data
        tariffConfig: null, // House mode uses selectedDomesticTariff directly, not tariffConfig
        hourlyConsumptionOverride: parsedProfile.hourly,
        selectedDomesticTariff: selectedDomesticTariff || undefined,
        uploadSummary: parsedProfile.filename ? {
          filename: parsedProfile.filename,
          year: parsedProfile.year,
          totalKwh: parsedProfile.totalKwh,
          slotsPerDay: 24 // ESB files are hourly for now
        } : undefined
      });
      return;
    }

    // Branch C: Commercial / Farm
    if (businessType !== 'house') {
      if (tariffType === 'preset') {
        if (!parsedProfile || !selectedBusinessTariff) return;

        let monthlyKwh = new Array(12).fill(0);

        if (parsedProfile.hourly) {
          const isLeapYear = parsedProfile.hourly.length === HOURS_PER_YEAR_LEAP;
          const daysInMonth = isLeapYear ? DAYS_PER_MONTH_LEAP : DAYS_PER_MONTH_NON_LEAP;

          let hIdx = 0;
          for (let m = 0; m < 12; m++) {
            const slotsPerDay = parsedProfile.hourly.length > 8784 ? 48 : 24;
            const slots = daysInMonth[m] * slotsPerDay;
            for (let h = 0; h < slots; h++) {
              if (hIdx < parsedProfile.hourly.length) {
                monthlyKwh[m] += parsedProfile.hourly[hIdx++];
              }
            }
          }
        }

        onNext({
          location,
          exampleMonths: [],
          curvedMonthlyKwh: parsedProfile.hourly ? monthlyKwh : [],
          tariffConfig: { type: 'preset' },
          hourlyConsumptionOverride: parsedProfile.hourly,
          selectedDomesticTariff: selectedBusinessTariff,
          uploadSummary: parsedProfile.filename ? {
            filename: parsedProfile.filename,
            year: parsedProfile.year,
            totalKwh: parsedProfile.totalKwh,
            slotsPerDay: parsedProfile.hourly && parsedProfile.hourly.length > 8784 ? 48 : 24
          } : undefined
        });
        return;
      } else {
        // Custom Builder mode
        const normalizedExampleMonths = exampleMonths.map(month => {
          if (!customSlots.length) {
            return { ...month, tariffSlotUsage: {} }; // Clear usage if not applicable
          }
          
          const totalSlotKwh = customSlots.reduce((sum, slot) => {
            return sum + (month.tariffSlotUsage[slot.id] || 0);
          }, 0);

          const normalizedSlotUsage: Record<string, number> = {};
          for (const slot of customSlots) {
            const kwh = month.tariffSlotUsage[slot.id] || 0;
            normalizedSlotUsage[slot.id] = totalSlotKwh > 0 ? kwh / totalSlotKwh : 0;
          }

          return {
            ...month,
            totalKwh: totalSlotKwh, // Also update the month's total kWh to match the sum of slots
            tariffSlotUsage: normalizedSlotUsage
          };
        });

        logInfo('ui', 'Step 1 (Digital Twin) continue clicked', {
          location,
          exampleMonths: normalizedExampleMonths,
          curvedMonthlyKwhTotal: curvedMonthlyKwh.reduce((a, b) => a + b, 0),
          tariffConfig
        });

        onNext({
          location,
          exampleMonths: normalizedExampleMonths,
          curvedMonthlyKwh,
          tariffConfig
        });
      }
    }
  };

  // Validation depends on mode
  const canContinue = useMemo(() => {
    if (!location) return false;
    
    if (businessType === 'house') {
      return !!parsedProfile && !!selectedDomesticTariff;
    }

    if (tariffType === 'preset') {
      return !!parsedProfile && !!selectedBusinessTariff;
    }

    return (
      exampleMonths.length >= 2 && 
      customSlots.length > 0 && 
      exampleMonths.every(m => m.totalKwh > 0)
    );
  }, [location, businessType, parsedProfile, selectedDomesticTariff, selectedBusinessTariff, exampleMonths, tariffType, customSlots]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Preamble */}
      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
            </svg>
          </span>
          Building Your Digital Twin
        </h2>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed max-w-2xl">
          Let's model your current building's energy profile. We need your <span className="font-medium text-slate-900">location</span> and <span className="font-medium text-slate-900">consumption patterns</span>.
        </p>
      </div>

      {/* Section A: Location */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">Location</h3>

        <Field label="County / Solar Region">
          <select
            className={selectClass}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">Select location...</option>
            {availableLocations.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* Section B: Energy use — separate card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-2">Energy use</h3>
        <p className="text-sm text-slate-500 mb-6">Your electricity consumption (load profile). Upload a meter file or pick a sample so we can model usage over the year.</p>
        
        {businessType === 'house' ? (
          <div>
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-blue-900 mb-2">Upload your usage data</h4>
              <p className="text-sm text-blue-800">
                For accurate domestic analysis, upload your ESB Networks HDF (Historical Data File). This provides your consumption pattern, not tariff rates. Download it from your ESB Networks account.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">ESB Networks CSV (consumption data)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-tines-purple file:text-white
                  hover:file:bg-emerald-700
                "
              />
              {uploadError && (
                <p className="mt-2 text-sm text-rose-600">{uploadError}</p>
              )}
            </div>

            {/* Sample house profiles — shared with Tariff Comparator */}
            <div className="mb-6 pt-4 border-t border-slate-100">
              <SampleHouseSelector
                activeId={activeHouseId}
                onLoad={(result) => {
                  setActiveHouseId(result.houseId);
                  setUploadError(null);
                  setParsedProfile({
                    hourly: result.hourly,
                    year: result.year,
                    totalKwh: result.totalKwh,
                    warnings: result.warnings,
                    filename: result.filename,
                  });
                  logInfo('ui', 'House sample profile loaded', {
                    houseId: result.houseId,
                    year: result.year,
                    totalKwh: result.totalKwh,
                  });
                }}
              />
            </div>

            {parsedProfile && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span className="font-semibold text-emerald-900">
                    {parsedProfile.filename ? parsedProfile.filename : 'Profile loaded'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                  <div>
                    <span className="text-emerald-700 block text-xs uppercase tracking-wide">Year</span>
                    <span className="font-medium text-emerald-900">{parsedProfile.year}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 block text-xs uppercase tracking-wide">Total Consumption</span>
                    <span className="font-medium text-emerald-900">{Math.round(parsedProfile.totalKwh).toLocaleString()} kWh</span>
                  </div>
                </div>
                {parsedProfile.warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-800 mb-1">Notes:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {parsedProfile.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-emerald-700">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Commercial / Farm: Energy use card content */
          <>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 mb-6">
              <h4 className="font-semibold text-emerald-900 mb-2">Upload your usage data</h4>
              <p className="text-sm text-emerald-800">
                Upload your ESB Networks HDF (Historical Data File) for a precise load profile. This is your consumption data, not tariff rates. Download it from your ESB Networks online account.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">ESB Networks CSV (consumption data)</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-slate-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-tines-purple file:text-white
                  hover:file:bg-emerald-700
                "
              />
              {uploadError && (
                <p className="mt-2 text-sm text-rose-600">{uploadError}</p>
              )}
            </div>

            <div className="mb-6">
              <p className="text-sm text-slate-500 mb-3">No file to hand? Load a research-backed sample profile:</p>
              <div className="flex flex-wrap gap-2">
                {businessType === 'farm' && (
                  <>
                    <button
                      type="button"
                      disabled={!!sampleLoading}
                      onClick={() => loadSampleProfile('/data/usages/sample_dairy_farm_100cow_2025.csv', '100-Cow Dairy Farm (sample)')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                    >
                      {sampleLoading === '100-Cow Dairy Farm (sample)' ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <span>🐄</span>
                      )}
                      100-Cow Dairy Farm
                    </button>
                    <button
                      type="button"
                      disabled={!!sampleLoading}
                      onClick={() => loadSampleProfile('/data/usages/sample_beef_farm_100cow_2025.csv', '100-Cow Beef Farm (sample)')}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      {sampleLoading === '100-Cow Beef Farm (sample)' ? (
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      ) : (
                        <span>🐂</span>
                      )}
                      100-Cow Beef Farm
                    </button>
                  </>
                )}
                {businessType !== 'farm' && (
                  <button
                    type="button"
                    disabled={!!sampleLoading}
                    onClick={() => loadSampleProfile('/data/usages/sample_hotel_20bed_2025.csv', '20-Bed Hotel (sample)')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 transition-colors"
                  >
                    {sampleLoading === '20-Bed Hotel (sample)' ? (
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    ) : (
                      <span>🏨</span>
                    )}
                    20-Bed Hotel
                  </button>
                )}
              </div>
            </div>

            {parsedProfile && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5 text-emerald-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <span className="font-semibold text-emerald-900">
                    {parsedProfile.filename ? `File: ${parsedProfile.filename}` : 'File processed successfully'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                  <div>
                    <span className="text-emerald-700 block text-xs uppercase tracking-wide">Year</span>
                    <span className="font-medium text-emerald-900">{parsedProfile.year}</span>
                  </div>
                  <div>
                    <span className="text-emerald-700 block text-xs uppercase tracking-wide">Total Consumption</span>
                    <span className="font-medium text-emerald-900">{Math.round(parsedProfile.totalKwh).toLocaleString()} kWh</span>
                  </div>
                </div>
                {parsedProfile.warnings.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-emerald-200">
                    <p className="text-xs font-semibold text-emerald-800 mb-1">Notes:</p>
                    <ul className="list-disc pl-4 space-y-1">
                      {parsedProfile.warnings.map((w, i) => (
                        <li key={i} className="text-xs text-emerald-700">{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          </>
        )}
      </div>

      {/* Section C: Tariff — separate card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        <h3 className="text-xl font-serif font-semibold text-tines-dark mb-2">Tariff</h3>
        <p className="text-sm text-slate-500 mb-6">How you&apos;re charged for electricity (rates). Choose a plan that matches your bill.</p>
        {businessType === 'house' ? (
          <div>
            {parsedProfile ? (
              <DomesticTariffSelector
                selectedTariffId={selectedDomesticTariff?.id}
                onSelect={setSelectedDomesticTariff}
              />
            ) : (
              <p className="text-sm text-slate-500">Complete <strong>Energy use</strong> above (upload or load a sample), then select your tariff here.</p>
            )}
          </div>
        ) : (
          <>
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Choose your tariff</h4>
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setTariffType('preset')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tariffType === 'preset'
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Predefined tariff
              </button>
              <button
                type="button"
                onClick={() => setTariffType('custom')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tariffType === 'custom'
                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Custom tariff builder
              </button>
            </div>

            {tariffType === 'preset' && (
              <div>
                {parsedProfile ? (
                  <div>
                    <p className="text-sm text-slate-500 mb-3">Choose your electricity tariff from the list below.</p>
                    <BusinessTariffSelector
                      selectedTariffId={selectedBusinessTariff?.id}
                      onSelect={setSelectedBusinessTariff}
                    />
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Upload your usage data or load a sample profile above, then you can select a predefined tariff here.</p>
                )}
              </div>
            )}

            {/* Time-of-Use Mode - Breakdown by slots */}
            {tariffType === 'custom' && (
              <div>
                <p className="text-sm text-slate-500 mb-6">
                  Define time-of-use tariff slots and enter kWh consumed in each slot for two example months.
                </p>

                {/* Standing Charge */}
                <div className="mb-6">
                  <Field label="Standing Charge (€/day)">
                    <input
                      className={inputClass}
                      type="number"
                      step={0.01}
                      value={standingCharge}
                      onChange={(e) => setStandingCharge(Number(e.target.value) || 0)}
                      placeholder="e.g., 0.90"
                    />
                    <p className="mt-2 text-xs text-slate-400">
                      Daily standing charge from your supplier (typically €0.80-€1.20/day).
                    </p>
                  </Field>
                </div>

                {/* Tariff Slots Definition */}
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-slate-700 mb-4">Tariff Time Slots</h4>
                  <div className="space-y-4">
                    {customSlots.map(slot => (
                      <div key={slot.id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <Field label="Slot Name">
                            <input
                              className={inputClass}
                              type="text"
                              value={slot.name}
                              onChange={(e) => updateTariffSlot(slot.id, { name: e.target.value })}
                              placeholder="e.g., Peak"
                            />
                          </Field>
                          <Field label="Start (0-23)">
                            <input
                              className={inputClass}
                              type="number"
                              min={0} max={23}
                              value={slot.startHour}
                              onChange={(e) => updateTariffSlot(slot.id, { startHour: Number(e.target.value) })}
                            />
                          </Field>
                          <Field label="End (0-23)">
                            <input
                              className={inputClass}
                              type="number"
                              min={0} max={23}
                              value={slot.endHour}
                              onChange={(e) => updateTariffSlot(slot.id, { endHour: Number(e.target.value) })}
                            />
                          </Field>
                          <Field label="Rate (€/kWh)">
                            <input
                              className={inputClass}
                              type="number"
                              step={0.001}
                              value={slot.ratePerKwh}
                              onChange={(e) => updateTariffSlot(slot.id, { ratePerKwh: Number(e.target.value) })}
                            />
                          </Field>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => removeTariffSlot(slot.id)} className="text-xs text-red-600 hover:underline">Remove Slot</button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addTariffSlot}
                      className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-500 hover:text-blue-600"
                    >
                      + Add Tariff Slot
                    </button>
                  </div>
                </div>

              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="px-8 py-3 bg-tines-purple text-white font-medium rounded-lg shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
        >
          Continue to Solar Configuration
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default Step1DigitalTwin;
