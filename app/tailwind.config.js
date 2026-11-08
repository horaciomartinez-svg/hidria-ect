/**
 * Tokens institucionales HIDRIA (SDFI · SRHDS · UCI).
 *
 * Contraste verificado sobre blanco: `hidria-600` (#0d5c63) ≈ 7.8:1 y
 * `hidria-700` (#0a4a50) ≈ 10.9:1, aptos para texto normal (WCAG 2.2 AA/AAA).
 * `hidria-500` (#0d8a92) ≈ 4.15:1: reservado a texto grande (≥ 24 px o ≥ 18.66 px
 * bold) y a elementos no textuales (bordes, foco). Los colores de semáforo nunca se
 * usan como único indicador de estado.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        hidria: {
          50: '#eef8f8',
          100: '#d5eeee',
          200: '#a9dedf',
          500: '#0d8a92',
          600: '#0d5c63',
          700: '#0a4a50',
          800: '#083b40',
          900: '#072f33',
        },
        surface: '#f7fafb',
        panel: '#ffffff',
        line: '#dfe8ec',
        // Semáforo institucional (docs/Arquitectura §5.8): nunca es el único indicador.
        semaforo: {
          ok: '#15803d',
          warn: '#b45309',
          crit: '#b91c1c',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(7, 47, 51, 0.06), 0 1px 3px rgba(7, 47, 51, 0.10)',
      },
    },
  },
  plugins: [],
};
