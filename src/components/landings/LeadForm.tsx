import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePostHog } from '@posthog/react';
import { PhoneInput } from 'react-international-phone';
import 'react-international-phone/style.css';
import { sha256Hex } from '../../utils/sha256';
import { isValidEircode, normaliseEircode } from '../../utils/eircodeValidation';
import { submitFunnelLead } from '../../utils/funnelSubmit';
import {
  BUSINESS_TYPE_OPTIONS,
  segmentForBusinessType,
  type BusinessTypeValue,
  type FunnelSegment,
} from './funnelConstants';

interface LeadFormProps {
  /** When set, segment is fixed and the chooser is hidden. */
  fixedSegment?: FunnelSegment;
  /** Where this form lives — passed to PostHog for funnel attribution. */
  source: 'hotels_landing' | 'dairy_landing' | 'root_landing_modal';
  /** Optional override for the submit-button label. */
  submitLabel?: string;
  /** Called when the user dismisses the inline confirmation (root-landing 'other' path only). */
  onConfirmationDismiss?: () => void;
}

interface FieldErrors {
  businessType?: string;
  name?: string;
  eircode?: string;
  phone?: string;
  annualSpend?: string;
  submit?: string;
}

const BRAND_GREEN = '#2D6A4F';
const BRAND_GREEN_DARK = '#1A4A35';

export function LeadForm({
  fixedSegment,
  source,
  submitLabel = 'Get my free Solar ROI',
  onConfirmationDismiss,
}: LeadFormProps) {
  const navigate = useNavigate();
  const posthog = usePostHog();

  const showChooser = !fixedSegment;
  const [businessType, setBusinessType] = useState<BusinessTypeValue | ''>('');
  const [name, setName] = useState('');
  const [eircode, setEircode] = useState('');
  const [phone, setPhone] = useState('+353');
  const [annualSpend, setAnnualSpend] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [othersConfirmed, setOthersConfirmed] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (showChooser && !businessType) next.businessType = 'Pick the option that fits.';
    if (!name.trim()) next.name = 'Please enter your name.';
    if (!eircode.trim() || !isValidEircode(eircode)) {
      next.eircode = 'Looks like an Eircode is missing or off (e.g. D02 X285).';
    }
    // E.164: starts with +, then 7-15 digits.
    if (!/^\+\d{7,15}$/.test(phone.replace(/\s/g, ''))) {
      next.phone = 'Enter a valid phone number.';
    }
    const spend = Number(annualSpend.replace(/[^\d]/g, ''));
    if (!Number.isFinite(spend) || spend < 1000) {
      next.annualSpend = 'Annual spend looks too low — should be at least €1,000.';
    }
    return next;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length > 0) return;

    setSubmitting(true);

    const segment = fixedSegment ?? segmentForBusinessType(businessType as BusinessTypeValue);
    const spend = Number(annualSpend.replace(/[^\d]/g, ''));

    const result = await submitFunnelLead({
      segment,
      name: name.trim(),
      eircode: normaliseEircode(eircode),
      phoneE164: phone.replace(/\s/g, ''),
      annualSpendEur: spend,
      businessType: showChooser ? businessType || undefined : undefined,
    });

    if (!result.ok) {
      setErrors({ submit: result.message });
      setSubmitting(false);
      return;
    }

    // Fire conversion analytics on success — mirrors CTAModal pattern.
    posthog?.capture('lead_submitted', { segment, source, has_phone: true });
    if (typeof window !== 'undefined' && window.gtag) {
      const hashedEmail = await sha256Hex(`${name.trim()}|${phone}`.toLowerCase());
      window.gtag('event', 'generate_lead', { segment, form: source });
      window.gtag('event', 'conversion', {
        send_to: 'AW-18091029484/zYnrCKi2xKMcEOznvLJD',
        value: 25.0,
        currency: 'EUR',
        user_data: { sha256_email_address: hashedEmail },
      });
    }

    if (result.segment === 'other' || !result.reportId) {
      // No personalised report for "other" — show inline confirmation.
      setOthersConfirmed(true);
      setSubmitting(false);
      return;
    }

    navigate(`/report/${result.segment}/${result.reportId}`);
  }

  if (othersConfirmed) {
    return (
      <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center shadow-sm">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-slate-800 mb-1.5">Thanks — we&rsquo;re on it</h3>
        <p className="text-sm text-slate-500 mb-5">
          We&rsquo;ll come back to you with an independent ROI within one business day.
        </p>
        {onConfirmationDismiss && (
          <button
            type="button"
            onClick={onConfirmationDismiss}
            className="text-sm font-semibold text-slate-600 hover:text-slate-800 underline underline-offset-2"
          >
            Done
          </button>
        )}
      </div>
    );
  }

  const fieldClass =
    'w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 focus:border-transparent bg-white';
  const labelClass = 'text-xs font-medium text-slate-600 mb-1.5 block';
  const errorClass = 'text-xs text-red-600 mt-1';

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl bg-white border border-slate-200 p-5 sm:p-6 shadow-sm space-y-3.5"
      noValidate
    >
      {showChooser && (
        <fieldset>
          <legend className={labelClass}>What&rsquo;s your business?</legend>
          <div
            role="radiogroup"
            aria-invalid={!!errors.businessType}
            className="grid grid-cols-4 gap-1.5"
          >
            {BUSINESS_TYPE_OPTIONS.map((o) => {
              const selected = businessType === o.value;
              return (
                <button
                  type="button"
                  key={o.value}
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setBusinessType(o.value)}
                  className={`flex items-center justify-center rounded-lg border px-1.5 py-2 text-[11px] sm:text-xs font-medium leading-tight text-center min-h-[2.5rem] transition-all ${
                    selected
                      ? 'border-green-700 bg-green-50 text-green-800 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="break-words">{o.label}</span>
                </button>
              );
            })}
          </div>
          {errors.businessType && <p className={errorClass}>{errors.businessType}</p>}
        </fieldset>
      )}

      <div>
        <label htmlFor="name" className={labelClass}>
          Your name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          className={fieldClass}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className={errorClass}>{errors.name}</p>}
      </div>

      <div>
        <label htmlFor="eircode" className={labelClass}>
          Eircode
        </label>
        <input
          id="eircode"
          type="text"
          value={eircode}
          onChange={(e) => setEircode(e.target.value)}
          placeholder="D02 X285"
          autoComplete="postal-code"
          className={fieldClass}
          aria-invalid={!!errors.eircode}
        />
        {errors.eircode && <p className={errorClass}>{errors.eircode}</p>}
      </div>

      <div>
        <label htmlFor="phone" className={labelClass}>
          Phone
        </label>
        <PhoneInput
          defaultCountry="ie"
          value={phone}
          onChange={(v) => setPhone(v)}
          inputProps={{ id: 'phone', autoComplete: 'tel' }}
          inputClassName="!w-full !rounded-xl !border-slate-200 !px-3.5 !py-2.5 !text-sm !h-auto"
          countrySelectorStyleProps={{
            buttonClassName: '!rounded-xl !border-slate-200 !h-auto !px-2.5',
            dropdownStyleProps: { className: 'shadow-lg' },
          }}
          className="!gap-1.5"
        />
        {errors.phone && <p className={errorClass}>{errors.phone}</p>}
      </div>

      <div>
        <label htmlFor="annualSpend" className={labelClass}>
          Annual electricity spend (€)
        </label>
        <input
          id="annualSpend"
          type="text"
          inputMode="numeric"
          value={annualSpend}
          onChange={(e) => setAnnualSpend(e.target.value.replace(/[^\d,€\s]/g, ''))}
          placeholder="e.g. 25000"
          className={fieldClass}
          aria-invalid={!!errors.annualSpend}
        />
        {errors.annualSpend && <p className={errorClass}>{errors.annualSpend}</p>}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: BRAND_GREEN }}
      >
        {submitting ? 'Building your ROI…' : submitLabel}
      </button>

      {errors.submit && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {errors.submit}
        </div>
      )}

      <p className="text-[11px] leading-snug text-slate-400 text-center pt-1">
        Independent of any installer.{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-slate-600"
        >
          privacy policy
        </a>
        .
      </p>

      {/* Suppress unused-variable lint for the dark green token (kept for future use). */}
      <span className="hidden" aria-hidden="true" data-brand-dark={BRAND_GREEN_DARK} />
    </form>
  );
}
