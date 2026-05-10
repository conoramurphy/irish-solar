// Eircode is the Irish postal code format: routing key (1 letter + 2 digits)
// followed by a unique identifier (4 alphanumeric, no I/O/Q to avoid confusion
// with 1/0). Reference: https://www.eircode.ie

const EIRCODE_REGEX = /^[A-Z][0-9]{2}\s?[A-Z0-9]{4}$/i;

/** Returns true if `value` looks like a syntactically-valid Eircode. */
export function isValidEircode(value: string): boolean {
  return EIRCODE_REGEX.test(value.trim());
}

/** Normalises an Eircode to canonical "A12 B345" format (uppercase, single space). */
export function normaliseEircode(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, '');
  if (cleaned.length < 7) return value.trim().toUpperCase();
  return `${cleaned.slice(0, 3)} ${cleaned.slice(3)}`;
}
