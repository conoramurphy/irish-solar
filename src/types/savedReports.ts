import type {
  CalculationResult,
  Financing,
  SystemConfiguration,
  TradingConfig
} from './index';
import type { ExampleMonth, TariffConfiguration } from './billing';

export interface SavedReport {
  id: string;
  name: string;
  createdAt: string; // ISO date string
  schemaVersion: number;

  // Inputs required to reproduce the calculation
  config: SystemConfiguration;
  financing: Financing;
  selectedGrantIds: string[];
  trading: TradingConfig;
  tariffId: string;
  
  // Billing/Consumption profile
  exampleMonths: ExampleMonth[];
  tariffConfig: TariffConfiguration | null;
  curvedMonthlyKwh: number[];
  estimatedMonthlyBills: number[];
  hourlyConsumptionOverride?: number[];
  selectedDomesticTariffId?: string;

  // Solar simulation context
  selectedYear?: number;

  // Optional snapshot of results (for preview without recalculation)
  result?: CalculationResult;
}
