// "Five ways this makes you money": copy ported verbatim from the marketing
// asset shared via screenshot. Three of the five points (#1, #3, #4) reinforce
// the "independent of installer" wedge for free.

interface FiveWayTile {
  number: string;
  title: string;
  body: string;
  metricLabel: string;
  metricValue: string;
}

const TILES: readonly FiveWayTile[] = [
  {
    number: '01',
    title: 'Sized for your site, not the average.',
    body: 'We use your real half-hourly load data and check local grid export capacity, so the system is sized correctly the first time and you have leverage in installer negotiation.',
    metricLabel: 'Avoidable return loss',
    metricValue: '20–40%',
  },
  {
    number: '02',
    title: 'Right-sized batteries.',
    body: 'We model battery dispatch against your real load before anyone quotes hardware, so you only pay for capacity that actually pays back.',
    metricLabel: 'Avoidable overspend',
    metricValue: '€10k+',
  },
  {
    number: '03',
    title: 'Three installer quotes.',
    body: 'We manage the tender and get you three quotes benchmarked on the same spec. Competitive pricing without the back-and-forth.',
    metricLabel: 'Lower installer quotes',
    metricValue: '~5%',
  },
  {
    number: '04',
    title: 'Tariff switching.',
    body: 'Once solar is live your load shape changes. We re-tender supply and show you three of the best business tariffs matched to the new profile.',
    metricLabel: 'Extra annual savings',
    metricValue: '5–10%',
  },
  {
    number: '05',
    title: 'Faster delivery.',
    body: 'We push the project through faster than going it alone. Earlier commissioning means savings start sooner, especially through the summer peak.',
    metricLabel: 'Earlier savings',
    metricValue: '3 mo',
  },
] as const;

export function FiveWaysGrid() {
  return (
    <section
      aria-labelledby="five-ways-heading"
      className="bg-slate-50 py-14 md:py-20 px-5 md:px-8"
    >
      <div className="max-w-6xl mx-auto">
        <h2
          id="five-ways-heading"
          className="text-3xl md:text-5xl font-serif font-bold text-slate-900 leading-tight tracking-tight mb-10 md:mb-12"
        >
          Five ways this makes you money.
        </h2>
        <ul
          role="list"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5"
        >
          {TILES.map((tile) => (
            <li
              key={tile.number}
              className="rounded-2xl bg-white p-6 md:p-7 flex flex-col border border-slate-100"
            >
              <p className="text-xs font-semibold tracking-widest text-amber-600 mb-3">
                {tile.number}
              </p>
              <h3 className="text-lg md:text-xl font-serif font-semibold text-slate-900 leading-snug mb-2.5">
                {tile.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed flex-1 mb-6">
                {tile.body}
              </p>
              <div className="border-t border-slate-100 pt-3 flex items-baseline justify-between gap-4">
                <span className="text-[11px] font-medium tracking-widest uppercase text-slate-400">
                  {tile.metricLabel}
                </span>
                <span className="text-xl md:text-2xl font-serif font-bold text-green-800">
                  {tile.metricValue}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
