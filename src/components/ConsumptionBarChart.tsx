import { MONTH_LABELS } from '../utils/consumption';
import type { ConsumptionProfile } from '../types';

interface ConsumptionBarChartProps {
  consumptionProfile: ConsumptionProfile;
}

export function ConsumptionBarChart({ consumptionProfile }: ConsumptionBarChartProps) {
  const maxKwh = Math.max(...consumptionProfile.months.map(m => m.totalKwh));

  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-8">
      <div className="mb-6">
        <h3 className="text-2xl font-serif font-bold text-tines-dark mb-2">Building Your Report</h3>
        <p className="text-sm text-slate-500">Monthly consumption profile</p>
      </div>

      <div className="space-y-3">
        {consumptionProfile.months.map((month) => {
          const heightPercent = (month.totalKwh / maxKwh) * 100;
          
          return (
            <div key={month.monthIndex} className="flex items-center gap-4">
              <div className="w-12 text-xs font-medium text-slate-500 text-right">
                {MONTH_LABELS[month.monthIndex]}
              </div>
              
              <div className="flex-1 bg-slate-100 rounded-full h-8 relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-tines-purple to-indigo-500 rounded-full transition-all duration-700 ease-out flex items-center justify-end pr-3"
                  style={{ width: `${heightPercent}%` }}
                >
                  {heightPercent > 30 && (
                    <span className="text-xs font-semibold text-white">
                      {month.totalKwh.toLocaleString()}
                    </span>
                  )}
                </div>
                {heightPercent <= 30 && (
                  <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-semibold text-slate-700">
                    {month.totalKwh.toLocaleString()}
                  </span>
                )}
              </div>
              
              <div className="w-16 text-xs text-slate-400">kWh</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 font-medium">Annual Total</span>
          <span className="text-xl font-bold text-tines-purple">
            {consumptionProfile.months.reduce((sum, m) => sum + m.totalKwh, 0).toLocaleString()} <span className="text-sm text-slate-400">kWh</span>
          </span>
        </div>
      </div>
    </div>
  );
}
