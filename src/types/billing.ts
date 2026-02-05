export interface TariffSlot {
  id: string;
  name: string;
  startHour: number; // 0-23
  endHour: number; // 0-23
  ratePerKwh: number; // €/kWh
}

export interface ExampleMonth {
  monthIndex: number; // 0-11
  monthName: string;
  totalKwh: number;
  totalBillEur: number;
  tariffSlotUsage: Record<string, number>; // slot id -> % of consumption (0-1)
}

export interface TariffConfiguration {
  type: 'flat' | 'custom';
  flatRate?: number; // €/kWh for flat tariff
  customSlots?: TariffSlot[]; // for custom tariff
}

export interface ConsumptionBillingProfile {
  exampleMonths: ExampleMonth[]; // Typically 2: one winter, one summer
  tariffConfig: TariffConfiguration;
  curvedMonthlyKwh: number[]; // 12 months, calculated from examples
  estimatedMonthlyBills: number[]; // 12 months, calculated
}
