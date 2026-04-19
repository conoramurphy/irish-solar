import { useState, useEffect } from 'react';
import { usePostHog } from '@posthog/react';

interface SaveReportModalProps {
  initialName?: string;
  existingNames: string[];
  onSave: (name: string) => void;
  onCancel: () => void;
  isOpen: boolean;
}

export function SaveReportModal({
  initialName = '',
  existingNames,
  onSave,
  onCancel,
  isOpen
}: SaveReportModalProps) {
  const posthog = usePostHog();
  const [name, setName] = useState(initialName);
  const [isOverwrite, setIsOverwrite] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
    }
  }, [isOpen, initialName]);

  useEffect(() => {
    setIsOverwrite(existingNames.includes(name.trim()));
  }, [name, existingNames]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="flex items-center justify-between bg-slate-50/50 px-6 py-4 border-b border-slate-100">
            <h3 className="text-lg font-serif font-bold text-slate-800">Save Report</h3>
            <button 
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

        <form 
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              posthog?.capture('report_saved', { is_overwrite: isOverwrite });
              onSave(name.trim());
            }
          }}
          className="p-6"
        >
          <div className="mb-6">
            <label htmlFor="report-name" className="block text-sm font-medium text-slate-700 mb-1">
              Report Name
            </label>
            <input
              type="text"
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2"
              placeholder="e.g. Hotel Plan A"
              autoFocus
            />
            {isOverwrite && (
              <div className="mt-2 text-sm text-amber-600 flex items-start gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 shrink-0 mt-0.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <p>Warning: A report with this name already exists and will be overwritten.</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOverwrite ? 'Overwrite & Save' : 'Save Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
