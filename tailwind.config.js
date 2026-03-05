/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Playfair Display"', 'serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        // Brand aliases — soft sage green theme
        tines: {
          purple: '#1E8A5E',  // sage-mid — primary action, CTAs, focus rings
          dark:   '#0D4027',  // sage-deep — headings, hero bg
          light:  '#ECFDF5',  // sage-pale — subtle bg tints
        },
        solar: {
          green: {
            deep:  '#145735',  // sage-dark — nav icon, dark accents
            mid:   '#1A6644',  // sage-medium — hover states
            muted: '#1A6644',
            light: '#D1FAE5',  // emerald-100 — active node tint
            pale:  '#ECFDF5',  // emerald-50 — subtle bg tints
          },
          gold: {
            deep:  '#92400E',  // Strong CTA text
            mid:   '#B45309',  // Primary CTA colour
            bright:'#D97706',  // Hover gold
            light: '#FEF3C7',  // Card background, warm gold
            pale:  '#FFFBEB',  // Subtle bg tints
          },
          cream:   '#F7FAF7',  // Page background
        },
      },
      backgroundImage: {
        'hero-green': 'linear-gradient(135deg, #0D4027 0%, #1A6644 50%, #1E8A5E 100%)',
        'dot-grid': 'radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)',
      },
      backgroundSize: {
        'dot-28': '28px 28px',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
