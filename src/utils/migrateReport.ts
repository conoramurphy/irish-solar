import type { SavedReport } from '../types/savedReports';

export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Migrates a raw stored report object to the current SavedReport shape.
 * Treats missing schemaVersion as v1 (the original shape before versioning).
 * Add new migration steps here as the schema evolves.
 */
export function migrateReport(raw: Record<string, unknown>): SavedReport {
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Report schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}. Please update the app.`
    );
  }

  // v1 → current: set schemaVersion field if missing
  const migrated = { ...raw, schemaVersion: CURRENT_SCHEMA_VERSION };

  return migrated as unknown as SavedReport;
}
