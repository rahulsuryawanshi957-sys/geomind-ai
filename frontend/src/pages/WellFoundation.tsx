import { useState } from 'react'
import { Waves, Loader2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// Well (caisson) foundation -- IS 3955:1967 + IRC:78-2014 Section VII.
// Added 7 Aug 2026, standard code formulas (no personal reference workbook
// this time -- Raahi confirmed IS 3955 / IRC:78 directly). See
// backend/app/services/calculators.py's well_foundation() docstring for
// exactly what's implemented (grip length, eccentric base pressure, bearing
// check) and what's deliberately deferred (lateral/elastic-theory tilt &
// shift check, steining thickness design, scour depth calculation).

function WellDiagram() {
  // Cross-section: GL/bed level, scour line, well steining (annulus),
  // grip length below scour, base with eccentric pressure triangle.
  return (
    <svg viewBox="0 0 240 220" width="240" height="220" className="text-slate-400">
      <line x1="10" y1="20" x2="230" y2="20" stroke="rgb(226 232 240 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      <text x="14" y="15" fontSize="9" fill="currentColor">Bed level</text>
      {/* scour line */}
      <line x1="10" y1="70" x2="230" y2="70" stroke="rgb(244 63 94 / 0.6)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="150" y="65" fontSize="9" fill="rgb(244 63 94)">Max scour level</text>
      {/* well steining (annulus, hollow) */}
      <rect x="80" y="20" width="14" height="160" fill="rgb(148 163 184 / 0.3)" stroke="currentColor" strokeWidth="1.5" />
      <rect x="146" y="20" width="14" height="160" fill="rgb(148 163 184 / 0.3)" stroke="currentColor" strokeWidth="1.5" />
      <rect x="94" y="20" width="52" height="160" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
      <text x="120" y="100" textAnchor="middle" fontSize="8" fill="currentColor">Steining</text>
      {/* grip length region */}
      <rect x="70" y="70" width="100" height="20" fill="none" />
      <line x1="60" y1="70" x2="60" y2="180" stroke="rgb(45 212 191)" strokeWidth="1" markerStart="url(#wf-arrow)" markerEnd="url(#wf-arrow)" />
      <text x="30" y="128" fontSize="9" fill="rgb(45 212 191)">Grip</text>
      {/* well curb + cutting edge */}
      <polygon points="80,180 160,180 152,196 88,196" fill="rgb(100 116 139 / 0.4)" stroke="currentColor" strokeWidth="1" />
      <text x="120" y="192" textAnchor="middle" fontSize="7" fill="currentColor">Curb</text>
      {/* base pressure triangle (eccentric) */}
      <polygon points="88,198 152,198 152,215 88,206" fill="rgb(167 139 250 / 0.35)" stroke="rgb(167 139 250)" strokeWidth="1" />
      <text x="120" y="220" textAnchor="middle" fontSize="8" fill="rgb(167 139 250)">Eccentric base pressure</text>
      {/* D label */}
      <line x1="80" y1="10" x2="160" y2="10" stroke="rgb(226 232 240)" strokeWidth="1" markerStart="url(#wf-arrow2)" markerEnd="url(#wf-arrow2)" />
      <text x="120" y="8" textAnchor="middle" fontSize="9" fill="currentColor">D (outer)</text>
      <defs>
        <marker id="wf-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(45 212 191)" /></marker>
        <marker id="wf-arrow2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(226 232 240)" /></marker>
      </defs>
    </svg>
  )
}

export default function WellFoundation() {
  const [outerDia, setOuterDia] = useState('8')
  const [steiningThk, setSteiningThk] = useState('1')
  const [foundingDepth, setFoundingDepth] = useState('18')
  const [maxScour, setMaxScour] = useState('12')
  const [steiningUW, setSteiningUW] = useState('2.4')
  const [superLoad, setSuperLoad] = useState('')
  const [moment, setMoment] = useState('0')
  const [plugWeight, setPlugWeight] = useState('0')

  const [showBearing, setShowBearing] = useState(false)
  const [cohesion, setCohesion] = useState('0')
  const [phi, setPhi] = useState('30')
  const [gammaAbove, setGammaAbove] = useState('1.9')
  const [gammaBase, setGammaBase] = useState('2.0')
  const [sg, setSg] = useState('2.67')
  const [moisture, setMoisture] = useState('12')
  const [waterTable, setWaterTable] = useState('0')
  const [fos, setFos] = useState('2.5')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  function num(v: string, fallback = 0): number {
    const n = parseFloat(v)
    return isNaN(n) ? fallback : n
  }

  async function run() {
    setError(''); setResult(null)
    const payload: Record<string, any> = {
      outer_dia_m: num(outerDia), steining_thickness_m: num(steiningThk),
      founding_depth_m: num(foundingDepth), max_scour_depth_m: num(maxScour),
      steining_unit_weight_t_m3: num(steiningUW),
      superstructure_load_t: num(superLoad), moment_at_base_tm: num(moment),
      bottom_plug_weight_t: num(plugWeight),
      fos: num(fos, 2.5),
    }
    // check_bearing tells the backend whether to actually run the bearing capacity
    // check. Without this, the backend used to run it anyway with cohesion=0/phi=0
    // defaults whenever this section was left collapsed, giving a bogus near-zero
    // "safe bearing capacity" and sometimes a false "exceeds capacity" warning.
    // Fixed 8 Aug 2026.
    payload.check_bearing = showBearing
    if (showBearing) {
      Object.assign(payload, {
        cohesion_t_m2: num(cohesion), phi_deg: num(phi),
        gamma_avg_above_t_m3: num(gammaAbove), gamma_at_base_t_m3: num(gammaBase),
        specific_gravity: num(sg, 2.67), moisture_content_pct: num(moisture),
        water_table_depth_m: num(waterTable),
      })
    }
    setLoading(true)
    try {
      const r = await api.runCalculator('well_foundation', payload)
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
        <div className="w-9 h-9 rounded-xl bg-violet-500/12 text-violet-500 flex items-center justify-center"><Waves size={18} /></div>
        <h1 className="font-display text-xl font-semibold text-slate-50">Well Foundation</h1>
      </div>
      <p className="text-xs text-slate-400 mb-5">
        Grip length + eccentric base pressure + bearing capacity check for a circular well (caisson) foundation — IS 3955:1967 + IRC:78-2014, Section VII.
      </p>
      <div className="text-[11px] text-amber-500/90 flex items-start gap-1.5 mb-4 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
        Phase 1 — axial load + moment check only. Lateral stability / tilt & shift (IRC:78 elastic theory) and steining thickness design are NOT covered — get those checked separately.
      </div>

      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Well Geometry</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Outer diameter (m)</label>
            <input className="gm-input w-full" value={outerDia} onChange={(e) => setOuterDia(e.target.value)} placeholder="e.g. 8" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Steining thickness (m)</label>
            <input className="gm-input w-full" value={steiningThk} onChange={(e) => setSteiningThk(e.target.value)} placeholder="e.g. 1" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Founding depth below bed/GL (m)</label>
            <input className="gm-input w-full" value={foundingDepth} onChange={(e) => setFoundingDepth(e.target.value)} placeholder="e.g. 18" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Max scour depth below bed/GL (m)</label>
            <input className="gm-input w-full" value={maxScour} onChange={(e) => setMaxScour(e.target.value)} placeholder="e.g. 12" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Steining unit weight (t/m³)</label>
            <input className="gm-input w-full" value={steiningUW} onChange={(e) => setSteiningUW(e.target.value)} placeholder="e.g. 2.4" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Bottom plug weight (t, optional)</label>
            <input className="gm-input w-full" value={plugWeight} onChange={(e) => setPlugWeight(e.target.value)} /></div>
        </div>
      </div>

      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Loads at Base Level</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Superstructure load (t)</label>
            <input className="gm-input w-full" value={superLoad} onChange={(e) => setSuperLoad(e.target.value)} placeholder="e.g. 2000" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Resultant moment at base (t·m, optional)</label>
            <input className="gm-input w-full" value={moment} onChange={(e) => setMoment(e.target.value)} /></div>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Moment at base = from your own structural analysis (water current, braking, seismic, wind — lever arm to base level). Not derived here.
        </p>
      </div>

      <div className="glass p-4 mb-3">
        <button onClick={() => setShowBearing(!showBearing)} className="text-sm font-medium text-slate-200 flex items-center gap-2">
          Bearing capacity check at founding level (optional) {showBearing ? '▲' : '▼'}
        </button>
        {showBearing && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-slate-500">Soil parameters at founding depth — feeds the same IS:6403 shear engine used by the standalone Bearing Capacity calculator.</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-400 mb-1 block">Cohesion, c (t/m²)</label>
                <input className="gm-input w-full" value={cohesion} onChange={(e) => setCohesion(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Friction angle, φ (°)</label>
                <input className="gm-input w-full" value={phi} onChange={(e) => setPhi(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Bulk density above base (t/m³)</label>
                <input className="gm-input w-full" value={gammaAbove} onChange={(e) => setGammaAbove(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Bulk density at base (t/m³)</label>
                <input className="gm-input w-full" value={gammaBase} onChange={(e) => setGammaBase(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Specific gravity, G</label>
                <input className="gm-input w-full" value={sg} onChange={(e) => setSg(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Moisture content (%)</label>
                <input className="gm-input w-full" value={moisture} onChange={(e) => setMoisture(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Water table depth below GL (m)</label>
                <input className="gm-input w-full" value={waterTable} onChange={(e) => setWaterTable(e.target.value)} /></div>
              <div><label className="text-xs text-slate-400 mb-1 block">Factor of safety</label>
                <input className="gm-input w-full" value={fos} onChange={(e) => setFos(e.target.value)} /></div>
            </div>
          </div>
        )}
        {!showBearing && (
          <p className="text-[11px] text-slate-500 mt-1.5">Leave collapsed to skip — grip length and base pressure will still be checked.</p>
        )}
      </div>

      {error && <div className="text-xs text-rose-400 mb-3">{error}</div>}
      <button onClick={run} disabled={loading} className="gm-btn-primary text-sm flex items-center gap-2">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : 'Calculate'}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          <div className="glass p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">Result</div>

            <div className="mb-4">
              <div className="text-xs text-slate-400 mb-1.5">Grip length</div>
              <div className="flex items-center gap-2 text-sm">
                {result.grip_length.adequate
                  ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                  : <XCircle size={15} className="text-rose-400 shrink-0" />}
                <span className="text-slate-100">{result.grip_length.grip_length_m} m</span>
                <span className="text-slate-500">(min required: {result.grip_length.min_required_m} m)</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div><span className="text-slate-400">Self weight:</span> <span className="text-slate-100">{result.loads.self_weight_t} t</span></div>
              <div><span className="text-slate-400">Total vertical load:</span> <span className="text-slate-100">{result.loads.total_vertical_load_t} t</span></div>
              <div><span className="text-slate-400">Eccentricity:</span> <span className="text-slate-100">{result.base_pressure.eccentricity_m} m</span> <span className="text-slate-500">(kern limit {result.base_pressure.kern_limit_m} m)</span></div>
              <div><span className="text-slate-400">Avg base pressure:</span> <span className="text-slate-100">{result.base_pressure.p_avg_t_m2} t/m²</span></div>
              {result.base_pressure.no_tension ? (
                <>
                  <div><span className="text-slate-400">Max base pressure:</span> <span className="text-violet-400 font-medium">{result.base_pressure.p_max_t_m2} t/m²</span></div>
                  <div><span className="text-slate-400">Min base pressure:</span> <span className="text-slate-100">{result.base_pressure.p_min_t_m2} t/m²</span></div>
                </>
              ) : (
                <div className="col-span-2 text-rose-400">No-tension condition violated — see warning below.</div>
              )}
            </div>

            {result.bearing_check && (
              <div className="mb-4 pt-3 border-t border-white/[0.06]">
                <div className="text-xs text-slate-400 mb-1.5">Bearing capacity at founding level</div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><span className="text-slate-400">Net safe SBC:</span> <span className="text-slate-100">{result.bearing_check.result} t/m²</span></div>
                  <div><span className="text-slate-400">Gross safe SBC:</span> <span className="text-slate-100">{result.bearing_check.safe_gross_bearing_capacity_t_m2} t/m²</span></div>
                </div>
              </div>
            )}

            {result.warnings?.map((w: string, i: number) => (
              <div key={i} className="text-[11px] text-amber-500 flex items-start gap-1.5 mt-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{w}</div>
            ))}

            <TheorySection
              title="Well Foundation — Grip Length & Eccentric Base Pressure"
              source={result.clause}
              confidence="Medium"
              diagram={<WellDiagram />}
              steps={[
                { label: 'Grip length', formula: 'Grip = Founding depth − Max scour depth', note: 'Must be ≥ Max scour depth / 3, per IRC:78' },
                { label: 'Self weight', formula: 'W = (π/4)·(D_outer² − D_inner²) × Founding depth × γ_steining' },
                { label: 'Total vertical load', formula: 'P = Superstructure load + Self weight + Plug weight' },
                { label: 'Eccentricity', formula: 'e = M / P' },
                { label: 'Kern limit (circular section)', formula: 'D/8 — no-tension condition needs e ≤ D/8' },
                { label: 'Base pressure (if e ≤ D/8)', formula: 'p(max,min) = (P/A) × (1 ± 8e/D)' },
                { label: 'Bearing check', formula: 'p_max compared against gross safe SBC (net SBC + γ_avg×D), via the IS:6403 shear engine' },
              ]}
              extraNote="Lateral stability / tilt & shift (IRC:78 elastic theory), steining thickness design, and scour-depth calculation are NOT built yet — this tool covers axial load + moment only. Ask Raahi's AI helper if you want any of these added next."
            />
          </div>
        </div>
      )}
    </div>
  )
}
