/**
 * Purely decorative engineering-blueprint backdrop for the Login page.
 * SVG line-art only, no interactivity, aria-hidden, pointer-events-none.
 *
 * 8 Aug 2026 rewrite: Raahi's brief explicitly says these diagrams must NOT
 * appear as separate visible cards -- everything here blends into the
 * background at low opacity, and (per the brief's mobile section) a
 * simplified SELECTION stays visible on mobile too, instead of being hidden
 * entirely below a breakpoint like the previous version did.
 *
 * Mobile-visible set (per brief): small foundation section, contour lines,
 * soil strata, small SPT graph, settlement curve, subtle pile drawing.
 * Desktop-only additions: bridge/hillside illustration, retaining wall +
 * earth pressure diagram.
 *
 * NOTE on the bridge/hillside corner motif: the reference board's desktop
 * mock uses a real photograph. This sandbox has no network access to
 * source/license an actual photo, so this stays an ILLUSTRATED line-art
 * substitute in the same blueprint style as everything else -- not a photo.
 * Flag it back if the literal photo look is wanted; that needs a real image
 * file dropped into `frontend/public/`.
 */
export default function LoginBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden select-none">
      {/* Base graph-paper grid, faint everywhere, all breakpoints */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.045]" preserveAspectRatio="none">
        <defs>
          <pattern id="lg-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#94A3B8" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lg-grid)" />
      </svg>

      {/* Illustrated bridge/hillside silhouette -- desktop only, top-left corner accent */}
      <svg
        viewBox="0 0 520 420"
        preserveAspectRatio="xMinYMin slice"
        className="hidden lg:block absolute -top-6 -left-10 w-[44vw] max-w-[600px] h-[360px] opacity-[0.12] text-slate-300"
      >
        <path d="M0,300 C90,250 150,340 230,290 C300,250 340,300 420,270 C470,250 500,260 520,240 L520,420 L0,420 Z"
          fill="currentColor" opacity="0.3" />
        <g fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M-20,150 C120,90 260,70 460,20" />
          <path d="M-20,162 C120,102 260,82 460,32" />
          {[40, 120, 200, 280, 360].map((x, i) => {
            const y = 150 - i * 20
            return <line key={x} x1={x} y1={y + 8} x2={x - 6} y2={y + 90} strokeWidth="1" opacity="0.75" />
          })}
        </g>
      </svg>

      {/* Foundation footing load diagram -- small on mobile, larger on desktop, top-right */}
      <svg
        viewBox="0 0 260 220"
        className="absolute top-6 right-4 w-[140px] sm:w-[190px] lg:w-[260px] xl:w-[300px] opacity-[0.13] text-slate-300"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.2">
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

      {/* Retaining wall + active earth pressure -- desktop only */}
      <svg
        viewBox="0 0 160 180"
        className="hidden xl:block absolute top-[240px] right-16 w-[150px] opacity-[0.11] text-slate-300"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.1">
          <rect x="20" y="20" width="18" height="140" />
          <line x1="38" y1="20" x2="120" y2="140" />
          <line x1="38" y1="160" x2="120" y2="160" />
          <line x1="120" y1="140" x2="120" y2="160" />
        </g>
        <text x="70" y="90" fontSize="9" fill="currentColor" opacity="0.8" fontFamily="ui-monospace, monospace">Pa</text>
      </svg>

      {/* Small SPT N-value line graph -- visible on mobile too, bottom-right */}
      <svg
        viewBox="0 0 140 130"
        className="absolute bottom-24 right-3 w-[110px] sm:w-[140px] lg:w-[170px] opacity-[0.16] text-orange-400"
      >
        <g stroke="currentColor" strokeWidth="0.6" opacity="0.35">
          <line x1="14" y1="10" x2="14" y2="112" />
          <line x1="14" y1="112" x2="130" y2="112" />
        </g>
        <path
          d="M18,14 L30,32 L26,50 L42,66 L38,82 L54,98 L50,110"
          fill="none" stroke="currentColor" strokeWidth="1.3"
        />
        {[[18, 14], [30, 32], [26, 50], [42, 66], [38, 82], [54, 98], [50, 110]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.8" fill="currentColor" />
        ))}
      </svg>

      {/* Settlement curve (time vs settlement, decaying) -- visible on mobile too, left side mid-page */}
      <svg
        viewBox="0 0 140 90"
        className="absolute top-[52%] left-2 w-[110px] sm:w-[130px] opacity-[0.10] text-slate-300"
      >
        <g stroke="currentColor" strokeWidth="0.6" opacity="0.35">
          <line x1="10" y1="8" x2="10" y2="78" />
          <line x1="10" y1="78" x2="130" y2="78" />
        </g>
        <path d="M12,16 C40,55 70,72 130,76" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>

      {/* Subtle pile foundation sketch -- visible on mobile too, small, opposite corner */}
      <svg
        viewBox="0 0 100 130"
        className="absolute bottom-6 left-3 w-[70px] sm:w-[90px] opacity-[0.10] text-slate-300"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1">
          <rect x="20" y="8" width="60" height="14" />
          {[28, 42, 58, 72].map((x) => <line key={x} x1={x} y1="22" x2={x} y2="110" />)}
        </g>
      </svg>

      {/* Topographic contour lines, brand-orange node dots -- visible on mobile too, bottom-left */}
      <svg
        viewBox="0 0 300 300"
        className="absolute -bottom-16 -left-16 w-[260px] sm:w-[340px] xl:w-[440px] opacity-[0.16] text-sky-400"
      >
        {[40, 65, 90, 115, 140, 165].map((r, i) => (
          <ellipse key={r} cx="150" cy="170" rx={r} ry={r * 0.72} fill="none" stroke="currentColor" strokeWidth="1" opacity={1 - i * 0.1} />
        ))}
        <circle cx="150" cy="170" r="2.6" fill="#FF8A00" opacity="0.9" />
        <circle cx="205" cy="140" r="2.2" fill="#FF8A00" opacity="0.75" />
        <circle cx="95" cy="205" r="2.2" fill="#FF8A00" opacity="0.75" />
      </svg>

      {/* Soil strata bands, very faint, full-width, all breakpoints */}
      <svg className="absolute inset-x-0 bottom-0 w-full h-40 opacity-[0.045]" preserveAspectRatio="none">
        {[0, 1, 2, 3, 4].map((i) => (
          <line key={i} x1="0" y1={i * 34} x2="100%" y2={i * 34 + 10} stroke="#94A3B8" strokeWidth="1" />
        ))}
      </svg>
    </div>
  )
}
