// Canonical funnel baselines on prod. Saved by hand; referenced by id here so the
// funnel can scale them up/down by user spend ratio. Locked=0 on prod, so the
// public /api/reports/:id endpoint serves them without auth.
//
// IDs are also referenced from Landing.tsx (EXAMPLE_MODELS) for the public preview
// cards. Keep in sync if the canonical models are ever re-saved.

export const FUNNEL_BASELINES = {
  hotel: {
    reportId: 'GXz4-_lMwsjVbgc3GzBww',
    label: 'Hotel, 20 beds',
  },
  dairy: {
    reportId: 'WZ9EWvHnXsJsk8gH7GUQN',
    label: 'Dairy farm',
  },
} as const;

export type FunnelSegment = 'hotel' | 'dairy';
export type LeadSegment = FunnelSegment | 'other';

export const BUSINESS_TYPE_OPTIONS = [
  { value: 'hotel', label: 'Hotel', segment: 'hotel' as const },
  { value: 'dairy', label: 'Dairy farm', segment: 'dairy' as const },
  { value: 'restaurant', label: 'Restaurant', segment: 'other' as const },
  { value: 'office', label: 'Office', segment: 'other' as const },
  { value: 'retail', label: 'Retail', segment: 'other' as const },
  { value: 'manufacturing', label: 'Manufacturing', segment: 'other' as const },
  { value: 'home', label: 'Home', segment: 'other' as const },
  { value: 'other', label: 'Other', segment: 'other' as const },
] as const;

export type BusinessTypeValue = (typeof BUSINESS_TYPE_OPTIONS)[number]['value'];

export function segmentForBusinessType(value: BusinessTypeValue): LeadSegment {
  const opt = BUSINESS_TYPE_OPTIONS.find((o) => o.value === value);
  return opt?.segment ?? 'other';
}
