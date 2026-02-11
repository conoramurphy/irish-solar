import { useMemo, useState, useEffect } from 'react';
import { Field } from '../Field';
import type { SystemConfiguration, Grant, Financing } from '../../types';
import { calculateGrantAmount, calculateSingleGrantAmount } from '../../models/grants';
import { logInfo } from '../../utils/logger';

// Soft curve estimation helper
function estimateSystemCost(kwp: number): number {
  if (!kwp || kwp <= 0) return 0;
  
  // Linear interpolation of price-per-kWp based on upper-bound markers
  let pricePerKwp = 1500;
  
  if (kwp <= 10) {
    pricePerKwp = 2000;
  } else if (kwp <= 50) {
    // Range 10-50 (span 40), Price 2000-1800 (span -200)
    const progress = (kwp - 10) / 40;
    pricePerKwp = 2000 - (progress * 200);
  } else if (kwp <= 150) {
    // Range 50-150 (span 100), Price 1800-1700 (span -100)
    const progress = (kwp - 50) / 100;
    pricePerKwp = 1800 - (progress * 100);
  } else if (kwp <= 300) {
    // Range 150-300 (span 150), Price 1700-1600 (span -100)
    const progress = (kwp - 150) / 150;
    pricePerKwp = 1700 - (progress * 100);
  } else if (kwp <= 500) {
    // Range 300-500 (span 200), Price 1600-1500 (span -100)
    const progress = (kwp - 300) / 200;
    pricePerKwp = 1600 - (progress * 100);
  } else {
    pricePerKwp = 1500;
  }
  
  return kwp * pricePerKwp;
}

interface Step4FinanceProps {
  config: SystemConfiguration;
  setConfig: (c: SystemConfiguration) => void;
  eligibleGrants: Grant[];
  selectedGrantIds: string[];
  setSelectedGrantIds: (ids: string[]) => void;
  financing: Financing;
  setFinancing: (f: Financing) => void;
  onGenerateReport: () => void;
  onBack: () => void;
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
  onBack
}: Step4FinanceProps) {
  const inputClass = "w-full rounded-md border-slate-200 shadow-sm focus:border-tines-purple focus:ring-tines-purple sm:text-sm py-2";

  const [grantValidationError, setGrantValidationError] = useState<string | null>(null);
  const [useEstimatedCost, setUseEstimatedCost] = useState(true);
  const [vatRate, setVatRate] = useState(0.135);

  const estimatedBaseCost = useMemo(() => {
    return estimateSystemCost(config.systemSizeKwp || 0);
  }, [config.systemSizeKwp]);

  // Update cost when estimation params change
  useEffect(() => {
    if (useEstimatedCost && config.systemSizeKwp) {
      const total = Math.round(estimatedBaseCost * (1 + vatRate));
      // Only update if different to avoid loops (though strict mode might trigger twice)
      if (total !== config.installationCost) {
        setConfig({ ...config, installationCost: total });
      }
    }
  }, [useEstimatedCost, vatRate, estimatedBaseCost, config, setConfig]);

  const selectedGrants = useMemo(
    () => eligibleGrants.filter((g) => selectedGrantIds.includes(g.id)),
    [eligibleGrants, selectedGrantIds]
  );

  const grantContext = useMemo(
    () => ({ systemSizeKwp: config.systemSizeKwp }),
    [config.systemSizeKwp]
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
  const loanAmount = Math.max(0, netCost - financing.equity);

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
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 mb-6 shadow-lg shadow-emerald-500/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8 text-white">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Investment & Financing
        </h2>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          Configure your project costs, apply for eligible grants, and structure your financing to understand the true ROI of your solar investment.
        </p>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8 mb-8">
        {(grantValidationError || grantCalcError) && (
          <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div className="font-semibold">Grant calculation needs attention</div>
            <div className="mt-1">{grantValidationError ?? grantCalcError}</div>
          </div>
        )}
        {/* Installation Cost */}
        <div className="mb-8 pb-8 border-b border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-serif font-semibold text-tines-dark">Installation Cost</h3>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={useEstimatedCost}
                onChange={(e) => setUseEstimatedCost(e.target.checked)}
                className="rounded border-slate-300 text-tines-purple focus:ring-tines-purple"
              />
              <span>Use estimated cost based on system size</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
             <Field label="VAT Rate">
                <select
                  className={inputClass}
                  value={vatRate}
                  onChange={(e) => setVatRate(Number(e.target.value))}
                  disabled={!useEstimatedCost} // If manual, user enters total gross cost directly
                >
                  <option value={0.135}>Reduced (13.5%)</option>
                  <option value={0.23}>Standard (23%)</option>
                </select>
                <p className="mt-2 text-xs text-slate-400">
                  <a 
                    href="https://www.revenue.ie/en/tax-professionals/tdm/value-added-tax/part03-taxable-transactions-goods-ica-services/Services/solar-panels.pdf"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-tines-purple hover:underline"
                  >
                    Check eligibility for reduced VAT
                  </a>
                </p>
             </Field>
             
             {useEstimatedCost && (
               <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 text-sm">
                 <div className="flex justify-between mb-1">
                    <span className="text-slate-500">Estimated Base Cost:</span>
                    <span className="font-medium text-slate-700">€{estimatedBaseCost.toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between mb-2 pb-2 border-b border-slate-200">
                    <span className="text-slate-500">VAT (@ {(vatRate * 100).toFixed(1)}%):</span>
                    <span className="font-medium text-slate-700">€{Math.round(estimatedBaseCost * vatRate).toLocaleString()}</span>
                 </div>
                 <div className="flex justify-between pt-1">
                    <span className="font-semibold text-slate-700">Total Estimate:</span>
                    <span className="font-bold text-tines-purple">€{Math.round(estimatedBaseCost * (1 + vatRate)).toLocaleString()}</span>
                 </div>
               </div>
             )}
          </div>

          <Field label="Total Project Cost (Inc. VAT) (€)">
            <input
              className={`${inputClass} ${useEstimatedCost ? 'bg-slate-50 text-slate-500' : ''}`}
              type="number"
              step={100}
              value={config.installationCost}
              onChange={(e) => {
                setConfig({ ...config, installationCost: Number(e.target.value) });
                if (useEstimatedCost) setUseEstimatedCost(false); // Switch to manual if user edits
              }}
              placeholder="e.g., 35000"
            />
            <p className="mt-2 text-xs text-slate-400 italic">
              Includes panels, inverters, installation, and grid connection
            </p>
          </Field>
        </div>

        {/* Grants */}
        <div className="mb-8 pb-8 border-b border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-serif font-semibold text-tines-dark">Available Grants</h3>
              <p className="text-sm text-slate-500 mt-1">Based on your business type: <span className="font-medium text-slate-700">{config.businessType}</span></p>
            </div>
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
                    : `${g.percentage}% of project cost, up to €${g.maxAmount.toLocaleString()} maximum`;

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
                          setSelectedGrantIds([...selectedGrantIds, g.id]);
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

        {/* Financing */}
        <div>
          <h3 className="text-xl font-serif font-semibold text-tines-dark mb-6">Financing Structure</h3>
          
          <div className="space-y-6">
            <Field label="Equity / Cash Down Payment (€)">
              <input
                className={inputClass}
                type="number"
                step={100}
                value={financing.equity}
                onChange={(e) => setFinancing({ ...financing, equity: Number(e.target.value) })}
                placeholder="e.g., 15000"
              />
              <p className="mt-2 text-xs text-slate-400 italic">Amount you'll pay upfront</p>
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Field label="Loan Interest Rate (annual %)">
                <input
                  className={inputClass}
                  type="number"
                  step={0.1}
                  value={financing.interestRate * 100}
                  onChange={(e) => setFinancing({ ...financing, interestRate: Number(e.target.value) / 100 })}
                  placeholder="e.g., 5"
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
                />
              </Field>
            </div>

            {/* Financial Summary */}
            {config.installationCost > 0 && (
              <div className="bg-slate-50 rounded-lg p-6 space-y-3 border border-slate-200">
                <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Financial Summary</h4>
                
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-slate-600">Total Project Cost</span>
                  <span className="font-semibold text-slate-900">€{config.installationCost.toLocaleString()}</span>
                </div>

                {totalGrantValue > 0 && (
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-emerald-600">Less: Grant Funding</span>
                    <span className="font-semibold text-emerald-600">−€{totalGrantValue.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex justify-between items-baseline text-sm pt-2 border-t border-slate-200">
                  <span className="text-slate-600">Net Cost</span>
                  <span className="font-semibold text-slate-900">€{netCost.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-slate-600">Your Equity</span>
                  <span className="font-semibold text-slate-900">€{financing.equity.toLocaleString()}</span>
                </div>

                <div className="flex justify-between items-baseline text-sm pt-2 border-t border-slate-200">
                  <span className="text-slate-600">Loan Amount</span>
                  <span className="font-bold text-tines-purple">€{loanAmount.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-all flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
          Back
        </button>

        <button
          type="button"
          onClick={handleGenerateReport}
          disabled={!config.installationCost || config.installationCost <= 0}
          className="px-8 py-3 bg-gradient-to-r from-tines-purple to-indigo-600 text-white font-semibold rounded-lg shadow-xl shadow-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/40 disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed transition-all transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
          Generate Final Report
        </button>
      </div>
    </div>
  );
}

export default Step4Finance;
