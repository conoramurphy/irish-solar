export interface BatteryConfig {
  capacityKwh: number;
  /** round-trip efficiency (0-1) */
  efficiency: number;
  /** usable fraction of capacity (0-1) */
  maxDepthOfDischarge: number;
}

/**
 * Placeholder battery model.
 * For the MVP we estimate self-consumption heuristically rather than simulating hourly charging.
 */
export function clampBatteryConfig(config: BatteryConfig): BatteryConfig {
  return {
    capacityKwh: Math.max(0, config.capacityKwh),
    efficiency: Math.min(1, Math.max(0, config.efficiency)),
    maxDepthOfDischarge: Math.min(1, Math.max(0, config.maxDepthOfDischarge))
  };
}

export function estimateUsableCapacity(config: BatteryConfig): number {
  const c = clampBatteryConfig(config);
  return c.capacityKwh * c.maxDepthOfDischarge;
}

export function calculateBatteryCycles(throughputKwh: number, capacityKwh: number): number {
  if (capacityKwh <= 0) return 0;
  return throughputKwh / (2 * capacityKwh);
}
