// Real half-hourly profiles for Sat 21 Jun 2025 (summer solstice).
//
// Load: pulled from public/data/usages/sample_{dairy_farm_100cow|hotel_20bed}_2025.csv.
// PV: GHI from public/data/solar/{Longford|Cavan}_2025.csv, converted to kW via
//   kW = kWp × GHI/1000 × 0.85  (0.85 is the performance ratio: inverter, soiling,
//   temperature, system losses). Longford is the dairy customer's actual location;
//   Cavan is the hotel customer's actual location.
//
// System sizes, battery sizes, self-consumption %, grant captured, and payback
// year all come from the real saved D1 reports for the two reference customers:
//   Dairy: WZ9EWvHnXsJsk8gH7GUQN ("Solar + Batteries, Longford, 100 head dairy, TAMS")
//   Hotel: GXz4-_lMwsjVbgc3GzBww ("Model for Cavan hotel, year round occupancy, 20 beds")
//
// The tariff used here is a representative Irish commercial day/night tariff
// (€0.35 day, €0.16 night, €0.195 export) so the battery night-rate strategy
// can be illustrated. Both reference customers are currently on a flat 24-hour
// rate (Electric Ireland Business Standard 24hr at €0.3397 / €0.195 export).
// The day/night example is what we recommend they switch to once solar is live.

import type { FunnelSegment } from './funnelConstants';

export interface ChartAnnotation {
  halfHourIndex: number; // 0..47
  label: string;
  sub?: string;
  align?: 'left' | 'right';
  color: 'load' | 'pv' | 'battery';
}

export interface ChartStat {
  label: string;
  value: string;
  emphasis?: boolean;
}

export interface TariffConfig {
  dayRate: number;
  nightRate: number;
  exportRate: number;
  nightStartHour: number;
  nightEndHour: number;
}

export function isNightRateIndex(halfHourIndex: number, tariff: TariffConfig): boolean {
  const hour = Math.floor(halfHourIndex / 2);
  if (tariff.nightStartHour > tariff.nightEndHour) {
    return hour >= tariff.nightStartHour || hour < tariff.nightEndHour;
  }
  return hour >= tariff.nightStartHour && hour < tariff.nightEndHour;
}

export interface BatteryConfig {
  capacityKwh: number;
  powerKw: number;
  initialSocKwh: number;
  roundTripEfficiency: number;
}

export interface SegmentChartData {
  title: string;
  unitsLabel: string;
  load: number[];
  generation: number[];
  batteryDischarge: number[];
  batteryCharge: number[];
  halfHourSpendEuros: number[];
  yMax: number;
  annotations: ChartAnnotation[];
  stats: [ChartStat, ChartStat, ChartStat];
  caption: string;
}

const TARIFF: TariffConfig = {
  dayRate: 0.35,
  nightRate: 0.16,
  exportRate: 0.195,
  nightStartHour: 23,
  nightEndHour: 8,
};

interface ModelInput {
  load: number[];
  generation: number[];
  battery?: BatteryConfig;
  tariff: TariffConfig;
}

interface ModelOutput {
  batteryDischarge: number[];
  batteryCharge: number[];
  halfHourSpendEuros: number[];
  selfConsumedKwh: number;
  totalGenKwh: number;
}

/**
 * Half-hourly battery + tariff simulation.
 *
 * Dispatch rules:
 *   1. PV surplus charges the battery first, exports the remainder.
 *   2. During day-rate deficits, the battery discharges to cover load.
 *   3. During night-rate deficits, the battery does NOT discharge (cheap import).
 *      Instead, the battery tops up from grid at the cheap rate so it has
 *      stored energy ready for the next day-rate peak.
 */
function modelDay({ load, generation, battery, tariff }: ModelInput): ModelOutput {
  const dt = 0.5;
  const n = load.length;
  const batteryDischarge = new Array<number>(n).fill(0);
  const batteryCharge = new Array<number>(n).fill(0);
  const halfHourSpendEuros = new Array<number>(n).fill(0);

  const cap = battery?.capacityKwh ?? 0;
  const maxPowerKw = battery?.powerKw ?? 0;
  const chargeEff = Math.sqrt(battery?.roundTripEfficiency ?? 0.9);
  const dischargeEff = chargeEff;
  let socKwh = battery?.initialSocKwh ?? 0;

  let totalSelfConsumedKwh = 0;
  let totalGenKwh = 0;

  for (let i = 0; i < n; i++) {
    const gen = generation[i];
    const ld = load[i];
    const netKw = gen - ld;
    const netKwh = netKw * dt;
    const isNight = isNightRateIndex(i, tariff);
    const importRate = isNight ? tariff.nightRate : tariff.dayRate;

    totalGenKwh += gen * dt;
    const directSelfConsumedKwh = Math.min(gen, ld) * dt;

    let bChargeFromPvKwh = 0;
    let bChargeFromGridKwh = 0;
    let bDischargeKwh = 0;

    if (netKwh > 0 && cap > 0) {
      const headroomKwh = (cap - socKwh) / chargeEff;
      bChargeFromPvKwh = Math.min(netKwh, maxPowerKw * dt, Math.max(0, headroomKwh));
      socKwh += bChargeFromPvKwh * chargeEff;
    } else if (netKwh < 0 && cap > 0) {
      if (isNight) {
        const headroomKwh = (cap - socKwh) / chargeEff;
        bChargeFromGridKwh = Math.min(maxPowerKw * dt, Math.max(0, headroomKwh));
        socKwh += bChargeFromGridKwh * chargeEff;
      } else {
        const availableKwh = socKwh * dischargeEff;
        bDischargeKwh = Math.min(-netKwh, maxPowerKw * dt, Math.max(0, availableKwh));
        socKwh -= bDischargeKwh / dischargeEff;
      }
    }

    batteryCharge[i] = (bChargeFromPvKwh + bChargeFromGridKwh) / dt;
    batteryDischarge[i] = bDischargeKwh / dt;
    totalSelfConsumedKwh += directSelfConsumedKwh + bDischargeKwh;

    const adjustedNetKwh = netKwh - bChargeFromPvKwh - bChargeFromGridKwh + bDischargeKwh;
    if (adjustedNetKwh < 0) {
      const importKwh = -adjustedNetKwh;
      halfHourSpendEuros[i] = importKwh * importRate;
    } else {
      const exportKwh = adjustedNetKwh;
      halfHourSpendEuros[i] = -exportKwh * tariff.exportRate;
    }
  }

  return {
    batteryDischarge,
    batteryCharge,
    halfHourSpendEuros,
    selfConsumedKwh: totalSelfConsumedKwh,
    totalGenKwh,
  };
}

// --- raw inputs from CSVs, Jun 21 2025 ---------------------------------------

const DAIRY_LOAD: number[] = [
  2.3, 2.18, 1.82, 1.93, 2.05, 2.19, 2.22, 2.0,
  2.12, 2.08, 4.58, 4.05, 4.01, 12.41, 11.31, 11.3,
  9.9, 6.04, 5.99, 4.27, 5.05, 2.56, 2.44, 2.6,
  2.46, 3.0, 2.66, 2.32, 2.26, 2.75, 2.43, 2.44,
  2.51, 2.49, 2.71, 2.29, 9.56, 11.19, 10.97, 11.12,
  4.3, 4.37, 3.98, 2.67, 2.26, 2.43, 2.76, 2.41,
];

// 65 kWp PV, Longford GHI × 0.85 PR.
const DAIRY_GEN: number[] = [
  0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
  0.2, 1.1, 3.1, 5.0, 3.8, 5.6, 6.9, 14.5,
  27.6, 30.5, 22.3, 21.0, 24.1, 37.1, 40.1, 35.9,
  40.5, 46.5, 43.3, 34.1, 30.0, 35.0, 32.7, 31.7,
  25.9, 27.5, 24.5, 18.9, 6.4, 4.2, 5.6, 4.1,
  1.4, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
];

const HOTEL_LOAD: number[] = [
  7.67, 3.62, 4.02, 3.52, 3.76, 3.53, 3.85, 4.05,
  3.26, 3.65, 3.92, 3.73, 3.68, 5.82, 7.11, 16.55,
  15.9, 16.21, 16.9, 17.74, 16.55, 12.0, 11.27, 11.97,
  9.9, 11.3, 9.95, 9.79, 12.31, 9.03, 8.68, 9.88,
  9.83, 8.43, 10.36, 8.68, 9.44, 16.37, 14.08, 15.86,
  14.26, 14.54, 12.08, 14.95, 14.2, 15.68, 14.93, 7.87,
];

// 50 kWp PV, Cavan GHI × 0.85 PR. No battery in the recommended hotel config:
// hotel daytime load already self-consumes most generation, so storage doesn't
// pay back on this customer profile.
const HOTEL_GEN: number[] = [
  0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
  0.3, 1.6, 2.3, 3.9, 8.9, 7.5, 8.9, 11.4,
  16.7, 24.5, 23.1, 16.6, 16.3, 24.1, 31.1, 34.8,
  32.0, 33.4, 32.2, 34.4, 29.4, 27.3, 21.6, 22.8,
  24.4, 19.0, 18.5, 14.5, 12.2, 9.1, 4.2, 2.6,
  1.7, 0.4, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
];

const DAIRY_BATTERY: BatteryConfig = {
  capacityKwh: 15,
  powerKw: 5,
  initialSocKwh: 3,
  roundTripEfficiency: 0.9,
};

// No HOTEL_BATTERY: recommended config is solar-only for this hotel profile.

const dairyModel = modelDay({ load: DAIRY_LOAD, generation: DAIRY_GEN, battery: DAIRY_BATTERY, tariff: TARIFF });
const hotelModel = modelDay({ load: HOTEL_LOAD, generation: HOTEL_GEN, tariff: TARIFF });

export const SEGMENT_CHART_DATA: Record<FunnelSegment, SegmentChartData> = {
  dairy: {
    title: 'A real dairy day, 100-head herd, Co. Longford',
    unitsLabel: 'Sat 21 Jun 2025 · kW, half-hourly',
    load: DAIRY_LOAD,
    generation: DAIRY_GEN,
    batteryDischarge: dairyModel.batteryDischarge,
    batteryCharge: dairyModel.batteryCharge,
    halfHourSpendEuros: dairyModel.halfHourSpendEuros,
    yMax: 50,
    annotations: [
      { halfHourIndex: 13, label: 'Morning milking', sub: 'plate cooler + parlour', align: 'left', color: 'load' },
      { halfHourIndex: 25, label: 'PV peak', sub: '47 kW at solar noon', align: 'right', color: 'pv' },
      { halfHourIndex: 37, label: 'Evening milking', sub: 'battery covers most of it', align: 'right', color: 'battery' },
    ],
    stats: [
      { label: 'Self-consumption', value: '42%' },
      { label: '10-yr return', value: '+€141k' },
      { label: 'Payback', value: 'Year 2.6', emphasis: true },
    ],
    caption: 'A real 100-head Longford farm modelled at 65 kWp PV plus a 15 kWh battery under TAMS 3. The herd uses 42% of generation directly; the rest exports at the CEG tariff or shifts into evening milking via the battery.',
  },
  hotel: {
    title: 'A real hotel day, 20-bed Cavan hotel',
    unitsLabel: 'Sat 21 Jun 2025 · kW, half-hourly',
    load: HOTEL_LOAD,
    generation: HOTEL_GEN,
    batteryDischarge: hotelModel.batteryDischarge,
    batteryCharge: hotelModel.batteryCharge,
    halfHourSpendEuros: hotelModel.halfHourSpendEuros,
    yMax: 50,
    annotations: [
      { halfHourIndex: 15, label: 'Breakfast + kitchen', sub: 'morning ramp', align: 'left', color: 'load' },
      { halfHourIndex: 23, label: 'PV peak', sub: '35 kW at solar noon', align: 'right', color: 'pv' },
      { halfHourIndex: 38, label: 'Evening service', sub: 'kitchen + laundry', align: 'right', color: 'load' },
    ],
    stats: [
      { label: 'Self-consumption', value: '70%' },
      { label: '10-yr return', value: '+€82,400' },
      { label: 'Payback', value: 'Year 4.5', emphasis: true },
    ],
    caption: 'A real 20-bed Cavan hotel modelled at 50 kWp PV with no battery under SEAI Non-Domestic Microgen. Hotel daytime load already self-consumes most of the PV, so storage does not pay back on this profile. Morning and evening peaks still need grid import.',
  },
};

export const CHART_TARIFF = TARIFF;
