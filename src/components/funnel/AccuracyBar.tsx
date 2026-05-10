// Sticky bar at the top of every funnel report. Frames the report's accuracy
// honestly and points to the call as the path to a tighter number — the
// entire funnel exists to earn that call.

interface AccuracyBarProps {
  onContact: () => void;
}

export function AccuracyBar({ onContact }: AccuracyBarProps) {
  return (
    <div
      role="status"
      className="sticky top-0 z-30 w-full border-b border-amber-200 bg-amber-50 text-amber-900"
    >
      <div className="max-w-5xl mx-auto px-5 md:px-8 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs sm:text-sm font-medium leading-snug">
          <span className="font-semibold">Accurate to ±20%.</span>{' '}
          When we use your real data it&rsquo;s ±5% accurate.
        </p>
        <button
          type="button"
          onClick={onContact}
          className="text-xs sm:text-sm font-semibold underline underline-offset-2 hover:text-amber-700 transition-colors whitespace-nowrap cursor-pointer"
        >
          Contact me for a full ROI →
        </button>
      </div>
    </div>
  );
}
