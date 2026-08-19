/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f1419',
        card: '#1a2332',
        hover: '#243044',
        line: '#2d3a4f',
        muted: '#8b9cb3',
        brand: { DEFAULT: '#0d9488', dark: '#0f766e' },
        accent: { DEFAULT: '#f97316', dark: '#ea580c' },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
};
