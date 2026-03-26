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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { domesticTariffs } from '../utils/domesticTariffParser';
import { loadSolarData } from '../utils/solarDataLoader';
import type { ParsedSolarData } from '../utils/solarTimeseriesParser';
import { formatCurrency } from '../utils/format';
import {
  sweepHli,
  analyseThresholdCrossing,
  compareRetrofitPaths,
  type PathComparison,
} from '../utils/hliThresholdAnalysis';

const DEFAULT_TARIFF = domesticTariffs.find((t) => t.type === '24-hour' || t.id?.includes('standard')) ?? domesticTariffs[0];

function fmt(n: number) { return formatCurrency(n); }

const MEASURE_DISRUPTION = {
  attic:      { level: 'None',     color: 'text-green-700' },
  cavity:     { level: 'None',     color: 'text-green-700' },
  airSealing: { level: 'Minimal',  color: 'text-slate-500' },
  ewi:        { level: 'Severe',   color: 'text-red-600 font-medium' },
  drylining:  { level: 'Severe',   color: 'text-red-600 font-medium' },
  floor:      { level: 'Severe',   color: 'text-red-600 font-medium' },
  windows:    { level: 'Medium',   color: 'text-amber-600' },
  doors:      { level: 'Minimal',  color: 'text-slate-500' },
} as const;

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

  // Key threshold points
  const at19 = sweep.find((p) => p.hli === 1.9);
  const at21 = sweep.find((p) => p.hli === 2.1);


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
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold leading-[1.08] tracking-tight mt-5 mb-5 max-w-2xl" style={{ color: '#78350F' }}
          >
            A simple, proven way to fix Ireland's domestic decarbonisation
          </h1>
          <p className="text-lg md:text-xl leading-relaxed max-w-2xl text-stone-700">
            Our heat pump policy isn't working. We've handcuffed ourselves with rules the data
            proves wrong. The fix is fast, cheap, less labour-intensive, and better for consumers.
            We need to electrify first, not deep-insulate first.
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
          <p className="text-xs font-medium tracking-widest uppercase mb-5" style={{ color: '#92400E' }}>The national problem</p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7]">
            Ireland committed to retrofitting 500,000 homes to BER B2 by 2030 and installing
            400,000 heat pumps. By end-2024, just 57,932 deep retrofits were complete, 11.5% of
            target. Only 14,194 heat pump grants were drawn down. At this pace, heat pump targets
            won't be met
            until <a href="https://www.rte.ie/news/2026/0310/1562514-climate-targets/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">2042</a>.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            The ESRI's March 2026 analysis
            (<a href="https://doi.org/10.26504/QEC2026SPR_SA_Lynch" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">Lynch et al.</a>)
            explains why. A deep retrofit of a detached house costs over €66,000 before grants,
            €45,000 after, with loan repayments of €770/month, a second mortgage. Annual energy
            saving: roughly €900. Simple payback: <a href="https://www.irishtimes.com/business/2026/03/11/we-need-a-retrofit-reality-check-the-figures-dont-stack-up-and-we-cant-be-bothered/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">48 years</a>.
            Uptake has stalled not because homeowners don't care about climate, but because
            the numbers don't work.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            The ESRI correctly identifies the problem, but its biofuels alternative is a
            distraction. A boiler converts biogas to heat at ~90% efficiency. A heat pump converts
            electricity to heat at 300–450% efficiency, <strong>3–5 times more heat</strong> per unit
            of primary energy (<a href="https://www.iea.org/reports/the-future-of-heat-pumps" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">IEA, 2022</a>).
            Ireland lacks the biomass to heat its housing stock, and
            the <a href="https://www.chathamhouse.org/2017/02/woody-biomass-power-and-heat" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">"carbon neutral" claim doesn't survive scrutiny</a> once
            you account for land use, supply chain emissions, and regrowth timescales. The IPCC
            is clear: bioenergy should be reserved for sectors that can't electrify. Homes can.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            Ireland faces a 40% shortfall in skilled carpenters and electricians. Hitting the
            2030 target requires 75,000 deep retrofits a year, three times the current rate. We
            don't have the workers even if every homeowner said yes. And many won't: the ESRI
            finds over 40% of homeowners are highly unlikely to undertake a deep retrofit, with
            the disruption alone valued at
            <a href="https://doi.org/10.26504/QEC2026SPR_SA_Lynch" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">€9,000–€24,000</a> per
            household (Curtis et al. 2024), potentially requiring families to vacate their homes
            for the duration of the work.
          </p>
        </section>

        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The insulation obsession</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-snug tracking-tight mb-6" style={{ color: '#78350F' }}>We built our entire strategy around the wrong lever.</h2>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7]">
            The cost of heating a home comes down to three things:
          </p>
          <div className="my-6 py-4 px-6 rounded-xl text-center" style={{ backgroundColor: '#FEF3C7' }}>
            <p className="text-sm font-mono tracking-wide" style={{ color: '#78350F' }}>
              <span className="font-semibold">heating cost</span>
              {' = '}
              <span className="italic">electricity price</span>
              {' × '}
              <span className="italic">conversion efficiency</span>
              {' × '}
              <span className="italic">heat retention</span>
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mt-2">
              i.e. what you pay per unit · how well your system turns it into heat · how well your house keeps it
            </p>
          </div>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7]">
            Twenty years ago, insulation was the only lever you could improve. Heat pumps were
            rare and expensive. Solar panels were exotic. So our entire retrofit strategy, grants,
            BER ratings, contractor training, was built around fabric. Insulate first. Insulate
            everything. Then maybe talk about heating.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            That made sense in 2005. It doesn't in 2026. The ESRI found theoretical energy
            savings from insulation are significantly overstated: homes rated F or G use 56% less
            energy than their BER predicts, because people in cold houses heat less. A-rated homes
            use 40% more than predicted. The gap between theory and reality undermines the entire
            fabric-first rationale.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            Today, a heat pump turns every unit of electricity into 3–4 units of heat. An 8 kWp
            solar array with a battery generates cheap electricity on the roof. These are the
            scalable levers. They work on every house, need no scaffolding, and install in days.
            But our grant system still pushes homeowners into the most expensive solution (full
            fabric retrofit), the most disruptive (months of construction), and the most
            labour-intensive, when we don't have enough workers.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            The HLI 2.0 threshold forces this choice. If your house isn't insulated enough,
            you can't get the heat pump grant, even though the heat pump would cut your bills
            and emissions regardless.
          </p>
        </section>

        {/* ============================================================= */}
        {/* WHAT THIS LOOKS LIKE IN PRACTICE                               */}
        {/* ============================================================= */}
        {paths.length === 2 && (
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>What this actually looks like</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-snug tracking-tight mb-6" style={{ color: '#78350F' }}>Two paths, same house</h2>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mb-6">
            Take a typical 1980s semi-detached (HLI 2.5, 108 m²). Two ways to decarbonise it.
            One spends on generation, the other on fabric. Same heat pump in both.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {paths.map((path) => (
              <div key={path.id} className={`rounded-xl border-2 p-5 ${path.id === 'pragmatic' ? 'border-blue-300 bg-blue-50/30' : 'border-amber-300 bg-amber-50/30'}`}>
                <h3 className="text-base font-semibold text-slate-900">{path.label}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mt-1">{path.subtitle}</p>
                <p className="text-xs text-slate-400 mt-1">BER after: {path.berRating} · HLI: {path.hliAfter.toFixed(2)}</p>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div>
                    <p className="text-xs text-slate-400">Gross cost</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt(path.totalGross)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Total grants</p>
                    <p className="text-lg font-semibold tabular-nums text-green-700">-{fmt(path.totalGrant)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">You pay</p>
                    <p className="text-lg font-semibold tabular-nums text-slate-900">{fmt(path.totalNet)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <p className="text-xs text-slate-400">Annual bill</p>
                    <p className="text-base font-semibold tabular-nums text-slate-700">{fmt(path.annualBillEur)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Saving vs gas</p>
                    <p className="text-base font-semibold tabular-nums text-green-700">{fmt(path.annualSavingEur)}/yr</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">SCOP</p>
                    <p className="text-base font-semibold tabular-nums text-slate-700">{path.scop.toFixed(2)}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Work days: </span>
                    <span className="font-semibold tabular-nums text-slate-700">{Math.round(path.totalWorkerHours / 8)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Payback: </span>
                    <span className="font-semibold tabular-nums text-slate-700">
                      {path.annualSavingEur > 0 ? `${(path.totalNet / path.annualSavingEur).toFixed(1)} yrs` : '—'}
                    </span>
                  </div>
                </div>

                <details className="mt-4">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                    Show itemised costs
                  </summary>
                  <div className="mt-2 text-xs">
                    <div className="grid grid-cols-5 gap-1 text-[0.6875rem] tracking-wide uppercase text-slate-400 font-medium border-b border-slate-200 pb-1 mb-1">
                      <span className="col-span-2">Item</span>
                      <span className="text-right">Gross</span>
                      <span className="text-right">Grant</span>
                      <span className="text-right">Days</span>
                    </div>
                    {path.lines.map((line, i) => (
                      <div key={i} className="grid grid-cols-5 gap-1 text-slate-700 py-0.5">
                        <span className="col-span-2 truncate" title={line.label}>{line.label}</span>
                        <span className="text-right tabular-nums">{fmt(line.grossEur)}</span>
                        <span className="text-right tabular-nums text-green-600">
                          {line.grantEur > 0 ? fmt(line.grantEur) : '—'}
                        </span>
                        <span className="text-right tabular-nums">{Math.round(line.workerHours / 8)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-5 gap-1 font-semibold text-slate-900 border-t border-slate-200 pt-1 mt-1">
                      <span className="col-span-2">Total</span>
                      <span className="text-right tabular-nums">{fmt(path.totalGross)}</span>
                      <span className="text-right tabular-nums text-green-700">{fmt(path.totalGrant)}</span>
                      <span className="text-right tabular-nums">{Math.round(path.totalWorkerHours / 8)}</span>
                    </div>
                    <div className="border-t border-slate-100 pt-2 mt-2 text-slate-400 space-y-0.5">
                      <p>Incl. base house load of {path.baseLoadKwh.toLocaleString()} kWh/yr</p>
                      {path.selfConsumptionKwh > 0 && (
                        <p className="text-green-600">
                          Solar: {Math.round(path.selfConsumptionKwh).toLocaleString()} kWh self-consumed, {fmt(path.exportRevenueEur)} export
                        </p>
                      )}
                      {path.selfConsumptionKwh === 0 && path.id === 'deep_retrofit' && (
                        <p>No solar generation</p>
                      )}
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>

          {paths.length === 2 && (() => {
            const [pragmatic, deep] = paths;
            const costDiff = deep.totalNet - pragmatic.totalNet;
            const daysDiff = Math.round((deep.totalWorkerHours - pragmatic.totalWorkerHours) / 8);
            const savingDiff = pragmatic.annualSavingEur - deep.annualSavingEur;
            return (
                <div className="border-l-4 bg-white rounded-r-xl p-5 shadow-sm" style={{ borderColor: '#92400E' }}>
                  <p className="text-[1.0625rem] font-medium text-slate-800 leading-[1.7]">
                    <strong>The pragmatic path costs {fmt(costDiff)} less</strong>, takes {daysDiff} fewer work days, and
                    {savingDiff > 0
                      ? ` saves ${fmt(savingDiff)}/yr more`
                      : ` saves ${fmt(Math.abs(savingDiff))}/yr less`
                    } on total household bills, including solar self-consumption and export revenue.
                  </p>
                  <p className="text-sm text-slate-500 leading-relaxed mt-3">
                    Deep retrofit achieves a better BER ({deep.berRating} vs {pragmatic.berRating}) and better comfort.
                    But €{Math.round(costDiff / 1000)}k of insulation and windows does not deliver better decarbonisation
                    than a €{Math.round(pragmatic.totalNet / 1000)}k heat pump with solar. The grant structure rewards
                    the more expensive, slower path.
                  </p>
                </div>
            );
          })()}
        </section>
        )}

        {/* ============================================================= */}
        {/* SECTION 2: WHAT THE NUMBERS SHOW                              */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The evidence</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-snug tracking-tight mb-6" style={{ color: '#78350F' }}>Heat pump costs rise smoothly. There is no cliff at HLI 2.0.</h2>

          <div className="py-10 mb-8">
            <p className="font-serif text-lg md:text-xl leading-relaxed tracking-tight text-center italic" style={{ color: '#78350F' }}>
              The difference in running cost between HLI 1.9 and 2.1
              is <strong>{fmt(costDiff)}/year</strong>. Less than €1 per week.
            </p>
          </div>

          {/* Chart A: Annual HP bill vs HLI */}
          <div className="mb-10">
            <h3 className="text-base font-semibold mb-3 text-slate-900">Annual heat pump electricity cost</h3>
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
            <p className="text-sm text-slate-500 leading-relaxed mt-2">
              The line is smooth. There is no inflection point at HLI 2.0; the heat pump doesn't suddenly
              become inefficient.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Modelled from EN 14511 COP test data, validated against real-world SCOP from{' '}
              <a href="https://www.heatgeek.com/heat-pump-performance-data/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">
                Heat Geek live installations
              </a>{' '}
              and the EST RHPP field trial (700+ UK/Irish heat pumps).
            </p>
          </div>

        </section>

        {/* ============================================================= */}
        {/* SECTION 3: THE INSULATION TRAP / GRANT CLIFF                  */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>The insulation trap</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-snug tracking-tight mb-6" style={{ color: '#78350F' }}>What does it cost to qualify for the grant?</h2>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mb-4">
            To get the €12,500 heat pump grant, your home's Heat Loss Indicator must be 2.0 or
            below. If not, you must insulate first. The table shows what that costs depending on
            your starting point.
          </p>
          <p className="text-sm text-slate-500 leading-relaxed mb-6">
            Costs shown are <strong>net of SEAI insulation grants</strong>. Example: cavity wall fill
            costs ~€1,700 to install; the grant covers €1,300, leaving €400 out of pocket.
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200 mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[0.6875rem] font-medium tracking-wide uppercase text-slate-400">
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
                    <td className={`px-4 py-3 text-right tabular-nums font-medium ${c.cheapestPath.reachesTarget && c.cheapestPath.totalCost >= 5000 ? 'text-red-700' : ''}`}>
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

          {/* Individual measure breakdown — expanded */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              What does each measure cost on its own? (starting from HLI 2.5)
            </h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[0.6875rem] font-medium tracking-wide uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left">Measure</th>
                    <th className="px-4 py-2 text-right">You pay (after grant)</th>
                    <th className="px-4 py-2 text-right">HLI reduction</th>
                    <th className="px-4 py-2 text-right">Your HLI after</th>
                    <th className="px-4 py-2 text-right">Annual fuel saving</th>
                    <th className="px-4 py-2 text-right">Payback</th>
                    <th className="px-4 py-2 text-right">Disruption</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {crossing25.individualMeasures.map((m) => {
                    const disruption = MEASURE_DISRUPTION[m.measure as keyof typeof MEASURE_DISRUPTION] ?? { level: 'Minimal', color: 'text-slate-500' };
                    const isExpensive = m.cost >= 5000;
                    return (
                    <tr key={m.measure} className={isExpensive ? 'bg-red-50' : ''}>
                      <td className="px-4 py-2">{m.label}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${isExpensive ? 'text-red-700 font-medium' : ''}`}>{fmt(m.cost)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">-{m.hliDelta.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.hliAfter.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmt(Math.round(m.annualFuelSavingEur))}/yr</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {m.paybackYears === Infinity
                          ? '—'
                          : m.paybackYears > 50
                            ? '50+ yrs'
                            : `${Math.round(m.paybackYears)} yrs`}
                      </td>
                      <td className={`px-4 py-2 text-right ${disruption.color}`}>{disruption.level}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 leading-relaxed mb-4">
            <strong>If your home is close to the threshold (HLI 2.1–2.5):</strong> a single cheap measure
            like cavity wall fill (€400 after grant) or attic insulation (€800 after grant) is enough
            to qualify. The grant system works well for these homes.
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 leading-relaxed">
            <strong>If your home starts at HLI 3.0 or above:</strong> you need multiple measures
            costing €{Math.round((crossing30.cheapestCostToTarget ?? 0) / 100) * 100}+.
            For homes at HLI 3.5+, even doing everything affordable may not be enough. You could be
            forced into external wall insulation (€14,000 after grant) or internal dry lining
            (€11,000 after grant, including replastering) just to qualify for a €12,500 heat pump grant.
            You spend more on qualifying than the grant is worth.
          </div>
        </section>

        {/* ============================================================= */}
        {/* SECTION: LOOKING TO THE FUTURE                               */}
        {/* ============================================================= */}
        <section>
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>Looking to the future</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-snug tracking-tight mb-6" style={{ color: '#78350F' }}>Insulation can't be measured. Electrification can.</h2>

          <p className="text-[1.0625rem] text-slate-700 leading-[1.7]">
            The ESRI's own research exposes a fundamental problem with fabric-first policy:
            insulation's real-world impact is unmeasurable. A study
            of <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC8550629/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">nearly 10,000 Irish households</a> (Meles,
            Farrell &amp; Curtis, 2021) found that F/G-rated homes use <strong>56% less energy</strong> than
            their BER predicts; A/B-rated homes use <strong>40% more</strong>. A G-rated house consumes
            just 3.7% more energy per year than an A-rated one. The BER predicts a fivefold
            difference. The real difference is almost nothing.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            This isn't a rounding error, it's a systemic measurement failure. People in cold
            homes heat less; people in warm homes heat more. The BER assumes everyone heats to 21°C
            for 8 hours daily. Nobody does. And once cavity fill is injected or attic insulation
            boarded over, work quality
            is <a href="https://www.esri.ie/publications/bunching-of-residential-building-energy-performance-certificates-at-threshold-values" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">essentially non-verifiable</a> without
            destructive inspection. Collins &amp; Curtis (2018) found systematic bunching of BER
            certificates at grade boundaries, with assessors nudging inputs to push ratings over the line.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            Electrification is the opposite. A solar panel's output is metered to the watt. A heat
            pump's SCOP is measured by comparing electricity in to heat out. A battery's cycling is
            logged by its management system. All readable remotely, verifiable nationally, auditable
            in seconds. No inspector subjectivity, no hidden workmanship, no performance gap.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            The economics point the same way. Insulation is labour and raw materials, costs
            that only rise, competing with a construction sector that can't find enough workers
            for housing. Solar and batteries are manufactured technologies on global learning
            curves, costs that fall every year. A residential solar system that cost
            €12,000 five years ago costs €6,000 today. Deep retrofit costs have moved the other way:
            the average SEAI-supported upgrade went from €2,600 in 2015 to €29,000 in 2025.
          </p>
          <p className="text-[1.0625rem] text-slate-700 leading-[1.7] mt-4">
            Electrify-first aligns Ireland with technologies getting cheaper, faster to deploy,
            and verifiable at national scale. Fabric-first locks us into technologies getting more
            expensive, taking months to install, and unmeasurable even after completion.
          </p>
        </section>

        {/* ============================================================= */}
        {/* SECTION 5: CONCLUSION                                         */}
        {/* ============================================================= */}
        <section className="border-t border-slate-200 pt-10">
          <p className="text-xs font-medium tracking-widest uppercase mb-3" style={{ color: '#92400E' }}>Policy fixes</p>
          <h2 className="text-2xl md:text-3xl font-serif font-bold leading-snug tracking-tight mb-6" style={{ color: '#78350F' }}>Two changes now, one for the future</h2>

          <p className="text-xs font-medium tracking-widest uppercase mb-4" style={{ color: '#92400E' }}>Now</p>
          <ol className="list-decimal list-inside space-y-5 text-[1.0625rem] text-slate-700 leading-[1.7]">
            <li>
              <strong>Raise the HLI threshold from 2.0 to 2.5.</strong> Costs rise smoothly through
              the range; there is no cliff at 2.0. A 2.5 threshold would unlock heat pump grants for
              hundreds of thousands of currently excluded homes, including most pre-2000 semi-detached
              houses, without meaningfully increasing running costs. A home at HLI 2.5 still runs a
              heat pump efficiently; it just pays slightly more in electricity than one at 2.0.
            </li>
            <li>
              <strong>Create an "Electrify Your Heating" package bundling heat pump and solar
              grants.</strong> A heat pump dramatically increases electricity consumption; the modelling
              shows annual bills of €1,400–€2,000+. Solar PV directly offsets this load, especially
              in summer when panels produce most and the heat pump is off. Bundling grants would
              drive simultaneous installation, maximising self-consumption, reducing grid strain,
              and strengthening electrification economics. The current system treats heating and
              generation as separate decisions. They should be one package.
            </li>
          </ol>

          <p className="text-xs font-medium tracking-widest uppercase mt-10 mb-4" style={{ color: '#92400E' }}>Future</p>
          <ol start={3} className="list-decimal list-inside space-y-5 text-[1.0625rem] text-slate-700 leading-[1.7]">
            <li>
              <strong>Replace inspector-based grant verification with remote performance
              data.</strong> Every heat pump, solar inverter, and battery already reports real-time
              performance. Instead of sending inspectors to check insulation they cannot see behind
              walls, require installers to submit seasonal performance reports: verified SCOP for
              heat pumps, measured kWh yield for solar, battery cycle data if installed. If the
              system misses its targets after one heating season, the installer must fix it or
              return the grant. The data shows exactly what is wrong and who installed it. No
              ambiguity. This shifts verification from subjective site visits to objective,
              automated, national-scale accountability, entirely remote. No inspectors, no
              scheduling, no gaming.
            </li>
          </ol>
          <p className="text-xs text-slate-400 leading-relaxed mt-6">
            The opportunity is enormous. Around 1.44 million Irish homes, 78.6% of occupied
            dwellings, still heat with fossil fuels (<a href="https://www.cso.ie/en/releasesandpublications/ep/p-cpp2/censusofpopulation2022profile2-housinginireland/occupieddwellings/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">CSO Census 2022</a>).
            A <a href="https://www.marei.ie/wp-content/uploads/2022/07/Quantifying-the-Potential-for-Rooftop-Solar-Photovoltaic-in-Ireland.pdf" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-700">national satellite analysis by MaREI (UCC)</a> found
            over 1 million homes have suitable roof space for solar PV. Because the fossil-fuel stock
            is dominated by detached and semi-detached houses, the types with the largest, least-shaded
            roofs, an estimated 750,000 to 900,000 fossil-fuel-heated homes could realistically
            install solar alongside a heat pump.
          </p>
          <div className="py-10 my-8">
            <p className="font-serif text-lg md:text-xl leading-relaxed tracking-tight text-center italic" style={{ color: '#78350F' }}>
              Every winter these barriers remain, homes that could be running
              a heat pump burn gas and oil instead, not because the technology
              doesn't work, but because policy hasn't caught up with the engineering.
            </p>
          </div>
        </section>

        {/* ============================================================= */}
        {/* SOURCES                                                        */}
        {/* ============================================================= */}
        <section className="border-t border-slate-200 pt-10">
          <p className="text-xs font-medium tracking-widest uppercase mb-1" style={{ color: '#92400E' }}>Methodology &amp; Data Sources</p>
          <p className="text-xs text-slate-400 leading-relaxed mt-3 mb-8">
            All figures generated live from a half-hourly simulation model. Tariff: {tariff.supplier} {tariff.product}.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-0">

            {/* ── Grants & Policy ── */}
            <div className="border-t border-slate-200 pt-4 mb-5">
              <p className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: 'rgba(146,64,14,0.5)' }}>
                Grants &amp; Policy
              </p>
              <div className="space-y-3">
                <Ref n={1} text={<>Sustainable Energy Authority of Ireland. <span className="italic">Heat Pump Grant — Domestic.</span> HP grant €12,500 (Feb 2026). HLI ≤ 2.0 required.</>} url="https://www.seai.ie/grants/home-energy-grants/individual-grants/heat-pump-systems" domain="seai.ie" />
                <Ref n={2} text={<>Sustainable Energy Authority of Ireland. <span className="italic">Insulation &amp; Window Grants.</span> Net costs used for all insulation measures. Rates for semi-detached.</>} url="https://www.seai.ie/grants/home-energy-grants/individual-grants/insulation-grants" domain="seai.ie" />
                <Ref n={3} text={<>Oireachtas. <span className="italic">Finance Act 2020, Section 40 — Carbon Tax.</span> €63.50/tonne in 2026, legislated trajectory to €100 by 2030.</>} url="https://www.irishstatutebook.ie/eli/2020/act/26/section/40/enacted/en/html" domain="irishstatutebook.ie" />
                <Ref n={4} text={<>Lynch et al. <span className="italic">The Cost of Decarbonising Residential Heat in Ireland.</span> ESRI QEC 2026. Confirms fabric-first deep retrofit has long payback.</>} url="https://doi.org/10.26504/QEC2026SPR_SA_Lynch" domain="doi.org" />
                <Ref n={5} text={<>Lowes, R. <span className="italic">Ireland's HLI Requirements for Heat Pumps.</span> RAP, 2022. Argues the 2.0 cutoff is not supported by engineering evidence.</>} url="https://www.raponline.org/wp-content/uploads/2023/09/RAP-Lowes-Ireland-HLI-Requirements-2022-Nov-29-FINAL-properties.pdf" domain="raponline.org" />
              </div>
            </div>

            {/* ── Heat Pump Performance ── */}
            <div className="border-t border-slate-200 pt-4 mb-5">
              <p className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: 'rgba(146,64,14,0.5)' }}>
                Heat Pump Performance
              </p>
              <div className="space-y-3">
                <Ref n={6} text={<>European Committee for Standardization. <span className="italic">EN 14511 / Keymark — Heat Pump COP Test Data.</span> COP model calibrated against test points. Carnot η = 0.52.</>} url="https://keymark.eu/en/products/heatpumps/certified-products" domain="keymark.eu" />
                <Ref n={7} text={<>Heat Geek. <span className="italic">Live Heat Pump Performance Dashboard.</span> Validates SCOP 3.5–4.5 for well-commissioned systems with weather compensation.</>} url="https://www.heatgeek.com/heat-pump-performance-data/" domain="heatgeek.com" />
                <Ref n={8} text={<>Energy Saving Trust. <span className="italic">Renewable Heat Premium Payment (RHPP) Field Trial.</span> Median SPF 2.65 across 700+ UK ASHP installs.</>} url="https://www.gov.uk/government/publications/rhpp-heat-pump-monitoring" domain="gov.uk" />
                <Ref n={9} text={<>BEIS. <span className="italic">Electrification of Heat Demonstration Project.</span> 750 heat pumps monitored 2020–2022. Median SPF_H2 = 2.82.</>} url="https://www.gov.uk/government/publications/electrification-of-heat-demonstration-project" domain="gov.uk" />
              </div>
            </div>

            {/* ── Building Data ── */}
            <div className="border-t border-slate-200 pt-4 mb-5">
              <p className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: 'rgba(146,64,14,0.5)' }}>
                Building Data
              </p>
              <div className="space-y-3">
                <Ref n={10} text={<>Sustainable Energy Authority of Ireland. <span className="italic">BER Research Tool.</span> HLI distribution across Irish housing stock.</>} url="https://ndber.seai.ie/BERResearchTool/ber/search.aspx" domain="seai.ie" />
                <Ref n={11} text={<>EPISCOPE / Energy Action. <span className="italic">TABULA Ireland — Building Typology.</span> Irish house archetypes with default HLI, floor area, and construction type.</>} url="https://episcope.eu/fileadmin/tabula/public/docs/brochure/IE_TABULA_TypologyBrochure_EnergyAction.pdf" domain="episcope.eu" />
                <Ref n={12} text={<>MCS. <span className="italic">MIS 3005-D — Heat Pump Installation Standard (2025).</span> Design flow temperature lookup and radiator sizing methodology.</>} url="https://mcscertified.com/wp-content/uploads/2025/02/MIS-3005-D-2025-V1.0.pdf" domain="mcscertified.com" />
              </div>
            </div>

            {/* ── Climate & Energy ── */}
            <div className="border-t border-slate-200 pt-4 mb-5">
              <p className="text-xs font-semibold mb-3 tracking-widest uppercase" style={{ color: 'rgba(146,64,14,0.5)' }}>
                Climate &amp; Energy
              </p>
              <div className="space-y-3">
                <Ref n={13} text={<>Met Éireann. <span className="italic">Climate Normals 1991–2020.</span> Monthly mean temperatures for Dublin. Drives half-hourly outdoor temperature model.</>} url="https://www.met.ie/climate/available-data/climate-normals" domain="met.ie" />
                <Ref n={14} text={<>Commission for Regulation of Utilities. <span className="italic">Clean Export Guarantee (Micro-generation).</span> Export rate floor ~€0.185/kWh.</>} url="https://www.cru.ie/professional/energy/energy-policy-and-regulation/micro-generation/" domain="cru.ie" />
              </div>
            </div>

          </div>
        </section>

        {/* Limitations */}
        <div className="text-xs text-slate-400 leading-relaxed border-t border-slate-100 pt-6 mt-10 space-y-2">
          <p>
            <strong>Limitations:</strong> The COP model uses a Carnot approximation (η = 0.52) calibrated against
            manufacturer test data. Real-world SCOP is typically 15-25% lower due to defrost cycles, part-load
            cycling, and standby/pump losses. This affects absolute bill figures but not the shape of the
            HLI-vs-performance curves; the threshold is equally arbitrary at lower SCOP values.
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

function Ref({ n, text, url, domain }: { n: number; text: React.ReactNode; url: string; domain: string }) {
  return (
    <div className="flex gap-3">
      <span className="font-mono text-xs flex-shrink-0 mt-0.5 w-5 text-right text-slate-300">[{n}]</span>
      <p className="text-xs leading-relaxed text-slate-500">
        {text}{' '}
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 decoration-dotted text-slate-400 hover:text-slate-600">{domain}</a>.
      </p>
    </div>
  );
}
