import { Link } from 'react-router-dom';

const SUN_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="w-5 h-5">
    <circle cx="16" cy="16" r="5.5" fill="#145735"/>
    <rect x="14.75" y="2.5" width="2.5" height="5" rx="1.25" fill="#145735"/>
    <rect x="14.75" y="24.5" width="2.5" height="5" rx="1.25" fill="#145735"/>
    <rect x="2.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735"/>
    <rect x="24.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735"/>
    <rect x="14.75" y="2.5" width="2.5" height="5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
    <rect x="14.75" y="24.5" width="2.5" height="5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
    <rect x="2.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
    <rect x="24.5" y="14.75" width="5" height="2.5" rx="1.25" fill="#145735" transform="rotate(45 16 16)"/>
  </svg>
);

export function Privacy() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF7' }}>
      <header className="w-full" style={{ backgroundColor: '#3A7A5C' }}>
        <div className="max-w-3xl mx-auto px-5 md:px-8 py-6 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: '#FDEAB4' }}
            >
              {SUN_ICON}
            </div>
            <span className="text-sm font-bold tracking-widest uppercase text-white">
              Watt <span style={{ color: '#FDEAB4' }}>Profit</span>
            </span>
          </Link>
          <Link
            to="/"
            className="text-xs font-semibold tracking-wide uppercase"
            style={{ color: 'rgba(255,255,255,0.7)' }}
          >
            ← Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 md:px-8 py-14 md:py-20">
        <p
          className="text-xs font-semibold tracking-widest uppercase mb-3"
          style={{ color: 'rgba(26,74,53,0.55)' }}
        >
          Legal
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif font-bold leading-tight tracking-tight mb-4"
          style={{ color: '#1A4A35' }}
        >
          Privacy policy
        </h1>
        <p className="text-sm mb-12" style={{ color: 'rgba(26,74,53,0.6)' }}>
          Last updated: 14 April 2026
        </p>

        <div className="space-y-10 text-[15px] leading-relaxed" style={{ color: '#1f2a24' }}>
          <section>
            <p>
              Watt Profit (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides independent solar and
              battery ROI modelling for Irish homes, farms and businesses. This page explains
              what personal information we collect when you use{' '}
              <span className="font-medium">wattprofit.ie</span>, why we collect it, and the
              rights you have under the General Data Protection Regulation (GDPR).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              Who we are
            </h2>
            <p>
              Watt Profit is operated as a sole trader based in Ireland. For questions about
              this policy or your data, contact{' '}
              <a
                href="mailto:conormurphy@outlook.com"
                className="underline decoration-dotted underline-offset-2"
                style={{ color: '#2D6A4F' }}
              >
                conormurphy@outlook.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              What we collect
            </h2>
            <p className="mb-3">We collect only what we need to respond to enquiries:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Contact form data</span> — email address, role
                (e.g. farmer, hotel owner), and any message you choose to add. Submitted via
                the &ldquo;Get your model&rdquo; form.
              </li>
              <li>
                <span className="font-medium">Usage data you enter in the modeller</span> —
                building type, electricity consumption, tariff details, and location. This
                stays in your browser unless you explicitly save or share a report.
              </li>
              <li>
                <span className="font-medium">Basic analytics</span> — if you accept the
                cookie notice, we record anonymous page visits and button clicks so we can
                see which parts of the site are useful. No personal profiles are built.
              </li>
            </ul>
            <p className="mt-3">
              We do not collect name, address, phone number or payment information through
              this website.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              Why we collect it
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                To reply to your enquiry and build the solar model you requested (legal basis:
                legitimate interest &mdash; you have asked us to get in touch).
              </li>
              <li>
                To understand how visitors use the site so we can improve it (legal basis:
                consent, where analytics are enabled).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              Who we share it with
            </h2>
            <p className="mb-3">Your data is only shared with the service providers we need to run the site:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="font-medium">Cloudflare</span> &mdash; hosting, DNS, and
                DDoS protection.
              </li>
              <li>
                <span className="font-medium">Resend</span> &mdash; transactional email
                delivery for the contact form.
              </li>
              <li>
                <span className="font-medium">Google Analytics &amp; Google Ads</span>{' '}
                &mdash; anonymous usage measurement and ad performance, only after you
                accept the cookie notice.
              </li>
            </ul>
            <p className="mt-3">We do not sell or rent personal data to anyone.</p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              How long we keep it
            </h2>
            <p>
              Contact form submissions are kept in our email inbox for as long as they remain
              useful for follow-up conversations, and deleted on request. Analytics data is
              retained for up to 14 months in line with Google&rsquo;s default settings.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              Your rights
            </h2>
            <p className="mb-3">Under GDPR you have the right to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Request a copy of the personal data we hold about you.</li>
              <li>Ask us to correct or delete that data.</li>
              <li>Withdraw your consent to analytics at any time by clearing cookies.</li>
              <li>
                Complain to the Data Protection Commission of Ireland at{' '}
                <a
                  href="https://www.dataprotection.ie"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted underline-offset-2"
                  style={{ color: '#2D6A4F' }}
                >
                  dataprotection.ie
                </a>
                .
              </li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{' '}
              <a
                href="mailto:conormurphy@outlook.com"
                className="underline decoration-dotted underline-offset-2"
                style={{ color: '#2D6A4F' }}
              >
                conormurphy@outlook.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              Cookies
            </h2>
            <p>
              The site uses strictly-necessary cookies to remember your consent choice and
              to keep the modeller working. Analytics and advertising cookies only load
              after you accept the cookie notice. You can change your choice at any time by
              clearing site data in your browser.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-serif font-semibold mb-3" style={{ color: '#1A4A35' }}>
              Changes to this policy
            </h2>
            <p>
              If we make material changes, we will update the &ldquo;Last updated&rdquo;
              date above and, where appropriate, notify you through the site.
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t" style={{ borderColor: 'rgba(26,74,53,0.15)' }}>
          <Link
            to="/"
            className="text-sm font-semibold"
            style={{ color: '#2D6A4F' }}
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
