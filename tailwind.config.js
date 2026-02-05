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
        tines: {
          purple: '#5346DA',
          dark: '#1C1C28',
          light: '#F9FAFB',
          blue: '#1a237e', // Deep blue for hero
        },
        pastel: {
          purple: '#F3E5F5',
          green: '#E8F5E9',
          orange: '#FFF3E0',
        }
      },
      backgroundImage: {
        'sunburst': 'radial-gradient(circle at 50% 100%, #1a237e 0%, #0d1245 100%)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}
