/** Configuración de Tailwind — tokens institucionales HIDRIA */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hidria: {
          50: '#eef8f8',
          100: '#d5eeee',
          500: '#0d8a92',
          600: '#0d5c63',
          700: '#0a4a50',
          900: '#072f33',
        },
      },
    },
  },
  plugins: [],
};
