/**
 * Indexed economic value WattProfit assigns to a primary lead-form submission
 * for Google Ads Smart Bidding.
 *
 * Calculation: average job value (€5,000) × lead-to-job conversion rate (20%)
 * = €1,000 per lead. This is a placeholder for real economic value; revise
 * after the first 50 clean leads if the actual rate diverges materially.
 *
 * Google Ads UI must hold the SAME value on the corresponding conversion
 * action ("Submit lead form (real)") for the bidder to learn correctly.
 * Changing this constant without updating Google Ads (or vice versa) leaves
 * the bid model unstable.
 */
export const LEAD_CONVERSION_VALUE_EUR = 1000;

/** ISO currency code for the lead conversion value. */
export const LEAD_CONVERSION_CURRENCY = 'EUR';
