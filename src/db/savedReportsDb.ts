import Dexie, { type Table } from 'dexie';
import type { SavedReport } from '../types/savedReports';

const DB_NAME = 'solar-roi-calculator';

class SavedReportsDb extends Dexie {
  savedReports!: Table<SavedReport, string>;

  constructor() {
    super(DB_NAME);

    // ISO strings sort correctly lexicographically, so indexing createdAt as string is fine.
    this.version(1).stores({
      // Primary key: id
      // Secondary indexes: name, createdAt
      savedReports: 'id, name, createdAt'
    });
  }
}

export const savedReportsDb = new SavedReportsDb();

export async function listSavedReports(): Promise<SavedReport[]> {
  return savedReportsDb.savedReports.toArray();
}

export async function getSavedReportById(id: string): Promise<SavedReport | undefined> {
  return savedReportsDb.savedReports.get(id);
}

export async function getSavedReportByName(name: string): Promise<SavedReport | undefined> {
  return savedReportsDb.savedReports.where('name').equals(name).first();
}

export async function upsertSavedReport(report: SavedReport): Promise<void> {
  await savedReportsDb.savedReports.put(report);
}

export async function deleteSavedReport(id: string): Promise<void> {
  await savedReportsDb.savedReports.delete(id);
}

export async function clearAllSavedReports(): Promise<void> {
  await savedReportsDb.savedReports.clear();
}
