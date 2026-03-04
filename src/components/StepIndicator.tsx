interface StepIndicatorProps {
  steps: Array<{
    id: number;
    label: string;
    disabled?: boolean;
  }>;
  currentStep: number;
  completedSteps: Set<number>;
  compact?: boolean;
}

export function StepIndicator({ steps, currentStep, completedSteps, compact = false }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="w-full">
      <ol className="flex items-center">
        {steps.map((step, idx) => {
          const isActive = step.id === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isAccessible = !step.disabled;
          const isLast = idx === steps.length - 1;

          // Connecting line styles
          const lineClass = isCompleted || isActive
            ? 'bg-indigo-600'
            : 'bg-slate-200';

          if (compact) {
            return (
              <li key={step.id} className={`flex items-center ${isLast ? '' : 'flex-1'}`}>
                <div className={`flex items-center gap-2 ${isActive || isCompleted ? 'opacity-100' : 'opacity-60 grayscale'}`}>
                  {/* Compact Step Node */}
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full shrink-0 text-[10px] font-bold
                      ${isCompleted ? 'bg-indigo-600 text-white' : isActive ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}
                    `}
                  >
                    {isCompleted ? (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      step.id
                    )}
                  </div>
                  
                  {/* Inline Label */}
                  <span className={`text-xs font-medium whitespace-nowrap ${isCompleted || isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                    {step.label}
                  </span>
                </div>

                {/* Connecting Line */}
                {!isLast && (
                  <div className={`h-[1px] w-full mx-3 sm:mx-4 ${lineClass} ${!isActive && !isCompleted ? 'opacity-50' : ''}`} />
                )}
              </li>
            );
          }

          // Full original view
          return (
            <li key={step.id} className={`relative ${isLast ? '' : 'flex-1'}`}>
              <div className="flex items-center">
                {/* Step Node */}
                <div
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full shrink-0
                    ${isCompleted ? 'bg-indigo-600' : isActive ? 'bg-white border-2 border-indigo-600' : 'bg-white border-2 border-slate-200'}
                  `}
                >
                  {isCompleted ? (
                    <svg className="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                    </svg>
                  ) : isActive ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-indigo-600" />
                  ) : (
                    <span className="text-xs font-medium text-slate-400">{step.id}</span>
                  )}
                </div>

                {/* Connecting Line */}
                {!isLast && (
                  <div className={`h-[2px] w-full mx-4 ${lineClass}`} />
                )}
              </div>

              {/* Label below the node */}
              <div className={`absolute left-4 -translate-x-1/2 top-10 w-max text-center ${isLast ? '' : ''}`}>
                  <div className={`text-xs font-medium ${isCompleted || isActive ? 'text-slate-900' : 'text-slate-500'}`}>
                    {step.label}
                    {step.disabled && (
                      <span className="ml-1 text-[10px] font-medium text-slate-400">· Coming Soon</span>
                    )}
                  </div>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
