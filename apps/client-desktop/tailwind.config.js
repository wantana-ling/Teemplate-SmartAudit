/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand colors aligned with SmartClick/SmartAudit logos
        primary: {
          50: '#caf0f8',   // Pale blue
          100: '#90e0ef',  // Light cyan
          200: '#00b4d8',  // Brand cyan
          300: '#0096c7',  // Mid cyan
          400: '#0077b6',  // Brand blue
          500: '#005f8a',  // Mid navy
          600: '#0a3d62',  // Brand navy (primary)
          700: '#083352',  // Dark navy
          800: '#062a44',  // Darker navy
          900: '#041e30',  // Deepest navy
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
}
