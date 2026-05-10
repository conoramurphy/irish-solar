import { useEffect } from 'react';
import { LeadForm } from './LeadForm';
import type { FunnelSegment } from './funnelConstants';

interface LeadFormModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the chooser is hidden inside the modal (segment pages already imply the segment). */
  fixedSegment?: FunnelSegment;
  /** PostHog source attribution for the modal. */
  source?: 'root_landing_modal' | 'hotels_landing' | 'dairy_landing';
}

/**
 * Modal wrapper around LeadForm. By default shows the "what's your business?"
 * chooser; pass `fixedSegment` to hide it (used by /hotels and /dairy where
 * the page already implies the segment).
 */
export function LeadFormModal({
  open,
  onClose,
  fixedSegment,
  source = 'root_landing_modal',
}: LeadFormModalProps) {
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
              Get your free Solar ROI in 1 minute
            </h3>
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
            source={source}
            fixedSegment={fixedSegment}
            submitLabel="Get your free Solar ROI"
            onConfirmationDismiss={onClose}
            bare
          />
        </div>
      </div>
    </div>
  );
}
