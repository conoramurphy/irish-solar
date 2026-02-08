interface StepIndicatorProps {
  steps: Array<{
    id: number;
    label: string;
    disabled?: boolean;
  }>;
  currentStep: number;
  completedSteps: Set<number>;
}

export function StepIndicator({ steps, currentStep, completedSteps }: StepIndicatorProps) {
  const total = steps.length;

  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="grid grid-cols-4 gap-2">
        {steps.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isAccessible = !step.disabled;

          const stateClass = isCompleted
            ? 'bg-indigo-600 text-white'
            : isActive
              ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
              : isAccessible
                ? 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'
                : 'bg-slate-50 text-slate-400 ring-1 ring-slate-100';

          return (
            <li key={step.id} className="min-w-0">
              <div className={`h-full rounded-lg px-3 py-2.5 flex items-center gap-3 ${stateClass}`}>
                <div
                  className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
                    isCompleted ? 'bg-white/15' : isActive ? 'bg-indigo-100' : 'bg-white'
                  } ${isCompleted ? 'text-white' : isActive ? 'text-indigo-700' : 'text-slate-700'}`}
                >
                  {isCompleted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  ) : (
                    step.id
                  )}
                </div>

                <div className="min-w-0">
                  <div className={`text-[11px] font-semibold uppercase tracking-wide ${isCompleted ? 'text-white/80' : isActive ? 'text-indigo-700/80' : 'text-slate-500'}`}>
                    Step {idx + 1} of {total}
                  </div>
                  <div className={`text-sm font-semibold truncate ${isCompleted ? 'text-white' : isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {step.label}
                    {step.disabled && (
                      <span className="ml-1 text-[10px] font-medium text-slate-400">· Coming Soon</span>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
