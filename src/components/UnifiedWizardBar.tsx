import { StepIndicator } from './StepIndicator';

interface UnifiedWizardBarProps {
  appMode: 'solar-battery' | 'tariff';
  onBack: () => void;
  onExit: () => void;
  onStartNew?: () => void;
  onRecalculate?: () => void;
  isEditing?: boolean;
  showExit: boolean;
  
  // Stepper props (only needed for solar-battery)
  steps?: Array<{ id: number; label: string; disabled?: boolean }>;
  currentStep?: number;
  completedSteps?: Set<number>;
}

export function UnifiedWizardBar({
  appMode,
  onBack,
  onExit,
  onStartNew,
  onRecalculate,
  isEditing,
  showExit,
  steps,
  currentStep,
  completedSteps,
}: UnifiedWizardBarProps) {
  const allStepsCompleted = completedSteps && steps && steps.every(s => completedSteps.has(s.id));

  return (
    <div className="sticky top-0 z-40 backdrop-blur-md border-b" style={{ background: 'rgba(116,198,157,0.97)', borderColor: 'rgba(13,64,39,0.12)' }}>
      <div className="mx-auto max-w-7xl px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Back & Brand */}
        <div className="flex items-center gap-4 min-w-[140px]">
          <button
            type="button"
            onClick={onBack}
            className="nav-btn-ghost flex items-center gap-1.5 text-sm font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          
          <div className="hidden md:block h-4 w-px" style={{ background: 'rgba(13,64,39,0.2)' }} />
          
          <div className="hidden md:flex items-center gap-2">
            {/* Mini sun */}
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#D97706' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
              </svg>
            </div>
            <span className="text-sm font-serif font-semibold truncate" style={{ color: '#0D4027' }}>
              {appMode === 'tariff' ? 'Tariff Comparer' : isEditing ? 'Editing Analysis' : 'Solar & Battery'}
            </span>
          </div>
        </div>

        {/* Center: Stepper (if applicable) */}
        <div className="flex-1 flex justify-center overflow-x-auto no-scrollbar mask-edges px-2">
          {appMode === 'solar-battery' && steps && currentStep !== undefined && completedSteps && (
            <div className="w-full max-w-[240px] py-1">
               <StepIndicator 
                 steps={steps} 
                 currentStep={currentStep} 
                 completedSteps={completedSteps} 
                 iconOnly={true}
               />
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-end gap-2 min-w-[140px]">
          {isEditing && allStepsCompleted && onRecalculate && (
            <button
              onClick={onRecalculate}
              className="nav-btn-gold flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md shadow-sm text-white"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Recalculate
            </button>
          )}

          {appMode === 'solar-battery' && onStartNew && (
            <button
              onClick={onStartNew}
              className="nav-btn-frosted flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border"
              title="Start a completely fresh analysis"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              <span className="hidden lg:inline">New Report</span>
            </button>
          )}

          {showExit && (
            <button
              type="button"
              onClick={onExit}
              className="nav-btn-ghost flex items-center gap-1.5 text-sm font-medium opacity-50"
            >
              <span className="hidden sm:inline">Exit</span>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
