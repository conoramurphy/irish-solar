export function Step3ComingSoon() {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white rounded-xl shadow-lg border border-slate-100 p-12 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 mb-6">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10 text-slate-400">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M4.5 10.5h6.75V15H4.5v-4.5ZM3.75 18h15A2.25 2.25 0 0 0 21 15.75v-6a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 9.75v6A2.25 2.25 0 0 0 3.75 18Z" />
          </svg>
        </div>
        
        <h2 className="text-3xl font-serif font-bold text-tines-dark mb-4">
          Batteries & Other Tariffs
        </h2>
        
        <div className="inline-block bg-amber-50 border border-amber-200 rounded-full px-5 py-2 mb-6">
          <span className="text-sm font-semibold text-amber-700">Coming Soon</span>
        </div>
        
        <p className="text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
          This step will let you explore battery storage options and alternative tariff scenarios. 
          For now, we'll skip ahead to the financial analysis.
        </p>
      </div>
    </div>
  );
}

export default Step3ComingSoon;
