import { useState, useEffect, useCallback } from 'react';
import type { SavedReport } from '../types/savedReports';
import {
  clearAllSavedReports,
  deleteSavedReport,
  getSavedReportByName,
  listSavedReports,
  upsertSavedReport
} from '../db/savedReportsDb';

const STORAGE_KEY = 'solar-roi-saved-reports';

export function useSavedReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);

  // Load from IndexedDB on mount.
  // Migration: if the DB is empty, import any legacy localStorage reports once.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        let next = await listSavedReports();

        // One-time migration from localStorage -> IndexedDB.
        if (next.length === 0) {
          const legacy = localStorage.getItem(STORAGE_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy) as SavedReport[];
            await Promise.all(parsed.map((r) => upsertSavedReport(r)));
            localStorage.removeItem(STORAGE_KEY);
            next = await listSavedReports();
          }
        }

        if (!cancelled) setReports(next);
      } catch (e) {
        console.error('Failed to load saved reports', e);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveReport = useCallback(
    (newReport: Omit<SavedReport, 'id' | 'createdAt'> & { id?: string }) => {
      async function run() {
        try {
          const now = new Date().toISOString();

          // Overwrite-by-name behaviour (keeps stable IDs when overwriting).
          const existingByName = await getSavedReportByName(newReport.name);

          const reportToSave: SavedReport = {
            ...newReport,
            id: newReport.id || existingByName?.id || crypto.randomUUID(),
            createdAt: now
          };

          await upsertSavedReport(reportToSave);

          // Keep UI state in sync.
          setReports((prev) => {
            const idx = prev.findIndex((r) => r.id === reportToSave.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = reportToSave;
              return copy;
            }

            // If we're overwriting-by-name but the ID changed for some reason,
            // replace the previous item with the same name.
            const nameIdx = prev.findIndex((r) => r.name === reportToSave.name);
            if (nameIdx >= 0) {
              const copy = [...prev];
              copy[nameIdx] = reportToSave;
              return copy;
            }

            return [...prev, reportToSave];
          });
        } catch (e) {
          console.error('Failed to save report', e);
        }
      }

      void run();
    },
    []
  );

  const deleteReport = useCallback((id: string) => {
    async function run() {
      try {
        await deleteSavedReport(id);
        setReports((prev) => prev.filter((r) => r.id !== id));
      } catch (e) {
        console.error('Failed to delete report', e);
      }
    }

    void run();
  }, []);

  const clearReports = useCallback(() => {
    async function run() {
      try {
        await clearAllSavedReports();
        setReports([]);
      } catch (e) {
        console.error('Failed to clear saved reports', e);
      }
    }

    void run();
  }, []);

  const importReports = useCallback((incoming: SavedReport[]) => {
    async function run() {
      try {
        const now = new Date().toISOString();

        for (const r of incoming) {
          if (!r || typeof r !== 'object') continue;
          if (typeof r.name !== 'string' || !r.name.trim()) continue;

          // Ensure overwrite-by-name works even across imports.
          const existingByName = await getSavedReportByName(r.name);

          await upsertSavedReport({
            ...r,
            id: existingByName?.id ?? r.id ?? crypto.randomUUID(),
            createdAt: r.createdAt ?? now
          });
        }

        setReports(await listSavedReports());
      } catch (e) {
        console.error('Failed to import saved reports', e);
      }
    }

    void run();
  }, []);

  return {
    reports,
    saveReport,
    deleteReport,
    clearReports,
    importReports
  };
}
