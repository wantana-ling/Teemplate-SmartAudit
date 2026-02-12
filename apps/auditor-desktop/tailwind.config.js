/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand colors aligned with SmartClick/SmartAudit
        primary: {
          50: '#caf0f8',
          100: '#90e0ef',
          200: '#00b4d8',
          300: '#0096c7',
          400: '#0077b6',
          500: '#005f8a',
          600: '#0a3d62',
          700: '#083352',
          800: '#062a44',
          900: '#041e30',
        },
        brand: {
          navy: '#0a3d62',
          blue: '#0077b6',
          cyan: '#00b4d8',
          light: '#90e0ef',
          pale: '#caf0f8',
        },
      },
    },
  },
  plugins: [],
};
