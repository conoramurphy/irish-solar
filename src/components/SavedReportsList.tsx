import { useState } from 'react';
import type { SavedReport } from '../types/savedReports';

interface SavedReportsListProps {
  reports: SavedReport[];
  onLoad: (report: SavedReport) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

export function SavedReportsList({
  reports,
  onLoad,
  onDelete,
  onClose,
  isOpen
}: SavedReportsListProps) {
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between bg-slate-50/50 px-6 py-4 border-b border-slate-100 shrink-0">
          <h3 className="text-lg font-serif font-bold text-slate-800">Saved Reports</h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {reports.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 mx-auto mb-3 opacity-50">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <p>No saved reports found.</p>
              <p className="text-sm mt-1">Generate a report and click "Save As" to see it here.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {reports
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((report) => (
                <div key={report.id} className="group relative bg-white border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:shadow-sm transition-all">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-800 truncate pr-8">{report.name}</h4>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                        <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{report.config.location}</span>
                        <span>•</span>
                        <span>{report.config.annualProductionKwh.toLocaleString()} kWh/yr</span>
                        {report.result && (
                          <>
                            <span>•</span>
                            <span className="font-medium text-emerald-600">
                              Savings: {new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(report.result.annualSavings)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onLoad(report)}
                        className="text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => setReportToDelete(report.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-md hover:bg-rose-50 transition-colors"
                        title="Delete report"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Delete Confirmation Overlay (Inline) */}
                  {reportToDelete === report.id && (
                    <div className="absolute inset-0 bg-white/95 backdrop-blur-[1px] rounded-lg flex items-center justify-center p-4 z-10 border border-rose-100 animate-in fade-in duration-200">
                      <div className="text-center w-full">
                        <p className="text-sm font-medium text-slate-800 mb-3">Delete "{report.name}"?</p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setReportToDelete(null)}
                            className="px-3 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              onDelete(report.id);
                              setReportToDelete(null);
                            }}
                            className="px-3 py-1 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700 shadow-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="bg-slate-50 border-t border-slate-100 p-4 text-center">
            <button
                onClick={onClose}
                className="text-sm text-slate-500 hover:text-slate-800 font-medium"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
}
