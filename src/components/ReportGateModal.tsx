import { useState } from 'react';
import { usePostHog } from '@posthog/react';
import { sha256Hex } from '../utils/sha256';

const SPEND_OPTIONS = [
  { value: 'lt100k', label: 'Under €100k / year' },
  { value: '100k-200k', label: '€100k–€200k / year' },
  { value: '200k-300k', label: '€200k–€300k / year' },
  { value: '300k-400k', label: '€300k–€400k / year' },
  { value: '400k-500k', label: '€400k–€500k / year' },
  { value: '500k+', label: '€500k+ / year' },
];

interface ReportGateModalProps {
  reportId: string;
  onComplete: () => void;
}

export function ReportGateModal({ reportId, onComplete }: ReportGateModalProps) {
  const posthog = usePostHog();
  const [email, setEmail] = useState('');
  const [spend, setSpend] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  function validate() {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return false;
    }
    if (!spend) {
      setError('Please select your annual electricity spend.');
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSending(true);
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), spend, source: 'report_gate', reportId }),
    }).catch(() => {});
    posthog?.identify(email.trim(), { annual_electricity_spend: spend });
    posthog?.capture('report_gate_submitted', { report_id: reportId, electricity_spend: spend });
    if (typeof window !== 'undefined' && window.gtag) {
      const hashedEmail = await sha256Hex(email.trim().toLowerCase());
      window.gtag('event', 'generate_lead', { form: 'report_gate' });
      window.gtag('event', 'conversion', {
        send_to: 'AW-18091029484/pqP0CI21qJwcEOznvLJD',
        value: 1.0,
        currency: 'EUR',
        user_data: { sha256_email_address: hashedEmail },
      });
    }
    onComplete();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <h2 className="text-2xl font-serif font-bold leading-tight tracking-tight mb-2" style={{ color: '#1A4A35' }}>
          See the savings.
        </h2>
        <p className="text-sm text-slate-500 mb-6">Enter your details to view the full model.</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="mb-4">
            <label htmlFor="rg-email" className="block text-sm font-semibold text-slate-700 mb-1.5">
              Email
            </label>
            <input
              id="rg-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="you@company.ie"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-offset-1"
              style={{ focusRingColor: '#3A7A5C' } as React.CSSProperties}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="rg-spend" className="block text-sm font-semibold text-slate-700 mb-1.5">
              How much do you spend on electricity?
            </label>
            <select
              id="rg-spend"
              value={spend}
              onChange={(e) => { setSpend(e.target.value); setError(''); }}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-1 bg-white"
            >
              <option value="" disabled>Select annual spend…</option>
              {SPEND_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {error && (
            <p className="mb-4 text-sm font-medium text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#3A7A5C' }}
          >
            {sending ? 'Loading…' : 'See the real savings →'}
          </button>
        </form>
      </div>
    </div>
  );
}
