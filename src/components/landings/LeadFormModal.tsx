import { useEffect } from 'react';
import { LeadForm } from './LeadForm';

interface LeadFormModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal wrapper around LeadForm with the "what's your business?" chooser shown.
 * Used by the existing root landing (`Landing.tsx`) — its CTAs all open this
 * modal. /hotels and /dairy render LeadForm inline (segment fixed) instead.
 */
export function LeadFormModal({ open, onClose }: LeadFormModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lead-modal-heading"
    >
      <div
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 pt-6 pb-3">
          <div>
            <h3
              id="lead-modal-heading"
              className="text-lg font-semibold text-slate-900 leading-tight"
            >
              Get your free Solar ROI
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 leading-snug">
              Independent of any installer. Built on a real Irish business model.
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0 -mt-0.5"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-6">
          <LeadForm
            source="root_landing_modal"
            submitLabel="Get your free Solar ROI"
            onConfirmationDismiss={onClose}
            bare
          />
        </div>
      </div>
    </div>
  );
}
