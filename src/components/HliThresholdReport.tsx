/**
 * Special report: "The HLI 2.0 Cliff"
 *
 * Route: /report/hli-threshold
 *
 * Generates live analysis showing SEAI's HLI ≤ 2.0 grant threshold is
 * arbitrary. Sweeps HLI 0.8–3.5 through the HP model, analyses what
 * measures are needed to cross the threshold, and compares policy alternatives.
 */

import { useMemo } from 'react';
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
import { formatCurrency } from '../utils/format';
import {
  sweepHli,
  analyseThresholdCrossing,
  comparePolicies,
  POLICY_SCENARIOS,
} from '../utils/hliThresholdAnalysis';

const DEFAULT_TARIFF = domesticTariffs.find((t) => t.type === '24-hour' || t.id?.includes('standard')) ?? domesticTariffs[0];

function fmt(n: number) { return formatCurrency(n); }

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

  if (!tariff || sweep.length === 0) return <div className="p-8">Loading...</div>;

  const costDiff = at21 && at19
    ? Math.abs(at21.annualHpBillEur - at19.annualHpBillEur)
    : 0;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <Link to="/heat-pump" className="text-sm text-slate-500 hover:text-slate-800">
            ← Heat Pump Calculator
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-3">
            The HLI 2.0 Cliff
          </h1>
          <p className="text-lg text-slate-600 mt-2">
            Why Ireland's heat pump grant threshold costs homeowners and the climate
          </p>
          <p className="text-xs text-slate-400 mt-3">
            All figures generated live from a half-hourly heat pump simulation model.
            Reference: 1980s semi-detached, 108 m², Dublin weather, {tariff.supplier} {tariff.product} tariff.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-10 space-y-16">

        {/* ============================================================= */}
        {/* SECTION 1: THE CLIFF                                          */}
        {/* ============================================================= */}
        <section>
          <p className="text-lg text-slate-700 leading-relaxed">
            If your home's Heat Loss Indicator is 2.0 or below, SEAI gives you <strong>€6,500</strong> towards
            a heat pump. At 2.1, you get <strong>nothing</strong>.
          </p>
          <p className="text-lg text-slate-700 leading-relaxed mt-4">
            The difference in actual running cost between those two homes
            is <strong>{fmt(costDiff)}/year</strong> — less than €1/week. This page asks:
            does that cutoff make any engineering sense?
          </p>
        </section>

        {/* ============================================================= */}
        {/* SECTION 2: WHAT THE NUMBERS SHOW                              */}
        {/* ============================================================= */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-6">What the numbers actually show</h2>

          {/* Chart A: Annual HP bill vs HLI */}
          <div className="mb-10">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Annual heat pump electricity cost</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={sweep} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hli" label={{ value: 'HLI (W/K/m²)', position: 'insideBottom', offset: -3, fontSize: 12 }} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `€${v}`} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine x={2.0} stroke="#dc2626" strokeDasharray="6 3" label={{ value: 'Grant threshold', fill: '#dc2626', fontSize: 11, position: 'top' }} />
                <Line type="monotone" dataKey="annualHpBillEur" stroke="#2563eb" strokeWidth={2.5} dot={false} name="HP electricity cost" />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-sm text-slate-500 mt-2">
              The line is smooth. There is no inflection point at HLI 2.0 — the heat pump doesn't suddenly
              become inefficient.
            </p>
          </div>

          {/* Chart B: SCOP vs HLI */}
          <div className="mb-10">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Seasonal COP (efficiency)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={sweep} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hli" tick={{ fontSize: 11 }} />
                <YAxis domain={[2, 5]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine x={2.0} stroke="#dc2626" strokeDasharray="6 3" />
                <Line type="monotone" dataKey="scop" stroke="#059669" strokeWidth={2.5} dot={false} name="SCOP" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart C: 10-year net saving with/without grant */}
          <div className="mb-10">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">10-year net saving vs gas boiler</h3>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={sweep} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hli" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip />
                <ReferenceLine x={2.0} stroke="#dc2626" strokeDasharray="6 3" />
                <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="2 2" />
                <Line type="monotone" dataKey="tenYearNetWithGrant" stroke="#2563eb" strokeWidth={2} dot={false} name="With grant" />
                <Line type="monotone" dataKey="tenYearNetNoGrant" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 3" dot={false} name="Without grant" />
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
          <h2 className="text-xl font-bold text-slate-900 mb-4">The grant cliff: can you get there cheaply?</h2>
          <p className="text-base text-slate-700 mb-6">
            If your HLI is above 2.0, SEAI says: insulate first, then apply for the heat pump grant.
            But what does that actually cost? And for houses that start higher, is it even possible
            with affordable measures?
          </p>

          <div className="overflow-x-auto rounded-lg border border-slate-200 mb-6">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Starting HLI</th>
                  <th className="px-4 py-3 text-left">Cheapest path to HLI ≤ 2.0</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">HLI after</th>
                  <th className="px-4 py-3 text-right">Reaches 2.0?</th>
                  <th className="px-4 py-3 text-right">Affordable?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[crossing23, crossing25, crossing30, crossing35].map((c) => (
                  <tr key={c.startingHli} className={!c.cheapestPath.reachesTarget ? 'bg-red-50' : c.achievableCheaply ? 'bg-green-50' : 'bg-amber-50'}>
                    <td className="px-4 py-3 font-medium">{c.startingHli.toFixed(1)}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
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
                    <td className="px-4 py-3 text-right">
                      {c.achievableCheaply
                        ? <span className="text-green-700">Under €2k</span>
                        : c.cheapestPath.reachesTarget
                          ? <span className="text-amber-600">€{Math.round(c.cheapestPath.totalCost / 1000)}k+</span>
                          : <span className="text-red-600">Not achievable</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Individual measure breakdown */}
          <details className="mb-6">
            <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900">
              Show individual measure effectiveness (from HLI 2.5)
            </summary>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">Measure</th>
                    <th className="px-4 py-2 text-right">Cost (net)</th>
                    <th className="px-4 py-2 text-right">HLI reduction</th>
                    <th className="px-4 py-2 text-right">HLI after</th>
                    <th className="px-4 py-2 text-right">Alone reaches 2.0?</th>
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

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            <p>
              <strong>For homes near the threshold (HLI 2.1–2.5):</strong> cheap measures like attic insulation
              (€{crossing25.individualMeasures.find((m) => m.measure === 'attic')?.cost ?? 800}) or cavity fill
              (€{crossing25.individualMeasures.find((m) => m.measure === 'cavity')?.cost ?? 400}) can get you there.
              The grant system works for these homes.
            </p>
            <p className="mt-2">
              <strong>For homes at HLI 3.0+:</strong> you need multiple measures totalling
              €{Math.round((crossing30.cheapestCostToTarget ?? 0) / 100) * 100}+. For HLI 3.5+, even
              all affordable measures may not reach the threshold — you're forced into EWI (€14,000+)
              or drylining (€6,000+) just to qualify for a €6,500 grant. That's the trap.
            </p>
          </div>
        </section>

        {/* ============================================================= */}
        {/* SECTION 4: ALTERNATIVE POLICIES                               */}
        {/* ============================================================= */}
        <section>
          <h2 className="text-xl font-bold text-slate-900 mb-4">What if the policy were different?</h2>
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
          <h2 className="text-xl font-bold text-slate-900 mb-4">Conclusion</h2>
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

        {/* Methodology */}
        <div className="text-xs text-slate-400 border-t border-slate-100 pt-6 space-y-1">
          <p>
            <strong>Methodology:</strong> Half-hourly heat pump simulation, Carnot COP (η=0.52),
            Dublin Met Éireann climate normals, good installation with weather compensation.
            Gas baseline: HDD 2,150, 90% boiler efficiency, €0.137/kWh.
            Tariff: {tariff.supplier} {tariff.product}. All figures generated live — change any
            assumption in the model and the charts update.
          </p>
          <p>
            <strong>Sources:</strong> SEAI grants (Feb 2026), Finance Act 2020 S.40 (carbon tax),
            EN14511/Keymark (COP validation), Met Éireann (temperature data).
          </p>
          <p>
            <strong>Limitations:</strong> This model uses a Carnot approximation calibrated against
            manufacturer data. Real-world SCOP is typically 15-25% lower due to defrost, cycling, and
            standby losses. This affects the absolute numbers but not the shape of the curves —
            the threshold is equally arbitrary at lower SCOP values.
          </p>
        </div>
      </div>
    </div>
  );
}
