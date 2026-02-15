import { useMemo, useState } from 'react';
import type { HourlyEnergyFlow } from '../types';

interface MarketAnalysisProps {
  hourlyData: HourlyEnergyFlow[];
  year: number;
}

function formatMwh(value: number) {
  return new Intl.NumberFormat('en-IE', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }).format(value);
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
        active 
          ? 'bg-white text-slate-700 shadow-sm ring-1 ring-slate-200' 
          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
      }`}
    >
      {children}
    </button>
  );
}

export function MarketAnalysis({ hourlyData, year }: MarketAnalysisProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'seasonality' | 'arbitrage'>('overview');
  // 1. Filter valid market data and normalize to MWh
  const validData = useMemo(() => {
    // Check if we have enough market price data
    const withPrice = hourlyData.filter(h => h.marketPrice !== undefined);
    if (withPrice.length < 24 * 300) return null; // Require at least ~300 days of data

    return withPrice.map(h => ({
      ...h,
      // Convert internal €/kWh to €/MWh for analysis
      priceMwh: (h.marketPrice ?? 0) * 1000
    }));
  }, [hourlyData]);

  const analysis = useMemo(() => {
    if (!validData) return null;

    // --- 1. Global Stats ---
    const allPrices = validData.map(d => d.priceMwh).sort((a, b) => a - b);
    const avgPrice = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;
    
    // P5 and P95 of all hours
    const p5Index = Math.floor(allPrices.length * 0.05);
    const p95Index = Math.floor(allPrices.length * 0.95);
    const p5Price = allPrices[p5Index];
    const p95Price = allPrices[p95Index];
    const p95p5Range = p95Price - p5Price;

    // % hours below 0 (and below 10)
    const belowZeroCount = allPrices.filter(p => p < 0).length;
    const belowZeroPct = belowZeroCount / allPrices.length;

    // --- 2. Daily Analysis ---
    // Group by day (YYYY-MM-DD)
    const days: Record<string, number[]> = {};
    validData.forEach(d => {
      let dayKey = '';
      if (d.hourKey) {
        dayKey = d.hourKey.split('T')[0];
      } else {
        dayKey = 'unknown';
      }
      
      if (!days[dayKey]) days[dayKey] = [];
      days[dayKey].push(d.priceMwh);
    });

    const dailySpreads: number[] = [];
    const spreadsByDay: Record<string, number> = {}; // dayKey -> spread

    Object.entries(days).forEach(([dayKey, prices]) => {
      if (prices.length < 24) return; // Skip incomplete days
      // Sort prices for this day
      const sorted = [...prices].sort((a, b) => a - b);
      // Cheapest 4
      const cheap4 = sorted.slice(0, 4);
      const avgCheap = cheap4.reduce((a, b) => a + b, 0) / 4;
      // Most expensive 4
      const exp4 = sorted.slice(-4);
      const avgExp = exp4.reduce((a, b) => a + b, 0) / 4;
      
      const spread = avgExp - avgCheap;
      dailySpreads.push(spread);
      spreadsByDay[dayKey] = spread;
    });

    if (dailySpreads.length === 0) return null;

    const meanDailySpread = dailySpreads.reduce((sum, s) => sum + s, 0) / dailySpreads.length;
    const maxDailySpread = Math.max(...dailySpreads);

    // --- 3. Buckets ---
    const buckets: Record<string, number> = {
      '0-25': 0,
      '25-50': 0,
      '50-75': 0,
      '75-100': 0,
      '100+': 0
    };
    
    dailySpreads.forEach(s => {
      if (s < 25) buckets['0-25']++;
      else if (s < 50) buckets['25-50']++;
      else if (s < 75) buckets['50-75']++;
      else if (s < 100) buckets['75-100']++;
      else buckets['100+']++;
    });

    // --- 4. Monthly Stats ---
    const months: Array<{
      monthIndex: number;
      meanSpread: number;
      p95p5Range: number;
      pctBelowZero: number;
      boxPlot: { min: number, p5: number, q1: number, median: number, q3: number, p95: number, max: number };
    }> = [];

    for (let m = 0; m < 12; m++) {
      // Filter data for this month
      const monthData = validData.filter(d => d.monthIndex === m);
      if (monthData.length === 0) continue;

      const monthPrices = monthData.map(d => d.priceMwh).sort((a, b) => a - b);
      
      // Monthly P95-P5
      const mp5 = monthPrices[Math.floor(monthPrices.length * 0.05)];
      const mp95 = monthPrices[Math.floor(monthPrices.length * 0.95)];
      
      // Box plot stats
      const min = monthPrices[0];
      const max = monthPrices[monthPrices.length - 1];
      const q1 = monthPrices[Math.floor(monthPrices.length * 0.25)];
      const median = monthPrices[Math.floor(monthPrices.length * 0.50)];
      const q3 = monthPrices[Math.floor(monthPrices.length * 0.75)];

      // Monthly Mean Spread
      const monthSpreads = Object.entries(spreadsByDay)
        .filter(([k]) => {
           const [, monthStr] = k.split('-');
           return parseInt(monthStr) - 1 === m;
        })
        .map(([, s]) => s);
      
      const meanSpread = monthSpreads.length > 0 
        ? monthSpreads.reduce((a, b) => a + b, 0) / monthSpreads.length
        : 0;
        
      const mBelowZero = monthPrices.filter(p => p < 0).length;

      months.push({
        monthIndex: m,
        meanSpread,
        p95p5Range: mp95 - mp5,
        pctBelowZero: mBelowZero / monthPrices.length,
        boxPlot: { min, p5: mp5, q1, median, q3, p95: mp95, max }
      });
    }

    return {
      avgPrice,
      meanDailySpread,
      p95p5Range,
      belowZeroPct,
      maxDailySpread,
      buckets,
      dailySpreadsCount: dailySpreads.length,
      months
    };
  }, [validData]);

  if (!analysis) return null;

  // Render helpers
  const bucketLabels = ['0-25', '25-50', '50-75', '75-100', '100+'];
  const maxBucketCount = Math.max(...Object.values(analysis.buckets));

  // Chart scaling for Box Plot
  // Find global min/max for Y axis
  const globalMin = Math.min(...analysis.months.map(m => m.boxPlot.p5)); // Clamp whiskers to P5
  const globalMax = Math.max(...analysis.months.map(m => m.boxPlot.p95)); // Clamp whiskers to P95
  
  // Add some padding
  const yMin = Math.floor(globalMin / 10) * 10;
  const yMax = Math.ceil(globalMax / 10) * 10;
  const yRange = yMax - yMin;

  const getY = (val: number) => {
    // 0 at bottom (height), max at top (0)
    // svg coords: y = height - ((val - min) / range) * height
    return 200 - ((val - yMin) / yRange) * 200;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden mb-8">
      <div className="px-8 py-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
        <div>
          <h3 className="text-xl font-serif font-bold text-slate-800">Market Rate Analysis ({year})</h3>
          <p className="text-sm text-slate-500 mt-1">
            Analysis of Day-Ahead Market (DAM) prices. All values in <span className="font-medium text-slate-700">€/MWh</span>.
          </p>
        </div>
        
        <div className="flex p-1 bg-slate-100 rounded-lg shrink-0 self-start md:self-auto">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
          <TabButton active={activeTab === 'seasonality'} onClick={() => setActiveTab('seasonality')}>Seasonality</TabButton>
          <TabButton active={activeTab === 'arbitrage'} onClick={() => setActiveTab('arbitrage')}>Arbitrage</TabButton>
        </div>
      </div>

      <div className="p-8 min-h-[400px]">
        {/* 1. Overview Tab */}
        {activeTab === 'overview' && (
          <div className="animate-in fade-in duration-300">
             <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-10">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Avg Price</div>
                 <div className="text-2xl font-bold text-slate-700">{formatMwh(analysis.avgPrice)}</div>
                 <div className="text-xs text-slate-400 mt-1">€/MWh</div>
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                 <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Mean Daily Spread</div>
                 <div className="text-2xl font-bold text-indigo-700">{formatMwh(analysis.meanDailySpread)}</div>
                 <div className="text-xs text-indigo-400 mt-1">Best 4h vs Worst 4h</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Volatility (P95-P5)</div>
                 <div className="text-2xl font-bold text-slate-700">{formatMwh(analysis.p95p5Range)}</div>
                 <div className="text-xs text-slate-400 mt-1">Hourly Range</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Negative Pricing</div>
                 <div className="text-2xl font-bold text-slate-700">{(analysis.belowZeroPct * 100).toFixed(1)}%</div>
                 <div className="text-xs text-slate-400 mt-1">Hours &lt; €0/MWh</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                 <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Max Daily Spread</div>
                 <div className="text-2xl font-bold text-slate-700">{formatMwh(analysis.maxDailySpread)}</div>
                 <div className="text-xs text-slate-400 mt-1">Extreme Volatility</div>
              </div>
            </div>
            
            {/* Also show Monthly Breakdown here for quick reference? Or keep separate? */}
            {/* Let's show the Monthly Table here as well since it's dense data good for overview */}
             <div>
               <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-6">Monthly Breakdown</h4>
               <div className="overflow-hidden rounded-lg border border-slate-200">
                 <table className="w-full text-sm text-left">
                   <thead className="bg-slate-50 text-xs text-slate-500 uppercase font-semibold">
                     <tr>
                       <th className="px-4 py-2">Month</th>
                       <th className="px-4 py-2 text-right">Mean Spread</th>
                       <th className="px-4 py-2 text-right">Range (P95-P5)</th>
                       <th className="px-4 py-2 text-right">% &lt; €0</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {analysis.months.map((m) => (
                       <tr key={m.monthIndex} className="hover:bg-slate-50/50">
                         <td className="px-4 py-2 font-medium text-slate-700">
                           {new Date(2000, m.monthIndex, 1).toLocaleString('en-IE', { month: 'short' })}
                         </td>
                         <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{formatMwh(m.meanSpread)}</td>
                         <td className="px-4 py-2 text-right text-slate-600 tabular-nums">{formatMwh(m.p95p5Range)}</td>
                         <td className={`px-4 py-2 text-right tabular-nums ${m.pctBelowZero > 0 ? 'text-rose-600 font-medium' : 'text-slate-400'}`}>
                           {m.pctBelowZero > 0 ? `${(m.pctBelowZero * 100).toFixed(1)}%` : '—'}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          </div>
        )}

        {/* 2. Seasonality Tab */}
        {activeTab === 'seasonality' && (
           <div className="animate-in fade-in duration-300">
             <div className="flex items-center justify-between mb-6">
               <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Price Seasonality & Volatility</h4>
               <div className="flex items-center gap-4 text-xs text-slate-500">
                 <div className="flex items-center gap-1">
                   <div className="w-3 h-0.5 bg-slate-300"></div>
                   <span>P5/P95</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-3 h-3 bg-indigo-100 border border-indigo-500"></div>
                   <span>Q1-Q3</span>
                 </div>
                 <div className="flex items-center gap-1">
                   <div className="w-3 h-0.5 bg-indigo-700"></div>
                   <span>Median</span>
                 </div>
               </div>
             </div>
             
             <div className="relative h-96 bg-slate-50/50 rounded-xl border border-slate-100 p-4 mb-8">
               {/* Y-Axis Labels */}
               <div className="absolute left-0 top-4 bottom-8 w-12 flex flex-col justify-between text-[10px] text-slate-400 text-right pr-2">
                 <div>{yMax}</div>
                 <div>{Math.round((yMax + yMin) / 2)}</div>
                 <div>{yMin}</div>
               </div>

               <div className="absolute left-12 right-4 top-4 bottom-8">
                 <svg width="100%" height="100%" preserveAspectRatio="none" className="overflow-visible">
                   {/* Grid lines */}
                   <line x1="0" y1="0" x2="100%" y2="0" stroke="#e2e8f0" strokeDasharray="4 4" />
                   <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#e2e8f0" strokeDasharray="4 4" />
                   <line x1="0" y1="100%" x2="100%" y2="100%" stroke="#e2e8f0" strokeDasharray="4 4" />
                   
                   {/* Zero line if visible */}
                   {yMin < 0 && yMax > 0 && (
                     <line 
                       x1="0" 
                       y1={getY(0)} 
                       x2="100%" 
                       y2={getY(0)} 
                       stroke="#94a3b8" 
                       strokeWidth="1" 
                       opacity="0.5" 
                     />
                   )}

                   {analysis.months.map((m, i) => {
                     const x = `${(i / 12) * 100 + (100/24)}%`; // Center of month slot
                     
                     const yP95 = getY(m.boxPlot.p95);
                     const yQ3 = getY(m.boxPlot.q3);
                     const yMedian = getY(m.boxPlot.median);
                     const yQ1 = getY(m.boxPlot.q1);
                     const yP5 = getY(m.boxPlot.p5);

                     return (
                       <g key={m.monthIndex}>
                         {/* Whiskers */}
                         <line x1={x} y1={yP95} x2={x} y2={yQ3} stroke="#64748b" strokeWidth="1" />
                         <line x1={x} y1={yQ1} x2={x} y2={yP5} stroke="#64748b" strokeWidth="1" />
                         
                         {/* Whisker caps */}
                         <line x1={`calc(${x} - 1%)`} y1={yP95} x2={`calc(${x} + 1%)`} y2={yP95} stroke="#64748b" strokeWidth="1" />
                         <line x1={`calc(${x} - 1%)`} y1={yP5} x2={`calc(${x} + 1%)`} y2={yP5} stroke="#64748b" strokeWidth="1" />

                         {/* Box */}
                         <rect
                           x={`calc(${x} - 2%)`}
                           y={yQ3}
                           width="4%"
                           height={Math.max(1, yQ1 - yQ3)}
                           fill="#e0e7ff"
                           stroke="#6366f1"
                           strokeWidth="1"
                         />
                         
                         {/* Median */}
                         <line
                           x1={`calc(${x} - 2%)`}
                           y1={yMedian}
                           x2={`calc(${x} + 2%)`}
                           y2={yMedian}
                           stroke="#4338ca"
                           strokeWidth="2"
                         />
                       </g>
                     );
                   })}
                 </svg>
               </div>
               
               {/* X-Axis Labels */}
               <div className="absolute left-12 right-4 bottom-0 h-6 flex justify-between text-[10px] text-slate-500 font-medium">
                  {analysis.months.map(m => (
                    <div key={m.monthIndex} className="flex-1 text-center">
                      {new Date(2000, m.monthIndex, 1).toLocaleString('en-IE', { month: 'narrow' })}
                    </div>
                  ))}
               </div>
             </div>
             <p className="text-xs text-slate-400 text-center italic">
                Box plot shows the distribution of hourly prices for each month (P5, Q1, Median, Q3, P95).
             </p>
           </div>
        )}

        {/* 3. Arbitrage Tab */}
        {activeTab === 'arbitrage' && (
           <div className="animate-in fade-in duration-300">
            <h4 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-6">Daily Arbitrage Opportunity Distribution</h4>
            <div className="h-64 flex items-end justify-between gap-2 max-w-3xl mx-auto">
              {bucketLabels.map((label) => {
                const count = analysis.buckets[label];
                const pct = count / analysis.dailySpreadsCount;
                const heightPct = count / maxBucketCount;
                
                return (
                  <div key={label} className="flex-1 flex flex-col items-center group">
                    <div className="text-xs font-bold text-slate-600 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {count}d
                    </div>
                    <div 
                      className="w-full bg-indigo-500 rounded-t-sm hover:bg-indigo-600 transition-colors relative"
                      style={{ height: `${Math.max(4, heightPct * 200)}px` }}
                    >
                       <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-400 opacity-0 group-hover:opacity-100 whitespace-nowrap">
                         {(pct * 100).toFixed(0)}%
                       </div>
                    </div>
                    <div className="mt-2 text-[10px] font-medium text-slate-500 text-center leading-tight">
                      {label} <span className="block text-slate-300">€/MWh</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 text-center mt-6">
               Number of days where the spread between the 4 cheapest and 4 most expensive hours falls within each range.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
