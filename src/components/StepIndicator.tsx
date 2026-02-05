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
  return (
    <div className="flex items-center justify-between mb-12">
      {steps.map((step, index) => {
        const isActive = step.id === currentStep;
        const isCompleted = completedSteps.has(step.id);
        const isAccessible = !step.disabled;
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              {/* Step Circle */}
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300
                  ${isCompleted ? 'bg-tines-purple text-white shadow-lg shadow-indigo-500/30' : ''}
                  ${isActive && !isCompleted ? 'bg-tines-purple text-white ring-4 ring-indigo-100' : ''}
                  ${!isActive && !isCompleted && isAccessible ? 'bg-slate-100 text-slate-400 border-2 border-slate-200' : ''}
                  ${!isAccessible ? 'bg-slate-50 text-slate-300 border-2 border-slate-100' : ''}
                `}
              >
                {isCompleted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              
              {/* Step Label */}
              <div className="mt-3 text-center">
                <p className={`text-sm font-medium ${isActive ? 'text-tines-dark' : isCompleted ? 'text-slate-600' : 'text-slate-400'}`}>
                  {step.label}
                </p>
              </div>
            </div>

            {/* Connector Line */}
            {!isLast && (
              <div className="flex-1 h-0.5 mx-4 -mt-12">
                <div
                  className={`h-full transition-all duration-300 ${
                    isCompleted ? 'bg-tines-purple' : 'bg-slate-200'
                  }`}
                ></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
