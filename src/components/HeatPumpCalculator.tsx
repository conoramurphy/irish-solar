/**
 * Heat pump ROI calculator page.
 *
 * Route: /heat-pump
 *
 * Accepts house archetype (or direct BER HLI), floor area, fuel type,
 * location, and tariff. Loads real solar data for the selected location,
 * runs the full waterfall scenario sequence + solar-maximalist scenario
 * through the same billing engine used by the main wizard, then renders
 * the results table.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Tariff } from '../types';
import { DomesticTariffSelector } from './DomesticTariffSelector';
import { domesticTariffs } from '../utils/domesticTariffParser';
import { getKnownLocations } from '../utils/solarLocationDiscovery';
import { loadSolarData } from '../utils/solarDataLoader';
import type { ParsedSolarData } from '../utils/solarTimeseriesParser';
import { ARCHETYPES } from '../data/heatPumpArchetypes';
import {
  buildWaterfallScenarios,
  buildSolarMaxScenario,
  estimateFuelBaseline,
  type WaterfallResult,
  type SolarMaxResult,
  type GasBaselineEstimate,
} from '../utils/heatPumpScenarios';
import { calculateAllScenarioBills, type WaterfallBillingResults } from '../utils/heatPumpBilling';
import { HeatPumpResults } from './HeatPumpResults';

// ---------------------------------------------------------------------------

interface FormState {
  useHliDirect: boolean;
  archetypeId: string;
  hliDirect: string;
  floorAreaM2: string;
  occupants: string;
  fuelType: 'gas' | 'oil';
  location: string;
  tariff: Tariff | null;
}

const YEAR = 2025;
const DEFAULT_TARIFF = domesticTariffs.find((t) => t.id?.includes('standard') || t.type === '24-hour') ?? domesticTariffs[0];

/** Returns true if the tariff has a cheap overnight rate worth shifting DHW into. */
function tariffHasNightRate(tariff: Tariff): boolean {
  return tariff.nightRate !== undefined || tariff.evRate !== undefined || tariff.type === 'ev';
}

export function HeatPumpCalculator() {
  const locations = getKnownLocations();

  const [form, setForm] = useState<FormState>({
    useHliDirect: false,
    archetypeId: '1980s_semi',
    hliDirect: '',
    floorAreaM2: '',
    occupants: '',
    fuelType: 'gas',
    location: 'Dublin',
    tariff: DEFAULT_TARIFF ?? null,
  });

  const [results, setResults] = useState<{
    waterfall: WaterfallResult;
    solarMax: SolarMaxResult;
    billing: WaterfallBillingResults;
    baseline: GasBaselineEstimate;
    floorAreaM2: number;
    solarDataLoaded: boolean;
    tariff: Tariff;
    location: string;
    dhwSchedule: 'draw-time' | 'night-boost';
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const [solarLoadStatus, setSolarLoadStatus] = useState<'idle' | 'loading' | 'loaded' | 'failed'>('idle');

  function handleField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setResults(null);
    if (key === 'location') setSolarLoadStatus('idle');
  }

  function validate(): string | null {
    if (!form.tariff) return 'Please select a tariff.';
    if (!form.location) return 'Please select a location.';
    if (form.useHliDirect) {
      const hli = parseFloat(form.hliDirect);
      if (isNaN(hli) || hli <= 0 || hli > 10) return 'HLI must be a number between 0.1 and 10.';
    }
    if (form.floorAreaM2) {
      const area = parseFloat(form.floorAreaM2);
      if (isNaN(area) || area < 20 || area > 2000) return 'Floor area must be between 20 and 2000 m².';
    }
    if (form.occupants) {
      const occ = parseInt(form.occupants, 10);
      if (isNaN(occ) || occ < 1 || occ > 20) return 'Occupants must be between 1 and 20.';
    }
    return null;
  }

  async function handleCalculate() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setComputing(true);

    try {
      const hliOverride = form.useHliDirect ? parseFloat(form.hliDirect) : undefined;
      const floorAreaM2 = form.floorAreaM2 ? parseFloat(form.floorAreaM2) : undefined;
      const occupants = form.occupants ? parseInt(form.occupants, 10) : undefined;

      // Load real solar data for the location (shared with main wizard via solarDataLoader cache)
      setSolarLoadStatus('loading');
      let solarData: ParsedSolarData | null = null;
      try {
        solarData = await loadSolarData(form.location, YEAR);
        setSolarLoadStatus('loaded');
      } catch {
        setSolarLoadStatus('failed');
        // Continue without solar data — solar steps will show HP-only cost
      }

      const dhwSchedule = form.tariff && tariffHasNightRate(form.tariff)
        ? 'night-boost' as const
        : 'draw-time' as const;

      const waterfall = buildWaterfallScenarios(
        form.archetypeId,
        form.location,
        YEAR,
        floorAreaM2,
        hliOverride,
        occupants,
        undefined,
        dhwSchedule,
      );

      const solarMax = buildSolarMaxScenario(
        form.archetypeId,
        form.location,
        YEAR,
        floorAreaM2,
        hliOverride,
        occupants,
        undefined,
        dhwSchedule,
      );

      const baseline = estimateFuelBaseline(
        form.archetypeId,
        form.fuelType,
        floorAreaM2,
        hliOverride,
        occupants,
      );

      // Same engine as main wizard: solar steps use runCalculation() with HP profile
      // as hourlyConsumptionOverride; non-solar steps use direct tariff billing
      const billing = calculateAllScenarioBills(
        waterfall.steps,
        solarMax,
        form.tariff!,
        solarData,
        baseline.annualBillEur,
      );

      const resolvedFloorArea = floorAreaM2 ?? ARCHETYPES.find((a) => a.id === form.archetypeId)?.floorAreaM2 ?? 100;

      setResults({
        waterfall,
        solarMax,
        billing,
        baseline,
        floorAreaM2: resolvedFloorArea,
        solarDataLoaded: solarData !== null,
        tariff: form.tariff!,
        location: form.location,
        dhwSchedule,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed. Please check your inputs.');
    } finally {
      setComputing(false);
    }
  }

  const selectClass =
    'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const inputClass =
    'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1';

  const computingLabel = solarLoadStatus === 'loading'
    ? 'Loading solar data…'
    : 'Calculating…';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-4xl flex items-center gap-4">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-800">
            ← Back
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Heat Pump ROI Calculator</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Waterfall payback — from a poorly-installed heat pump to an optimised system
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 space-y-8">
        {/* Input form */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-5">Your house</h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Archetype or HLI */}
            <div className="sm:col-span-2">
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => handleField('useHliDirect', false)}
                  className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                    !form.useHliDirect
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  By house type
                </button>
                <button
                  type="button"
                  onClick={() => handleField('useHliDirect', true)}
                  className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
                    form.useHliDirect
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  From BER certificate (HLI)
                </button>
              </div>

              {!form.useHliDirect ? (
                <div>
                  <label className={labelClass}>House type</label>
                  <select
                    value={form.archetypeId}
                    onChange={(e) => handleField('archetypeId', e.target.value)}
                    className={selectClass}
                  >
                    {ARCHETYPES.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.label} — typical HLI {a.defaultHLI} W/K/m²
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    {ARCHETYPES.find((a) => a.id === form.archetypeId)?.description}
                  </p>
                </div>
              ) : (
                <div>
                  <label className={labelClass}>
                    Heat Loss Indicator (W/K/m²) — from BER certificate
                  </label>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    placeholder="e.g. 1.9"
                    value={form.hliDirect}
                    onChange={(e) => handleField('hliDirect', e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    SEAI grant threshold: HLI ≤ 2.0. Found on your BER cert or SEAI portal.
                  </p>
                  <div className="mt-3">
                    <label className={labelClass}>House type (for cavity wall info)</label>
                    <select
                      value={form.archetypeId}
                      onChange={(e) => handleField('archetypeId', e.target.value)}
                      className={selectClass}
                    >
                      {ARCHETYPES.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Floor area */}
            <div>
              <label className={labelClass}>Floor area (m²) — optional</label>
              <input
                type="number"
                min="20"
                max="2000"
                step="1"
                placeholder={
                  (ARCHETYPES.find((a) => a.id === form.archetypeId)?.floorAreaM2.toString() ?? '') +
                  ' (archetype default)'
                }
                value={form.floorAreaM2}
                onChange={(e) => handleField('floorAreaM2', e.target.value)}
                className={inputClass}
              />
            </div>

            {/* Occupants */}
            <div>
              <label className={labelClass}>Occupants — optional</label>
              <input
                type="number"
                min="1"
                max="20"
                step="1"
                placeholder="Auto from floor area"
                value={form.occupants}
                onChange={(e) => handleField('occupants', e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-slate-400 mt-1">Drives hot water demand.</p>
            </div>

            {/* Fuel type */}
            <div>
              <label className={labelClass}>Current heating fuel</label>
              <select
                value={form.fuelType}
                onChange={(e) => handleField('fuelType', e.target.value as 'gas' | 'oil')}
                className={selectClass}
              >
                <option value="gas">Natural gas</option>
                <option value="oil">Heating oil (kerosene)</option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label className={labelClass}>Location</label>
              <select
                value={form.location}
                onChange={(e) => handleField('location', e.target.value)}
                className={selectClass}
              >
                {locations.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tariff */}
          <div className="mt-5 border-t border-slate-100 pt-5">
            <h3 className="text-sm font-medium text-slate-700 mb-3">Electricity tariff</h3>
            <DomesticTariffSelector
              selectedTariffId={form.tariff?.id}
              onSelect={(t) => handleField('tariff', t)}
            />
          </div>

          {/* Error + Calculate */}
          {error && (
            <div className="mt-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => { void handleCalculate(); }}
              disabled={computing}
              className="rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {computing ? computingLabel : 'Calculate scenarios'}
            </button>
          </div>
        </div>

        {/* Results */}
        {results && (
          <HeatPumpResults
            waterfall={results.waterfall}
            solarMax={results.solarMax}
            billing={results.billing}
            baseline={results.baseline}
            floorAreaM2={results.floorAreaM2}
            solarDataLoaded={results.solarDataLoaded}
            tariff={results.tariff}
            location={results.location}
            dhwSchedule={results.dhwSchedule}
          />
        )}
      </div>
    </div>
  );
}
