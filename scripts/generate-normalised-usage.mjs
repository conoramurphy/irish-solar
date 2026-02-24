import fs from 'node:fs';
import path from 'node:path';

const TARGET_YEAR = 2025;
const TOLERANCE = 0.10; // Only scale a month up if it is >10% below the target ratio

// Monthly totals relative to January.
// Index 0=Jan ... 11=Dec
const CURVE = [
  1.00, 0.95, 0.86, 0.75, 0.68, 0.62, 0.60, 0.62, 0.70, 0.82, 0.92, 0.98
];

const INPUT_CSV = path.join(process.cwd(), 'public', 'data', 'usages', 'usage_john.csv');
const OUTPUT_CSV = path.join(process.cwd(), 'public', 'data', 'usages', `usage_john_normalised_${TARGET_YEAR}.csv`);

function parseEndTimeToUtcMillis(endTimeStr) {
  // Format: DD-MM-YYYY HH:mm
  const [d, t] = endTimeStr.trim().split(' ');
  const [day, month, year] = d.split('-').map(Number);
  const [hour, min] = t.split(':').map(Number);
  return Date.UTC(year, month - 1, day, hour, min);
}

function formatUtcMillisToEndTime(tsMillis) {
  const d = new Date(tsMillis);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function getMonthIndexFromUtcMillis(tsMillis) {
  return new Date(tsMillis).getUTCMonth();
}

function getSlotIndexFromUtcMillis(tsMillis) {
  const d = new Date(tsMillis);
  return d.getUTCHours() * 2 + (d.getUTCMinutes() >= 30 ? 1 : 0);
}

function main() {
  const text = fs.readFileSync(INPUT_CSV, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error('Input CSV has no data');

  const header = lines[0];
  const headers = header.split(',').map(h => h.trim().toLowerCase());
  const idxMprn = headers.indexOf('mprn');
  const idxSerial = headers.indexOf('meter serial number');
  const idxValue = headers.indexOf('read value');
  const idxType = headers.indexOf('read type');
  const idxEndTime = headers.indexOf('read date and end time');

  if (idxValue === -1 || idxEndTime === -1) {
    throw new Error('Invalid CSV: missing expected headers');
  }

  // Build mapping from interval-start timestamp -> kW (averaged if duplicates).
  const startTsToSumKw = new Map();
  const startTsToCount = new Map();

  let sampleMprn = null;
  let sampleSerial = null;

  // For filling missing intervals: month+slot averages from available points.
  const monthSlotSum = Array.from({ length: 12 }, () => new Float64Array(48));
  const monthSlotCount = Array.from({ length: 12 }, () => new Uint32Array(48));
  const globalSlotSum = new Float64Array(48);
  const globalSlotCount = new Uint32Array(48);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = line.split(',');
    const typ = idxType !== -1 ? (cols[idxType] || '').trim().toLowerCase() : '';
    if (typ.includes('export')) continue;

    const endStr = (cols[idxEndTime] || '').trim();
    const valStr = (cols[idxValue] || '').trim();
    if (!endStr || !valStr) continue;

    const endTs = parseEndTimeToUtcMillis(endStr);
    const startTs = endTs - 30 * 60 * 1000;

    // Only keep intervals whose START belongs to the target year
    const startYear = new Date(startTs).getUTCFullYear();
    if (startYear !== TARGET_YEAR) continue;

    const kw = Number.parseFloat(valStr);
    if (!Number.isFinite(kw)) continue;

    if (sampleMprn == null && idxMprn !== -1) sampleMprn = (cols[idxMprn] || '').trim();
    if (sampleSerial == null && idxSerial !== -1) sampleSerial = (cols[idxSerial] || '').trim();

    startTsToSumKw.set(startTs, (startTsToSumKw.get(startTs) || 0) + kw);
    startTsToCount.set(startTs, (startTsToCount.get(startTs) || 0) + 1);

    const monthIdx = getMonthIndexFromUtcMillis(startTs);
    const slotIdx = getSlotIndexFromUtcMillis(startTs);
    monthSlotSum[monthIdx][slotIdx] += kw;
    monthSlotCount[monthIdx][slotIdx] += 1;
    globalSlotSum[slotIdx] += kw;
    globalSlotCount[slotIdx] += 1;
  }

  if (!sampleMprn) sampleMprn = '10013715764';
  if (!sampleSerial) sampleSerial = '000000000024641939';

  // Convert duplicates to averages
  const startTsToKw = new Map();
  for (const [ts, sum] of startTsToSumKw.entries()) {
    const c = startTsToCount.get(ts) || 1;
    startTsToKw.set(ts, sum / c);
  }

  // Precompute fill averages
  const monthSlotAvg = Array.from({ length: 12 }, () => new Float64Array(48));
  const globalSlotAvg = new Float64Array(48);
  for (let slot = 0; slot < 48; slot++) {
    globalSlotAvg[slot] = globalSlotCount[slot] ? globalSlotSum[slot] / globalSlotCount[slot] : 0;
  }
  for (let m = 0; m < 12; m++) {
    for (let slot = 0; slot < 48; slot++) {
      monthSlotAvg[m][slot] = monthSlotCount[m][slot]
        ? monthSlotSum[m][slot] / monthSlotCount[m][slot]
        : globalSlotAvg[slot];
    }
  }

  // Build full-year 30-min grid (start times)
  const startOfYear = Date.UTC(TARGET_YEAR, 0, 1, 0, 0);
  const startOfNextYear = Date.UTC(TARGET_YEAR + 1, 0, 1, 0, 0);

  const intervalStarts = [];
  for (let ts = startOfYear; ts < startOfNextYear; ts += 30 * 60 * 1000) {
    intervalStarts.push(ts);
  }
  if (intervalStarts.length !== 365 * 48) {
    throw new Error(`Unexpected interval count for ${TARGET_YEAR}: ${intervalStarts.length}`);
  }

  // Build half-hour kW series (filled to full year)
  const kwSeries = new Float64Array(intervalStarts.length);
  let filledCount = 0;
  for (let i = 0; i < intervalStarts.length; i++) {
    const ts = intervalStarts[i];
    const v = startTsToKw.get(ts);
    if (v != null) {
      kwSeries[i] = v;
    } else {
      const monthIdx = getMonthIndexFromUtcMillis(ts);
      const slotIdx = getSlotIndexFromUtcMillis(ts);
      kwSeries[i] = monthSlotAvg[monthIdx][slotIdx];
      filledCount++;
    }
  }

  // Compute monthly totals (kWh) from the complete series
  const monthKwh = new Float64Array(12);
  for (let i = 0; i < intervalStarts.length; i++) {
    const kwh = kwSeries[i] * 0.5;
    const monthIdx = getMonthIndexFromUtcMillis(intervalStarts[i]);
    monthKwh[monthIdx] += kwh;
  }

  const janKwh = monthKwh[0];
  if (!janKwh) throw new Error('January total is zero; cannot normalize');

  // Decide which months to scale up
  const monthScale = new Float64Array(12);
  monthScale.fill(1);

  for (let m = 0; m < 12; m++) {
    const actualRatio = monthKwh[m] / janKwh;
    const targetRatio = CURVE[m];

    const minAcceptable = targetRatio * (1 - TOLERANCE);
    if (actualRatio < minAcceptable) {
      const targetKwh = janKwh * targetRatio;
      monthScale[m] = targetKwh / monthKwh[m];
    }
  }

  // Apply scaling
  for (let i = 0; i < intervalStarts.length; i++) {
    const monthIdx = getMonthIndexFromUtcMillis(intervalStarts[i]);
    kwSeries[i] *= monthScale[monthIdx];
  }

  // Recompute month totals after scaling for reporting
  const monthKwhAfter = new Float64Array(12);
  for (let i = 0; i < intervalStarts.length; i++) {
    const kwh = kwSeries[i] * 0.5;
    const monthIdx = getMonthIndexFromUtcMillis(intervalStarts[i]);
    monthKwhAfter[monthIdx] += kwh;
  }

  // Write CSV in ESB-like reverse chronological order (latest first)
  const out = [];
  out.push('MPRN,Meter Serial Number,Read Value,Read Type,Read Date and End Time');

  for (let i = intervalStarts.length - 1; i >= 0; i--) {
    const startTs = intervalStarts[i];
    const endTs = startTs + 30 * 60 * 1000;
    const kw = kwSeries[i];
    out.push([
      sampleMprn,
      sampleSerial,
      kw.toFixed(3),
      'Active Import Interval (kW)',
      formatUtcMillisToEndTime(endTs)
    ].join(','));
  }

  fs.writeFileSync(OUTPUT_CSV, out.join('\r\n') + '\r\n', 'utf8');

  // Console summary
  console.log(`Wrote ${OUTPUT_CSV}`);
  console.log(`Intervals: ${intervalStarts.length} (filled missing: ${filledCount})`);
  console.log('Month summary (kWh before -> after, scale, ratio after vs Jan, target):');
  const janAfter = monthKwhAfter[0];
  for (let m = 0; m < 12; m++) {
    const ratioAfter = monthKwhAfter[m] / janAfter;
    console.log(
      `${String(m + 1).padStart(2, '0')}: ` +
      `${monthKwh[m].toFixed(1)} -> ${monthKwhAfter[m].toFixed(1)} ` +
      `(x${monthScale[m].toFixed(3)}), ratio=${ratioAfter.toFixed(3)}, target=${CURVE[m].toFixed(2)}`
    );
  }
}

main();
