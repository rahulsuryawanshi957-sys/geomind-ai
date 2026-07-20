import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Mountain, Printer } from 'lucide-react'
import { api } from '../../api/client'

// Same convention as the Borehole Log page's symbol library, kept local here
// since this page only needs colors/patterns (not the full log editor).
function classificationToStyle(classification?: string | null, weatheringGrade?: string | null): { color: string; pattern: string } {
  const c = (classification || '').toUpperCase()
  if (weatheringGrade) {
    const g = weatheringGrade.toUpperCase()
    if (g.includes('I') && !g.includes('II')) return { color: '#D8D8D8', pattern: 'repeating-linear-gradient(45deg, #333 0, #333 1.5px, transparent 1.5px, transparent 6px), repeating-linear-gradient(-45deg, #333 0, #333 1.5px, transparent 1.5px, transparent 6px)' }
    if (g.includes('II')) return { color: '#E0E0E0', pattern: 'repeating-linear-gradient(45deg, #555 0, #555 1.2px, transparent 1.2px, transparent 8px)' }
    if (g.includes('III')) return { color: '#E6E0D2', pattern: 'radial-gradient(circle, #6B5B45 1.5px, transparent 2px)' }
    if (g.includes('IV')) return { color: '#EAE3D3', pattern: 'repeating-linear-gradient(90deg, #7A7A7A 0, #7A7A7A 1px, transparent 1px, transparent 10px), repeating-linear-gradient(0deg, #7A7A7A 0, #7A7A7A 1px, transparent 1px, transparent 10px)' }
    return { color: '#E2D8C3', pattern: 'radial-gradient(circle, #9C8B6E 1px, transparent 1.5px)' }
  }
  if (c.startsWith('G')) return { color: '#F0E2C4', pattern: 'radial-gradient(circle, transparent 2.5px, #7A4E1E 2.5px, #7A4E1E 3.2px, transparent 3.2px)' }
  if (c.startsWith('S')) return { color: '#F3EBCB', pattern: 'radial-gradient(circle, #8A6D1E 1.3px, transparent 1.6px)' }
  if (c === 'ML' || c === 'CL' || c === 'OL') return { color: '#EFEAE0', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1.2px, transparent 1.2px, transparent 9px)' }
  if (c === 'MI' || c === 'CI' || c === 'OI') return { color: '#EDE7D8', pattern: 'repeating-linear-gradient(0deg, #333 0, #333 1.6px, transparent 1.6px, transparent 6.5px)' }
  if (c === 'MH' || c === 'CH' || c === 'OH') return { color: '#EDE7D8', pattern: 'repeating-linear-gradient(0deg, #333 0, #333 2px, transparent 2px, transparent 4.5px)' }
  if (c === 'PT') return { color: '#DDD7B8', pattern: 'repeating-linear-gradient(90deg, #5C4A2E 0, #5C4A2E 1.5px, transparent 1.5px, transparent 7px)' }
  return { color: '#C9C4B8', pattern: 'radial-gradient(circle at 30% 40%, #8B8680 2px, transparent 2.5px)' } // fill / unclassified
}

export default function SoilProfile() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [hoveredLayer, setHoveredLayer] = useState<{ boreholeId: string; layer: any } | null>(null)
  const [pxPerMeter, setPxPerMeter] = useState(28)

  useEffect(() => {
    api.listBoreholes().then((bhs) => {
      setBoreholes(bhs)
      setSelectedIds(bhs.slice(0, 4).map((b: any) => b.id))
    }).catch(() => {})
  }, [])

  const selected = boreholes.filter((b) => selectedIds.includes(b.id))
  const maxDepth = Math.max(1, ...selected.flatMap((b) => b.layers.map((l: any) => l.to_m)))

  function toggle(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id])
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-50 flex items-center gap-2">
            <Mountain size={20} className="text-violet-400" /> Soil Profile Viewer
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Built directly from your Lab Data Import — no re-entry needed. Compare boreholes side by side.
          </p>
        </div>
        <button onClick={() => window.print()} className="gm-btn-secondary flex items-center gap-2 text-sm">
          <Printer size={14} /> Print
        </button>
      </div>

      {boreholes.length === 0 ? (
        <div className="glass p-8 text-center text-sm text-slate-500">
          No borehole profiles yet. Go to <span className="text-violet-400">Lab Data Import</span> and upload a sheet first —
          this page reads directly from there.
        </div>
      ) : (
        <>
          <div className="glass p-4 mb-5 print:hidden">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Boreholes to compare</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {boreholes.map((b) => (
                <button
                  key={b.id}
                  onClick={() => toggle(b.id)}
                  className={`px-3 py-1.5 rounded-full text-xs border ${selectedIds.includes(b.id) ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'text-slate-400 border-white/10'}`}
                >
                  {b.borehole_id}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Zoom</label>
              <input type="range" min={12} max={60} value={pxPerMeter} onChange={(e) => setPxPerMeter(parseInt(e.target.value))} className="flex-1 max-w-xs" />
            </div>
          </div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 overflow-x-auto">
            <div className="flex gap-6" style={{ minHeight: `${maxDepth * pxPerMeter + 40}px` }}>
              {/* Depth scale */}
              <div className="w-12 shrink-0 relative" style={{ height: `${maxDepth * pxPerMeter}px` }}>
                {Array.from({ length: Math.ceil(maxDepth) + 1 }, (_, i) => i).map((m) => (
                  <div key={m} className="absolute left-0 right-0 flex items-center justify-end pr-1.5 border-t border-white/5" style={{ top: `${m * pxPerMeter}px` }}>
                    <span className="text-[10px] text-slate-500">{m}m</span>
                  </div>
                ))}
              </div>

              {selected.map((bh) => (
                <div key={bh.id} className="shrink-0 w-32">
                  <div className="text-xs font-medium text-slate-200 mb-1 text-center truncate">{bh.borehole_id}</div>
                  <div className="relative border border-white/10 rounded" style={{ height: `${maxDepth * pxPerMeter}px` }}>
                    {bh.layers.map((l: any) => {
                      const style = classificationToStyle(l.classification, l.weathering_grade)
                      return (
                        <div
                          key={l.id}
                          className="absolute left-0 right-0 border-b border-white/20 cursor-pointer hover:brightness-110 transition-all"
                          style={{ top: `${l.from_m * pxPerMeter}px`, height: `${(l.to_m - l.from_m) * pxPerMeter}px`, background: style.color, backgroundImage: style.pattern }}
                          onMouseEnter={() => setHoveredLayer({ boreholeId: bh.borehole_id, layer: l })}
                          onMouseLeave={() => setHoveredLayer(null)}
                        />
                      )
                    })}
                    {bh.water_table_depth_m != null && (
                      <div className="absolute left-0 right-0 border-t-2 border-dashed border-cyan-400 z-10" style={{ top: `${bh.water_table_depth_m * pxPerMeter}px` }}>
                        <span className="text-[8px] bg-cyan-500 text-navy-950 px-1 rounded">GWL</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {hoveredLayer && (
              <div className="mt-4 pt-4 border-t border-white/10 text-xs text-slate-300">
                <span className="text-violet-400 font-medium">{hoveredLayer.boreholeId}</span>
                {' · '}{hoveredLayer.layer.from_m}–{hoveredLayer.layer.to_m}m
                {hoveredLayer.layer.description && ` · ${hoveredLayer.layer.description}`}
                {hoveredLayer.layer.classification && ` · Class: ${hoveredLayer.layer.classification}`}
                {hoveredLayer.layer.weathering_grade && ` · ${hoveredLayer.layer.weathering_grade}`}
                {hoveredLayer.layer.n_value != null && ` · N=${hoveredLayer.layer.n_value}`}
                {hoveredLayer.layer.cohesion_t_m2 != null && ` · C=${hoveredLayer.layer.cohesion_t_m2} t/m²`}
                {hoveredLayer.layer.friction_angle_deg != null && ` · φ=${hoveredLayer.layer.friction_angle_deg}°`}
                {hoveredLayer.layer.ucs_kg_cm2 != null && ` · UCS=${hoveredLayer.layer.ucs_kg_cm2} kg/cm²`}
                {hoveredLayer.layer.rqd_pct != null && ` · RQD=${hoveredLayer.layer.rqd_pct}%`}
              </div>
            )}
            {!hoveredLayer && <div className="mt-4 pt-4 border-t border-white/10 text-xs text-slate-500">Hover over a layer to see its properties.</div>}
          </motion.div>
        </>
      )}
    </div>
  )
}
