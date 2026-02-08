export type BusinessType = 'hotel' | 'farm' | 'commercial' | 'other';

export type BuildingTypeSelection = 'hotel-year-round' | 'house' | 'farm' | 'hotel-seasonal';

export interface SystemConfiguration {
  annualProductionKwh: number; // Total annual production from solar system
  batterySizeKwh: number;
  installationCost: number;
  location: string;
  businessType: BusinessType;
}

export interface Grant {
  id: string;
  name: string;
  type: 'SEAI' | 'TAMS' | 'Other';
  percentage: number;
  maxAmount: number;
  eligibleFor: BusinessType[];
  description?: string;
}

export interface Financing {
  /** Up-front cash paid by the customer */
  equity: number;
  /** Annual nominal interest rate, e.g. 0.05 for 5% */
  interestRate: number;
  /** Loan term in years */
  termYears: number;
  /** Optional explicit loan amount (otherwise derived from netCost - equity) */
  loanAmount?: number;
}

export interface TariffRate {
  period: string;
  hours?: string;
  /** EUR per kWh */
  rate: number;
}

export interface Tariff {
  id: string;
  supplier: string;
  product: string;
  type: '24-hour' | 'time-of-use' | 'smart';
  /** EUR per day */
  standingCharge: number;
  rates: TariffRate[];
  /** EUR per kWh */
  exportRate: number;
  /** Optional extra levy (EUR per kWh) */
  psoLevy?: number;
}

export interface TradingConfig {
  enabled: boolean;
  annualRevenue?: number;
  frequency?: 'daily' | 'weekly' | 'monthly';
}

export interface HistoricalSolarData {
  location: string;
  lat: number;
  lon: number;
  source: string;
  period: string;
  monthlyAverages?: Record<string, { irradiance: number; pvYield: number }>;
  yearlyTotals: Array<{ year: number; totalKwhKwp: number }>;
}

export interface HistoricalTariffData {
  supplier: string;
  product: string;
  history: Array<{
    effectiveDate: string;
    standingCharge: number;
    unitRate: number;
    psoLevy?: number;
  }>;
}

export type TariffBucketKey = string;

export interface MonthlyConsumption {
  /** 0 = Jan ... 11 = Dec */
  monthIndex: number;
  /** Total site consumption for the month (kWh) */
  totalKwh: number;
  /**
   * Split of the month’s consumption across tariff buckets.
   * Keys should match derived tariff bucket keys (normalized from tariff.rates[].period).
   * Values are shares (0..1) and should sum to 1.
   */
  bucketShares: Record<TariffBucketKey, number>;
}

export interface ConsumptionProfile {
  months: MonthlyConsumption[];
}

export interface HourlyEnergyFlow {
  /** Hour of year (0-8759) */
  hour: number;
  /** Solar generation this hour (kWh) */
  generation: number;
  /** Site consumption this hour (kWh) */
  consumption: number;
  /** Energy imported from grid (kWh) */
  gridImport: number;
  /** Energy exported to grid (kWh) */
  gridExport: number;
  /** Energy charged to battery (kWh) */
  batteryCharge: number;
  /** Energy discharged from battery (kWh) */
  batteryDischarge: number;
  /** Battery state of charge at end of hour (kWh) */
  batterySoC: number;
  /** Canonical hour key (YYYY-MM-DDTHH) for traceability */
  hourKey?: string;
  /** Month index (0-11) from canonical timestamp */
  monthIndex?: number;
  /** Hour-of-day (0-23) from canonical timestamp */
  hourOfDay?: number;
  /** Baseline (no-solar) cost for this hour (EUR) */
  baselineCost: number;
  /** Cost of imports this hour (EUR) */
  importCost: number;
  /** Revenue from exports this hour (EUR) */
  exportRevenue: number;
  /** Net savings for this hour vs baseline (EUR) */
  savings: number;
  /** Tariff bucket for this hour */
  tariffBucket: string;
}

export interface HourlySimulationResult {
  /** Total energy imported from grid (kWh) */
  totalGridImport: number;
  /** Total energy exported to grid (kWh) */
  totalGridExport: number;
  /** Total self-consumed solar (kWh) */
  totalSelfConsumption: number;
  /** Total cost of grid imports (EUR) */
  totalImportCost: number;
  /** Total revenue from exports (EUR) */
  totalExportRevenue: number;
  /** Net savings compared to baseline (EUR) */
  totalSavings: number;
  /** Hourly detail (optional, for debugging/visualization) */
  hourlyData?: HourlyEnergyFlow[];
}

export interface CalculationResult {
  systemCost: number;
  netCost: number;
  annualGeneration: number;
  annualSelfConsumption: number;
  annualExport: number;
  annualSavings: number;
  simplePayback: number;
  npv: number;
  irr: number;
  cashFlows: Array<{
    year: number;
    generation: number;
    savings: number;
    loanPayment: number;
    netCashFlow: number;
    cumulativeCashFlow: number;
  }>;
  /** Optional audit/debug payload derived from the same hourly source-of-truth used for the report. */
  audit?: {
    mode: 'hourly';
    year?: number;
    totalHours?: number;
    corrections?: {
      selectedYear: number;
      expectedHours: number;
      actualRowsInYear: number;
      duplicatesDropped: number;
      hoursMissingFilled: number;
      rowsOutsideYearDropped: number;
      warnings: string[];
    };
    hourly: HourlyEnergyFlow[];
    monthly: Array<{
      monthIndex: number;
      generation: number;
      consumption: number;
      gridImport: number;
      gridExport: number;
      selfConsumption: number;
      baselineCost: number;
      importCost: number;
      exportRevenue: number;
      savings: number;
      /** Loan payment allocated to this month (Year 1 only; 0 if no loan). */
      debtPayment: number;
      /** savings − debtPayment (Year 1 only). Positive means "up", negative means "out of pocket". */
      netOutOfPocket: number;
    }>;
    provenance: {
      hourlyDefinition: string;
      monthlyAggregationDefinition: string;
    };
  };
}
