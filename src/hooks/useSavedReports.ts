import { useState, useEffect, useCallback } from 'react';
import type { SavedReport } from '../types/savedReports';

const STORAGE_KEY = 'solar-roi-saved-reports';

export function useSavedReports() {
  const [reports, setReports] = useState<SavedReport[]>([]);

  // Load from local storage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setReports(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load saved reports', e);
    }
  }, []);

  const saveReport = useCallback((newReport: Omit<SavedReport, 'id' | 'createdAt'> & { id?: string }) => {
    setReports((prev) => {
      const now = new Date().toISOString();
      const reportToSave: SavedReport = {
        ...newReport,
        id: newReport.id || crypto.randomUUID(),
        createdAt: now
      };

      // Check if we are overwriting an existing ID or Name
      // Logic: If ID exists, replace. If Name exists, replace (per user preference).
      // Since we decided on "Overwrite based on name" or "New ID", let's handle the Name collision at the UI level.
      // Here, we just blindly append or update by ID if provided.
      // Actually, plan says: "If name exists... overwrite".
      // Let's implement upsert by Name or ID.
      
      let nextReports = [...prev];
      const existingIndex = nextReports.findIndex(r => r.name === reportToSave.name);

      if (existingIndex >= 0) {
        // Overwrite existing
        nextReports[existingIndex] = { ...reportToSave, id: nextReports[existingIndex].id, createdAt: now };
      } else {
        // Add new
        nextReports.push(reportToSave);
      }
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextReports));
      } catch (e) {
        console.error('Failed to save report', e);
      }
      
      return nextReports;
    });
  }, []);

  const deleteReport = useCallback((id: string) => {
    setReports((prev) => {
      const nextReports = prev.filter((r) => r.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextReports));
      } catch (e) {
        console.error('Failed to delete report', e);
      }
      return nextReports;
    });
  }, []);

  return {
    reports,
    saveReport,
    deleteReport
  };
}
