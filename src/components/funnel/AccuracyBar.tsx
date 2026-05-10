// Sticky bar at the top of every funnel report. Frames the report's accuracy
// honestly and points to the call as the path to a tighter number — the
// entire funnel exists to earn that call.

const PHONE_HREF =
  'https://wa.me/353858082080?text=Hey%2C%20I%20just%20got%20my%20Watt%20Profit%20independent%20ROI%20and%20want%20to%20chat%20through%20it.%20What%20time%20works%3F';

export function AccuracyBar() {
  return (
    <div
      role="status"
      className="sticky top-0 z-30 w-full border-b border-amber-200 bg-amber-50 text-amber-900"
    >
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs sm:text-sm font-medium leading-snug">
          <span className="font-semibold">Accurate to ±20%.</span>{' '}
          The real one is ±5%.
        </p>
        <a
          href={PHONE_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs sm:text-sm font-semibold underline underline-offset-2 hover:text-amber-700 transition-colors whitespace-nowrap"
        >
          Contact for a full ROI →
        </a>
      </div>
    </div>
  );
}
