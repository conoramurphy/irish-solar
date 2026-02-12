export function estimateSystemCost(kwp: number, batteryKwh: number): number {
  // Solar Base Cost Curve
  let solarBaseCost = 0;
  if (kwp > 0) {
    let pricePerKwp = 1500;
    if (kwp <= 10) pricePerKwp = 2000;
    else if (kwp <= 50) pricePerKwp = 2000 - ((kwp - 10) / 40) * 200;
    else if (kwp <= 150) pricePerKwp = 1800 - ((kwp - 50) / 100) * 100;
    else if (kwp <= 300) pricePerKwp = 1700 - ((kwp - 150) / 150) * 100;
    else if (kwp <= 500) pricePerKwp = 1600 - ((kwp - 300) / 200) * 100;
    solarBaseCost = kwp * pricePerKwp;
  }

  // Battery Base Cost (Simple benchmark: €750/kWh)
  const batteryBaseCost = batteryKwh * 750;

  return solarBaseCost + batteryBaseCost;
}
