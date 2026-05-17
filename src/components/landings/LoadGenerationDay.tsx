import { useEffect, useMemo, useRef, useState } from 'react';
import type { SegmentChartData, ChartAnnotation } from './segmentChartData';
import { isNightRateIndex, CHART_TARIFF } from './segmentChartData';

interface Props {
  data: SegmentChartData;
}

const COLORS = {
  load: '#0D4027',
  loadStroke: '#0D4027',
  pvStroke: '#3A7A5C',
  pvFill: 'rgba(58, 122, 92, 0.13)',
  battery: '#D97706', // amber-600
  batteryFill: 'rgba(217, 119, 6, 0.30)',
  axisGrid: '#e2e8f0',
  axisText: '#64748b',
  annotationLine: '#cbd5e1',
  scrubLine: '#475569',
  badgeBg: '#0F172A',
  badgeText: '#FFFFFF',
  badgeSub: '#94a3b8',
};

const VIEW_W = 780;
const VIEW_H = 340;
const MARGIN = { top: 88, right: 28, bottom: 32, left: 40 };
const INNER_W = VIEW_W - MARGIN.left - MARGIN.right;
const INNER_H = VIEW_H - MARGIN.top - MARGIN.bottom;

const ANIMATION_DURATION_MS = 14000;
const REDUCED_MOTION_STATIC_INDEX = 24; // solar noon

function xForIndex(i: number): number {
  return MARGIN.left + (i / 47) * INNER_W;
}

function yForValue(v: number, yMax: number): number {
  return MARGIN.top + (1 - v / yMax) * INNER_H;
}

function buildLinePath(values: number[], yMax: number): string {
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(2)} ${yForValue(v, yMax).toFixed(2)}`)
    .join(' ');
}

function buildAreaPath(values: number[], yMax: number): string {
  const baseline = yForValue(0, yMax);
  const linePoints = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(2)} ${yForValue(v, yMax).toFixed(2)}`)
    .join(' ');
  const lastX = xForIndex(values.length - 1).toFixed(2);
  const firstX = xForIndex(0).toFixed(2);
  return `${linePoints} L ${lastX} ${baseline.toFixed(2)} L ${firstX} ${baseline.toFixed(2)} Z`;
}

/** Battery-to-load amber stack: from min(load, PV) up to min(load, PV) + batteryDischarge. */
function buildBatteryStackPath(load: number[], generation: number[], batteryDischarge: number[], yMax: number): string {
  const n = load.length;
  if (batteryDischarge.every((v) => v <= 0)) return '';
  let d = '';
  // top edge: pvServed + batteryDischarge
  for (let i = 0; i < n; i++) {
    const pvServed = Math.min(load[i], generation[i]);
    const top = pvServed + batteryDischarge[i];
    d += `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(2)} ${yForValue(top, yMax).toFixed(2)} `;
  }
  // bottom edge: pvServed, reversed
  for (let i = n - 1; i >= 0; i--) {
    const pvServed = Math.min(load[i], generation[i]);
    d += `L ${xForIndex(i).toFixed(2)} ${yForValue(pvServed, yMax).toFixed(2)} `;
  }
  d += 'Z';
  return d;
}

function indexToHHMM(i: number): string {
  const halfHour = i * 30;
  const h = Math.floor(halfHour / 60);
  const m = halfHour % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function indexToHourLabel(i: number): string {
  return String(Math.floor(i / 2)).padStart(2, '0');
}

const X_TICKS = [0, 12, 24, 36, 46];

function computeYTicks(yMax: number): number[] {
  if (yMax <= 25) return [0, 10, 20];
  if (yMax <= 50) return [0, 25, 50];
  if (yMax <= 100) return [0, 25, 50, 75, 100];
  if (yMax <= 150) return [0, 50, 100, 150];
  return [0, 50, 100, 150, 200];
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReduced(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}

function useScrubIndex(active: boolean): number {
  const [index, setIndex] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let startMs: number | null = null;
    const step = (t: number) => {
      if (startMs === null) startMs = t;
      const elapsed = (t - startMs) % ANIMATION_DURATION_MS;
      const fractional = (elapsed / ANIMATION_DURATION_MS) * 47;
      setIndex(fractional);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  return index;
}

interface ScrubBadgeDisplay {
  time: string;
  primary: string;
  sub: string;
  tone: 'day' | 'night' | 'export' | 'balanced';
}

function formatBadge(timeLabel: string, halfHourSpendEuros: number, isNight: boolean): ScrubBadgeDisplay {
  if (halfHourSpendEuros > 0.005) {
    return {
      time: timeLabel,
      primary: `€${halfHourSpendEuros.toFixed(2)}`,
      sub: isNight ? 'night rate' : 'day rate',
      tone: isNight ? 'night' : 'day',
    };
  }
  if (halfHourSpendEuros < -0.005) {
    return {
      time: timeLabel,
      primary: `€${(-halfHourSpendEuros).toFixed(2)}`,
      sub: 'exported',
      tone: 'export',
    };
  }
  return { time: timeLabel, primary: '€0.00', sub: 'balanced', tone: 'balanced' };
}

export function LoadGenerationDay({ data }: Props) {
  const { yMax } = data;
  const yTickValues = computeYTicks(yMax);
  const reducedMotion = usePrefersReducedMotion();
  const animatedIndex = useScrubIndex(!reducedMotion);
  const scrubFractional = reducedMotion ? REDUCED_MOTION_STATIC_INDEX : animatedIndex;
  const currentIntIndex = Math.min(47, Math.max(0, Math.floor(scrubFractional)));
  const scrubX = xForIndex(scrubFractional);

  const batteryAreaPath = useMemo(
    () => buildBatteryStackPath(data.load, data.generation, data.batteryDischarge, yMax),
    [data.load, data.generation, data.batteryDischarge, yMax]
  );
  const pvAreaPath = useMemo(() => buildAreaPath(data.generation, yMax), [data.generation, yMax]);
  const pvLinePath = useMemo(() => buildLinePath(data.generation, yMax), [data.generation, yMax]);
  const loadLinePath = useMemo(() => buildLinePath(data.load, yMax), [data.load, yMax]);

  const loadAtScrub = data.load[currentIntIndex];
  const beaconY = yForValue(loadAtScrub, yMax);
  const isNight = isNightRateIndex(currentIntIndex, CHART_TARIFF);
  const badge = formatBadge(indexToHHMM(currentIntIndex), data.halfHourSpendEuros[currentIntIndex], isNight);
  const badgeOnLeft = scrubFractional > 23; // flip when past midday

  return (
    <section className="bg-white py-14 md:py-20">
      <div className="max-w-5xl mx-auto px-5 md:px-8">
        <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden">
          <header className="flex items-baseline justify-between gap-4 px-5 sm:px-7 pt-5 sm:pt-6 pb-2">
            <div className="flex items-center gap-2.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.pvStroke }} aria-hidden="true" />
              <h3 className="text-sm sm:text-base font-semibold text-slate-900 tracking-tight">
                {data.title}
              </h3>
            </div>
            <span className="text-xs sm:text-sm text-slate-400 font-medium whitespace-nowrap">
              {data.unitsLabel}
            </span>
          </header>

          <div className="px-2 sm:px-4 pb-2 relative">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              role="img"
              aria-label={`${data.title}: half-hourly electricity load, solar PV generation, and battery contribution in kilowatts over 24 hours.`}
              className="w-full h-auto block"
            >
              {yTickValues.map((tickV) => {
                const y = yForValue(tickV, yMax);
                return (
                  <g key={`y-${tickV}`}>
                    <line
                      x1={MARGIN.left}
                      x2={VIEW_W - MARGIN.right}
                      y1={y}
                      y2={y}
                      stroke={COLORS.axisGrid}
                      strokeWidth={1}
                    />
                    <text
                      x={MARGIN.left - 8}
                      y={y + 4}
                      textAnchor="end"
                      fontSize={11}
                      fill={COLORS.axisText}
                      fontFamily="Inter, sans-serif"
                    >
                      {tickV}
                    </text>
                  </g>
                );
              })}

              {X_TICKS.map((i) => (
                <text
                  key={`x-${i}`}
                  x={xForIndex(i)}
                  y={VIEW_H - MARGIN.bottom + 18}
                  textAnchor="middle"
                  fontSize={11}
                  fill={COLORS.axisText}
                  fontFamily="Inter, sans-serif"
                >
                  {indexToHourLabel(i)}
                </text>
              ))}

              <path d={pvAreaPath} fill={COLORS.pvFill} stroke="none" />
              <path d={pvLinePath} fill="none" stroke={COLORS.pvStroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

              {batteryAreaPath && (
                <path d={batteryAreaPath} fill={COLORS.batteryFill} stroke={COLORS.battery} strokeWidth={1} strokeLinejoin="round" />
              )}

              <path d={loadLinePath} fill="none" stroke={COLORS.loadStroke} strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" />

              {data.annotations.map((ann, idx) => (
                <Annotation key={idx} annotation={ann} data={data} />
              ))}

              {/* Scrubber line + beacon */}
              <g aria-hidden="true">
                <line
                  x1={scrubX}
                  x2={scrubX}
                  y1={MARGIN.top - 6}
                  y2={VIEW_H - MARGIN.bottom}
                  stroke={COLORS.scrubLine}
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
                <circle
                  cx={scrubX}
                  cy={beaconY}
                  r={5}
                  fill={COLORS.loadStroke}
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              </g>
            </svg>

            <ScrubBadgeOverlay
              scrubXPct={(scrubX / VIEW_W) * 100}
              flipLeft={badgeOnLeft}
              display={badge}
            />
          </div>

          <div className="grid grid-cols-3 border-t border-slate-200">
            {data.stats.map((stat, i) => (
              <div
                key={i}
                className={`px-4 sm:px-6 py-4 sm:py-5 text-center ${i < 2 ? 'border-r border-slate-200' : ''}`}
              >
                <p className="text-[11px] sm:text-xs uppercase tracking-wider text-slate-500 font-medium mb-1.5">
                  {stat.label}
                </p>
                <p
                  className="text-lg sm:text-2xl font-serif font-bold leading-none"
                  style={{ color: stat.emphasis ? COLORS.pvStroke : '#0F172A' }}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-sm sm:text-base text-slate-500 leading-relaxed max-w-3xl">
          {data.caption}
        </p>
      </div>
    </section>
  );
}

function Annotation({ annotation, data }: { annotation: ChartAnnotation; data: SegmentChartData }) {
  const { halfHourIndex, label, sub, align = 'left', color } = annotation;
  const pointValue =
    color === 'load' ? data.load[halfHourIndex]
    : color === 'pv' ? data.generation[halfHourIndex]
    : data.batteryDischarge[halfHourIndex];
  const px = xForIndex(halfHourIndex);
  const py = yForValue(pointValue, data.yMax);

  const labelY = MARGIN.top - 28;
  const labelXOffset = align === 'left' ? -6 : 6;
  const labelX = px + labelXOffset;
  const labelAnchor: 'end' | 'start' = align === 'left' ? 'end' : 'start';
  const strokeColor =
    color === 'pv' ? COLORS.pvStroke
    : color === 'battery' ? COLORS.battery
    : COLORS.loadStroke;

  return (
    <g>
      <line
        x1={px}
        x2={px}
        y1={labelY + 4}
        y2={py - 4}
        stroke={COLORS.annotationLine}
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <circle cx={px} cy={py} r={3} fill={strokeColor} />
      <text
        x={labelX}
        y={labelY}
        textAnchor={labelAnchor}
        fontSize={12}
        fontWeight={600}
        fill={strokeColor}
        fontFamily="Inter, sans-serif"
      >
        {label}
      </text>
      {sub && (
        <text
          x={labelX}
          y={labelY + 14}
          textAnchor={labelAnchor}
          fontSize={11}
          fill={COLORS.axisText}
          fontFamily="Inter, sans-serif"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

function ScrubBadgeOverlay({ scrubXPct, flipLeft, display }: { scrubXPct: number; flipLeft: boolean; display: ScrubBadgeDisplay }) {
  const toneClass =
    display.tone === 'export' ? 'text-emerald-400'
    : display.tone === 'balanced' ? 'text-slate-400'
    : display.tone === 'night' ? 'text-amber-300'
    : 'text-rose-300';

  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none top-[6%] sm:top-[5%]"
      style={{
        left: `${scrubXPct}%`,
        transform: flipLeft ? 'translateX(calc(-100% - 10px))' : 'translateX(10px)',
      }}
    >
      <div className="bg-slate-900/95 text-white rounded-lg px-3 py-2 shadow-md min-w-[124px]">
        <div className="text-[10px] font-semibold tracking-widest text-slate-400">
          {display.time}
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-0.5">
          <span className="text-sm sm:text-base font-bold tabular-nums">{display.primary}</span>
          <span className={`text-[10px] font-semibold tracking-wider uppercase ${toneClass}`}>
            {display.sub}
          </span>
        </div>
      </div>
    </div>
  );
}
