/**
 * Purely decorative engineering-blueprint backdrop for the Login page.
 * SVG line-art only, no interactivity, aria-hidden, pointer-events-none --
 * safe to sit behind the login form at any viewport without affecting
 * layout, tab order, or hit-testing.
 *
 * NOTE on the top-left corner motif: the reference image used a real photograph
 * (elevated highway/flyover bridge at dusk). This sandbox has no network access to
 * source/license an actual photo, so this is an ILLUSTRATED line-art substitute
 * (bridge deck + piers + a hillside curve) in the same blueprint style as the rest
 * of the page, not a photo. If Raahi wants the literal photo look, that needs an
 * actual image asset dropped into `frontend/public/` and referenced here -- flag
 * this back if so.
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

      {/* Illustrated bridge/hillside silhouette -- top-left, desktop only. See file-level
          note above: substitute for the reference's photo, in matching line-art style. */}
      <svg
        viewBox="0 0 520 420"
        preserveAspectRatio="xMinYMin slice"
        className="hidden lg:block absolute -top-6 -left-10 w-[46vw] max-w-[620px] h-[380px] opacity-[0.16] text-slate-300"
      >
        {/* hillside */}
        <path d="M0,300 C90,250 150,340 230,290 C300,250 340,300 420,270 C470,250 500,260 520,240 L520,420 L0,420 Z"
          fill="currentColor" opacity="0.35" />
        {/* flyover bridge deck + piers, simple line art */}
        <g fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M-20,150 C120,90 260,70 460,20" />
          <path d="M-20,162 C120,102 260,82 460,32" />
          {[40, 120, 200, 280, 360].map((x, i) => {
            const y = 150 - i * 20
            return <line key={x} x1={x} y1={y + 8} x2={x - 6} y2={y + 90} strokeWidth="1.1" opacity="0.8" />
          })}
        </g>
      </svg>

      {/* Topographic contour lines -- bottom-left, brand-orange node dots */}
      <svg
        viewBox="0 0 300 300"
        className="hidden md:block absolute -bottom-16 -left-16 w-[380px] xl:w-[460px] opacity-[0.20] text-sky-400"
      >
        {[40, 65, 90, 115, 140, 165].map((r, i) => (
          <ellipse
            key={r}
            cx="150"
            cy="170"
            rx={r}
            ry={r * 0.72}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity={1 - i * 0.1}
          />
        ))}
        <circle cx="150" cy="170" r="2.6" fill="#F97316" opacity="0.95" />
        <circle cx="205" cy="140" r="2.2" fill="#F97316" opacity="0.8" />
        <circle cx="95" cy="205" r="2.2" fill="#F97316" opacity="0.8" />
        <circle cx="230" cy="200" r="1.8" fill="#F97316" opacity="0.6" />
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
