import { useState } from 'react'
import { Gem, Loader2, AlertTriangle } from 'lucide-react'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// Safe axial (compression + uplift) capacity of a pile socketed into rock --
// IRC:78, Appendix-5, Cl 9, Method 1 or Method 2. Added 5 Aug 2026, digitized
// from Raahi's own Method_I_sheet.xlsx / Method_II_sheet.xlsx -- see
// backend/app/services/rock_socket_pile.py's module docstring for exactly
// what's implemented (end bearing + socket shear, compression + uplift) and
// what's deliberately deferred (lateral/moment-in-rock socket-length check).

function RockSocketDiagram({ method }: { method: 'method_1' | 'method_2' }) {
  // Cross-section: GL, rock top, pile socketed into rock, end-bearing arrows
  // at the tip, shear arrows along the socket sides (top 0.3m greyed out --
  // ignored per the code), Ls and COL labelled.
  return (
    <svg viewBox="0 0 240 220" width="240" height="220" className="text-slate-400">
      <line x1="10" y1="30" x2="230" y2="30" stroke="rgb(226 232 240 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      <text x="14" y="25" fontSize="9" fill="currentColor">Ground level</text>
      {/* rock strata (hatched) */}
      <rect x="60" y="70" width="120" height="130" fill="rgb(148 163 184 / 0.1)" stroke="currentColor" strokeWidth="1" />
      <line x1="10" y1="70" x2="230" y2="70" stroke="rgb(167 139 250 / 0.6)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="14" y="65" fontSize="9" fill="rgb(167 139 250)">Rock top</text>
      {/* pile shaft above rock */}
      <rect x="102" y="14" width="36" height="56" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      {/* socket - top 0.3m ignored (grey), rest active (teal) */}
      <rect x="102" y="70" width="36" height="14" fill="rgb(100 116 139 / 0.35)" stroke="currentColor" strokeWidth="1" />
      <rect x="102" y="84" width="36" height="86" fill="rgb(45 212 191 / 0.3)" stroke="rgb(45 212 191)" strokeWidth="1.5" />
      <text x="145" y="80" fontSize="8" fill="currentColor">0.3m ignored</text>
      {/* socket shear arrows along sides */}
      {[100, 125, 150].map((y, i) => (
        <g key={i}>
          <line x1="90" y1={y} x2="100" y2={y} stroke="rgb(45 212 191)" strokeWidth="1.2" markerEnd="url(#rs-arrow)" />
          <line x1="150" y1={y} x2="140" y2={y} stroke="rgb(45 212 191)" strokeWidth="1.2" markerEnd="url(#rs-arrow)" />
        </g>
      ))}
      <text x="120" y="195" textAnchor="middle" fontSize="9" fill="rgb(45 212 191)">Socket shear (Raf)</text>
      {/* end bearing arrows at tip */}
      {[110, 120, 130].map((x, i) => (
        <line key={i} x1={x} y1="182" x2={x} y2="170" stroke="rgb(244 63 94)" strokeWidth="1.2" markerEnd="url(#rs-arrow2)" />
      ))}
      <text x="120" y="196" textAnchor="middle" fontSize="0" />
      <rect x="102" y="170" width="36" height="6" fill="rgb(244 63 94 / 0.3)" stroke="rgb(244 63 94)" strokeWidth="1" />
      <text x="120" y="210" textAnchor="middle" fontSize="9" fill="rgb(244 63 94)">End bearing (Re)</text>
      {/* D label */}
      <line x1="102" y1="8" x2="138" y2="8" stroke="rgb(226 232 240)" strokeWidth="1" markerStart="url(#rs-arrow3)" markerEnd="url(#rs-arrow3)" />
      <text x="120" y="6" textAnchor="middle" fontSize="9" fill="currentColor">D</text>
      {/* Ls label */}
      <line x1="188" y1="70" x2="188" y2="170" stroke="rgb(34 211 238)" strokeWidth="1" markerStart="url(#rs-arrow4)" markerEnd="url(#rs-arrow4)" />
      <text x="196" y="122" fontSize="9" fill="rgb(34 211 238)">Ls</text>
      <defs>
        <marker id="rs-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgb(45 212 191)" /></marker>
        <marker id="rs-arrow2" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0,0 L6,0 L3,6 Z" fill="rgb(244 63 94)" /></marker>
        <marker id="rs-arrow3" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(226 232 240)" /></marker>
        <marker id="rs-arrow4" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(34 211 238)" /></marker>
      </defs>
      <text x="120" y="18" textAnchor="middle" fontSize="0" />
      <text x="16" y="215" fontSize="9" fill="currentColor">{method === 'method_1' ? 'Method 1 (rock UCS based)' : 'Method 2 (SPT-N / Table 6 based)'}</text>
    </svg>
  )
}

export default function RockSocketPile() {
  const [method, setMethod] = useState<'method_1' | 'method_2'>('method_1')

  // Common
  const [dia, setDia] = useState('1200')
  const [socketX, setSocketX] = useState('2')
  const [rockTop, setRockTop] = useState('')
  const [scour, setScour] = useState('0')
  const [cr, setCr] = useState('')
  const [rqd, setRqd] = useState('')

  // Method 1
  const [qc, setQc] = useState('')

  // Method 2
  const [cub, setCub] = useState('')
  const [crushing, setCrushing] = useState('')
  const [nc, setNc] = useState('9')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  function num(v: string): number | undefined {
    if (v === '' || v == null) return undefined
    const n = parseFloat(v)
    return isNaN(n) ? undefined : n
  }

  async function run() {
    setError(''); setResult(null)
    const payload: Record<string, any> = {
      method,
      dia_mm: num(dia), socket_length_x_dia: num(socketX),
      rock_top_depth_m: num(rockTop), scour_depth_m: num(scour),
      cr_percent: num(cr), rqd_percent: num(rqd),
      qc_kgcm2: method === 'method_1' ? num(qc) : undefined,
      cub_mpa: method === 'method_2' ? num(cub) : undefined,
      crushing_strength_mpa: method === 'method_2' ? num(crushing) : undefined,
      nc: method === 'method_2' ? num(nc) : undefined,
    }
    setLoading(true)
    try {
      const r = await api.runRockSocketPile(payload)
      setResult(r)
    } catch (e: any) {
      setError(e.message || 'Calculation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-xl bg-violet-500/12 text-violet-500 flex items-center justify-center"><Gem size={18} /></div>
        <h1 className="font-display text-xl font-semibold text-slate-50">Rock Socket Pile Capacity</h1>
      </div>
      <p className="text-xs text-slate-400 mb-5">
        Safe axial (compression + uplift) capacity of a pile socketed into rock — IRC:78, Appendix-5, Cl 9 — Method 1 or Method 2.
      </p>

      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Method</div>
        <div className="flex gap-2 mb-3">
          <button onClick={() => setMethod('method_1')} className={`px-3 py-1.5 rounded-full text-xs border ${method === 'method_1' ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'text-slate-400 border-white/10'}`}>
            Method 1 (rock UCS)
          </button>
          <button onClick={() => setMethod('method_2')} className={`px-3 py-1.5 rounded-full text-xs border ${method === 'method_2' ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'text-slate-400 border-white/10'}`}>
            Method 2 (SPT-N / Table 6)
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Rule of thumb (per your own workbook): (CR+RQD)/2 &gt; 30% AND RQD &gt; 0 AND rock UCS &gt; 10 MPa → Method 1.
          Poor/fragmented rock, RQD = 0, or weak rock → Method 2.
        </p>
      </div>

      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Pile & Socket Geometry</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Pile diameter (mm)</label>
            <input className="gm-input w-full" value={dia} onChange={(e) => setDia(e.target.value)} placeholder="e.g. 1200" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Socket length (× diameter)</label>
            <input className="gm-input w-full" value={socketX} onChange={(e) => setSocketX(e.target.value)} placeholder="e.g. 2" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Depth of rock strata below GL (m)</label>
            <input className="gm-input w-full" value={rockTop} onChange={(e) => setRockTop(e.target.value)} placeholder="e.g. 2.02" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Scour depth below GL (m, optional)</label>
            <input className="gm-input w-full" value={scour} onChange={(e) => setScour(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Core Recovery, CR (%)</label>
            <input className="gm-input w-full" value={cr} onChange={(e) => setCr(e.target.value)} placeholder="e.g. 60.66" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">RQD (%)</label>
            <input className="gm-input w-full" value={rqd} onChange={(e) => setRqd(e.target.value)} placeholder="e.g. 57.33" /></div>
        </div>
      </div>

      {method === 'method_1' ? (
        <div className="glass p-4 mb-3">
          <div className="text-sm font-medium text-slate-200 mb-2.5">Method 1 — Rock Core Strength</div>
          <div><label className="text-xs text-slate-400 mb-1 block">Average UCS of rock core, qc (kg/cm²)</label>
            <input className="gm-input w-full" value={qc} onChange={(e) => setQc(e.target.value)} placeholder="e.g. 670.65" /></div>
        </div>
      ) : (
        <div className="glass p-4 mb-3">
          <div className="text-sm font-medium text-slate-200 mb-2.5">Method 2 — From IRC:78 Table 6 (rock type + SPT-N)</div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400 mb-1 block">Cub — shear strength below base (MPa)</label>
              <input className="gm-input w-full" value={cub} onChange={(e) => setCub(e.target.value)} placeholder="e.g. 0.7" /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Crushing strength for socket shear (MPa)</label>
              <input className="gm-input w-full" value={crushing} onChange={(e) => setCrushing(e.target.value)} placeholder="e.g. 0.7" /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Nc — bearing capacity factor</label>
              <input className="gm-input w-full" value={nc} onChange={(e) => setNc(e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2.5">
            Look up Cub, crushing strength and Nc from your own copy of IRC:78 Table 6, based on rock type + SPT-N, and enter them manually — the code doesn't give a closed-form formula for these (same as your own workbook, which also treats them as manual inputs).
          </p>
        </div>
      )}

      {error && <div className="text-xs text-rose-400 mb-3">{error}</div>}
      <button onClick={run} disabled={loading} className="gm-btn-primary text-sm flex items-center gap-2">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : 'Calculate'}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="glass p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">{result.method} Result</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-slate-400">Socket length:</span> <span className="text-slate-100">{result.geometry.Ls_m} m</span></div>
              <div><span className="text-slate-400">Pile tip depth below GL:</span> <span className="text-slate-100">{result.geometry.pile_tip_depth_below_GL_m} m</span></div>
              <div><span className="text-slate-400">Pile length below cut-off:</span> <span className="text-slate-100">{result.geometry.pile_length_below_COL_m} m</span></div>
              <div><span className="text-slate-400">Safe End Bearing:</span> <span className="text-slate-100">{result.safe_end_bearing_t} t</span></div>
              <div><span className="text-slate-400">Safe Socket Shear:</span> <span className="text-slate-100">{result.safe_socket_shear_t} t</span></div>
              <div><span className="text-slate-400">Safe Pile Capacity (Compression):</span> <span className="text-violet-400 font-medium">{result.safe_pile_capacity_compression_t} t</span></div>
              <div><span className="text-slate-400">Self weight:</span> <span className="text-slate-100">{result.self_weight_t} t</span></div>
              <div><span className="text-slate-400">Safe Pile Capacity (Uplift):</span> <span className="text-violet-400 font-medium">{result.safe_pile_capacity_uplift_t} t</span></div>
            </div>

            {result.warnings?.map((w: string, i: number) => (
              <div key={i} className="text-[11px] text-amber-500 flex items-start gap-1.5 mt-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{w}</div>
            ))}

            <TheorySection
              title={result.method === 'Method 1' ? 'Rock Socket Pile — Method 1 (Core Strength Based)' : 'Rock Socket Pile — Method 2 (SPT-N / Table 6 Based)'}
              source={result.clause + ' — digitized directly from your own Method_I_sheet.xlsx / Method_II_sheet.xlsx reference workbooks.'}
              confidence="High"
              diagram={<RockSocketDiagram method={method} />}
              steps={
                result.method === 'Method 1' ? [
                  { label: 'qc in MPa', formula: 'qc(MPa) = 0.0980665 × qc(kg/cm²)' },
                  { label: 'Ultimate socket shear strength', formula: 'Cus = min(0.225 × √qc(MPa), 3 MPa)' },
                  { label: 'Ksp (empirical factor)', formula: 'Ksp = 0.3 + 0.01285714286 × [(CR+RQD)/2 − 30]' },
                  { label: 'Depth factor', formula: 'df = min(1 + 0.4 × Ls/D, 1.2)' },
                  { label: 'Safe end bearing', formula: 'Re = min(Ksp × qc × df / 3, 5 MPa) × Ap', note: '/3 = FS in end bearing' },
                  { label: 'Safe socket shear', formula: 'Raf = As × (Ls − 0.3) × Cus / 6', note: '/6 = FS in socket shear, top 0.3m of socket ignored' },
                  { label: 'Safe pile capacity (compression)', formula: 'Qa = Re + Raf' },
                  { label: 'Safe pile capacity (uplift)', formula: '0.7 × Raf + Self-weight (submerged)' },
                ] : [
                  { label: 'Crushing strength (effective)', formula: 'capped at 3 MPa — confined shear capacity of M35 concrete' },
                  { label: 'Safe end bearing', formula: 'Re = min(Cub × Nc / 3, 5 MPa) × Ap', note: '/3 = FS in end bearing, Nc = bearing capacity factor (9 typical)' },
                  { label: 'Safe socket shear', formula: 'Raf = As × (Ls − 0.3) × Crushing strength(eff) / 6', note: '/6 = FS in socket shear, top 0.3m of socket ignored' },
                  { label: 'Safe pile capacity (compression)', formula: 'Qa = Re + Raf' },
                  { label: 'Safe pile capacity (uplift)', formula: '0.7 × Raf + Self-weight (submerged)' },
                ]
              }
              extraNote="Lateral / moment-in-rock socket-length check (a separate part of IRC:78 Appendix-5) is NOT built yet — this tool covers axial compression + uplift only. Ask Raahi's AI helper if you want that added next."
            />
          </div>
        </div>
      )}
    </div>
  )
}
