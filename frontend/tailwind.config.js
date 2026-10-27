/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // ------------------------------------------------------------
      // Color — Structured Organization palette
      // Primary: deep slate-navy (institutional, architectural, serious)
      // Accent: precise amber (attention, action, modules)
      // Surfaces: warm neutrals, not grays
      // ------------------------------------------------------------
      colors: {
        brand: {
          50: '#f4f6f8',
          100: '#e4e8ec',
          200: '#c9d2da',
          300: '#a8b4c0',
          400: '#8190a0',
          500: '#5c6b7d',
          600: '#44556a',
          700: '#313e4f',
          800: '#242f3c',
          900: '#17212b',
        },
        accent: {
          50: '#fdf4e7',
          100: '#fce8cf',
          200: '#fad9a5',
          300: '#f8c66e',
          400: '#f5ae34',
          500: '#d98a1f',
          600: '#b76f16',
          700: '#955710',
          800: '#73420c',
          900: '#512e07',
        },
        surface: {
          subtle: '#f7f9fb',
          DEFAULT: '#ffffff',
          card: '#ffffff',
          overlay: 'rgba(23, 33, 43, 0.35)',
        },
        border: {
          subtle: '#eef1f4',
          DEFAULT: '#d9e0e8',
          strong: '#b9c4d0',
        },
        // Semantic tokens (OKLCH)
        background: 'oklch(0.99 0.003 250)',
        foreground: 'oklch(0.22 0.01 250)',
        primary: 'oklch(0.28 0.015 250)',
        'primary-foreground': 'oklch(1 0 0)',
        secondary: 'oklch(0.97 0.004 250)',
        'secondary-foreground': 'oklch(0.22 0.01 250)',
        muted: 'oklch(0.97 0.004 250)',
        'muted-foreground': 'oklch(0.55 0.01 250)',
        accent: 'oklch(0.72 0.16 55)',
        'accent-foreground': 'oklch(0.22 0.01 250)',
        destructive: 'oklch(0.55 0.22 25)',
        'destructive-foreground': 'oklch(1 0 0)',
        border: 'oklch(0.87 0.008 250)',
        ring: 'oklch(0.45 0.02 250)',
        card: 'oklch(1 0 0)',
        'card-foreground': 'oklch(0.22 0.01 250)',
      },
      // ------------------------------------------------------------
      // Typography — Deliberate, not default
      // Headings: tight tracking, heavy weight
      // Body: readable, slightly loose
      // Labels: letter-spaced, small caps feel via tracking
      // ------------------------------------------------------------
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
      fontSize: {
        'caption': ['0.75rem', { lineHeight: '1rem', letterSpacing: '0.05em' }],
        'xs': ['0.8125rem', { lineHeight: '1.125rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.025em' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.03em' }],
        '5xl': ['3rem', { lineHeight: '1', letterSpacing: '-0.035em' }],
      },
      // ------------------------------------------------------------
      // Radius — Minimal, precise. No pill-shaped everything.
      // ------------------------------------------------------------
      borderRadius: {
        sm: '0.125rem',   // 2px — hairline
        md: '0.25rem',    // 4px — subtle
        lg: '0.375rem',   // 6px — moderate
        xl: '0.5rem',     // 8px — card
        none: '0',
      },
      // ------------------------------------------------------------
      // Shadows — Minimal. Cards use borders, not shadows.
      // ------------------------------------------------------------
      boxShadow: {
        subtle: '0 1px 0 0 oklch(0 0 0 / 0.04)',
        card: '0 1px 2px 0 oklch(0 0 0 / 0.03)',
        dialog: '0 20px 25px -5px oklch(0 0 0 / 0.1), 0 10px 10px -5px oklch(0 0 0 / 0.04)',
      },
      // ------------------------------------------------------------
      // Spacing — Strict 4px grid
      // ------------------------------------------------------------
      spacing: {
        0: '0',
        1: '0.25rem',
        2: '0.5rem',
        3: '0.75rem',
        4: '1rem',
        5: '1.25rem',
        6: '1.5rem',
        8: '2rem',
        10: '2.5rem',
        12: '3rem',
        16: '4rem',
        20: '5rem',
        24: '6rem',
        32: '8rem',
      },
    },
  },
  plugins: [],
};
