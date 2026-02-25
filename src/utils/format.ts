/**
 * Shared formatting utilities for EUR currency and numeric display.
 * All formatters use the en-IE locale for consistency.
 */

const currencyFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const currencyPreciseFmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });
const kwhFmt = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 3 });

/** Format as EUR with no decimals (e.g. "€1,234"). */
export function formatCurrency(value: number): string {
  return currencyFmt.format(value);
}

/** Format as EUR with 2 decimal places (e.g. "€1,234.56"). */
export function formatCurrencyPrecise(value: number): string {
  return currencyPreciseFmt.format(value);
}

/** Format a number with no decimals and locale grouping (e.g. "1,234"). */
export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

/** Format kWh with up to 3 decimal places. */
export function formatKwh(value: number): string {
  return kwhFmt.format(value);
}
