export function estimateSystemCost(kwp: number, batteryKwh: number): number {
  if (kwp <= 0 && batteryKwh <= 0) return 0;

  // 1. Solar PV Cost (Hardware + Install)
  // Curve calibrated to ~€880/kWp for ~75kWp commercial systems
  let solarBaseCost = 0;
  if (kwp > 0) {
    let pricePerKwp = 800; // Asymptote for large systems
    if (kwp <= 10) pricePerKwp = 1200;
    else if (kwp <= 50) pricePerKwp = 1200 - ((kwp - 10) / 40) * 250; // 1200 -> 950
    else if (kwp <= 150) pricePerKwp = 950 - ((kwp - 50) / 100) * 150; // 950 -> 800
    
    solarBaseCost = kwp * pricePerKwp;
  }

  // 2. Battery Cost (Hardware + Install)
  // Calibrated to ~€350/kWh for large commercial BESS (e.g. 460kWh)
  const batteryBaseCost = batteryKwh * 350;

  // 3. Balance of System, Controls, PM & Integration
  // Evidence suggests ~33% overhead on top of core hardware for:
  // - Controls + generator integration (~€50k for 75kWp/460kWh)
  // - PM/Commissioning/Contingency (~€25k)
  // Total ~€75k on top of ~€225k hardware = ~33% markup
  const bosMarkup = 1.33;

  return (solarBaseCost + batteryBaseCost) * bosMarkup;
}
