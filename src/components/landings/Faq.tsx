import { useState } from 'react';

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'How does Watt Profit make money?',
    answer: (
      <>
        <p className="mb-3">
          We&rsquo;re an advisory and brokerage, not an installer. There are three small,
          transparent fees across the project. No commission stack, no hidden margins.
        </p>
        <ol className="list-decimal pl-5 space-y-2.5">
          <li>
            <span className="font-semibold">In-depth model.</span> A small fixed fee from
            you to build the independent ROI model on your real data. This is what makes
            us independent: we&rsquo;re paid to size the system right, not paid by whoever
            sells you panels.
          </li>
          <li>
            <span className="font-semibold">Brokerage.</span> If you decide to go ahead, we
            tender at least three quotes from reputable solar installers benchmarked on
            the same spec. You pick the installer; we receive a small standard flat
            brokerage fee from them. Flat, not percentage, so we have no incentive to
            push a bigger system.
          </li>
          <li>
            <span className="font-semibold">Tariff switch.</span> Once solar is live your
            load shape changes. We re-tender supply and broker the best tariff for the
            new profile (a typical 5&ndash;10% extra savings on top). A small broker fee
            from the supplier, same model as any switching site.
          </li>
        </ol>
      </>
    ),
  },
  {
    question: 'What does “project management” mean in this case?',
    answer: (
      <>
        <p className="mb-3">
          We sit on your side of the table from the model through to commissioning. You
          stay in control; we do the running.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            Write the technical spec from your real load data, so every quote is on the
            same basis. No apples-to-oranges comparison.
          </li>
          <li>
            Run the tender: invite three benchmarked installers, chase responses, surface
            differences in writing.
          </li>
          <li>
            Negotiate against the spec on your behalf: system size, battery, export cap,
            warranty, payment milestones.
          </li>
          <li>
            Track the install: ESB Networks application, planning if needed, scheduling,
            commissioning sign-off.
          </li>
          <li>
            Verify the install matches the model after go-live, and re-tender supply for
            the new load shape.
          </li>
        </ul>
        <p className="mt-3">
          You can drop us at any stage; we don&rsquo;t lock you in.
        </p>
      </>
    ),
  },
  {
    question: 'Why is independence from installers a big deal?',
    answer: (
      <>
        <p className="mb-3">
          An installer&rsquo;s &ldquo;free&rdquo; ROI is a sales tool. They&rsquo;re paid
          per kWp installed and per kWh of battery, so their model leans toward whichever
          system pays them most, not the system that pays you back fastest.
        </p>
        <p>
          We&rsquo;re paid by you to build the model and a flat brokerage fee from the
          installer you choose. The size of the system doesn&rsquo;t change what we earn,
          so the recommendation can be honest. That gap is typically &euro;50k&ndash;&euro;200k
          of savings over 10 years.
        </p>
      </>
    ),
  },
  {
    question: 'Can you model batteries or a heat pump independently down the line?',
    answer: (
      <>
        <p className="mb-3">
          Yes. Solar is usually the first move, but you can come back any time for a
          stand-alone independent model on either of these. Same approach, same
          independence from installers.
        </p>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <span className="font-semibold">Battery-only model.</span> If you already have
            solar (ours or someone else&rsquo;s), we model what a battery actually adds at
            your real load shape and current tariff. Many systems get oversold a battery
            that doesn&rsquo;t pay back. We tell you, on your data, whether yours does.
          </li>
          <li>
            <span className="font-semibold">Heat-pump model.</span> Electrifying heat
            changes your load and your tariff economics. We model the heat pump against
            your real building and current setup, factor in SEAI grants and the right
            night-rate tariff, and tell you the honest payback before you commit.
          </li>
        </ul>
        <p className="mt-3">
          Same flat-fee model: you pay us to build it, we broker quotes if you want to go
          ahead, and you keep control end to end.
        </p>
      </>
    ),
  },
];

interface FaqProps {
  /** Optional override for the section background colour. */
  bgClassName?: string;
}

export function Faq({ bgClassName = 'bg-white' }: FaqProps) {
  return (
    <section
      aria-labelledby="faq-heading"
      className={`${bgClassName} py-14 md:py-20 px-5 md:px-8 border-t border-slate-100`}
    >
      <div className="max-w-3xl mx-auto">
        <h2
          id="faq-heading"
          className="text-3xl md:text-4xl font-serif font-bold text-slate-900 leading-tight tracking-tight mb-8 md:mb-10"
        >
          Common questions.
        </h2>
        <ul className="space-y-3">
          {FAQ_ITEMS.map((item, idx) => (
            <FaqRow key={idx} item={item} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FaqRow({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 px-5 md:px-6 py-4 md:py-5 text-left hover:bg-slate-50 transition-colors rounded-2xl"
      >
        <span className="text-base md:text-lg font-serif font-semibold text-slate-900">
          {item.question}
        </span>
        <svg
          className={`w-5 h-5 shrink-0 text-slate-500 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-5 md:px-6 pb-5 md:pb-6 text-sm md:text-base text-slate-700 leading-relaxed">
          {item.answer}
        </div>
      )}
    </li>
  );
}
