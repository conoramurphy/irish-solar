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
  daylightConsumption: number; // During solar generation hours
  darkConsumption: number; // Outside solar generation hours
  hours: HourlyEnergyFlow[];
}

const MONTH_ABBREVS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function LegendToggle({
  active,
  onToggle,
  color,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  color: string;
  label: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 rounded px-2 py-1 transition-opacity hover:opacity-80"
      style={{ opacity: active ? 1 : 0.4 }}
      aria-pressed={active}
    >
      <div
        className="w-3 h-3 rounded flex-shrink-0"
        style={{ background: active ? color : '#94a3b8' }}
      />
      <span className={`text-slate-600 ${active ? '' : 'line-through'}`}>{label}</span>
    </button>
  );
}

export function EnergyAnalyticsChart({ hourlyData, year }: EnergyAnalyticsChartProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('yearly');
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(0);
  const [selectedWeek, setSelectedWeek] = useState<number>(0);

  // Series visibility toggles — all on by default
  const [showGeneration, setShowGeneration] = useState(true);
  const [showDaylightUsage, setShowDaylightUsage] = useState(true);
  const [showNightUsage, setShowNightUsage] = useState(true);

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

  // Sync selectedYear state when the year prop changes (e.g. parent updates simulation year)
  if (selectedYear !== year && availableYears.length <= 1) {
    setSelectedYear(year);
  }

  const hourlyForSelectedYear = useMemo(() => {
    if (availableYears.length <= 1) return hourlyData;
    return hourlyData.filter((h) => h.hourKey?.startsWith(String(selectedYear)));
  }, [availableYears.length, hourlyData, selectedYear]);

  // Group slot data by day (works for both hourly and half-hourly)
  const slotsPerDay = hourlyForSelectedYear.length > 10000 ? 48 : 24;

  const dailyData = useMemo((): DayData[] => {
    const daysMap = new Map<number, HourlyEnergyFlow[]>();
    
    hourlyForSelectedYear.forEach((hour, index) => {
      const dayOfYear = Math.floor(index / slotsPerDay);
      if (!daysMap.has(dayOfYear)) {
        daysMap.set(dayOfYear, []);
      }
      daysMap.get(dayOfYear)!.push(hour);
    });

    return Array.from(daysMap.entries()).map(([dayOfYear, hours]) => {
      const totalGeneration = hours.reduce((sum, h) => sum + h.generation, 0);
      const totalConsumption = hours.reduce((sum, h) => sum + h.consumption, 0);
      const totalExport = hours.reduce((sum, h) => sum + h.gridExport, 0);
      
      // Determine daylight hours based on when solar is actually generating
      // Use a threshold of 0.01 kWh to filter out rounding errors
      const daylightConsumption = hours
        .filter(h => h.generation > 0.01)
        .reduce((sum, h) => sum + h.consumption, 0);
      
      // Dark time: when solar is not generating
      const darkConsumption = totalConsumption - daylightConsumption;

      const firstHour = hours[0];
      const date = firstHour?.hourKey?.split('T')[0] || `Day ${dayOfYear + 1}`;

      return {
        date,
        dayOfYear,
        totalGeneration,
        totalConsumption,
        totalExport,
        daylightConsumption,
        darkConsumption,
        hours
      };
    });
  }, [hourlyForSelectedYear, slotsPerDay]);

  // Month boundaries for yearly x-axis labels
  const monthBoundaries = useMemo(() => {
    const result: { label: string; startIdx: number }[] = [];
    let lastMonth = -1;
    dailyData.forEach((day, i) => {
      const parts = day.date.split('-');
      const m = Number(parts[1]) - 1;
      if (m !== lastMonth) {
        result.push({ label: MONTH_ABBREVS[m] ?? String(m + 1), startIdx: i });
        lastMonth = m;
      }
    });
    return result;
  }, [dailyData]);

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

  // Dynamic Y-axis max: only consider visible series, then add 5% headroom
  const maxDailyConsumption = useMemo(() => {
    const rawMax = Math.max(
      ...dailyData.map(d => {
        const candidates: number[] = [0.01];
        if (showGeneration) candidates.push(d.totalGeneration);
        if (showDaylightUsage && showNightUsage) candidates.push(d.totalConsumption);
        else if (showDaylightUsage) candidates.push(d.daylightConsumption);
        else if (showNightUsage) candidates.push(d.darkConsumption);
        return Math.max(...candidates);
      })
    );
    return rawMax * 1.05;
  }, [dailyData, showGeneration, showDaylightUsage, showNightUsage]);

  const maxHourlyValue = useMemo(() => {
    const candidates: number[] = [0.01];
    selectedDay?.hours.forEach(h => {
      if (showGeneration) candidates.push(h.generation);
      if (showDaylightUsage && h.generation > 0.01) candidates.push(h.consumption);
      if (showNightUsage && h.generation <= 0.01) candidates.push(h.consumption);
    });
    return Math.max(...candidates) * 1.05;
  }, [selectedDay, showGeneration, showDaylightUsage, showNightUsage]);

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
            <div className="flex items-center gap-1 text-xs">
              <LegendToggle
                active={showGeneration}
                onToggle={() => setShowGeneration(v => !v)}
                color="rgba(251, 191, 36, 0.9)"
                label="Generation"
              />
              <LegendToggle
                active={showDaylightUsage}
                onToggle={() => setShowDaylightUsage(v => !v)}
                color="rgba(16, 185, 129, 0.35)"
                label="Daylight Usage"
              />
              <LegendToggle
                active={showNightUsage}
                onToggle={() => setShowNightUsage(v => !v)}
                color="rgba(99, 102, 241, 0.25)"
                label="Night Usage"
              />
            </div>
          </div>

          <div className="relative bg-slate-50 rounded-lg p-4">
            {(() => {
              const w = 1000;
              const h = 240;
              const innerH = 180;
              const baseY = 200;
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

              // Stack order: daylight usage at the bottom (baseline), night usage on top.
              const daylightLinePoints = dailyData.map((d, i) => ({ x: i * stepX, y: yFor(d.daylightConsumption) }));
              const totalUsagePoints = dailyData.map((d, i) => ({ x: i * stepX, y: yFor(d.darkConsumption + d.daylightConsumption) }));
              const genPoints = dailyData.map((d, i) => ({ x: i * stepX, y: yFor(d.totalGeneration) }));

              const daylightLine = toSmoothPath(daylightLinePoints);
              const totalLine = toSmoothPath(totalUsagePoints);
              const genLine = toSmoothPath(genPoints);

              // Areas
              // Daylight area: baseline -> daylight line
              const daylightArea = `${daylightLine} L ${w} ${baseY} L 0 ${baseY} Z`;

              // Night area: region between total usage line and daylight line
              const daylightRev = [...daylightLinePoints].reverse();
              const daylightRevPath = toSmoothPath(daylightRev).replace(/^M/, 'L');
              const darkArea = `${totalLine} ${daylightRevPath} Z`;

              return (
                <svg
                  width="100%"
                  height={h}
                  viewBox={`0 0 ${w} ${h}`}
                  preserveAspectRatio="none"
                  className="block"
                >
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

                  {/* Month boundary lines and labels */}
                  {monthBoundaries.map((boundary, bi) => {
                    const bx = boundary.startIdx * stepX;
                    const nextBoundary = monthBoundaries[bi + 1];
                    const nextBx = nextBoundary ? nextBoundary.startIdx * stepX : w;
                    const labelX = (bx + nextBx) / 2;
                    return (
                      <g key={boundary.label}>
                        {bi > 0 && (
                          <line
                            x1={bx}
                            y1={0}
                            x2={bx}
                            y2={baseY}
                            stroke="#cbd5e1"
                            strokeWidth={1}
                            strokeDasharray="4 3"
                          />
                        )}
                        <text
                          x={labelX}
                          y={h - 6}
                          textAnchor="middle"
                          fill="#64748b"
                          fontSize={14}
                          fontFamily="sans-serif"
                        >
                          {boundary.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* Soft areas */}
                  {showDaylightUsage && <path d={daylightArea} fill="rgba(16, 185, 129, 0.22)" />}
                  {showNightUsage && <path d={darkArea} fill="rgba(99, 102, 241, 0.20)" />}

                  {/* Usage outlines */}
                  {showDaylightUsage && (
                    <path d={daylightLine} fill="none" stroke="rgba(16, 185, 129, 0.45)" strokeWidth={1.5} />
                  )}
                  {showNightUsage && (
                    <path d={totalLine} fill="none" stroke="rgba(99, 102, 241, 0.35)" strokeWidth={1.5} />
                  )}

                  {/* Generation line (slightly thicker) */}
                  {showGeneration && (
                    <path d={genLine} fill="none" stroke="rgba(245, 158, 11, 0.95)" strokeWidth={2.6} strokeLinecap="round" />
                  )}
                </svg>
              );
            })()}
          </div>

          <p className="mt-2 text-xs text-slate-500 italic">
            Soft shaded areas show usage during daylight (solar generating) vs night. The thicker orange line is solar generation.
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs">
                <LegendToggle
                  active={showGeneration}
                  onToggle={() => setShowGeneration(v => !v)}
                  color="#fbbf24"
                  label="Generation"
                />
                <LegendToggle
                  active={showDaylightUsage}
                  onToggle={() => setShowDaylightUsage(v => !v)}
                  color="#10b981"
                  label="Daylight Usage"
                />
                <LegendToggle
                  active={showNightUsage}
                  onToggle={() => setShowNightUsage(v => !v)}
                  color="#6366f1"
                  label="Night Usage"
                />
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
                const daylightHeight = (day.daylightConsumption / maxDailyConsumption) * 200;
                const darkHeight = (day.darkConsumption / maxDailyConsumption) * 200;

                return (
                  <g key={index}>
                    {/* Daylight usage (bottom) */}
                    {showDaylightUsage && (
                      <rect
                        x={x - barWidth / 2}
                        y={220 - daylightHeight}
                        width={barWidth}
                        height={daylightHeight}
                        fill="#10b981"
                        opacity="0.8"
                        rx="2"
                      />
                    )}
                    {/* Night usage (top) */}
                    {showNightUsage && (
                      <rect
                        x={x - barWidth / 2}
                        y={220 - daylightHeight - darkHeight}
                        width={barWidth}
                        height={darkHeight}
                        fill="#6366f1"
                        opacity="0.8"
                        rx="2"
                      />
                    )}
                    {/* Generation marker */}
                    {showGeneration && (
                      <line
                        x1={x - barWidth / 2 - 5}
                        y1={220 - genHeight}
                        x2={x + barWidth / 2 + 5}
                        y2={220 - genHeight}
                        stroke="#fbbf24"
                        strokeWidth="3"
                        strokeLinecap="round"
                      />
                    )}
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs">
                <LegendToggle
                  active={showGeneration}
                  onToggle={() => setShowGeneration(v => !v)}
                  color="#fbbf24"
                  label="Generation"
                />
                <LegendToggle
                  active={showDaylightUsage}
                  onToggle={() => setShowDaylightUsage(v => !v)}
                  color="#10b981"
                  label="Daylight Usage"
                />
                <LegendToggle
                  active={showNightUsage}
                  onToggle={() => setShowNightUsage(v => !v)}
                  color="#6366f1"
                  label="Night Usage"
                />
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
                const genHeight = (hour.generation / maxHourlyValue) * 200;
                const consHeight = (hour.consumption / maxHourlyValue) * 200;
                const hourOfDay = hour.hourOfDay ?? index;

                const isDaylight = hour.generation > 0.01;

                return (
                  <g key={index}>
                    {/* Consumption bar — coloured by daylight/night, gated by toggle */}
                    {(isDaylight ? showDaylightUsage : showNightUsage) && (
                      <rect
                        x={x}
                        y={220 - consHeight}
                        width={barWidth}
                        height={consHeight}
                        fill={isDaylight ? '#10b981' : '#6366f1'}
                        opacity="0.7"
                        rx="2"
                      />
                    )}
                    {/* Generation bar */}
                    {showGeneration && (
                      <rect
                        x={x}
                        y={220 - genHeight}
                        width={barWidth}
                        height={genHeight}
                        fill="#fbbf24"
                        opacity="0.8"
                        rx="2"
                      />
                    )}
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
