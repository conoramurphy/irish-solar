import { useEffect, useRef, useState } from 'react';

const WHATSAPP_NUMBER = '353858082080';

const ROLES = [
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'installer', label: 'Installer / Contractor' },
  { value: 'business_owner', label: 'Business owner' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'other', label: 'Other' },
] as const;

function fireCapture(email: string, role: string, message: string, closedEarly: boolean) {
  if (!email.trim()) return;
  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), role, message, closedEarly }),
  }).catch(() => {});
}

interface CTAModalProps {
  open: boolean;
  onClose: () => void;
}

const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="#25D366" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

export function CTAModal({ open, onClose }: CTAModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const captured = useRef(false);

  // Reset whenever modal opens — setState calls in effects are intentional here
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open) {
      setStep(1);
      setEmail('');
      setRole('');
      setMessage('');
      setSending(false);
      setSent(false);
      captured.current = false;
    }
  }, [open]);

  function handleClose() {
    if (!captured.current) {
      captured.current = true;
      fireCapture(email, role, message, true);
    }
    onClose();
  }

  // Escape key — re-registers on every render so handleClose always has fresh state
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  function handleNext() {
    if (!email.trim()) return;
    setStep(2);
  }

  async function handleSend() {
    if (sending) return;
    setSending(true);
    captured.current = true;
    fireCapture(email, role, message, false);
    await new Promise(r => setTimeout(r, 700));
    setSending(false);
    setSent(true);
  }

  if (!open) return null;

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}`;

  const whatsappBtn = (
    <a
      href={waHref}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
    >
      {WHATSAPP_ICON}
      Chat on WhatsApp
    </a>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {sent ? (
          /* ── Confirmation ── */
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-800 mb-1.5">We're on it</h3>
            <p className="text-sm text-slate-500 mb-6">
              We'll be in touch with your personalised energy model shortly.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: '#2D6A4F' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div>
                <h3 className="text-[1.05rem] font-semibold text-slate-800 leading-snug">
                  Get your profit model
                </h3>
                <p className="text-sm text-slate-500 mt-1 leading-snug">
                  Tell us about your setup and we'll build a free personalised energy analysis.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="ml-3 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors shrink-0 -mt-0.5"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* ── Progress dots ── */}
            <div className="px-6 pb-5 flex gap-1.5">
              <div className="h-1 flex-1 rounded-full" style={{ backgroundColor: '#2D6A4F' }} />
              <div
                className="h-1 flex-1 rounded-full transition-colors duration-300"
                style={{ backgroundColor: step === 2 ? '#2D6A4F' : '#E2E8F0' }}
              />
            </div>

            {step === 1 ? (
              /* ── Step 1: email + role ── */
              <div className="px-6 pb-6 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleNext(); }}
                    placeholder="you@company.ie"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent"
                    autoFocus
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    I am a…
                  </label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent bg-white appearance-none"
                  >
                    <option value="">Select…</option>
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleNext}
                  disabled={!email.trim()}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-35"
                  style={{ backgroundColor: '#2D6A4F' }}
                >
                  Next →
                </button>
                {whatsappBtn}
              </div>
            ) : (
              /* ── Step 2: message ── */
              <div className="px-6 pb-6 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1.5 block">
                    Anything to add?{' '}
                    <span className="font-normal text-slate-400">optional</span>
                  </label>
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="e.g. Hotel, 3-phase 50 kVA, ~400k kWh/yr, interested in 100 kWp + battery…"
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent resize-none"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: '#2D6A4F' }}
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
                {whatsappBtn}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
