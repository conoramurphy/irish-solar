import { beforeEach, describe, expect, it } from 'vitest';
import type { SavedReport } from '../../src/types/savedReports';
import {
  clearAllSavedReports,
  deleteSavedReport,
  getSavedReportByName,
  listSavedReports,
  savedReportsDb,
  upsertSavedReport
} from '../../src/db/savedReportsDb';

function makeReport(partial: Partial<SavedReport> = {}): SavedReport {
  return {
    id: partial.id ?? crypto.randomUUID(),
    name: partial.name ?? 'Report A',
    createdAt: partial.createdAt ?? new Date('2026-01-01T00:00:00.000Z').toISOString(),
    config: (partial.config ?? {
      annualProductionKwh: 1000,
      batterySizeKwh: 0,
      installationCost: 1000,
      location: 'Dublin',
      businessType: 'hotel'
    }) as SavedReport['config'],
    financing: (partial.financing ?? {
      equity: 0,
      interestRate: 0.05,
      termYears: 10
    }) as SavedReport['financing'],
    selectedGrantIds: partial.selectedGrantIds ?? [],
    trading: (partial.trading ?? { enabled: false }) as SavedReport['trading'],
    tariffId: partial.tariffId ?? 'tariff-1',
    exampleMonths: partial.exampleMonths ?? [],
    tariffConfig: partial.tariffConfig ?? null,
    curvedMonthlyKwh: partial.curvedMonthlyKwh ?? Array.from({ length: 12 }, () => 0),
    estimatedMonthlyBills: partial.estimatedMonthlyBills ?? Array.from({ length: 12 }, () => 0),
    selectedYear: partial.selectedYear,
    hourlyConsumptionOverride: partial.hourlyConsumptionOverride,
    uploadSummary: partial.uploadSummary
  };
}

beforeEach(async () => {
  // Ensure a clean DB for each test run.
  await clearAllSavedReports();
});

describe('savedReportsDb', () => {
  it('persists and lists saved reports', async () => {
    const r1 = makeReport({ name: 'One' });
    const r2 = makeReport({ name: 'Two' });

    await upsertSavedReport(r1);
    await upsertSavedReport(r2);

    const all = await listSavedReports();
    const names = all.map((r) => r.name).sort();

    expect(names).toEqual(['One', 'Two']);
  });

  it('supports overwrite-by-name semantics (caller can keep stable IDs)', async () => {
    const original = makeReport({ id: 'stable-id', name: 'Same Name' });
    await upsertSavedReport(original);

    const existing = await getSavedReportByName('Same Name');
    expect(existing?.id).toBe('stable-id');

    const overwrite = makeReport({
      id: existing!.id,
      name: 'Same Name',
      createdAt: new Date('2026-02-01T00:00:00.000Z').toISOString()
    });

    await upsertSavedReport(overwrite);

    const after = await getSavedReportByName('Same Name');
    expect(after?.id).toBe('stable-id');
    expect(after?.createdAt).toBe(overwrite.createdAt);
  });

  it('deletes saved reports', async () => {
    const r1 = makeReport({ id: 'to-delete', name: 'Delete Me' });
    await upsertSavedReport(r1);

    await deleteSavedReport('to-delete');

    const all = await listSavedReports();
    expect(all.find((r) => r.id === 'to-delete')).toBeUndefined();
  });

  it('round-trips uploadSummary and hourlyConsumptionOverride through IndexedDB', async () => {
    const hourly = Array.from({ length: 8760 }, (_, i) => i * 0.5);
    const r = makeReport({
      name: 'Upload Round-trip',
      hourlyConsumptionOverride: hourly,
      uploadSummary: {
        filename: 'hotel-meter-2024.csv',
        year: 2024,
        totalKwh: 87600,
        slotsPerDay: 24
      }
    });

    await upsertSavedReport(r);

    const fetched = await getSavedReportByName('Upload Round-trip');
    expect(fetched?.uploadSummary).toEqual({
      filename: 'hotel-meter-2024.csv',
      year: 2024,
      totalKwh: 87600,
      slotsPerDay: 24
    });
    expect(fetched?.hourlyConsumptionOverride).toHaveLength(8760);
    expect(fetched?.hourlyConsumptionOverride?.[1]).toBeCloseTo(0.5);
  });

  it('db is openable (sanity)', async () => {
    await expect(savedReportsDb.open()).resolves.toBeDefined();
  });
});
