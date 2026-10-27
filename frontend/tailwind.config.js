/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Clean Enterprise design system palette
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        surface: {
          subtle: '#f8fafc',
          DEFAULT: '#ffffff',
          card: '#ffffff',
          overlay: 'rgba(15, 23, 42, 0.4)',
        },
        border: {
          subtle: '#f1f5f9',
          DEFAULT: '#e2e8f0',
          strong: '#cbd5e1',
        },
        // Semantic design tokens (OKLCH-based)
        background: 'oklch(1 0 0)',
        foreground: 'oklch(0.19 0.005 263.66)',
        primary: 'oklch(0.563 0.22 263.66)',
        'primary-foreground': 'oklch(1 0 0)',
        secondary: 'oklch(0.975 0.002 263.66)',
        'secondary-foreground': 'oklch(0.19 0.005 263.66)',
        muted: 'oklch(0.975 0.002 263.66)',
        'muted-foreground': 'oklch(0.45 0.005 263.66)',
        accent: 'oklch(0.975 0.002 263.66)',
        'accent-foreground': 'oklch(0.19 0.005 263.66)',
        destructive: 'oklch(0.577 0.245 27.325)',
        'destructive-foreground': 'oklch(1 0 0)',
        border: 'oklch(0.889 0.008 263.66)',
        ring: 'oklch(0.563 0.22 263.66)',
        card: 'oklch(1 0 0)',
        'card-foreground': 'oklch(0.19 0.005 263.66)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.07), 0 1px 2px -1px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
