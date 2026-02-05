export function Hero() {
  return (
    <div className="relative overflow-hidden bg-tines-blue text-white pt-24 pb-32">
      {/* Sunburst/Rays effect */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: 'repeating-conic-gradient(from 0deg, transparent 0deg, transparent 15deg, rgba(255,255,255,0.1) 15deg, rgba(255,255,255,0.1) 30deg)',
          maskImage: 'radial-gradient(circle at center bottom, black 0%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle at center bottom, black 0%, transparent 80%)'
        }}
      ></div>
      
      {/* Glow at the bottom to simulate the "sun" source */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-[800px] h-[400px] bg-indigo-500 opacity-30 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="relative mx-auto max-w-5xl px-6 text-center z-10">
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6">
          Solar & Battery <br/>
          <span className="text-indigo-200">ROI Calculator</span>
        </h1>
        <p className="text-xl text-indigo-100 max-w-2xl mx-auto font-light leading-relaxed">
          Estimate your savings, payback period, and environmental impact with our advanced modeling tool for Irish SMEs.
        </p>
      </div>
    </div>
  );
}
