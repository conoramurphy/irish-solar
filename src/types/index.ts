export interface PanelOrientation {
  /** Compass azimuth in degrees: 0 = south, 90 = west, -90 = east, 180 = north */
  azimuthDeg: number;
  /** Tilt from horizontal in degrees: 0 = flat, 90 = vertical */
  tiltDeg: number;
}

export type BusinessType = 'hotel' | 'farm' | 'commercial' | 'other' | 'house';

export type BuildingTypeSelection = 'hotel-year-round' | 'house' | 'farm';

export interface SystemConfiguration {
  annualProductionKwh: number; // Total annual production from solar system
  numberOfPanels?: number; // Number of south-facing panels
  /** Installed DC capacity (kWp). Needed for some grant calculations (e.g. SEAI Non-Domestic Microgen). */
  systemSizeKwp?: number;
  batterySizeKwh: number;
  /** Maximum Export Capacity (MEC) in kW. Grid limit for exports. */
  gridExportCapKw?: number;
  installationCost: number;
  location: string;
  businessType: BusinessType;
  /** Panel orientation. When set, uses pre-baked PVGIS hourly profiles instead of GHI weighting. */
  orientation?: PanelOrientation;
  /** Whether to exclude VAT from all calculations (for VAT-registered businesses) */
  excludeVat?: boolean;
  /** Persisted VAT rate for installation costs (decimal, e.g. 0.135) */
  installationVatRate?: number;
}

export interface UploadSummary {
  filename: string;
  year: number;
  totalKwh: number;
  slotsPerDay: 24 | 48;
}

export interface Grant {
  id: string;
  name: string;
  type: 'SEAI' | 'TAMS' | 'Other';

  /**
   * Default calculation inputs (legacy): percent-of-project-cost with an independent cap.
   * Some grants override this via `calculation.method`.
   */
  percentage: number;
  maxAmount: number;

  eligibleFor: BusinessType[];
  description?: string;

  /** One or more authoritative source pages (for provenance). */
  sourceUrls?: string[];
  /** Optional: when these figures were last verified. ISO date (YYYY-MM-DD). */
  lastVerified?: string;

  /** Optional override for how to compute this grant. */
  calculation?: {
    method: 'percentage-of-cost' | 'seai-non-domestic-microgen-solar-pv' | 'seai-domestic-solar-pv' | 'tams-scis-solar-pv';
  };
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
  /** Whether to apply Accelerated Capital Allowance (tax relief) */
  isTaxReliefEligible?: boolean;
  /** Effective tax rate for ACA (decimal, e.g. 0.125 or 0.52) */
  taxRate?: number;
}

export interface TariffRate {
  period: string;
  hours?: string;
  /** EUR per kWh */
  rate: number;
}

/** Time window for special tariff rates (EV charging, free electricity, etc.) */
export interface TimeWindow {
  /** Human-readable description (e.g., "2am - 6am", "Sat/Sun 8-11") */
  description: string;
  /** Hour ranges [startHour, endHour) in 24h format. Multiple ranges for complex windows. */
  hourRanges?: Array<{ start: number; end: number }>;
  /** Optional day-of-week constraint (0=Sun, 1=Mon, ..., 6=Sat) */
  daysOfWeek?: number[];
}

export interface Tariff {
  id: string;
  supplier: string;
  product: string;
  type: '24-hour' | 'time-of-use' | 'smart' | 'ev' | 'flat';
  /** EUR per day */
  standingCharge: number;
  rates: TariffRate[];
  /** EUR per kWh */
  exportRate: number;
  /** Optional extra levy (EUR per kWh) */
  psoLevy?: number;
  /** Whether the rates in this tariff are already ex-VAT */
  isExVat?: boolean;
  
  // Domestic-specific features
  /** EV or boost rate (EUR per kWh) */
  evRate?: number;
  /** Time window when EV rate applies */
  evTimeWindow?: TimeWindow;
  /** Free electricity window (0 rate during specified times) */
  freeElectricityWindow?: TimeWindow;
  /** 24-hour flat rate (EUR per kWh) for simple tariffs */
  flatRate?: number;
  /** Night rate (EUR per kWh) for day/night tariffs */
  nightRate?: number;
  /** Peak rate (EUR per kWh) for time-of-use tariffs */
  peakRate?: number;
}

export interface TradingConfig {
  enabled: boolean;
  /** Margin added to day-ahead price for imports (EUR/kWh). Default 0. */
  importMargin?: number;
  /** Margin deducted from day-ahead price for exports (EUR/kWh). Default 0. */
  exportMargin?: number;
  /** Number of hours to force charge (cheapest) and discharge (most expensive) per day. Default 4. */
  hoursWindow?: number; 
  annualRevenue?: number;
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
  /** Slot index within the year (0-based; covers hourly or half-hourly series) */
  hour: number;
  /** Solar generation this slot (kWh) */
  generation: number;
  /** Site consumption this slot (kWh) */
  consumption: number;
  /** Energy imported from grid this slot (kWh) */
  gridImport: number;
  /** Energy exported to grid this slot (kWh) */
  gridExport: number;
  /** Energy charged to battery this slot (kWh) */
  batteryCharge: number;
  /** Energy discharged from battery this slot (kWh) */
  batteryDischarge: number;
  /** Battery state of charge at end of slot (kWh) */
  batterySoC: number;
  /** Canonical slot key (YYYY-MM-DDTHH for hourly, YYYY-MM-DDTHH:MM for half-hourly) */
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
  /** Market price for this hour (EUR/kWh) if trading enabled */
  marketPrice?: number;
}

export interface HourlySimulationResult {
  /** Total energy imported from grid (kWh) */
  totalGridImport: number;
  /** Total energy exported to grid (kWh) - actual paid exports */
  totalGridExport: number;
  /** Total energy curtailed due to export cap (kWh) - unpaid spill */
  totalGridExportCurtailed: number;
  /** Number of hours where any export curtailment occurred */
  totalExportCurtailedHours: number;
  /** Total self-consumed solar (kWh) */
  totalSelfConsumption: number;
  /** Total cost of grid imports (EUR) */
  totalImportCost: number;
  /** Total revenue from exports (EUR) */
  totalExportRevenue: number;
  /** Net savings compared to baseline (EUR) */
  totalSavings: number;
  
  // Breakdown
  totalSolarToLoadKwh: number;
  totalBatteryToLoadKwh: number;
  totalSolarToLoadSavings: number;
  totalBatteryToLoadSavings: number;

  /** Hourly detail (optional, for debugging/visualization) */
  hourlyData?: HourlyEnergyFlow[];
}

export interface SolarSpillageCurvePoint {
  annualGenerationKwh: number;
  scaleFactor: number;
  exportKwh: number;
  spillageFraction: number;
}

export interface SolarSpillageAnalysis {
  targetSpillageFraction: number;
  current: SolarSpillageCurvePoint;
  target?: SolarSpillageCurvePoint;
  curve: SolarSpillageCurvePoint[];
  note: string;
}

export interface SensitivityVariant {
  /** Multiplier of base battery kWh/kWp: 0 = no battery, 0.5 = half, 1.0 = full, 2.0 = double. */
  batteryFactor: 0 | 0.5 | 1.0 | 2.0;
  batterySizeKwh: number;
  systemCost: number;
  netCost: number;
  annualSavings: number;
  /** Year 1 export revenue component of annualSavings, used for future-rate re-projection. */
  year1ExportRevenue: number;
  /** Year 1 annualGeneration (kWh), used for degradation scaling. */
  annualGenerationKwh: number;
  /** Equity (cash) invested at time 0. Used as starting basis for cumulative cash flow. */
  equityAmount: number;
  /** Annual loan payment (0 if no loan). Used to compute net cash flow per year. */
  annualLoanPayment: number;
  /** Loan term in years (0 if no loan). */
  loanTermYears: number;
  /** 25-year IRR, or NaN if not solvable. */
  irr: number;
  year1NetCashFlow: number;
  year10NetCashFlow: number;
  spillageFraction: number;
  /** Fraction of generation exported AND paid for. */
  exportPaidFraction: number;
  /** Fraction of generation curtailed above export cap (unpaid). */
  exportUnpaidFraction: number;
  /** Hours per year where export was curtailed by the grid cap. */
  exportCurtailedHours: number;
}

export interface SensitivityScenario {
  scaleFactor: number;
  annualGenerationKwh: number;
  systemSizeKwp: number;
  noBattery: SensitivityVariant;     // batteryFactor: 0
  halfBattery: SensitivityVariant;   // batteryFactor: 0.5
  fullBattery: SensitivityVariant;   // batteryFactor: 1.0
  doubleBattery: SensitivityVariant; // batteryFactor: 2.0
}

export interface SensitivityAnalysis {
  rows: SensitivityScenario[];
  note: string;
}

export interface InputsUsedSolarSampleRow {
  hourKey: string;
  stamp: { year: number; monthIndex: number; day: number; hour: number };
  irradianceWm2: number;
  sourceIndex: number;
}

export interface InputsUsedConsumptionSampleRow {
  hourKey: string;
  consumptionKwh: number;
}

export interface InputsUsedPriceSampleRow {
  hourKey: string;
  priceEurPerKwh: number;
}

export interface ConsumptionNormalizationCorrections {
  originalLength: number;
  targetLength: number;
  padded: boolean;
  trimmed: boolean;
  warnings: string[];
}

export interface PriceNormalizationCorrections {
  targetYear: number;
  expectedHours: number;
  actualRowsParsed: number;
  duplicatesDropped: number;
  hoursMissingFilled: number;
  warnings: string[];
}

export interface SolarNormalizationCorrections {
  selectedYear: number;
  expectedSlots: number;
  actualRowsInYear: number;
  duplicatesDropped: number;
  slotsMissingFilled: number;
  rowsOutsideYearDropped: number;
  warnings: string[];
}

export interface InputsUsed {
  config: SystemConfiguration;
  tariff: Tariff;
  financing: Financing;
  grants: Array<{ id: string; name: string; type: Grant['type'] }>;
  trading: TradingConfig;
  simulation: {
    year: number;
    totalHours: number;
    consumptionSource: 'override' | 'monthly-profile';
    marketPricesProvided: boolean;
  };
  corrections?: {
    solar?: SolarNormalizationCorrections;
    consumption?: ConsumptionNormalizationCorrections;
    prices?: PriceNormalizationCorrections;
  };
  samples?: {
    solar: InputsUsedSolarSampleRow[];
    consumption?: InputsUsedConsumptionSampleRow[];
    prices?: InputsUsedPriceSampleRow[];
  };
}

export interface CalculationDiagnostics {
  warnings: string[];
}

export interface CalculationResult {
  systemCost: number;
  netCost: number;
  annualGeneration: number;
  annualSelfConsumption: number;
  annualExport: number;
  annualSavings: number;
  
  // Savings breakdown (EUR)
  annualSolarToLoadSavings: number;
  annualBatteryToLoadSavings: number;
  annualExportRevenue: number;
  /** Tax savings from ACA in Year 1 (EUR) */
  year1TaxSavings?: number;
  /** Equity (cash) invested at time 0, used as NPV/IRR initial outflow. */
  equityAmount?: number;
  /** Effective net cost after grants and tax relief (for display). */
  effectiveNetCost?: number;

  /** Years to recover equity (out of pocket) at first-year net cash flow. */
  simplePayback: number;
  /** NPV at 5% discount, initial outflow = equity only, cash flows = net of loan. */
  npv: number;
  /** 25-year IRR on equity (out of pocket), cash flows net of loan. */
  irr: number;
  cashFlows: Array<{
    year: number;
    generation: number;
    savings: number;
    loanPayment: number;
    netCashFlow: number;
    cumulativeCashFlow: number;
  }>;
  /** Extra mini-analysis: solar-only spillage sensitivity (no battery, no € rates). */
  solarSpillageAnalysis?: SolarSpillageAnalysis;
  sensitivityAnalysis?: SensitivityAnalysis;
  /** Optional audit/debug payload derived from the same hourly source-of-truth used for the report. */
  audit?: {
    mode: 'hourly';
    year?: number;
    totalHours?: number;
    corrections?: SolarNormalizationCorrections;
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

  /** Compact traceability payload for what inputs were actually used in the engine. */
  inputsUsed?: InputsUsed;
  /** Diagnostics produced during normalization/fallback/assumption steps. */
  diagnostics?: CalculationDiagnostics;
}
