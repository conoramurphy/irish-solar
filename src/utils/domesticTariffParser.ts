import type { Tariff, TimeWindow } from '../types';
import { DOMESTIC_EXPORT_RATE } from '../constants/houseModeDefaults';

/**
 * Parses ESB Networks domestic tariff CSV file into Tariff objects.
 * 
 * CSV Format:
 * Supplier,Plan Name / Type,24hr / Day (c/kWh),Night Rate (c/kWh),Peak (5-7pm) (c/kWh),EV / Boost Rate (c/kWh),EV Slot / Time,Standing Charge (€/yr)
 */

interface RawDomesticTariff {
  supplier: string;
  planName: string;
  dayRate: string;
  nightRate: string;
  peakRate: string;
  evRate: string;
  evSlot: string;
  standingCharge: string;
}

/**
 * Parse a rate value from the CSV (handles "N/A", cents conversion, asterisks)
 */
function parseRate(value: string): number | undefined {
  if (!value || value.trim() === 'N/A') return undefined;
  
  // Remove any asterisks, currency symbols, and whitespace
  const cleaned = value.replace(/[*€c\s]/g, '');
  const num = parseFloat(cleaned);
  
  if (isNaN(num)) return undefined;
  
  // Convert cents to EUR
  return num / 100;
}

/**
 * Parse standing charge (€/yr to €/day)
 */
function parseStandingCharge(value: string): number {
  const cleaned = value.replace(/[€,\s]/g, '');
  const yearly = parseFloat(cleaned);
  
  if (isNaN(yearly)) return 0;
  
  // Convert to daily rate
  return yearly / 365;
}

/**
 * Parse time window from strings like "2am – 6am" or "Sat/Sun 8-11"
 */
function parseTimeWindow(description: string): TimeWindow | undefined {
  if (!description || description.trim() === 'N/A') return undefined;
  
  const desc = description.trim();
  
  // Weekend format: "Sat/Sun 8-11"
  if (desc.toLowerCase().includes('sat') || desc.toLowerCase().includes('sun')) {
    const hourMatch = desc.match(/(\d+)-(\d+)/);
    if (hourMatch) {
      const start = parseInt(hourMatch[1]);
      const end = parseInt(hourMatch[2]);
      return {
        description: desc,
        hourRanges: [{ start, end }],
        daysOfWeek: [0, 6], // Sunday and Saturday
      };
    }
  }
  
  // Time range format: "2am – 6am" or "7pm – 12am"
  const timeMatch = desc.match(/(\d+)\s*([ap]m)\s*[–-]\s*(\d+)\s*([ap]m)/i);
  if (timeMatch) {
    let start = parseInt(timeMatch[1]);
    const startPeriod = timeMatch[2].toLowerCase();
    let end = parseInt(timeMatch[3]);
    const endPeriod = timeMatch[4].toLowerCase();
    
    // Convert to 24h
    if (startPeriod === 'pm' && start !== 12) start += 12;
    if (startPeriod === 'am' && start === 12) start = 0;
    if (endPeriod === 'pm' && end !== 12) end += 12;
    if (endPeriod === 'am' && end === 12) end = 0;
    
    return {
      description: desc,
      hourRanges: [{ start, end }],
    };
  }
  
  // Fallback: return description only
  return {
    description: desc,
  };
}

/**
 * Generate a slug ID from supplier and plan name
 */
function generateId(supplier: string, planName: string): string {
  const combined = `${supplier}-${planName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return combined;
}

/**
 * Determine tariff type based on available rates
 */
function determineTariffType(raw: RawDomesticTariff): Tariff['type'] {
  const hasNight = parseRate(raw.nightRate) !== undefined;
  const hasPeak = parseRate(raw.peakRate) !== undefined;
  const hasEv = parseRate(raw.evRate) !== undefined;
  const hasDay = parseRate(raw.dayRate) !== undefined;
  
  if (hasEv) return 'ev';
  if (hasPeak && hasNight) return 'time-of-use';
  if (hasNight && !hasPeak) return 'time-of-use'; // Day/Night
  if (hasDay && !hasNight && !hasPeak) return 'flat';
  
  return 'smart';
}

/**
 * Build rates array for the tariff
 */
function buildRates(raw: RawDomesticTariff): Tariff['rates'] {
  const rates: Tariff['rates'] = [];
  
  const dayRate = parseRate(raw.dayRate);
  const nightRate = parseRate(raw.nightRate);
  const peakRate = parseRate(raw.peakRate);
  
  if (nightRate !== undefined) {
    rates.push({
      period: 'night',
      hours: '23:00-08:00',
      rate: nightRate,
    });
  }
  
  if (peakRate !== undefined) {
    rates.push({
      period: 'peak',
      hours: '17:00-19:00',
      rate: peakRate,
    });
  }
  
  if (dayRate !== undefined) {
    rates.push({
      period: 'day',
      hours: nightRate ? '08:00-23:00' : 'all-day',
      rate: dayRate,
    });
  }
  
  return rates;
}

/**
 * Parse a single CSV row into a Tariff object
 */
function parseRow(raw: RawDomesticTariff): Tariff {
  const id = generateId(raw.supplier, raw.planName);
  const type = determineTariffType(raw);
  const standingCharge = parseStandingCharge(raw.standingCharge);
  const rates = buildRates(raw);
  
  const dayRate = parseRate(raw.dayRate);
  const nightRate = parseRate(raw.nightRate);
  const peakRate = parseRate(raw.peakRate);
  const evRate = parseRate(raw.evRate);
  const evTimeWindow = parseTimeWindow(raw.evSlot);
  
  // Check for free electricity window
  const freeWindow = evRate === 0 ? evTimeWindow : undefined;
  
  const tariff: Tariff = {
    id,
    supplier: raw.supplier,
    product: raw.planName,
    type,
    standingCharge,
    rates,
    exportRate: DOMESTIC_EXPORT_RATE, // SEAI microgeneration export rate for domestic users
    flatRate: dayRate && !nightRate && !peakRate ? dayRate : undefined,
    nightRate,
    peakRate,
    evRate: evRate !== undefined && evRate > 0 ? evRate : undefined,
    evTimeWindow: evRate !== undefined && evRate > 0 ? evTimeWindow : undefined,
    freeElectricityWindow: freeWindow,
  };
  
  return tariff;
}

/**
 * Parse the entire domestic tariff CSV file
 */
export function parseDomesticTariffsCsv(csvContent: string): Tariff[] {
  const lines = csvContent.trim().split(/\r?\n/);
  
  if (lines.length < 2) {
    throw new Error('CSV file must contain header and at least one data row');
  }
  
  // Skip header row
  const dataLines = lines.slice(1);
  
  const tariffs: Tariff[] = [];
  
  for (const line of dataLines) {
    // Split by comma but respect quoted fields
    const fields = line.split(',').map(f => f.trim());
    
    if (fields.length < 8) {
      console.warn('Skipping malformed row:', line);
      continue;
    }
    
    const raw: RawDomesticTariff = {
      supplier: fields[0],
      planName: fields[1],
      dayRate: fields[2],
      nightRate: fields[3],
      peakRate: fields[4],
      evRate: fields[5],
      evSlot: fields[6],
      standingCharge: fields[7],
    };
    
    try {
      const tariff = parseRow(raw);
      tariffs.push(tariff);
    } catch (error) {
      console.error('Error parsing row:', line, error);
    }
  }
  
  return tariffs;
}

/**
 * Load and parse domestic tariffs from the CSV file
 */
export async function loadDomesticTariffs(): Promise<Tariff[]> {
  const response = await fetch('/data/tarrifs/domestic-tarrifs.csv');
  if (!response.ok) {
    throw new Error(`Failed to load domestic tariffs: ${response.statusText}`);
  }
  
  const csvContent = await response.text();
  return parseDomesticTariffsCsv(csvContent);
}
