/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Official RaahiGeo brand palette (logo colors) -- use `brand-navy` /
        // `brand-orange` when building brand-consistent UI (header, buttons, links,
        // active states) alongside the existing workspace palette below.
        brand: {
          navy: '#0B2A5B',
          orange: '#F97316',
        },
        // Premium engineering-workspace palette: deep navy base, slate surfaces,
        // purple + cyan dual accent (purple = AI/intelligence, cyan = data/precision).
        // NOTE (2 Aug 2026): every shade below is now a CSS variable
        // (`rgb(var(--x) / <alpha-value>)`), NOT a fixed hex. This is deliberate --
        // it lets ONE CSS block (see `html.light` in index.css) re-skin every page in
        // the app to the light navy/orange brand theme, since every page already uses
        // these exact class names (bg-navy-900, text-slate-400, from-violet-500, etc.)
        // without editing each page file individually. Do not change these back to
        // plain hex strings -- that would silently break the light-theme override.
        navy: {
          950: 'rgb(var(--navy-950) / <alpha-value>)',
          900: 'rgb(var(--navy-900) / <alpha-value>)',
          850: 'rgb(var(--navy-850) / <alpha-value>)',
          800: 'rgb(var(--navy-800) / <alpha-value>)',
          700: 'rgb(var(--navy-700) / <alpha-value>)',
          600: 'rgb(var(--navy-600) / <alpha-value>)',
        },
        slate: {
          50: 'rgb(var(--slate-50) / <alpha-value>)',
          100: 'rgb(var(--slate-100) / <alpha-value>)',
          200: 'rgb(var(--slate-200) / <alpha-value>)',
          300: 'rgb(var(--slate-300) / <alpha-value>)',
          400: 'rgb(var(--slate-400) / <alpha-value>)',
          500: 'rgb(var(--slate-500) / <alpha-value>)',
          600: 'rgb(var(--slate-600) / <alpha-value>)',
          800: 'rgb(var(--slate-800) / <alpha-value>)',
          900: 'rgb(var(--slate-900) / <alpha-value>)',
          950: 'rgb(var(--slate-950) / <alpha-value>)',
        },
        violet: {
          300: 'rgb(var(--violet-300) / <alpha-value>)',
          400: 'rgb(var(--violet-400) / <alpha-value>)',
          500: 'rgb(var(--violet-500) / <alpha-value>)',
          600: 'rgb(var(--violet-600) / <alpha-value>)',
          700: 'rgb(var(--violet-700) / <alpha-value>)',
        },
        cyan: {
          300: 'rgb(var(--cyan-300) / <alpha-value>)',
          400: 'rgb(var(--cyan-400) / <alpha-value>)',
          500: 'rgb(var(--cyan-500) / <alpha-value>)',
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
