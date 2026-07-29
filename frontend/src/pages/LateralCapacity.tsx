import { useEffect, useState } from 'react'
import { ArrowLeftRight, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

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
            </div>
          )}
        </div>
      )}
    </div>
  )
}
