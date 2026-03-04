import React from 'react';
import { StepIndicator } from './StepIndicator';

interface UnifiedWizardBarProps {
  appMode: 'solar-battery' | 'tariff';
  onBack: () => void;
  onExit: () => void;
  onOpenSavedReports?: () => void;
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
  onOpenSavedReports,
  showExit,
  steps,
  currentStep,
  completedSteps,
}: UnifiedWizardBarProps) {
  return (
    <div className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div className="mx-auto max-w-7xl px-4 md:px-6 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Back & Brand */}
        <div className="flex items-center gap-4 min-w-[140px]">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back
          </button>
          
          <div className="hidden md:block h-4 w-px bg-slate-200" />
          
          <div className="hidden md:block text-sm font-serif font-semibold text-slate-900 truncate">
            {appMode === 'solar-battery' ? 'Solar & Battery' : 'Tariff Comparer'}
          </div>
        </div>

        {/* Center: Stepper (if applicable) */}
        <div className="flex-1 flex justify-center overflow-x-auto no-scrollbar mask-edges px-2">
          {appMode === 'solar-battery' && steps && currentStep !== undefined && completedSteps && (
            <div className="w-full max-w-2xl py-1">
               <StepIndicator 
                 steps={steps} 
                 currentStep={currentStep} 
                 completedSteps={completedSteps} 
                 compact={true}
               />
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-end gap-3 min-w-[140px]">
          {onOpenSavedReports && (
            <button
              onClick={onOpenSavedReports}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors border border-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
              </svg>
              <span className="hidden sm:inline">Saved Reports</span>
            </button>
          )}

          {showExit && (
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors"
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