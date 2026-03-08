import type { SavedReport } from '../types/savedReports';

export const API_PATHS = {
  createReport: '/api/reports',
  getReport: (id: string) => `/api/reports/${id}`,
} as const;

export interface CreateReportRequest {
  name?: string;
  report: SavedReport;
}

export interface CreateReportResponse {
  id: string;
}

export interface GetReportResponse {
  id: string;
  name: string | null;
  schemaVersion: number;
  payload: SavedReport;
  createdAt: number;
}
