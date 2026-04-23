import { useLayoutEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getConsent, setConsent } from '../utils/consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(() => getConsent() === null);

  // TEMP — sync with App forcing grant on load so banner does not flash
  useLayoutEffect(() => {
    if (getConsent() !== null) setVisible(false);
  }, []);

  if (!visible) return null;

  function decide(choice: 'granted' | 'denied') {
    setConsent(choice);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 pointer-events-none"
    >
      <div
        className="pointer-events-auto mx-auto max-w-3xl rounded-2xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5 px-5 py-4"
        style={{
          backgroundColor: '#1A4A35',
          border: '1px solid rgba(253,234,180,0.25)',
        }}
      >
        <p
          className="text-xs sm:text-sm leading-snug flex-1"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          We use cookies to measure site usage and improve our modelling. You can accept
          or decline — either way, the calculator still works.{' '}
          <Link
            to="/privacy"
            className="underline decoration-dotted underline-offset-2"
            style={{ color: '#FDEAB4' }}
          >
            Privacy policy
          </Link>
          .
        </p>
        <div className="flex gap-2 shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => decide('denied')}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.85)',
            }}
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide('granted')}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#FDEAB4', color: '#1A4A35' }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
