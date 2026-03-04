/**
 * VAT rates for Ireland
 */
export const VAT_RATE_REDUCED = 0.135; // 13.5% - typically for electricity and domestic solar
export const VAT_RATE_STANDARD = 0.23;  // 23% - typically for commercial solar/batteries

/**
 * Strip VAT from a gross amount to get the net amount.
 * Formula: Net = Gross / (1 + Rate)
 */
export function stripVat(amount: number, rate: number): number {
  if (rate === 0) return amount;
  return amount / (1 + rate);
}

/**
 * Add VAT to a net amount to get the gross amount.
 * Formula: Gross = Net * (1 + Rate)
 */
export function addVat(amount: number, rate: number): number {
  return amount * (1 + rate);
}
