/**
 * Mid-funnel quality events for Smart Bidding.
 *
 * The audit (May 2026, §2.3) recommends two engagement events as Secondary
 * conversions so Google Ads can learn what a high-quality lead looks like
 * before any form submission:
 *
 *   - `calculator_started`    Tier 2, fired on wizard mount
 *   - `calculator_completed`  Tier 3, fired when the engine returns a result
 *
 * Each event fires PostHog, dataLayer (for any GTM / sGTM container), and
 * gtag (for GA4 + Google Ads). To convert these into Google Ads Conversion
 * Actions, set up the actions in the Google Ads UI and add `send_to` ids
 * here. Until then they fire as plain GA4 events and Smart Bidding can pick
 * them up via Enhanced Conversions for Leads.
 *
 * Window typing for `gtag` and `dataLayer` is declared in src/utils/consent.ts.
 */

interface CalculatorPostHog {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
}

export interface CalculatorEventContext {
  /** Where in the app the event fired, e.g. 'wizard_solar_battery', 'funnel_report'. */
  source: string;
  /** Optional segment when known, e.g. 'hotel', 'dairy'. */
  segment?: string;
}

export function fireCalculatorStarted(
  posthog: CalculatorPostHog | undefined,
  ctx: CalculatorEventContext,
): void {
  emitConversionEvent('calculator_started', posthog, ctx);
}

export function fireCalculatorCompleted(
  posthog: CalculatorPostHog | undefined,
  ctx: CalculatorEventContext,
): void {
  emitConversionEvent('calculator_completed', posthog, ctx);
}

function emitConversionEvent(
  eventName: string,
  posthog: CalculatorPostHog | undefined,
  ctx: CalculatorEventContext,
): void {
  if (typeof window === 'undefined') return;
  const props: Record<string, unknown> = { ...ctx };
  posthog?.capture(eventName, props);
  if (window.dataLayer) {
    window.dataLayer.push({ event: eventName, ...props });
  }
  if (window.gtag) {
    window.gtag('event', eventName, props);
  }
}
