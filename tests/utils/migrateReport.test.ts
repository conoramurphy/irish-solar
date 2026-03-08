import { describe, it, expect } from 'vitest';
import { migrateReport, CURRENT_SCHEMA_VERSION } from '../../src/utils/migrateReport';

const minimalV1Report = {
  id: 'abc123',
  name: 'Test Report',
  createdAt: '2024-01-01T00:00:00.000Z',
  schemaVersion: 1,
  config: {},
  financing: {},
  selectedGrantIds: [],
  trading: {},
  tariffId: 'default',
  exampleMonths: [],
  tariffConfig: null,
  curvedMonthlyKwh: [],
  estimatedMonthlyBills: [],
};

describe('migrateReport', () => {
  it('is a no-op for a current-version report', () => {
    const result = migrateReport({ ...minimalV1Report });
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.id).toBe('abc123');
    expect(result.name).toBe('Test Report');
  });

  it('treats a missing schemaVersion as v1 and sets it', () => {
    const raw = { ...minimalV1Report };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (raw as any).schemaVersion;
    const result = migrateReport(raw);
    expect(result.schemaVersion).toBe(1);
  });

  it('preserves all existing fields during migration', () => {
    const result = migrateReport({ ...minimalV1Report, name: 'My Hotel' });
    expect(result.name).toBe('My Hotel');
    expect(result.id).toBe('abc123');
  });

  it('throws for a schema version newer than supported', () => {
    const future = { ...minimalV1Report, schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrateReport(future)).toThrow(/newer than supported/);
  });
});
