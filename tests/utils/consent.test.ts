import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyStoredConsent,
  clearConsentForTesting,
  getConsent,
  setConsent,
} from '../../src/utils/consent';

describe('consent utility', () => {
  beforeEach(() => {
    clearConsentForTesting();
    // Reset gtag stub between tests
    (window as unknown as { gtag?: unknown }).gtag = vi.fn();
  });

  afterEach(() => {
    clearConsentForTesting();
    delete (window as unknown as { gtag?: unknown }).gtag;
  });

  it('returns null when nothing has been stored yet', () => {
    expect(getConsent()).toBeNull();
  });

  it('persists a granted choice to localStorage', () => {
    setConsent('granted');
    expect(getConsent()).toBe('granted');
  });

  it('persists a denied choice to localStorage', () => {
    setConsent('denied');
    expect(getConsent()).toBe('denied');
  });

  it('overwrites a previous choice when the user changes their mind', () => {
    setConsent('denied');
    setConsent('granted');
    expect(getConsent()).toBe('granted');
  });

  it('ignores unknown values already in localStorage', () => {
    window.localStorage.setItem('wp_consent_v1', 'maybe');
    expect(getConsent()).toBeNull();
  });

  it('pushes a consent update to gtag when setConsent is called', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    setConsent('granted');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
  });

  it('pushes a denied consent update to gtag', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    setConsent('denied');
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
  });

  it('does not throw if gtag is not loaded', () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    expect(() => setConsent('granted')).not.toThrow();
    expect(getConsent()).toBe('granted');
  });

  it('applyStoredConsent replays a stored choice to gtag', () => {
    setConsent('granted');
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    applyStoredConsent();
    expect(gtag).toHaveBeenCalledWith(
      'consent',
      'update',
      expect.objectContaining({ analytics_storage: 'granted' }),
    );
  });

  it('applyStoredConsent is a no-op when nothing is stored', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    applyStoredConsent();
    expect(gtag).not.toHaveBeenCalled();
  });
});
