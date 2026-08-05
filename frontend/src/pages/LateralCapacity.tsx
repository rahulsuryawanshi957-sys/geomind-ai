import { useEffect, useState } from 'react'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// ---------------------------------------------------------------------------
// Theory diagrams + live Fig.3 chart -- added 5 Aug 2026, same request as the
// Ground Improvement theory panels but for Lateral Pile Capacity. The curve
// data below is a DISPLAY-ONLY mirror of the real digitized/polynomial data
// in backend/app/services/pile_calculator.py (_fig3_factor_clay_ocs /
// _fig3_factor_sand) -- the actual numbers always come from the backend
// result object, this just redraws the same curve so Raahi can see where his
// pile's L1/stiffness point lands on IS:2911's own Fig.3 chart.
// ---------------------------------------------------------------------------

function figFactorClayOcs(x: number, head: 'free' | 'fixed'): number {
  if (head === 'free') {
    return 2.7056 * x ** 6 - 8.9041 * x ** 5 + 10.697 * x ** 4 - 5.5211 * x ** 3 + 1.2093 * x ** 2 - 0.3871 * x + 1.6502
  }
  if (x === 0) return 2.0
  return 2e-5 * x ** 6 - 0.0006 * x ** 5 + 0.0084 * x ** 4 - 0.0554 * x ** 3 + 0.2068 * x ** 2 - 0.4598 * x + 1.982
}

const FIG3_SAND_FREE: [number, number][] = [[0, 1.826], [1.04, 1.826], [2, 1.79], [4, 1.73], [6, 1.70], [8, 1.68], [10, 1.67]]
const FIG3_SAND_FIXED: [number, number][] = [[0, 2.219], [0.79, 2.035], [1.04, 1.98], [2, 1.93], [4, 1.88], [6, 1.85], [8, 1.83], [10, 1.82]]

function figFactorSand(x: number, head: 'free' | 'fixed'): number {
  const pts = head === 'free' ? FIG3_SAND_FREE : FIG3_SAND_FIXED
  if (x <= pts[0][0]) return pts[0][1]
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
    if (x >= x0 && x <= x1) return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
  }
  return pts[pts.length - 1][1]
}

function Fig3Chart({ useClayOcs, currentX, freeFactor, fixedFactor, stiffnessLabel }: {
  useClayOcs: boolean, currentX: number, freeFactor: number, fixedFactor: number, stiffnessLabel: string
}) {
  const maxX = useClayOcs ? 1 : 10
  const N = 40
  const freePts: [number, number][] = []
  const fixedPts: [number, number][] = []
  for (let i = 0; i <= N; i++) {
    const x = (maxX * i) / N
    freePts.push([x, useClayOcs ? figFactorClayOcs(x, 'free') : figFactorSand(x, 'free')])
    fixedPts.push([x, useClayOcs ? figFactorClayOcs(x, 'fixed') : figFactorSand(x, 'fixed')])
  }
  const allY = [...freePts, ...fixedPts].map((p) => p[1])
  const minY = Math.min(...allY) * 0.95
  const maxY = Math.max(...allY) * 1.05

  const W = 280, H = 190, padL = 34, padB = 24, padT = 12, padR = 10
  const sx = (x: number) => padL + (x / maxX) * (W - padL - padR)
  const sy = (y: number) => H - padB - ((y - minY) / (maxY - minY)) * (H - padB - padT)
  const toPath = (pts: [number, number][]) => pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${sx(x).toFixed(1)} ${sy(y).toFixed(1)}`).join(' ')
  const cx = Math.min(Math.max(currentX, 0), maxX)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="text-slate-400">
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke="currentColor" strokeWidth="1" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="currentColor" strokeWidth="1" />
      <path d={toPath(freePts)} fill="none" stroke="rgb(45 212 191)" strokeWidth="1.5" />
      <path d={toPath(fixedPts)} fill="none" stroke="rgb(167 139 250)" strokeWidth="1.5" />
      <line x1={sx(cx)} y1={padT} x2={sx(cx)} y2={H - padB} stroke="rgb(226 232 240 / 0.3)" strokeDasharray="2 2" />
      <circle cx={sx(cx)} cy={sy(freeFactor)} r="3.5" fill="rgb(45 212 191)" stroke="white" strokeWidth="1" />
      <circle cx={sx(cx)} cy={sy(fixedFactor)} r="3.5" fill="rgb(167 139 250)" stroke="white" strokeWidth="1" />
      <text x={padL} y={H - padB + 14} fontSize="9" fill="currentColor">0</text>
      <text x={W - padR} y={H - padB + 14} textAnchor="end" fontSize="9" fill="currentColor">{maxX}</text>
      <text x={(padL + W - padR) / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="currentColor">
        L1 / {stiffnessLabel}  (aapka pile = {currentX.toFixed(2)})
      </text>
      <text x={padL - 6} y={padT + 8} textAnchor="end" fontSize="8" fill="currentColor">{maxY.toFixed(1)}</text>
      <text x={padL - 6} y={H - padB} textAnchor="end" fontSize="8" fill="currentColor">{minY.toFixed(1)}</text>
      <circle cx={W - 78} cy={padT + 4} r="3" fill="rgb(45 212 191)" />
      <text x={W - 71} y={padT + 7} fontSize="8" fill="currentColor">Free head</text>
      <circle cx={W - 78} cy={padT + 16} r="3" fill="rgb(167 139 250)" />
      <text x={W - 71} y={padT + 19} fontSize="8" fill="currentColor">Fixed head</text>
    </svg>
  )
}

function EquivalentCantileverDiagram() {
  // Schematic: pile above/below ground, free length L1, virtual fixity depth Lf,
  // total equivalent cantilever Leq = L1+Lf, deflected shape under load P.
  return (
    <svg viewBox="0 0 230 215" width="230" height="215" className="text-slate-400">
      <line x1="10" y1="65" x2="220" y2="65" stroke="rgb(226 232 240 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      <text x="14" y="60" fontSize="9" fill="currentColor">Ground level</text>
      <rect x="82" y="65" width="26" height="135" fill="rgb(148 163 184 / 0.08)" stroke="currentColor" strokeWidth="1" />
      <rect x="89" y="18" width="12" height="182" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      <line x1="70" y1="18" x2="70" y2="65" stroke="rgb(45 212 191)" strokeWidth="1" markerStart="url(#capA)" markerEnd="url(#capA)" />
      <text x="60" y="45" fontSize="9" fill="rgb(45 212 191)" textAnchor="end">L1</text>
      <line x1="122" y1="65" x2="122" y2="148" stroke="rgb(167 139 250)" strokeWidth="1" strokeDasharray="3 2" markerStart="url(#capB)" markerEnd="url(#capB)" />
      <text x="130" y="110" fontSize="9" fill="rgb(167 139 250)">Lf</text>
      <line x1="95" y1="148" x2="152" y2="148" stroke="rgb(167 139 250 / 0.5)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="122" y="163" fontSize="8" fill="rgb(167 139 250)" textAnchor="middle">virtual fixity point</text>
      <line x1="155" y1="18" x2="155" y2="148" stroke="rgb(34 211 238)" strokeWidth="1" markerStart="url(#capC)" markerEnd="url(#capC)" />
      <text x="163" y="86" fontSize="9" fill="rgb(34 211 238)">Leq = L1+Lf</text>
      <line x1="35" y1="18" x2="87" y2="18" stroke="rgb(244 63 94)" strokeWidth="1.5" markerEnd="url(#capD)" />
      <text x="15" y="15" fontSize="9" fill="rgb(244 63 94)">P</text>
      <path d="M 95 18 Q 100 55 112 118" fill="none" stroke="rgb(244 63 94 / 0.5)" strokeWidth="1" strokeDasharray="2 2" />
      <defs>
        <marker id="capA" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(45 212 191)" /></marker>
        <marker id="capB" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(167 139 250)" /></marker>
        <marker id="capC" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,3 L6,0 L6,6 Z" fill="rgb(34 211 238)" /></marker>
        <marker id="capD" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgb(244 63 94)" /></marker>
      </defs>
      <text x="115" y="211" textAnchor="middle" fontSize="9" fill="currentColor">Equivalent cantilever (pile fixed at depth Lf)</text>
    </svg>
  )
}

export default function LateralCapacity() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [widthMm, setWidthMm] = useState('1000')
  const [embeddedLength, setEmbeddedLength] = useState('12')
  const [freeLength, setFreeLength] = useState('1')
  const [modulus, setModulus] = useState('3000000')
  const [allowDefl, setAllowDefl] = useState('1')
  const [soilTypeOverride, setSoilTypeOverride] = useState('')
  const [consolidationOverride, setConsolidationOverride] = useState('')
  const [cohesionOverride, setCohesionOverride] = useState('')
  const [nValueOverride, setNValueOverride] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  async function run() {
    setError(''); setResult(null)
    if (!selectedBoreholeId) { setError('Pehle ek borehole select karo.'); return }
    setLoading(true)
    try {
      const overrides: Record<string, any> = {}
      if (soilTypeOverride) overrides.soil_type = soilTypeOverride
      if (consolidationOverride) overrides.consolidation_type = consolidationOverride
      if (cohesionOverride) overrides.cohesion_t_m2 = parseFloat(cohesionOverride)
      if (nValueOverride) overrides.n_value = parseFloat(nValueOverride)

      const r = await api.runLateralCapacity({
        borehole_id: selectedBoreholeId,
        width_m: (parseFloat(widthMm) || 1000) / 1000,
        embedded_length_m: parseFloat(embeddedLength) || 12,
        free_length_above_ground_m: parseFloat(freeLength) || 0,
        pile_material_modulus_t_m2: parseFloat(modulus) || 3000000,
        allowable_deflection_pct_dia: parseFloat(allowDefl) || 1,
        overrides,
      })
      setResult(r)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2">
        <ArrowLeftRight size={20} className="text-violet-400" /> Lateral Pile Capacity
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        1%-of-diameter deflection criterion (IS:2911 Part 1/Sec 1:2010, Annex C). Free-head and fixed-head results always shown together -- the code gives no rule for picking one.
      </p>

      {boreholes.length === 0 ? (
        <div className="glass p-8 text-center max-w-md">
          <p className="text-sm text-slate-400 mb-3">Lateral capacity reads soil data from a saved borehole profile. Import lab data first.</p>
          <Link to="/lab-reports" className="gm-btn-primary inline-block">Go to Lab Data Import</Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-[26rem] shrink-0 space-y-4">
            <div className="glass p-5 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Borehole</label>
                <select className="gm-input w-full" value={selectedBoreholeId} onChange={(e) => { setSelectedBoreholeId(e.target.value); setResult(null) }}>
                  <option value="">Select borehole...</option>
                  {boreholes.map((b) => <option key={b.id} value={b.id}>{b.borehole_id} {b.project_name ? `(${b.project_name})` : ''}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Pile width/dia (mm)</label>
                  <input type="number" step="any" className="gm-input w-full" value={widthMm} onChange={(e) => setWidthMm(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Embedded length (m)</label>
                  <input type="number" step="any" className="gm-input w-full" value={embeddedLength} onChange={(e) => setEmbeddedLength(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Free length above ground / scour (m) -- also used to pick the founding soil layer</label>
                <input type="number" step="any" className="gm-input w-full" value={freeLength} onChange={(e) => setFreeLength(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Pile material modulus E (t/m²)</label>
                  <input type="number" step="any" className="gm-input w-full" value={modulus} onChange={(e) => setModulus(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Allowable deflection (% dia)</label>
                  <input type="number" step="any" className="gm-input w-full" value={allowDefl} onChange={(e) => setAllowDefl(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Soil type (blank = auto)</label>
                  <select className="gm-input w-full" value={soilTypeOverride} onChange={(e) => setSoilTypeOverride(e.target.value)}>
                    <option value="">Auto (from layer)</option>
                    <option value="cohesive">Cohesive (clay/silt)</option>
                    <option value="cohesionless">Cohesionless (sand)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Consolidation (clay only)</label>
                  <select className="gm-input w-full" value={consolidationOverride} onChange={(e) => setConsolidationOverride(e.target.value)}>
                    <option value="">NCS (default)</option>
                    <option value="NCS">NCS -- normally consolidated</option>
                    <option value="OCS">OCS -- preloaded</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Cohesion override (t/m²)</label>
                  <input type="number" step="any" className="gm-input w-full" value={cohesionOverride} onChange={(e) => setCohesionOverride(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">SPT N-value override</label>
                  <input type="number" step="any" className="gm-input w-full" value={nValueOverride} onChange={(e) => setNValueOverride(e.target.value)} />
                </div>
              </div>

              <button onClick={run} disabled={loading} className="gm-btn-primary w-full mt-2 flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={14} className="animate-spin" /> Running...</> : 'Run'}
              </button>
            </div>
            {error && <div className="text-sm text-rose-400">{error}</div>}
          </div>

          {result && (
            <div className="flex-1 min-w-0 space-y-4">
              <div className="glass p-5">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Pile behaviour</div>
                <div className="text-lg font-display font-semibold text-slate-50">{result.pile_behaviour}</div>
                <div className="text-xs text-slate-400 mt-1">
                  Founding layer: {result.founding_layer} · {result.soil_type === 'cohesive' ? `Cohesive (${result.consolidation_type})` : 'Cohesionless (sand)'} · Stiffness factor {result.stiffness_factor_label} = {result.stiffness_factor_m} m
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Short pile if L ≤ {result.short_pile_if_L_le_m} m · Long pile if L ≥ {result.long_pile_if_L_ge_m} m
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="glass p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Free head</div>
                  <div className="text-2xl font-display font-semibold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                    {result.free_head?.safe_lateral_load_t} <span className="text-sm text-slate-400">t</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Chart factor {result.free_head?.chart_factor} · Leq {result.free_head?.equivalent_cantilever_length_m} m</div>
                </div>
                <div className="glass p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Fixed head</div>
                  <div className="text-2xl font-display font-semibold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                    {result.fixed_head?.safe_lateral_load_t} <span className="text-sm text-slate-400">t</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Chart factor {result.fixed_head?.chart_factor} · Leq {result.fixed_head?.equivalent_cantilever_length_m} m</div>
                </div>
              </div>

              {result.warnings?.length > 0 && (
                <div className="glass p-5">
                  <div className="text-xs uppercase tracking-wide text-amber-500/80 mb-1">Warnings</div>
                  <ul className="text-xs text-amber-400/90 list-disc list-inside space-y-0.5">
                    {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="glass p-5">
                <TheorySection
                  title="Lateral Pile Capacity — 1%-of-Diameter Deflection Criterion"
                  source="IS:2911 Part 1/Sec 1:2010, Annex C (equivalent-cantilever approach), Table 3/4 (nh, k1), Fig.3 (chart factor). NOT Broms' ultimate lateral capacity method."
                  confidence={result.soil_type === 'cohesive' && result.consolidation_type === 'OCS' ? 'High' : 'Medium'}
                  diagram={<EquivalentCantileverDiagram />}
                  steps={[
                    result.soil_type === 'cohesive' && result.consolidation_type === 'OCS'
                      ? { label: 'Modulus of subgrade reaction K (OCS clay, constant with depth)', formula: 'k1 from Table 4 (via qu=2c)  →  K = k1 × 0.3 / (1.5 × D)', note: 'IS:2911 Table 4' }
                      : { label: `Modulus of horizontal subgrade reaction nh (${result.soil_type === 'cohesionless' ? 'sand' : 'NCS clay, uses sand formula'})`, formula: 'nh from Table 3, interpolated by SPT N-value', note: 'IS:2911 Table 3' },
                    { label: `Stiffness factor (${result.stiffness_factor_label})`, formula: result.stiffness_factor_label === 'R' ? 'R = (EI / (K×D))^0.25' : 'T = (EI / nh)^0.2' },
                    { label: 'Pile behaviour classification', formula: result.stiffness_factor_label === 'R' ? 'Short: L≤2R · Long: L≥3.5R' : 'Short: L≤2T · Long: L≥4T', note: 'IS:2911 Table 5' },
                    { label: 'Ratio plotted on Fig.3 chart', formula: `x = L1 / ${result.stiffness_factor_label} = ${result.L1_over_stiffness}` },
                    { label: 'Chart factor (Lf/stiffness) read off Fig.3', formula: `Free head = ${result.free_head?.chart_factor}  ·  Fixed head = ${result.fixed_head?.chart_factor}`, note: 'graph niche dekho' },
                    { label: 'Equivalent cantilever length', formula: 'Leq = L1 + Lf' },
                    { label: 'Safe lateral load (at allowable deflection)', formula: 'Q = [0.5 × k × E × I / Leq³] × (allow. deflection / 0.5)', note: 'k = 3 for free head, 12 for fixed head' },
                  ]}
                  extraNote={
                    result.soil_type === 'cohesionless'
                      ? "Sand-side Fig.3 chart factor is a piecewise-linear digitization anchored at 3 real points from Raahi's own reference workbook — not an exact polynomial like the clay side. Verify against a known sand case before trusting fully."
                      : "IS:2911 gives no rule for choosing free-head vs fixed-head — that's a pile-cap connection detail, not a soil property. Pick whichever matches your actual structure."
                  }
                />
                <div className="mt-4 flex justify-center">
                  <Fig3Chart
                    useClayOcs={result.soil_type === 'cohesive' && result.consolidation_type === 'OCS'}
                    currentX={result.L1_over_stiffness}
                    freeFactor={result.free_head?.chart_factor}
                    fixedFactor={result.fixed_head?.chart_factor}
                    stiffnessLabel={result.stiffness_factor_label}
                  />
                </div>
                <p className="text-[10px] text-slate-500 text-center mt-1">
                  IS:2911 Fig.3 curve ({result.soil_type === 'cohesive' && result.consolidation_type === 'OCS' ? 'preloaded clay' : 'sand / NCS clay'}) — dots dikhate hain tumhara pile is curve pe kahaan aata hai.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
