/**
 * Special report: "The HLI 2.0 Cliff"
 *
 * Route: /report/hli-threshold
 *
 * Generates live analysis showing SEAI's HLI ≤ 2.0 grant threshold is
 * arbitrary. Sweeps HLI 0.8–3.5 through the HP model, analyses what
 * measures are needed to cross the threshold, and compares policy alternatives.
 */

import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { domesticTariffs } from '../utils/domesticTariffParser';
import { loadSolarData } from '../utils/solarDataLoader';
import type { ParsedSolarData } from '../utils/solarTimeseriesParser';
import { formatCurrency } from '../utils/format';
import {
  sweepHli,
  analyseThresholdCrossing,
  comparePolicies,
  compareRetrofitPaths,
  POLICY_SCENARIOS,
  type PathComparison,
} from '../utils/hliThresholdAnalysis';

const DEFAULT_TARIFF = domesticTariffs.find((t) => t.type === '24-hour' || t.id?.includes('standard')) ?? domesticTariffs[0];

function fmt(n: number) { return formatCurrency(n); }

/** Map HLI to approximate BER rating for the secondary x-axis label */
function hliBerLabel(hli: number): string {
  if (hli <= 0.8) return 'A1';
  if (hli <= 1.0) return 'A2';
  if (hli <= 1.3) return 'A3';
  if (hli <= 1.5) return 'B1';
  if (hli <= 1.8) return 'B2';
  if (hli <= 2.0) return 'B3';
  if (hli <= 2.3) return 'C1';
  if (hli <= 2.5) return 'C2';
  if (hli <= 2.8) return 'C3';
  if (hli <= 3.0) return 'D1';
  if (hli <= 3.3) return 'D2';
  return 'E1';
}

export function HliThresholdReport() {
  const tariff = DEFAULT_TARIFF;

  const sweep = useMemo(() => {
    if (!tariff) return [];
    return sweepHli(tariff, 108, 'gas');
  }, [tariff]);

  const policyComparison = useMemo(() => comparePolicies(sweep), [sweep]);

  // Key threshold points
  const at19 = sweep.find((p) => p.hli === 1.9);
  const at20 = sweep.find((p) => p.hli === 2.0);
  const at21 = sweep.find((p) => p.hli === 2.1);
  const at23 = sweep.find((p) => p.hli === 2.3);
  const at25 = sweep.find((p) => p.hli === 2.5);


  // Threshold crossing analysis for common starting points
  const crossing23 = useMemo(() => analyseThresholdCrossing(2.3), []);
  const crossing25 = useMemo(() => analyseThresholdCrossing(2.5), []);
  const crossing30 = useMemo(() => analyseThresholdCrossing(3.0), []);
  const crossing35 = useMemo(() => analyseThresholdCrossing(3.5), []);

  // Load solar data for the path comparison (needs real irradiance for self-consumption)
  const [solarData, setSolarData] = useState<ParsedSolarData | null>(null);
  useEffect(() => {
    loadSolarData('Dublin', 2025).then(setSolarData).catch(() => setSolarData(null));
  }, []);

  // Path comparison: pragmatic (with real solar billing) vs deep retrofit
  const paths = useMemo(() => {
    if (!tariff) return [] as PathComparison[];
    return compareRetrofitPaths(tariff, solarData);
  }, [tariff, solarData]);

  if (!tariff || sweep.length === 0) return <div className="p-8">Loading...</div>;

  const costDiff = at21 && at19
    ? Math.abs(at21.annualHpBillEur - at19.annualHpBillEur)
    : 0;

  const GRID_DARK: React.CSSProperties = {
    backgroundImage: [
      'linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px)',
      'linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: '48px 48px',
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFFBF0' }}>
      {/* Hero — amber theme from Landing heat pump section */}
      <div className="relative py-14 md:py-20" style={{ backgroundColor: '#FEF3C7' }}>
        <div className="pointer-events-none absolute inset-0" style={GRID_DARK} />
        <div className="relative z-10 w-full max-w-3xl mx-auto px-5 md:px-8">
          <Link to="/heat-pump" className="text-xs font-medium" style={{ color: 'rgba(146,64,14,0.5)' }}>
            ← Heat Pump Calculator
          </Link>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold leading-[1.08] tracking-tight mt-5 mb-5 max-w-2xl"
            style={{ color: '#78350F' }}
          >
            A simple, proven way to fix Ireland's domestic decarbonisation
          </h1>
          <p className="text-lg md:text-xl font-light leading-relaxed max-w-2xl" style={{ color: 'rgba(120,53,15,0.8)' }}>
            SEAI's heat pump grant requires HLI ≤ 2.0. There is no engineering basis for this number.
            A sliding scale would unlock decarbonisation at no additional cost to the state.
          </p>
          <p className="text-xs mt-5" style={{ color: 'rgba(146,64,14,0.4)' }}>
            All figures generated live · 1980s semi-d, 108 m², Dublin · {tariff.supplier} {tariff.product}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 md:px-8 py-14 space-y-20">

        {/* ============================================================= */}
        {/* THE PROBLEM                                                     */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The problem</p>
          <p className="text-base text-slate-700 leading-relaxed">
            Ireland has committed to retrofitting 500,000 homes to BER B2 by 2030. We are
            not on track. The ESRI's 2026 analysis
            (<a href="https://doi.org/10.26504/QEC2026SPR_SA_Lynch" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Lynch et al.</a>)
            identifies the core problem: the cost of deep retrofit is too high relative to the
            energy savings it delivers, and the homes that need it most — older, poorly insulated
            stock — face the longest payback periods. Uptake has stalled not because homeowners
            don't care about climate, but because spending €30,000–€50,000 on a deep retrofit
            that saves €1,500/year doesn't make financial sense for most families. The grant
            system was designed to close that gap, but a binary threshold at HLI 2.0 means
            hundreds of thousands of homes that could benefit from a heat pump are locked out
            entirely — while the homes that do qualify often don't need the grant to make
            the numbers work.
          </p>
        </section>

        {/* ============================================================= */}
        {/* WHAT THIS LOOKS LIKE IN PRACTICE                               */}
        {/* ============================================================= */}
        {paths.length === 2 && (
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The solution</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight tracking-tight mb-6" style={{ color: '#78350F' }}>Two paths, same house</h2>
          <p className="text-base text-slate-700 mb-6">
            Take a typical 1980s semi-detached (HLI 2.5, 108 m²). Two ways to decarbonise it.
            One spends on generation, the other on fabric. Same heat pump in both.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {paths.map((path) => (
              <div key={path.id} className={`rounded-xl border-2 p-5 ${path.id === 'pragmatic' ? 'border-blue-300 bg-blue-50/30' : 'border-amber-300 bg-amber-50/30'}`}>
                <h3 className="text-lg font-bold text-slate-900">{path.label}</h3>
                <p className="text-sm text-slate-500 mt-1">{path.subtitle}</p>
                <p className="text-xs text-slate-400 mt-1">BER after: {path.berRating} · HLI: {path.hliAfter.toFixed(2)}</p>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div>
                    <p className="text-xs text-slate-500">Gross cost</p>
                    <p className="text-lg font-bold text-slate-900">{fmt(path.totalGross)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Total grants</p>
                    <p className="text-lg font-bold text-green-700">-{fmt(path.totalGrant)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">You pay</p>
                    <p className="text-lg font-bold text-slate-900">{fmt(path.totalNet)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <p className="text-xs text-slate-500">Annual bill</p>
                    <p className="text-base font-semibold text-slate-800">{fmt(path.annualBillEur)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      incl. base house load of {path.baseLoadKwh.toLocaleString()} kWh/yr
                    </p>
                    {path.selfConsumptionKwh > 0 && (
                      <p className="text-xs text-green-600 mt-0.5">
                        after solar: {Math.round(path.selfConsumptionKwh).toLocaleString()} kWh self-consumed,
                        {fmt(path.exportRevenueEur)} export
                      </p>
                    )}
                    {path.selfConsumptionKwh === 0 && path.id === 'deep_retrofit' && (
                      <p className="text-xs text-slate-400 mt-0.5">no solar generation</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Saving vs gas</p>
                    <p className="text-base font-semibold text-green-700">{fmt(path.annualSavingEur)}/yr</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">SCOP</p>
                    <p className="text-base font-semibold text-slate-800">{path.scop.toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Worker hours: </span>
                    <span className="font-semibold text-slate-800">{path.totalWorkerHours}</span>
                    <span className="text-slate-400"> (~{Math.round(path.totalWorkerHours / 8)} work days)</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Payback: </span>
                    <span className="font-semibold text-slate-800">
                      {path.annualSavingEur > 0 ? `${(path.totalNet / path.annualSavingEur).toFixed(1)} yrs` : '—'}
                    </span>
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="text-xs font-medium text-slate-600 cursor-pointer hover:text-slate-900">
                    Show itemised costs
                  </summary>
                  <div className="mt-2 text-xs">
                    <div className="grid grid-cols-5 gap-1 text-slate-400 font-medium border-b border-slate-200 pb-1 mb-1">
                      <span className="col-span-2">Item</span>
                      <span className="text-right">Gross</span>
                      <span className="text-right">Grant</span>
                      <span className="text-right">Hours</span>
                    </div>
                    {path.lines.map((line, i) => (
                      <div key={i} className="grid grid-cols-5 gap-1 text-slate-600 py-0.5">
                        <span className="col-span-2 truncate" title={line.label}>{line.label}</span>
                        <span className="text-right tabular-nums">{fmt(line.grossEur)}</span>
                        <span className="text-right tabular-nums text-green-600">
                          {line.grantEur > 0 ? fmt(line.grantEur) : '—'}
                        </span>
                        <span className="text-right tabular-nums">{line.workerHours}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-5 gap-1 font-semibold text-slate-800 border-t border-slate-200 pt-1 mt-1">
                      <span className="col-span-2">Total</span>
                      <span className="text-right tabular-nums">{fmt(path.totalGross)}</span>
                      <span className="text-right tabular-nums text-green-700">{fmt(path.totalGrant)}</span>
                      <span className="text-right tabular-nums">{path.totalWorkerHours}</span>
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>

          {paths.length === 2 && (() => {
            const [pragmatic, deep] = paths;
            const costDiff = deep.totalNet - pragmatic.totalNet;
            const hoursDiff = deep.totalWorkerHours - pragmatic.totalWorkerHours;
            const savingDiff = pragmatic.annualSavingEur - deep.annualSavingEur;
            return (
              <div className="border-l-4 bg-white rounded-r-xl p-5 shadow-sm" style={{ borderColor: '#92400E' }}>
                <p className="text-sm text-slate-800">
                  <strong>The pragmatic path costs {fmt(costDiff)} less</strong>, takes {hoursDiff} fewer worker hours
                  (~{Math.round(hoursDiff / 8)} fewer work days), and
                  {savingDiff > 0
                    ? ` saves ${fmt(savingDiff)}/yr more`
                    : ` saves ${fmt(Math.abs(savingDiff))}/yr less`
                  } on total household bills — including solar self-consumption and export revenue.
                </p>
                <p className="text-sm text-slate-700 mt-3">
                  The deep retrofit achieves a better BER ({deep.berRating} vs {pragmatic.berRating}) and better comfort.
                  But external wall insulation, windows, and floor insulation costing €{Math.round(costDiff / 1000)}k does not deliver
                  better decarbonisation outcomes than a €{Math.round(pragmatic.totalNet / 1000)}k heat pump with solar.
                  The current grant structure rewards the more expensive, slower path.
                </p>
              </div>
            );
          })()}
        </section>
        )}

        {/* ============================================================= */}
        {/* SECTION 1: THE CLIFF                                          */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The cliff</p>
          <p className="text-lg text-slate-700 leading-relaxed">
            If your home's Heat Loss Indicator is 2.0 or below, SEAI gives you <strong>€6,500</strong> towards
            a heat pump. At 2.1, you get <strong>nothing</strong>.
          </p>
          <div className="my-8 py-6 border-y-2" style={{ borderColor: '#92400E' }}>
            <p className="text-2xl md:text-3xl font-serif font-bold text-center leading-tight" style={{ color: '#78350F' }}>
              The difference in running cost between HLI 1.9 and 2.1 is {fmt(costDiff)}/year.
              <br />
              <span className="text-lg md:text-xl font-light">Less than €1 per week. The data shows the cutoff has no engineering basis.</span>
            </p>
          </div>
        </section>

        {/* ============================================================= */}
        {/* SECTION 2: WHAT THE NUMBERS SHOW                              */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The evidence</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight tracking-tight mb-6" style={{ color: '#78350F' }}>Heat pump costs rise smoothly. There is no cliff at HLI 2.0.</h2>

          {/* Chart A: Annual HP bill vs HLI */}
          <div className="mb-10">
            <h3 className="text-base font-serif font-semibold mb-3" style={{ color: '#78350F' }}>Annual heat pump electricity cost</h3>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={sweep} margin={{ top: 5, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hli" tick={{ fontSize: 11 }} xAxisId="hli" />
                <XAxis dataKey="hli" xAxisId="ber" orientation="bottom" axisLine={false} tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickFormatter={hliBerLabel}
                  interval={2}
                  dy={14}
                />
                <YAxis tickFormatter={(v: number) => `€${v}`} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine x={2.0} stroke="#dc2626" strokeDasharray="6 3" xAxisId="hli"
                  label={{ value: 'Grant threshold', fill: '#dc2626', fontSize: 11, position: 'top' }} />
                <Line type="monotone" dataKey="annualHpBillEur" stroke="#2563eb" strokeWidth={2.5} dot={false} name="HP electricity cost" xAxisId="hli" />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-slate-500 mt-2">
              The line is smooth. There is no inflection point at HLI 2.0 — the heat pump doesn't suddenly
              become inefficient.
            </p>
          </div>

          {/* Chart B: 10-year net saving with/without grant */}
          <div className="mb-10">
            <h3 className="text-base font-serif font-semibold mb-3" style={{ color: '#78350F' }}>The grant creates the cliff, not the engineering</h3>
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={sweep} margin={{ top: 5, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hli" tick={{ fontSize: 11 }} xAxisId="hli" />
                <XAxis dataKey="hli" xAxisId="ber" orientation="bottom" axisLine={false} tickLine={false}
                  tick={{ fontSize: 9, fill: '#94a3b8' }}
                  tickFormatter={hliBerLabel}
                  interval={2}
                  dy={14}
                />
                <YAxis tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine x={2.0} stroke="#dc2626" strokeDasharray="6 3" xAxisId="hli" />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
                <Line type="monotone" dataKey="tenYearNetWithGrant" stroke="#2563eb" strokeWidth={2} dot={false} name="With grant" xAxisId="hli" />
                <Line type="monotone" dataKey="tenYearNetNoGrant" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Without grant" xAxisId="hli" />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-slate-500 mt-2">
              The gap between the two lines is the grant — a constant €6,500 that disappears
              at HLI 2.0. The underlying economics barely change.
            </p>
          </div>

          {/* Smoking gun table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">HLI</th>
                  <th className="px-4 py-3 text-right">SCOP</th>
                  <th className="px-4 py-3 text-right">HP bill</th>
                  <th className="px-4 py-3 text-right">Gas bill</th>
                  <th className="px-4 py-3 text-right">Annual saving</th>
                  <th className="px-4 py-3 text-right">Grant</th>
                  <th className="px-4 py-3 text-right">10yr net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[at19, at20, at21, at23, at25].filter(Boolean).map((p) => {
                  const isCliff = p!.hli === 2.1;
                  return (
                    <tr key={p!.hli} className={isCliff ? 'bg-red-50' : p!.hli === 2.0 ? 'bg-green-50' : ''}>
                      <td className="px-4 py-2 font-medium">{p!.hli.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p!.scop.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(p!.annualHpBillEur)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(p!.annualGasBillEur)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(p!.annualSavingEur)}</td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${p!.grantEur > 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {fmt(p!.grantEur)}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">{fmt(p!.tenYearNetWithGrant)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-600 mt-3">
            Between HLI 2.0 and 2.1, the annual saving drops by {fmt(costDiff)}. But the
            10-year outcome drops by <strong>{fmt((at20?.tenYearNetWithGrant ?? 0) - (at21?.tenYearNetWithGrant ?? 0))}</strong> — almost entirely
            because of the grant, not the engineering.
          </p>
        </section>

        {/* ============================================================= */}
        {/* SECTION 3: THE INSULATION TRAP / GRANT CLIFF                  */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The insulation trap</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight tracking-tight mb-6" style={{ color: '#78350F' }}>What does it cost to qualify for the grant?</h2>
          <p className="text-base text-slate-700 mb-4">
            To get the €12,500 heat pump grant, your home's Heat Loss Indicator must be 2.0 or below.
            If you're above that, you need to insulate first. The table below shows what that costs
            depending on where your home starts.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Costs shown are <strong>what you actually pay</strong> — after SEAI insulation grants have been deducted.
            For example, cavity wall fill costs around €1,700 to install, but the SEAI grant covers €1,300,
            so you pay €400 out of pocket.
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200 mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Your starting HLI</th>
                  <th className="px-4 py-3 text-left">What you need to do</th>
                  <th className="px-4 py-3 text-right">You pay (after grants)</th>
                  <th className="px-4 py-3 text-right">Your HLI after</th>
                  <th className="px-4 py-3 text-right">Qualifies?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[crossing23, crossing25, crossing30, crossing35].map((c) => (
                  <tr key={c.startingHli} className={!c.cheapestPath.reachesTarget ? 'bg-red-50' : c.cheapestPath.totalCost <= 2000 ? 'bg-green-50' : 'bg-amber-50'}>
                    <td className="px-4 py-3 font-medium">{c.startingHli.toFixed(1)}</td>
                    <td className="px-4 py-3 text-slate-700 text-xs">
                      {c.cheapestPath.labels.join(' + ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {c.cheapestPath.reachesTarget ? fmt(c.cheapestPath.totalCost) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.cheapestPath.hliAfter.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {c.cheapestPath.reachesTarget
                        ? <span className="text-green-700 font-medium">Yes</span>
                        : <span className="text-red-600 font-medium">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Individual measure breakdown */}
          <details className="mb-6">
            <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900">
              What does each measure cost on its own? (starting from HLI 2.5)
            </summary>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Measure</th>
                    <th className="px-4 py-2 text-right">You pay (after grant)</th>
                    <th className="px-4 py-2 text-right">How much it lowers your HLI</th>
                    <th className="px-4 py-2 text-right">Your HLI after</th>
                    <th className="px-4 py-2 text-right">Enough on its own?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {crossing25.individualMeasures.map((m) => (
                    <tr key={m.measure}>
                      <td className="px-4 py-2">{m.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(m.cost)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">-{m.hliDelta.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.hliAfter.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">
                        {m.reachesTarget ? <span className="text-green-700">Yes</span> : <span className="text-slate-400">No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 mb-4">
            <strong>If your home is close to the threshold (HLI 2.1–2.5):</strong> a single cheap measure
            like cavity wall fill (€400 after grant) or attic insulation (€800 after grant) is enough
            to qualify. The grant system works well for these homes.
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <strong>If your home starts at HLI 3.0 or above:</strong> you need multiple measures
            costing €{Math.round((crossing30.cheapestCostToTarget ?? 0) / 100) * 100}+.
            For homes at HLI 3.5+, even doing everything affordable may not be enough — you could be
            forced into external wall insulation (€14,000 after grant) or internal dry lining
            (€11,000 after grant, including replastering) just to qualify for a €12,500 heat pump grant.
            You spend more on qualifying than the grant is worth.
          </div>
        </section>

        {/* ============================================================= */}
        {/* SECTION 5: ALTERNATIVE POLICIES                               */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>Policy alternatives</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight tracking-tight mb-6" style={{ color: '#78350F' }}>The cliff disappears under every alternative</h2>
          <p className="text-base text-slate-700 mb-6">
            The same model, same house, same weather — but four different grant designs.
            The cliff disappears under every alternative.
          </p>

          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={policyComparison} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hli" tick={{ fontSize: 11 }} label={{ value: 'HLI', position: 'insideBottom', offset: -3, fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
              <Tooltip />
              <ReferenceLine x={2.0} stroke="#dc2626" strokeDasharray="6 3" />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
              {POLICY_SCENARIOS.map((policy, i) => {
                const colors = ['#dc2626', '#2563eb', '#059669', '#d97706'];
                const dashes = ['', '5 3', '8 4', '3 3'];
                return (
                  <Line
                    key={policy.id}
                    type="monotone"
                    dataKey={(d: (typeof policyComparison)[0]) => d.policies[i]?.tenYearNetEur}
                    stroke={colors[i]}
                    strokeWidth={policy.id === 'status_quo' ? 2.5 : 1.5}
                    strokeDasharray={dashes[i]}
                    dot={false}
                    name={policy.label}
                  />
                );
              })}
              <Legend />
            </LineChart>
          </ResponsiveContainer>

          {/* Policy comparison at HLI 2.3 */}
          {at23 && (
            <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Policy</th>
                    <th className="px-4 py-3 text-right">Grant at HLI 2.3</th>
                    <th className="px-4 py-3 text-right">10-year net saving</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {POLICY_SCENARIOS.map((policy) => {
                    const grant = policy.getGrant(2.3);
                    const tenYr = at23.annualSavingEur * 10 - (14000 - grant);
                    return (
                      <tr key={policy.id} className={policy.id === 'status_quo' ? 'bg-red-50' : ''}>
                        <td className="px-4 py-2">{policy.label}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(grant)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(tenYr)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ============================================================= */}
        {/* SECTION 5: CONCLUSION                                         */}
        {/* ============================================================= */}
        <section className="border-t border-slate-200 pt-10">
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>Conclusion</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-tight tracking-tight mb-6" style={{ color: '#78350F' }}>Move the line, or remove it</h2>
          <ol className="list-decimal list-inside space-y-3 text-base text-slate-700">
            <li>
              <strong>The HLI 2.0 threshold has no basis in heat pump engineering.</strong> Performance
              degrades smoothly. There is no inflection point at 2.0.
            </li>
            <li>
              <strong>The threshold forces expensive insulation with poor standalone payback</strong> on
              homeowners who are already close — while completely locking out the oldest, coldest homes
              that would benefit most from decarbonisation.
            </li>
            <li>
              <strong>A sliding scale would preserve the incentive to insulate</strong> (lower HLI = bigger grant)
              while removing the cliff that blocks hundreds of thousands of homes.
            </li>
          </ol>
          <p className="text-lg text-slate-700 mt-6 italic">
            Every winter this threshold stays in place, homes that could run a heat pump burn gas and oil
            instead — not because the technology doesn't work, but because a number on a certificate is
            0.1 too high.
          </p>
        </section>

        {/* ============================================================= */}
        {/* SOURCES                                                        */}
        {/* ============================================================= */}
        <section className="border-t border-slate-200 pt-10">
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>References</p>
          <h2 className="text-2xl font-serif font-bold leading-tight tracking-tight mb-6" style={{ color: '#78350F' }}>Sources and methodology</h2>

          <p className="text-sm text-slate-600 mb-6">
            All figures on this page are generated live from a half-hourly simulation model.
            The sources below were used to calibrate the model and inform the policy analysis.
            Tariff used: {tariff.supplier} {tariff.product}.
          </p>

          <div className="space-y-5 text-sm">
            <Source
              title="SEAI Heat Pump Grants (Feb 2026)"
              url="https://www.seai.ie/grants/home-energy-grants/individual-grants/heat-pump-systems"
              used="Grant amounts for HP (€12,500), insulation, solar (€1,800), windows, doors. All net costs in this report use these figures."
              key_info="HP grant increased to €12,500 in Feb 2026 (€6,500 unit + €2,000 central heating + €4,000 renewable bonus). HLI ≤ 2.0 required."
            />
            <Source
              title="SEAI Insulation & Window Grants (Feb 2026)"
              url="https://www.seai.ie/grants/home-energy-grants/individual-grants/insulation-grants"
              used="Net costs for attic (€1,500 grant), cavity (€1,300), external wall (€6,000), dry lining (€3,500), windows (€3,000), doors (€1,600). Semi-detached rates."
              key_info="Grants increased Feb 2026. Windows and doors newly eligible. Second wall measure now permitted (from Mar 2026)."
            />
            <Source
              title="Finance Act 2020, Section 40 — Carbon Tax"
              url="https://www.irishstatutebook.ie/eli/2020/act/26/section/40/enacted/en/html"
              used="Carbon tax trajectory (€7.50/tonne/yr to €100 by 2030) applied to gas baseline. Shows escalating cost of staying on fossil fuels."
              key_info="€63.50/tonne in 2026. Adds ~1.3c/kWh to gas now, rising to ~2.0c/kWh by 2030. Legislated, not discretionary."
            />
            <Source
              title="EN 14511 / Keymark — Heat Pump COP Test Data"
              url="https://keymark.eu/en/products/heatpumps/certified-products"
              used="COP model calibrated against EN14511 test points: A7/W35 → 4.48 (Vaillant aroTHERM 5kW), A7/W55 → 3.0, A-7/W45 → 2.83. Carnot efficiency η = 0.52."
              key_info="Test-point COPs are lab conditions. Real-world SCOP is 15-25% lower (defrost, cycling, standby). This affects absolute numbers but not the threshold argument — the curves are equally smooth at lower SCOP."
            />
            <Source
              title="Heat Geek — Live Heat Pump Performance Dashboard"
              url="https://www.heatgeek.com/heat-pump-performance-data/"
              used="Validates that well-commissioned systems with weather compensation achieve SCOP 3.5-4.5 in UK/Irish climates. Confirms the 'good install' tier in our model."
              key_info="Heat Geek installs consistently show 30-50% higher SCOP than average UK installs. Key driver: proper weather compensation + radiator sizing — exactly what the 'good install' upgrade represents."
            />
            <Source
              title="EST Renewable Heat Premium Payment (RHPP) Field Trial"
              url="https://www.gov.uk/government/publications/rhpp-heat-pump-monitoring"
              used="Median field SPF of 2.65 across 700+ UK ASHP installs. Used to anchor the 'poor install' SCOP in the model."
              key_info="Median SPF_H4 = 2.44, SPF_H2 = 2.82. Systems without weather comp performed worst. Confirms the SCOP 2.5-3.0 range for poor installs."
            />
            <Source
              title="BEIS Electrification of Heat Demonstration Project (2023)"
              url="https://www.gov.uk/government/publications/electrification-of-heat-demonstration-project"
              used="Median SPF_H2 of 2.82, best quartile ~3.3. Validates that even recent UK installs underperform lab COP by 15-25%."
              key_info="750 heat pumps monitored 2020-2022. Key finding: installer quality and system design are the dominant factors, not the heat pump hardware."
            />
            <Source
              title="ESRI — The Cost of Decarbonising Residential Heat in Ireland (Lynch et al., 2026)"
              url="https://doi.org/10.26504/QEC2026SPR_SA_Lynch"
              used="Provides the economic framework for comparing retrofit paths. Confirms that fabric-first deep retrofit has long payback vs generation-led approaches."
              key_info="ESRI analysis of Irish housing stock decarbonisation costs. Finds significant variation in cost-effectiveness across dwelling types. Supports the argument that a blanket HLI threshold is too blunt."
            />
            <Source
              title="RAP — Ireland's HLI Requirements for Heat Pumps (Lowes, 2022)"
              url="https://www.raponline.org/wp-content/uploads/2023/09/RAP-Lowes-Ireland-HLI-Requirements-2022-Nov-29-FINAL-properties.pdf"
              used="Directly addresses the HLI threshold debate. Argues the 2.0 cutoff is not well-supported by engineering evidence."
              key_info="RAP found that heat pumps perform adequately in homes with HLI above 2.0. Recommended a more flexible approach or higher threshold. The SEAI threshold has not changed since."
            />
            <Source
              title="Met Éireann — Climate Normals 1991-2020"
              url="https://www.met.ie/climate/available-data/climate-normals"
              used="Monthly mean temperatures for Dublin and regional profiles. Drives the half-hourly outdoor temperature model for COP calculations."
              key_info="Dublin Jan mean 7.1°C, Jul mean 17.8°C. Daily amplitude ±2.5°C (winter) to ±4.0°C (summer). Ireland's mild, maritime climate means heat pumps operate in a favourable outdoor temperature range year-round."
            />
            <Source
              title="SEAI BER Research Tool"
              url="https://ndber.seai.ie/BERResearchTool/ber/search.aspx"
              used="HLI distribution across Irish housing stock. Informs the 'who gets locked out' analysis — homes at HLI 2.0-2.5 are the largest segment."
              key_info="The BER database shows the majority of 1970s-1990s Irish homes have HLI between 2.0 and 3.5. These are the homes most affected by the threshold."
            />
            <Source
              title="TABULA Ireland — Building Typology (EPISCOPE/Energy Action)"
              url="https://episcope.eu/fileadmin/tabula/public/docs/brochure/IE_TABULA_TypologyBrochure_EnergyAction.pdf"
              used="Irish house archetypes (pre-1940 to modern) with default HLI, floor area, and wall construction. Drives the archetype selector."
              key_info="Five dwelling types cover the Irish stock: pre-1940 solid wall (HLI ~4.5), 1940-78 semi (3.5), 1980s semi (2.5), 1990s semi (2.0), modern (1.2)."
            />
            <Source
              title="MCS MIS 3005-D — Heat Pump Installation Standard (2025)"
              url="https://mcscertified.com/wp-content/uploads/2025/02/MIS-3005-D-2025-V1.0.pdf"
              used="Design flow temperature lookup and radiator sizing methodology. Informs the 'good install' upgrade costing."
              key_info="MCS requires heat loss survey, weather compensation, and adequate emitter sizing. The 'good install' step in our model represents MCS-compliant commissioning."
            />
            <Source
              title="CRU — Clean Export Guarantee (Micro-generation)"
              url="https://www.cru.ie/professional/energy/energy-policy-and-regulation/micro-generation/"
              used="Export rate floor (~€0.185/kWh). All supplier tariffs in the model use their actual export rates (currently €0.21/kWh across all suppliers)."
              key_info="CRU mandates a minimum export payment for domestic micro-generators. Supplier rates are typically at or slightly above this floor."
            />
          </div>
        </section>

        {/* Limitations */}
        <div className="text-xs text-slate-400 border-t border-slate-100 pt-6 mt-10 space-y-2">
          <p>
            <strong>Limitations:</strong> The COP model uses a Carnot approximation (η = 0.52) calibrated against
            manufacturer test data. Real-world SCOP is typically 15-25% lower due to defrost cycles, part-load
            cycling, and standby/pump losses. This affects absolute bill figures but not the shape of the
            HLI-vs-performance curves — the threshold is equally arbitrary at lower SCOP values.
          </p>
          <p>
            Temperature profiles use Met Éireann monthly normals with sinusoidal daily variation. Real weather
            includes cold snaps (0 to -3°C overnight) not captured by the synthetic model, which slightly
            underestimates peak demand and overestimates winter COP.
          </p>
          <p>
            Solar yield assumes 950 kWh/kWp/yr (standard Irish estimate, south-facing, unshaded). Actual yield
            varies with orientation, shading, and weather. Self-consumption and export are calculated from
            real Dublin 2025 half-hourly irradiance data via the same simulation engine used by the main calculator.
          </p>
        </div>
      </div>
    </div>
  );
}

function Source({ title, url, used, key_info }: { title: string; url: string; used: string; key_info: string }) {
  return (
    <div className="border-l-2 border-slate-200 pl-4">
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue-700 hover:underline">
        {title}
      </a>
      <p className="text-xs text-slate-500 mt-1"><strong>How used:</strong> {used}</p>
      <p className="text-xs text-slate-400 mt-0.5"><strong>Key info:</strong> {key_info}</p>
    </div>
  );
}
