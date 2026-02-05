import React from 'react';

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5">{label}</span>
      <div className="relative group">
        {children}
      </div>
    </label>
  );
}
