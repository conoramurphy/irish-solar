/**
 * Cookie consent state management + Google Consent Mode v2 bridge.
 *
 * Default-deny posture is set inline in index.html before gtag.js loads.
 * This module persists the user's choice and pushes a `consent update` to
 * gtag so GA4 / Google Ads storage is enabled only after acceptance.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const STORAGE_KEY = 'wp_consent_v1';

export type ConsentChoice = 'granted' | 'denied';
export type ConsentState = ConsentChoice | null;

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getConsent(): ConsentState {
  const storage = safeLocalStorage();
  if (!storage) return null;
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (value === 'granted' || value === 'denied') return value;
    return null;
  } catch {
    return null;
  }
}

function pushConsentUpdate(choice: ConsentChoice): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('consent', 'update', {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
}

export function setConsent(choice: ConsentChoice): void {
  const storage = safeLocalStorage();
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, choice);
    } catch {
      // ignore — quota full or private mode
    }
  }
  pushConsentUpdate(choice);
}

/**
 * On every page load, replay the stored choice to gtag so the user's
 * previous decision survives across sessions.
 */
export function applyStoredConsent(): void {
  const stored = getConsent();
  if (stored) pushConsentUpdate(stored);
}

export function clearConsentForTesting(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
