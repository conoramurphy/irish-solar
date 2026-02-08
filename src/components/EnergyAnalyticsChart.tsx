import { useState, useMemo } from 'react';
import type { HourlyEnergyFlow } from '../types';

interface EnergyAnalyticsChartProps {
  hourlyData: HourlyEnergyFlow[];
  year: number;
}

type ViewMode = 'yearly' | 'weekly' | 'daily';
type InterestingDay = 'max-generation' | 'max-export' | 'min-generation';

interface DayData {
  date: string;
  dayOfYear: number;
  totalGeneration: number;
  totalConsumption: number;
  totalExport: number;
  brightTimeConsumption: number; // 7am-7pm
  darkTimeConsumption: number; // 7pm-7am
  hours: HourlyEnergyFlow[];
}

export function EnergyAnalyticsChart({ hourlyData, year }: EnergyAnalyticsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('yearly');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedWeek, setSelectedWeek] = useState<number>(0);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const h of hourlyData) {
      const hk = h.hourKey;
      if (!hk) continue;
      const y = Number(hk.slice(0, 4));
      if (Number.isFinite(y)) years.add(y);
    }
    return Array.from(years).sort((a, b) => a - b);
  }, [hourlyData]);

  const [selectedYear, setSelectedYear] = useState<number>(year);

  const hourlyForSelectedYear = useMemo(() => {
    if (availableYears.length <= 1) return hourlyData;
    return hourlyData.filter((h) => h.hourKey?.startsWith(String(selectedYear)));
  }, [availableYears.length, hourlyData, selectedYear]);

  // Group hourly data by day
  const dailyData = useMemo((): DayData[] => {
    const daysMap = new Map<number, HourlyEnergyFlow[]>();
    
    hourlyForSelectedYear.forEach((hour, index) => {
      const dayOfYear = Math.floor(index / 24);
      if (!daysMap.has(dayOfYear)) {
        daysMap.set(dayOfYear, []);
      }
      daysMap.get(dayOfYear)!.push(hour);
    });

    return Array.from(daysMap.entries()).map(([dayOfYear, hours]) => {
      const totalGeneration = hours.reduce((sum, h) => sum + h.generation, 0);
      const totalConsumption = hours.reduce((sum, h) => sum + h.consumption, 0);
      const totalExport = hours.reduce((sum, h) => sum + h.gridExport, 0);
      
      // Bright time: 7am-7pm (hours 7-18 inclusive)
      const brightTimeConsumption = hours
        .filter(h => (h.hourOfDay ?? 0) >= 7 && (h.hourOfDay ?? 0) < 19)
        .reduce((sum, h) => sum + h.consumption, 0);
      
      // Dark time: 7pm-7am (hours 19-23 and 0-6)
      const darkTimeConsumption = totalConsumption - brightTimeConsumption;

      const firstHour = hours[0];
      const date = firstHour?.hourKey?.split('T')[0] || `Day ${dayOfYear + 1}`;

      return {
        date,
        dayOfYear,
        totalGeneration,
        totalConsumption,
        totalExport,
        brightTimeConsumption,
        darkTimeConsumption,
        hours
      };
    });
  }, [hourlyForSelectedYear]);

  // Find interesting days
  const interestingDays = useMemo(() => {
    const maxGenDay = dailyData.reduce((max, day) => 
      day.totalGeneration > max.totalGeneration ? day : max
    , dailyData[0] || { totalGeneration: 0, dayOfYear: 0, date: '' });

    const maxExportDay = dailyData.reduce((max, day) => 
      day.totalExport > max.totalExport ? day : max
    , dailyData[0] || { totalExport: 0, dayOfYear: 0, date: '' });

    const minGenDay = dailyData.reduce((min, day) => 
      day.totalGeneration > 0 && day.totalGeneration < min.totalGeneration ? day : min
    , dailyData[0] || { totalGeneration: Infinity, dayOfYear: 0, date: '' });

    return {
      'max-generation': maxGenDay,
      'max-export': maxExportDay,
      'min-generation': minGenDay
    };
  }, [dailyData]);

  // Group days into weeks
  const weeklyData = useMemo(() => {
    const weeks: DayData[][] = [];
    for (let i = 0; i < dailyData.length; i += 7) {
      weeks.push(dailyData.slice(i, i + 7));
    }
    return weeks;
  }, [dailyData]);

  const handleInterestingDay = (type: InterestingDay) => {
    const day = interestingDays[type];
    setSelectedDayIndex(day.dayOfYear);
    setViewMode('daily');
  };

  const selectedDay = dailyData[selectedDayIndex] || dailyData[0];
  const currentWeek = weeklyData[selectedWeek] || [];

  // Calculate max values for scaling
  const maxDailyConsumption = Math.max(...dailyData.map(d => d.totalConsumption));
  const maxHourlyConsumption = Math.max(...(selectedDay?.hours.map(h => h.consumption) || [1]));

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-2xl font-serif font-bold text-tines-dark mb-2">
          Energy Analytics
        </h3>
        <p className="text-sm text-slate-600">
          Generation vs consumption patterns throughout the year
        </p>
      </div>

      {/* View Mode Selector */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {availableYears.length > 1 && (
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs font-medium text-slate-500">Year:</span>
            <select
              value={selectedYear}
              onChange={(e) => {
                const y = Number(e.target.value);
                setSelectedYear(y);
                setSelectedDayIndex(0);
                setSelectedWeek(0);
              }}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          <button
            onClick={() => setViewMode('yearly')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              viewMode === 'yearly'
                ? 'bg-tines-purple text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Year
          </button>
          <button
            onClick={() => setViewMode('weekly')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${
              viewMode === 'weekly'
                ? 'bg-tines-purple text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${
              viewMode === 'daily'
                ? 'bg-tines-purple text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Day
          </button>
        </div>

        {/* Interesting Days Shortcuts */}
        {viewMode === 'daily' && (
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <span className="text-xs text-slate-500 font-medium">Jump to:</span>
            <button
              onClick={() => handleInterestingDay('max-generation')}
              className="px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors"
            >
              ☀️ Best Generation
            </button>
            <button
              onClick={() => handleInterestingDay('max-export')}
              className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 rounded-md hover:bg-amber-100 transition-colors"
            >
              ⚡ Most Spill
            </button>
            <button
              onClick={() => handleInterestingDay('min-generation')}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 transition-colors"
            >
              ☁️ Worst Generation
            </button>
          </div>
        )}
      </div>

      {/* Yearly View */}
      {viewMode === 'yearly' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">
              {availableYears.length > 1 ? selectedYear : year} - Daily Totals ({dailyData.length} days)
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ background: 'rgba(251, 191, 36, 0.9)' }} />
                <span className="text-slate-600">Generation</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ background: 'rgba(16, 185, 129, 0.35)' }} />
                <span className="text-slate-600">Bright Time Usage</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded" style={{ background: 'rgba(99, 102, 241, 0.25)' }} />
                <span className="text-slate-600">Dark Time Usage</span>
              </div>
            </div>
          </div>

          <div className="relative h-64 bg-slate-50 rounded-lg p-4 overflow-x-auto">
            {(() => {
              const w = Math.max(900, dailyData.length * 4);
              const h = 220;
              const innerH = 200;
              const baseY = 220;
              const stepX = w / Math.max(1, dailyData.length - 1);

              const yFor = (value: number) => baseY - (value / maxDailyConsumption) * innerH;

              const toSmoothPath = (points: Array<{ x: number; y: number }>) => {
                if (points.length === 0) return '';
                if (points.length === 1) return `M ${points[0]!.x} ${points[0]!.y}`;

                // Catmull-Rom -> cubic Bezier
                const d: string[] = [`M ${points[0]!.x} ${points[0]!.y}`];
                for (let i = 0; i < points.length - 1; i++) {
                  const p0 = points[i - 1] ?? points[i]!;
                  const p1 = points[i]!;
                  const p2 = points[i + 1]!;
                  const p3 = points[i + 2] ?? p2;

                  const c1x = p1.x + (p2.x - p0.x) / 6;
                  const c1y = p1.y + (p2.y - p0.y) / 6;
                  const c2x = p2.x - (p3.x - p1.x) / 6;
                  const c2y = p2.y - (p3.y - p1.y) / 6;

                  d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
                }
                return d.join(' ');
              };

              const darkLinePoints = dailyData.map((d, i) => ({ x: i * stepX, y: yFor(d.darkTimeConsumption) }));
              const totalUsagePoints = dailyData.map((d, i) => ({ x: i * stepX, y: yFor(d.darkTimeConsumption + d.brightTimeConsumption) }));
              const genPoints = dailyData.map((d, i) => ({ x: i * stepX, y: yFor(d.totalGeneration) }));

              const darkLine = toSmoothPath(darkLinePoints);
              const totalLine = toSmoothPath(totalUsagePoints);
              const genLine = toSmoothPath(genPoints);

              // Areas
              const darkArea = `${darkLine} L ${w} ${baseY} L 0 ${baseY} Z`;

              // Bright-time area is the region between total usage and dark-time usage.
              const darkRev = [...darkLinePoints].reverse();
              const darkRevPath = toSmoothPath(darkRev).replace(/^M/, 'L');
              const brightArea = `${totalLine} ${darkRevPath} Z`;

              return (
                <svg width={w} height={h} className="block">
                  {/* Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((p) => (
                    <line
                      key={p}
                      x1={0}
                      y1={baseY - p * innerH}
                      x2={w}
                      y2={baseY - p * innerH}
                      stroke="#e2e8f0"
                      strokeWidth={1}
                    />
                  ))}

                  {/* Soft areas */}
                  <path d={darkArea} fill="rgba(99, 102, 241, 0.20)" />
                  <path d={brightArea} fill="rgba(16, 185, 129, 0.22)" />

                  {/* Usage outlines */}
                  <path d={darkLine} fill="none" stroke="rgba(99, 102, 241, 0.35)" strokeWidth={1.5} />
                  <path d={totalLine} fill="none" stroke="rgba(16, 185, 129, 0.45)" strokeWidth={1.5} />

                  {/* Generation line (slightly thicker) */}
                  <path d={genLine} fill="none" stroke="rgba(245, 158, 11, 0.95)" strokeWidth={2.6} strokeLinecap="round" />
                </svg>
              );
            })()}
          </div>

          <p className="mt-2 text-xs text-slate-500 italic">
            Soft shaded areas show usage (dark vs bright time). The thicker orange line is solar generation.
          </p>
        </div>
      )}

      {/* Weekly View */}
      {viewMode === 'weekly' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">
              Week {selectedWeek + 1} of {weeklyData.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedWeek(Math.max(0, selectedWeek - 1))}
                disabled={selectedWeek === 0}
                className="px-3 py-1 text-sm font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => setSelectedWeek(Math.min(weeklyData.length - 1, selectedWeek + 1))}
                disabled={selectedWeek === weeklyData.length - 1}
                className="px-3 py-1 text-sm font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="relative h-64 bg-slate-50 rounded-lg p-4">
            <svg width="100%" height="220" viewBox="0 0 700 220" preserveAspectRatio="xMidYMid meet">
              {/* Grid */}
              {[0, 25, 50, 75, 100].map(pct => (
                <line
                  key={pct}
                  x1="0"
                  y1={220 - (pct / 100) * 200}
                  x2="700"
                  y2={220 - (pct / 100) * 200}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}

              {/* Bars for each day */}
              {currentWeek.map((day, index) => {
                const x = 50 + index * 100;
                const barWidth = 40;
                const genHeight = (day.totalGeneration / maxDailyConsumption) * 200;
                const brightHeight = (day.brightTimeConsumption / maxDailyConsumption) * 200;
                const darkHeight = (day.darkTimeConsumption / maxDailyConsumption) * 200;

                return (
                  <g key={index}>
                    {/* Dark time */}
                    <rect
                      x={x - barWidth / 2}
                      y={220 - darkHeight}
                      width={barWidth}
                      height={darkHeight}
                      fill="#6366f1"
                      opacity="0.8"
                      rx="2"
                    />
                    {/* Bright time */}
                    <rect
                      x={x - barWidth / 2}
                      y={220 - darkHeight - brightHeight}
                      width={barWidth}
                      height={brightHeight}
                      fill="#10b981"
                      opacity="0.8"
                      rx="2"
                    />
                    {/* Generation marker */}
                    <line
                      x1={x - barWidth / 2 - 5}
                      y1={220 - genHeight}
                      x2={x + barWidth / 2 + 5}
                      y2={220 - genHeight}
                      stroke="#fbbf24"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                    {/* Day label */}
                    <text
                      x={x}
                      y="235"
                      textAnchor="middle"
                      className="text-xs fill-slate-600"
                      fontSize="11"
                    >
                      {day.date.split('-').slice(1).join('/')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Daily View */}
      {viewMode === 'daily' && selectedDay && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-medium text-slate-700">
              {selectedDay.date} - Hourly Profile
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDay.date}
                onChange={(e) => {
                  const targetDate = e.target.value;
                  const dayIndex = dailyData.findIndex(d => d.date === targetDate);
                  if (dayIndex >= 0) setSelectedDayIndex(dayIndex);
                }}
                className="px-3 py-1 text-sm border border-slate-200 rounded-md"
              />
              <button
                onClick={() => setSelectedDayIndex(Math.max(0, selectedDayIndex - 1))}
                disabled={selectedDayIndex === 0}
                className="px-3 py-1 text-sm font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
              >
                ←
              </button>
              <button
                onClick={() => setSelectedDayIndex(Math.min(dailyData.length - 1, selectedDayIndex + 1))}
                disabled={selectedDayIndex === dailyData.length - 1}
                className="px-3 py-1 text-sm font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50"
              >
                →
              </button>
            </div>
          </div>

          <div className="relative h-64 bg-slate-50 rounded-lg p-4">
            <svg width="100%" height="220" viewBox="0 0 960 220" preserveAspectRatio="xMidYMid meet">
              {/* Grid */}
              {[0, 25, 50, 75, 100].map(pct => (
                <line
                  key={pct}
                  x1="0"
                  y1={220 - (pct / 100) * 200}
                  x2="960"
                  y2={220 - (pct / 100) * 200}
                  stroke="#e2e8f0"
                  strokeWidth="1"
                />
              ))}

              {/* Hourly bars */}
              {selectedDay.hours.map((hour, index) => {
                const x = index * 40;
                const barWidth = 35;
                const genHeight = (hour.generation / maxHourlyConsumption) * 200;
                const consHeight = (hour.consumption / maxHourlyConsumption) * 200;
                const hourOfDay = hour.hourOfDay ?? index;

                const isBrightTime = hourOfDay >= 7 && hourOfDay < 19;

                return (
                  <g key={index}>
                    {/* Consumption bar */}
                    <rect
                      x={x}
                      y={220 - consHeight}
                      width={barWidth}
                      height={consHeight}
                      fill={isBrightTime ? '#10b981' : '#6366f1'}
                      opacity="0.7"
                      rx="2"
                    />
                    {/* Generation bar */}
                    <rect
                      x={x}
                      y={220 - genHeight}
                      width={barWidth}
                      height={genHeight}
                      fill="#fbbf24"
                      opacity="0.8"
                      rx="2"
                    />
                    {/* Hour label (every 3 hours) */}
                    {index % 3 === 0 && (
                      <text
                        x={x + barWidth / 2}
                        y="235"
                        textAnchor="middle"
                        className="text-xs fill-slate-600"
                        fontSize="10"
                      >
                        {hourOfDay}h
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-600 mb-1">Total Generation</div>
              <div className="text-lg font-bold text-amber-600">
                {selectedDay.totalGeneration.toFixed(0)} kWh
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-600 mb-1">Total Consumption</div>
              <div className="text-lg font-bold text-slate-900">
                {selectedDay.totalConsumption.toFixed(0)} kWh
              </div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-600 mb-1">Export (Spill)</div>
              <div className="text-lg font-bold text-tines-purple">
                {selectedDay.totalExport.toFixed(0)} kWh
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
