import { useMemo, useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Field } from '../Field';
import { SunDuskSpinner } from '../SunDuskSpinner';
import type { SystemConfiguration, Grant, Financing } from '../../types';
import { calculateGrantAmount, calculateSingleGrantAmount } from '../../models/grants';
import { estimateSystemCostBreakdown } from '../../utils/costEstimation';
import { logInfo } from '../../utils/logger';
import { HOUSE_MODE_DEFAULTS } from '../../constants/houseModeDefaults';
import { VAT_RATE_REDUCED, VAT_RATE_STANDARD, stripVat } from '../../utils/vat';

interface Step4FinanceProps {
  config: SystemConfiguration;
  setConfig: Dispatch<SetStateAction<SystemConfiguration>>;
  eligibleGrants: Grant[];
  selectedGrantIds: string[];
  setSelectedGrantIds: (ids: string[]) => void;
  financing: Financing;
  setFinancing: (f: Financing) => void;
  onGenerateReport: () => void;
  reportGenerating?: boolean;
  /** Annual electricity consumption (kWh). Used for TAMS SCIS eligible kWp cap. */
  annualConsumptionKwh?: number;
}

export function Step4Finance({
  config,
  setConfig,
  eligibleGrants,
  selectedGrantIds,
  setSelectedGrantIds,
  financing,
  setFinancing,
  onGenerateReport,
  reportGenerating = false,
  annualConsumptionKwh
}: Step4FinanceProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  const [grantValidationError, setGrantValidationError] = useState<string | null>(null);
  const [vatRate, setVatRate] = useState(config.installationVatRate ?? VAT_RATE_REDUCED);
  const [houseDefaultsApplied, setHouseDefaultsApplied] = useState(false);
  const [grantsAutoSelectedNotice, setGrantsAutoSelectedNotice] = useState(false);
  const [payInCash, setPayInCash] = useState(true);

  const costBreakdown = useMemo(() => {
    const mode = config.businessType === 'house' ? 'domestic' : 'commercial';
    return estimateSystemCostBreakdown(config.systemSizeKwp || 0, config.batterySizeKwh || 0, mode);
  }, [config.systemSizeKwp, config.batterySizeKwh, config.businessType]);

  const estimatedBaseCost = costBreakdown.totalBaseCost;
  const estimatedTotal = Math.round(estimatedBaseCost * (1 + vatRate));

  const [useEstimatedCost, setUseEstimatedCost] = useState(
    config.installationCost === 0 || Math.abs(config.installationCost - estimatedTotal) < 2
  );

  // Update cost when estimation params change
  useEffect(() => {
    if (useEstimatedCost && estimatedBaseCost > 0) {
      const total = Math.round(estimatedBaseCost * (1 + vatRate));
      // Only update if different to avoid loops (though strict mode might trigger twice)
      if (total !== config.installationCost) {
        // Use functional update to avoid stomping concurrent edits
        setConfig((prev) => ({ ...prev, installationCost: total }));
      }
    }
  }, [useEstimatedCost, vatRate, estimatedBaseCost, config.installationCost, setConfig]);

  // Sync equity to the full net cost whenever "pay in cash" is on.
  // Intentionally omit `financing` from deps to avoid an update loop —
  // we only need to react to payInCash toggling or the cost changing.
  useEffect(() => {
    if (payInCash) {
      setFinancing({ ...financing, equity: displayNetCost });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payInCash, displayNetCost]);

  const applyHouseDefaults = () => {
    setHouseDefaultsApplied(true);
    setConfig((prev) => ({
      ...prev,
      installationCost: HOUSE_MODE_DEFAULTS.INSTALLATION_COST,
      systemSizeKwp: HOUSE_MODE_DEFAULTS.SYSTEM_SIZE_KWP,
      batterySizeKwh: HOUSE_MODE_DEFAULTS.BATTERY_SIZE_KWH,
      numberOfPanels: HOUSE_MODE_DEFAULTS.NUMBER_OF_PANELS
    }));
    // Force manual cost mode so we don't overwrite the explicit default package cost
    setUseEstimatedCost(false);
  };

  const selectAllEligibleGrants = () => {
    setGrantsAutoSelectedNotice(true);
    setSelectedGrantIds(eligibleGrants.map((g) => g.id));
  };

  const selectedGrants = useMemo(
    () => eligibleGrants.filter((g) => selectedGrantIds.includes(g.id)),
    [eligibleGrants, selectedGrantIds]
  );

  const grantContext = useMemo(
    () => ({
      systemSizeKwp: config.systemSizeKwp,
      batterySizeKwh: config.batterySizeKwh,
      annualConsumptionKwh
    }),
    [config.systemSizeKwp, config.batterySizeKwh, annualConsumptionKwh]
  );

  const { totalGrant: totalGrantValue, error: grantCalcError } = useMemo(() => {
    try {
      const { totalGrant } = calculateGrantAmount(config.installationCost, selectedGrants, grantContext);
      return { totalGrant, error: null as string | null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Grant calculation failed.';
      return { totalGrant: 0, error: msg };
    }
  }, [config.installationCost, selectedGrants, grantContext]);

  const netCost = Math.max(0, config.installationCost - totalGrantValue);
  
  // If excluding VAT, we show ex-VAT figures for ROI
  const displayInstallationCost = config.excludeVat ? stripVat(config.installationCost, vatRate) : config.installationCost;
  const displayNetCost = config.excludeVat ? stripVat(netCost, vatRate) : netCost;
  const loanAmount = Math.max(0, displayNetCost - financing.equity);

  const handleGenerateReport = () => {
    setGrantValidationError(null);

    logInfo('ui', 'Step 3 generate report clicked', {
      installationCost: config.installationCost,
      equity: financing.equity,
      interestRate: financing.interestRate,
      termYears: financing.termYears,
      systemSizeKwp: config.systemSizeKwp
    });

    // Enforce: if a selected grant requires extra inputs (e.g. kWp), block generation.
    try {
      calculateGrantAmount(config.installationCost, selectedGrants, grantContext);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Grant calculation failed.';
      setGrantValidationError(msg);
      return;
    }

    if (config.installationCost > 0 && financing.equity >= 0) {
      onGenerateReport();
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Preamble */}
      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </span>
          Investment & Financing
        </h2>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed max-w-2xl">
          Configure your project costs, apply for eligible grants, and structure your financing to understand the true ROI of your solar investment.
        </p>
      </div>

      <div className="space-y-6 mb-8">
        {/* Installation Cost Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          {(grantValidationError || grantCalcError) && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <div className="font-semibold">Grant calculation needs attention</div>
              <div className="mt-1">{grantValidationError ?? grantCalcError}</div>
            </div>
          )}

          {config.businessType === 'house' && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">Domestic mode: defaults are opt-in</div>
              <p className="mt-1 text-amber-800">
                To avoid silent overrides, this step will <span className="font-semibold">not</span> apply any typical domestic sizing/cost defaults automatically.
                If you want a starter package, apply it explicitly below.
              </p>
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={applyHouseDefaults}
                  className="inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  Apply typical domestic defaults (6.4 kWp + 8 kWh + €10,000)
                </button>
                {houseDefaultsApplied && (
                  <span className="text-xs text-amber-800 self-center">
                    Applied. You can still edit Solar/Battery steps to change sizing.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Installation Cost Header & Checkboxes */}
          <div className="mb-6">
            <h3 className="text-xl font-serif font-semibold text-slate-900 mb-3">Installation Cost</h3>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useEstimatedCost}
                  onChange={(e) => setUseEstimatedCost(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                />
                <span className="font-medium">Use estimated cost based on system size</span>
              </label>
              
              {config.businessType !== 'house' && (
                <label className="flex items-center gap-2 text-sm text-emerald-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.excludeVat || false}
                    onChange={(e) => setConfig(prev => ({ ...prev, excludeVat: e.target.checked }))}
                    className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
                  />
                  <span className="font-medium">Business VAT Write-off (Exclude VAT)</span>
                </label>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 mb-6">
            {useEstimatedCost && (
              <div className="flex flex-col sm:flex-row sm:items-start gap-4 bg-slate-50 rounded-lg p-5 border border-slate-200">
                <div className="flex-1 text-sm space-y-2">
                   <div className="flex justify-between border-b border-slate-200/60 pb-2">
                      <span className="text-slate-500">Estimated Base Cost (ex VAT):</span>
                      <span className="font-medium text-slate-700">€{estimatedBaseCost.toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between border-b border-slate-200/60 pb-2">
                      <span className="text-slate-500 flex items-center gap-2">
                        VAT Rate:
                        <select
                          className="py-1 px-2 pr-8 text-xs rounded-md border-slate-200 shadow-sm focus:border-emerald-700 focus:ring-emerald-700"
                          value={vatRate}
                          onChange={(e) => {
                            const newVat = Number(e.target.value);
                            setVatRate(newVat);
                            setConfig(prev => ({ ...prev, installationVatRate: newVat }));
                          }}
                        >
                          <option value={VAT_RATE_REDUCED}>Reduced (13.5%)</option>
                          <option value={VAT_RATE_STANDARD}>Standard (23%)</option>
                          <option value={0}>Zero (0%)</option>
                        </select>
                      </span>
                      <span className="font-medium text-slate-700">€{Math.round(estimatedBaseCost * vatRate).toLocaleString()}</span>
                   </div>
                   <div className="flex justify-between pt-1">
                      <span className="font-semibold text-slate-700">Total Estimate (inc VAT):</span>
                      <span className="font-bold text-emerald-700">€{Math.round(estimatedBaseCost * (1 + vatRate)).toLocaleString()}</span>
                   </div>

                   <details className="mt-3">
                     <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors">
                       Show calculation details
                     </summary>
                     <div className="mt-3 text-xs text-slate-600 space-y-3 bg-white p-3 rounded border border-slate-200">
                       <div className="rounded bg-slate-50 p-2">
                         <span className="font-medium text-slate-700">Inputs:</span>
                         <span className="ml-2">Solar: {costBreakdown.inputs.kwp.toFixed(1)} kWp · Battery: {costBreakdown.inputs.batteryKwh.toFixed(1)} kWh</span>
                       </div>

                       <div>
                         <div className="font-medium text-slate-700">1) Solar PV base cost</div>
                         {costBreakdown.inputs.kwp > 0 ? (
                           <div className="mt-1">
                             Tier: <span className="font-medium">{costBreakdown.solar.tier}</span> → price = <span className="font-medium">€{costBreakdown.solar.pricePerKwp.toFixed(0)}/kWp</span>
                             <div className="mt-1 text-slate-500">
                               €{costBreakdown.solar.baseCost.toLocaleString()} = {costBreakdown.inputs.kwp.toFixed(1)} × €{costBreakdown.solar.pricePerKwp.toFixed(0)}
                             </div>
                           </div>
                         ) : (
                           <div className="mt-1">No solar component.</div>
                         )}
                       </div>

                       <div>
                         <div className="font-medium text-slate-700">2) Battery base cost</div>
                         {costBreakdown.inputs.batteryKwh > 0 ? (
                           <div className="mt-1 text-slate-500">
                             €{costBreakdown.battery.baseCost.toLocaleString()} = {costBreakdown.inputs.batteryKwh.toFixed(1)} × €{costBreakdown.battery.pricePerKwh.toFixed(0)}/kWh
                           </div>
                         ) : (
                           <div className="mt-1">No battery component.</div>
                         )}
                       </div>

                       <div>
                         <div className="font-medium text-slate-700">3) BOS / controls markup</div>
                         <div className="mt-1 text-slate-500">
                           €{estimatedBaseCost.toLocaleString()} = €{costBreakdown.subtotalHardware.toLocaleString()} (hardware) × {costBreakdown.bosMarkup}
                         </div>
                       </div>
                     </div>
                   </details>
                </div>
              </div>
            )}

            {!useEstimatedCost && (
              <div className="w-full sm:w-1/2">
                <Field label="VAT Rate">
                  <select
                    className="w-full rounded-md border-slate-200 shadow-sm focus:border-emerald-700 focus:ring-emerald-700 sm:text-sm py-2"
                    value={vatRate}
                    onChange={(e) => {
                      const newVat = Number(e.target.value);
                      setVatRate(newVat);
                      setConfig(prev => ({ ...prev, installationVatRate: newVat }));
                    }}
                  >
                    <option value={VAT_RATE_REDUCED}>Reduced (13.5%)</option>
                    <option value={VAT_RATE_STANDARD}>Standard (23%)</option>
                    <option value={0}>Zero (0%)</option>
                  </select>
                </Field>
              </div>
            )}
          </div>

          <Field label={`Total Project Cost ${config.excludeVat ? '(Ex. VAT)' : '(Inc. VAT)'} (€)`}>
            <input
              className={`w-full rounded-md border-slate-200 shadow-sm focus:border-emerald-700 focus:ring-emerald-700 sm:text-sm py-2 ${useEstimatedCost ? 'bg-slate-50 text-slate-500' : ''}`}
              type="number"
              step={100}
              value={displayInstallationCost}
              onChange={(e) => {
                const newValue = Number(e.target.value);
                // If excluding VAT, the manual input is treated as ex-VAT, so we store it as gross
                const storedValue = config.excludeVat ? Math.round(newValue * (1 + vatRate)) : newValue;
                setConfig({ ...config, installationCost: storedValue });
                if (useEstimatedCost) setUseEstimatedCost(false); // Switch to manual if user edits
              }}
              placeholder="e.g., 35000"
            />
            <p className="mt-2 text-xs text-slate-400 italic">
              Includes panels, inverters, battery, installation, and grid connection
            </p>
          </Field>
        </div>

        {/* Grants Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-serif font-semibold text-tines-dark">Available Grants</h3>
              <p className="text-sm text-slate-500 mt-1">Based on your business type: <span className="font-medium text-slate-700">{config.businessType}</span></p>
            </div>
            <div className="flex items-center gap-3">
              {eligibleGrants.length > 0 && selectedGrantIds.length === 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-500 hover:text-tines-purple underline"
                  onClick={selectAllEligibleGrants}
                >
                  Select all eligible
                </button>
              )}
              {selectedGrantIds.length > 0 && (
                <button
                  type="button"
                  className="text-sm text-slate-500 hover:text-tines-purple underline"
                  onClick={() => setSelectedGrantIds([])}
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {grantsAutoSelectedNotice && (
            <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              Selected all eligible grants. Review the list below and uncheck any you don't plan to apply for.
            </div>
          )}

          {eligibleGrants.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-sm text-slate-500">No grants available for this business type.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {eligibleGrants.map((g) => {
                let grantAmount: number | null = null;
                let perGrantError: string | null = null;

                try {
                  grantAmount = calculateSingleGrantAmount(config.installationCost, g, grantContext);
                } catch (e) {
                  perGrantError = e instanceof Error ? e.message : 'Grant calculation failed.';
                }

                const calculationHint =
                  g.calculation?.method === 'seai-non-domestic-microgen-solar-pv'
                    ? `Tiered by system size (kWp), capped at €${g.maxAmount.toLocaleString()}`
                    : g.calculation?.method === 'tams-scis-solar-pv'
                      ? 'Eligible kWp from consumption; 60% of eligible cost, max €54,000'
                      : `${g.percentage}% of project cost, up to €${g.maxAmount.toLocaleString()} maximum`;

                const tamsEligibleHint =
                  g.id === 'tams-scis-solar-pv' &&
                  config.businessType === 'farm' &&
                  annualConsumptionKwh != null &&
                  annualConsumptionKwh > 0 &&
                  Number.isFinite(config.systemSizeKwp) &&
                  config.systemSizeKwp != null
                    ? (() => {
                        const capKwp = Math.min(annualConsumptionKwh / 1000, 62);
                        const eligibleKwp = Math.min(capKwp, config.systemSizeKwp ?? 0);
                        const eligibleBatteryKwh = Math.min(config.batterySizeKwh ?? 0, eligibleKwp * 0.5);
                        return `Eligible: up to ${eligibleKwp.toFixed(1)} kWp, ${eligibleBatteryKwh.toFixed(1)} kWh battery from your consumption`;
                      })()
                    : null;

                return (
                  <label
                    key={g.id}
                    className="flex items-start gap-4 p-4 rounded-lg border border-slate-200 hover:bg-slate-50 hover:border-tines-purple/30 transition-all cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 rounded border-slate-300 text-tines-purple focus:ring-tines-purple"
                      checked={selectedGrantIds.includes(g.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Enforce mutual exclusivity: TAMS vs SEAI
                          // If selecting a TAMS grant, remove any SEAI grants, and vice versa.
                          const newGrantType = g.type;
                          const conflictingType = newGrantType === 'TAMS' ? 'SEAI' : newGrantType === 'SEAI' ? 'TAMS' : null;

                          let newSelectedIds = [...selectedGrantIds];
                          
                          if (conflictingType) {
                            // Find IDs of conflicting grants
                            const conflictingIds = eligibleGrants
                              .filter(cg => cg.type === conflictingType)
                              .map(cg => cg.id);
                            
                            // Remove them
                            newSelectedIds = newSelectedIds.filter(id => !conflictingIds.includes(id));
                          }
                          
                          setSelectedGrantIds([...newSelectedIds, g.id]);
                        } else {
                          setSelectedGrantIds(selectedGrantIds.filter((id) => id !== g.id));
                        }
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-semibold text-tines-dark group-hover:text-tines-purple transition-colors">
                          {g.name}
                        </span>
                        <span className={`text-sm font-bold ${perGrantError ? 'text-slate-400' : 'text-emerald-600'}`}>
                          {grantAmount != null && !perGrantError ? `€${grantAmount.toLocaleString()}` : '—'}
                        </span>
                      </div>

                      <p className="text-sm text-slate-500 mt-1">{calculationHint}</p>

                      {tamsEligibleHint && (
                        <p className="text-xs text-slate-600 mt-1">{tamsEligibleHint}</p>
                      )}

                      {g.description && <p className="text-xs text-slate-400 mt-1">{g.description}</p>}

                      {g.sourceUrls && g.sourceUrls.length > 0 && (
                        <p className="text-xs text-slate-400 mt-1">
                          Source:{' '}
                          {g.sourceUrls.map((url, idx) => (
                            <span key={url}>
                              {idx > 0 ? ', ' : ''}
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-tines-purple hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {url.replace(/^https?:\/\//, '').split('/')[0]}
                              </a>
                            </span>
                          ))}
                        </p>
                      )}

                      {perGrantError && (
                        <p className="text-xs text-rose-600 mt-1">{perGrantError}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}

          {totalGrantValue > 0 && (
            <div className="mt-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-lg p-4 border border-emerald-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-900">Total Grant Funding</span>
                <span className="text-xl font-bold text-emerald-700">€{totalGrantValue.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Financing Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-semibold text-slate-900">Financing Structure</h3>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={payInCash}
                onChange={(e) => setPayInCash(e.target.checked)}
                className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-700"
              />
              Pay in cash
            </label>
          </div>
          
          <div className="space-y-6">
            <Field label="Equity / Cash Down Payment (€)">
              <input
                className={`${inputClass} ${payInCash ? 'bg-slate-50 text-slate-500' : ''}`}
                type="number"
                step={100}
                value={payInCash ? displayNetCost : financing.equity}
                readOnly={payInCash}
                onChange={(e) => !payInCash && setFinancing({ ...financing, equity: Number(e.target.value) })}
                placeholder="e.g., 15000"
              />
              <p className="mt-2 text-xs text-slate-400 italic">
                {payInCash ? 'Full net cost paid upfront — no loan' : 'Amount you'll pay upfront'}
              </p>
            </Field>

            <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 transition-opacity ${payInCash ? 'opacity-40 pointer-events-none' : ''}`}>
              <Field label="Loan Interest Rate (annual %)">
                <input
                  className={inputClass}
                  type="number"
                  step={0.1}
                  value={financing.interestRate * 100}
                  onChange={(e) => setFinancing({ ...financing, interestRate: Number(e.target.value) / 100 })}
                  placeholder="e.g., 5"
                  disabled={payInCash}
                />
              </Field>

              <Field label="Loan Term (years)">
                <input
                  className={inputClass}
                  type="number"
                  step={1}
                  value={financing.termYears}
                  onChange={(e) => setFinancing({ ...financing, termYears: Number(e.target.value) })}
                  placeholder="e.g., 10"
                  disabled={payInCash}
                />
              </Field>
            </div>

            {/* Tax Relief (ACA) */}
            <div className="pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-serif font-semibold text-tines-dark">Tax Incentives</h4>
                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={financing.isTaxReliefEligible || false}
                    onChange={(e) => setFinancing({ 
                      ...financing, 
                      isTaxReliefEligible: e.target.checked,
                      taxRate: e.target.checked ? (financing.taxRate || 0.125) : undefined
                    })}
                    className="rounded border-slate-300 text-tines-purple focus:ring-tines-purple"
                  />
                  <span>Apply Accelerated Capital Allowance (ACA)</span>
                </label>
              </div>

              {financing.isTaxReliefEligible && (
                <div className="bg-blue-50/50 rounded-lg p-4 border border-blue-100">
                  <p className="text-sm text-slate-600 mb-4">
                    Companies and sole traders can write off 100% of the equipment cost against their tax bill in Year 1.
                    Select your effective tax rate to estimate the benefit.
                  </p>
                  
                  <Field label="Effective Tax Rate">
                     <select
                      className={inputClass}
                      value={financing.taxRate || 0.125}
                      onChange={(e) => setFinancing({ ...financing, taxRate: Number(e.target.value) })}
                    >
                      <option value={0.125}>Corporate Tax (12.5%) - Hotels/Companies</option>
                      <option value={0.20}>Income Tax Standard (20%) - Sole Traders</option>
                      <option value={0.40}>Income Tax Higher (40%) - Sole Traders</option>
                      <option value={0.52}>Income Tax Top (52%) - High Earner Sole Traders</option>
                    </select>
                  </Field>
                </div>
              )}
            </div>

            {/* Financial Summary */}
            {config.installationCost > 0 && (
              <div className="pt-6 mt-6 border-t border-slate-200">
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between items-baseline">
                    <dt className="text-slate-500 font-medium">Total Project Cost {config.excludeVat && '(Ex. VAT)'}</dt>
                    <dd className="font-semibold text-slate-900">€{Math.round(displayInstallationCost).toLocaleString()}</dd>
                  </div>

                  {totalGrantValue > 0 && (
                    <div className="flex justify-between items-baseline">
                      <dt className="text-emerald-600 font-medium">Less: Grant Funding</dt>
                      <dd className="font-semibold text-emerald-600">−€{Math.round(config.excludeVat ? stripVat(totalGrantValue, vatRate) : totalGrantValue).toLocaleString()}</dd>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                    <dt className="text-slate-500 font-medium">Net Cost {config.excludeVat && '(Ex. VAT)'}</dt>
                    <dd className="font-semibold text-slate-900">€{Math.round(displayNetCost).toLocaleString()}</dd>
                  </div>

                  {financing.isTaxReliefEligible && (
                    <div className="flex justify-between items-baseline text-blue-700 bg-blue-50/50 px-2 py-1 -mx-2 rounded">
                      <dt className="font-medium">Est. Tax Savings (Year 1)</dt>
                      <dd className="font-semibold">−€{Math.round(displayNetCost * (financing.taxRate || 0)).toLocaleString()}</dd>
                    </div>
                  )}

                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                    <dt className="text-slate-500 font-medium">Your Equity</dt>
                    <dd className="font-semibold text-slate-900">€{financing.equity.toLocaleString()}</dd>
                  </div>

                  <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                    <dt className="text-slate-700 font-medium">Loan Amount</dt>
                    <dd className="font-bold text-emerald-700">€{Math.round(loanAmount).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end mt-8">
        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={!config.installationCost || config.installationCost <= 0 || reportGenerating}
          className="px-8 py-3 bg-tines-purple hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
        >
          {reportGenerating ? (
            <>
              <SunDuskSpinner className="w-5 h-5" />
              Generating report…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
              </svg>
              Generate Final Report
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default Step4Finance;
