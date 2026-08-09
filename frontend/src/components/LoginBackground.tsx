/**
 * Purely decorative engineering-blueprint backdrop for the Login page.
 * SVG line-art only, no interactivity, aria-hidden, pointer-events-none --
 * safe to sit behind the login form at any viewport without affecting
 * layout, tab order, or hit-testing.
 */
export default function LoginBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {/* Base graph-paper grid, faint everywhere */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.05]" preserveAspectRatio="none">
        <defs>
          <pattern id="lg-grid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#94A3B8" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lg-grid)" />
      </svg>

      {/* Foundation footing load diagram -- top-right, desktop only */}
      <svg
        viewBox="0 0 260 220"
        className="hidden lg:block absolute top-10 right-10 w-[280px] xl:w-[340px] opacity-[0.16] text-slate-300"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.1">
          <line x1="130" y1="8" x2="130" y2="52" markerEnd="url(#lg-arrow)" />
          <line x1="112" y1="52" x2="148" y2="52" />
          <rect x="112" y="52" width="36" height="26" />
          <line x1="60" y1="96" x2="200" y2="96" />
          <line x1="60" y1="100" x2="200" y2="100" />
          <line x1="60" y1="78" x2="60" y2="118" />
          <line x1="200" y1="78" x2="200" y2="118" />
          {[70, 90, 110, 130, 150, 170, 190].map((x) => (
            <line key={x} x1={x} y1="100" x2={x - 14} y2="150" strokeWidth="0.7" opacity="0.7" />
          ))}
          <line x1="60" y1="130" x2="60" y2="145" />
          <line x1="200" y1="130" x2="200" y2="145" />
          <line x1="56" y1="137" x2="204" y2="137" strokeWidth="0.8" />
        </g>
        <g fill="currentColor" fontSize="9" fontFamily="ui-monospace, monospace" opacity="0.85">
          <text x="134" y="30">P</text>
          <text x="126" y="112">B</text>
          <text x="205" y="115">Df</text>
          <text x="98" y="165">q_all</text>
        </g>
        <defs>
          <marker id="lg-arrow" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto">
            <path d="M0,0 L6,0 L3,6 Z" fill="currentColor" />
          </marker>
        </defs>
      </svg>

      {/* Topographic contour lines -- bottom-left, desktop only, brand-orange accent dots */}
      <svg
        viewBox="0 0 300 300"
        className="hidden md:block absolute -bottom-16 -left-16 w-[360px] xl:w-[440px] opacity-[0.14] text-sky-400"
      >
        {[40, 65, 90, 115, 140].map((r, i) => (
          <ellipse
            key={r}
            cx="150"
            cy="170"
            rx={r}
            ry={r * 0.72}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity={1 - i * 0.12}
          />
        ))}
        <circle cx="150" cy="170" r="2.5" fill="#F97316" opacity="0.9" />
        <circle cx="205" cy="140" r="2" fill="#F97316" opacity="0.7" />
        <circle cx="95" cy="205" r="2" fill="#F97316" opacity="0.7" />
      </svg>

      {/* Soil strata bands, very faint, full-width */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-40 opacity-[0.05]" preserveAspectRatio="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="0" y1={i * 34} x2="100%" y2={i * 34 + 10} stroke="#94A3B8" strokeWidth="1" />
        ))}
      </svg>
    </div>
  )
}
