/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8f5',
          100: '#d8eee6',
          200: '#b4dcd1',
          300: '#8ac8bb',
          400: '#4fa89a',
          500: '#218273',
          600: '#176c60',
          700: '#11584f',
          800: '#10463f',
          900: '#103933',
          950: '#092b26',
        },
        slate: {
          50: '#f6f8f7', 100: '#eef2f0', 200: '#dce3df', 300: '#becac5',
          400: '#77867f', 500: '#586961', 600: '#46574f', 700: '#34443c',
          800: '#24342d', 900: '#15231e', 950: '#0c1511',
        },
        surface: {
          subtle: '#f6f8f7',
          DEFAULT: '#ffffff',
          card: '#ffffff',
          overlay: 'rgba(15, 30, 26, 0.45)',
        },
        border: {
          subtle: '#edf0ee',
          DEFAULT: '#d5dfda',
          strong: '#b0bfb7',
        },
      },
      fontFamily: {
        sans: [
          'Instrument Sans Variable',
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
