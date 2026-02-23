// Debug script to test Energia EV tariff with 10kWh battery
// Run with: node --loader ts-node/esm debug-battery-test.ts

const energiaEVTariff = {
  id: 'energia-smart-drive-ev',
  supplier: 'Energia',
  product: 'Smart Drive (EV)',
  type: 'ev',
  standingCharge: 0.726,
  rates: [
    { period: 'night', hours: '23:00-08:00', rate: 0.24 },
    { period: 'peak', hours: '17:00-19:00', rate: 0.5108 },
    { period: 'day', hours: '08:00-23:00', rate: 0.3893 }
  ],
  exportRate: 0.21,
  nightRate: 0.24,
  peakRate: 0.5108,
  evRate: 0.0942,
  evTimeWindow: {
    description: '2am – 6am',
    hourRanges: [{ start: 2, end: 6 }]
  }
};

console.log('Energia EV Tariff:');
console.log('- EV Rate (2-6am): €0.0942/kWh');
console.log('- Peak Rate (17-19h): €0.5108/kWh');
console.log('- Spread: €0.4166/kWh');
console.log('');
console.log('Expected battery value (10kWh):');
console.log('- Daily cycles: 1');
console.log('- Daily profit: 10 kWh × €0.4166 × 0.9 efficiency = €3.75');
console.log('- Annual profit: €3.75 × 365 = €1,369');
console.log('');
console.log('User is seeing only €396/year - something is very wrong!');
