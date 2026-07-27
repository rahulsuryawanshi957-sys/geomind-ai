/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Premium engineering-workspace palette: deep navy base, slate surfaces,
        // purple + cyan dual accent (purple = AI/intelligence, cyan = data/precision).
        navy: {
          950: '#05070D',
          900: '#0A0E1A',
          850: '#0F1424',
          800: '#141A2E',
          700: '#1C2440',
          600: '#28325A',
        },
        slate: {
          400: '#8B93A8',
          300: '#AEB4C7',
        },
        violet: {
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
        },
        cyan: {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      backdropBlur: { xs: '2px' },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,0.15), 0 8px 30px -8px rgba(139,92,246,0.25)',
        'glow-cyan': '0 0 0 1px rgba(34,211,238,0.15), 0 8px 30px -8px rgba(34,211,238,0.25)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(6px)' }, '100%': { opacity: 1, transform: 'translateY(0)' } },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
}
