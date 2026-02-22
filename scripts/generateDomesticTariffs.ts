/**
 * Script to generate domesticTariffs.json from the CSV file
 * Run with: npx tsx scripts/generateDomesticTariffs.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Import the parser
import { parseDomesticTariffsCsv } from '../src/utils/domesticTariffParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const csvPath = join(__dirname, '../public/data/tarrifs/domestic-tarrifs.csv');
const outputPath = join(__dirname, '../src/data/domesticTariffs.json');

try {
  console.log('Reading CSV from:', csvPath);
  const csvContent = readFileSync(csvPath, 'utf-8');
  
  console.log('Parsing tariffs...');
  const tariffs = parseDomesticTariffsCsv(csvContent);
  
  console.log(`Parsed ${tariffs.length} tariffs`);
  
  // Write to JSON
  const json = JSON.stringify(tariffs, null, 2);
  writeFileSync(outputPath, json, 'utf-8');
  
  console.log('Successfully wrote to:', outputPath);
  
  // Print summary
  console.log('\nTariff Summary:');
  tariffs.forEach(t => {
    console.log(`  - ${t.supplier}: ${t.product} (${t.type})`);
  });
  
} catch (error) {
  console.error('Error generating tariffs:', error);
  process.exit(1);
}
