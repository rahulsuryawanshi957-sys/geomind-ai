/**
 * Decorative right-column content for the Login page desktop (xl+) layout only --
 * mirrors the reference image's engineering-diagram sidebar (footing sketch, soil
 * classification table, SPT N-value chart, secondary structural sketch). All static,
 * non-interactive, no real data -- purely visual/branding, matching the reference's
 * "geotechnical intelligence" identity. Hidden below `xl` per the brief (mobile
 * background should be much more subtle, not this level of detail).
 */

const SOIL_ROWS = ['Clay', 'Silt', 'Sand', 'Gravel', 'Boulder']

export function FootingDiagramPanel() {
  return (
    <svg viewBox="0 0 260 190" className="w-full max-w-[300px] text-slate-400 opacity-70">
      <g fill="none" stroke="currentColor" strokeWidth="1.1">
        <line x1="130" y1="6" x2="130" y2="46" markerEnd="url(#fd-arrow)" />
        <line x1="112" y1="46" x2="148" y2="46" />
        <rect x="112" y="46" width="36" height="24" />
        <line x1="60" y1="86" x2="200" y2="86" />
        <line x1="60" y1="90" x2="200" y2="90" />
        <line x1="60" y1="70" x2="60" y2="108" />
        <line x1="200" y1="70" x2="200" y2="108" />
        {[70, 90, 110, 130, 150, 170, 190].map((x) => (
          <line key={x} x1={x} y1="90" x2={x - 12} y2="134" strokeWidth="0.7" opacity="0.7" />
        ))}
        <line x1="60" y1="118" x2="60" y2="132" />
        <line x1="200" y1="118" x2="200" y2="132" />
        <line x1="56" y1="125" x2="204" y2="125" strokeWidth="0.8" />
      </g>
      <g fill="currentColor" fontSize="9" fontFamily="ui-monospace, monospace" opacity="0.9">
        <text x="134" y="26">P</text>
        <text x="126" y="102">B</text>
        <text x="205" y="105">Df</text>
        <text x="98" y="148">q_all</text>
      </g>
      <defs>
        <marker id="fd-arrow" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto">
          <path d="M0,0 L6,0 L3,6 Z" fill="currentColor" />
        </marker>
      </defs>
    </svg>
  )
}

export function SoilClassificationPanel() {
  return (
    <div className="w-full max-w-[300px] rounded-xl border border-white/10 bg-[#0B1626]/70 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-2.5 text-center text-[11px] tracking-wide text-slate-300 border-b border-white/10">
        SOIL CLASSIFICATION
      </div>
      <div className="grid grid-cols-[1fr,64px] text-[11px] text-slate-500 px-4 pt-2">
        <span>DESCRIPTION</span>
        <span className="text-right">SYMBOL</span>
      </div>
      <div className="px-4 pb-3 pt-1 divide-y divide-white/[0.06]">
        {SOIL_ROWS.map((label) => (
          <div key={label} className="flex items-center justify-between py-1.5">
            <span className="text-[13px] text-slate-300">{label}</span>
            <span
              className="h-4 w-14 rounded-sm border border-white/10"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, rgba(148,163,184,0.18) 0, rgba(148,163,184,0.18) 2px, transparent 2px, transparent 6px)',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export function SptChartPanel() {
  // Illustrative N-value vs depth trace -- decorative only, not real borehole data.
  const points = [
    [14, 8], [22, 26], [20, 44], [34, 62], [30, 80], [46, 98],
    [40, 116], [56, 134], [66, 152], [72, 170],
  ]
  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ')
  return (
    <div className="w-full max-w-[300px] rounded-xl border border-white/10 bg-[#0B1626]/70 backdrop-blur-sm p-4">
      <div className="text-center text-[11px] tracking-wide text-slate-300 mb-2.5">SPT N-VALUE vs DEPTH</div>
      <svg viewBox="0 0 220 190" className="w-full">
        <text x="80" y="8" fontSize="8" fill="#64748B">N-VALUE</text>
        <text x="4" y="100" fontSize="8" fill="#64748B" transform="rotate(-90 4 100)">DEPTH (m)</text>
        <g stroke="rgba(148,163,184,0.15)" strokeWidth="1">
          {[8, 46, 84, 122, 160].map((y) => <line key={y} x1="16" y1={y} x2="216" y2={y} />)}
          {[16, 56, 96, 136, 176, 216].map((x) => <line key={x} x1={x} y1="8" x2={x} y2="176" />)}
        </g>
        <path d={path} fill="none" stroke="#F97316" strokeWidth="1.4" opacity="0.85" transform="translate(16,8)" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x + 16} cy={y + 8} r="2.3" fill="#F97316" opacity="0.9" />
        ))}
      </svg>
    </div>
  )
}

export function SecondaryDiagramPanel() {
  return (
    <svg viewBox="0 0 200 220" className="w-full max-w-[220px] text-slate-500 opacity-50">
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <rect x="70" y="10" width="16" height="50" />
        <line x1="60" y1="60" x2="140" y2="60" />
        <line x1="55" y1="60" x2="55" y2="150" />
        <line x1="145" y1="60" x2="145" y2="150" />
        <line x1="55" y1="150" x2="145" y2="150" strokeWidth="1.2" />
        {[70, 90, 110, 130].map((x) => <line key={x} x1={x} y1="150" x2={x} y2="180" strokeWidth="0.7" opacity="0.7" />)}
      </g>
      <g fill="currentColor" opacity="0.85">
        <circle cx="72" cy="128" r="1.6" />
        <circle cx="92" cy="140" r="1.6" />
        <circle cx="112" cy="118" r="1.6" />
        <circle cx="128" cy="134" r="1.6" />
        <path d="M72,128 L92,140 L112,118 L128,134" stroke="currentColor" strokeWidth="0.8" fill="none" opacity="0.6" />
      </g>
    </svg>
  )
}
