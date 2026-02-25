/**
 * Default values for domestic/house mode.
 * 
 * Based on typical Irish domestic solar installations in 2025.
 * Reference: Industry standard for 16-panel system with battery storage.
 */

export const HOUSE_MODE_DEFAULTS = {
  /**
   * Default installation cost (EUR, including VAT).
   * Based on: 16 x 400W panels (6.4kWp) + 8kWh battery + installation
   * Industry benchmark: ~€10,000 for domestic system in Ireland (2025)
   */
  INSTALLATION_COST: 10000,

  /**
   * System size in kWp (kilowatt-peak).
   * Calculation: 16 panels × 400W = 6,400W = 6.4kWp
   */
  SYSTEM_SIZE_KWP: 6.4,

  /**
   * Battery capacity in kWh.
   * Typical domestic battery: 8kWh provides 2-4 hours of average household load
   */
  BATTERY_SIZE_KWH: 8,

  /**
   * Number of panels (informational).
   * Standard domestic installation: 16 panels @ 400W each
   */
  NUMBER_OF_PANELS: 16,

  /**
   * Panel wattage (W) for reference.
   */
  PANEL_WATTAGE: 400,
} as const;

/**
 * Domestic export rate (EUR/kWh).
 * Ireland SEAI microgeneration export rate: €0.21/kWh (2025)
 * Source: https://www.seai.ie/grants/home-energy-grants/solar-electricity-grant/
 */
export const DOMESTIC_EXPORT_RATE = 0.21;

