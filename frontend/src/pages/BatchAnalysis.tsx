import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, Layers3, Target, Printer, Loader2, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

function parseNumberList(input: string): number[] {
  return input
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n > 0)
}

// Optional manual pins. Any field left blank is auto-sourced by the backend
// (founding layer -> nearest neighbour -> borehole average). Anything filled
// here overrides that auto-sourcing for every combination in the batch.
const OVERRIDE_FIELDS: { key: string; label: string }[] = [
  { key: 'cohesion_t_m2', label: 'Cohesion c (t/m²)' },
  { key: 'friction_angle_deg', label: 'Friction angle φ (°)' },
  { key: 'bulk_density_t_m3', label: 'Bulk density γ (t/m³)' },
  { key: 'gamma_avg_above_t_m3', label: 'Overburden density (blank = auto weighted-avg)' },
  { key: 'specific_gravity', label: 'Specific gravity G' },
  { key: 'moisture_content_pct', label: 'Moisture content (%)' },
  { key: 'n_value', label: 'SPT N-value' },
  { key: 'compression_index_cc', label: 'Compression index Cc' },
  { key: 'initial_void_ratio_e0', label: 'Initial void ratio e0' },
  { key: 'elastic_modulus_t_m2', label: 'Elastic modulus Es (t/m²)' },
]

export default function BatchAnalysis() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [widthsInput, setWidthsInput] = useState('1.5, 2, 2.5, 3')
  const [depthsInput, setDepthsInput] = useState('1.5, 2, 2.5')
  const [lengthOverride, setLengthOverride] = useState('')
  const [shape, setShape] = useState('square')
  const [fos, setFos] = useState('2.5')
  const [allowableSettlement, setAllowableSettlement] = useState('25')
  const [consolidationType, setConsolidationType] = useState('NCS')
  const [rigidityFactor, setRigidityFactor] = useState('1')
  const [soilTypeForce, setSoilTypeForce] = useState('') // '' = auto per depth
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [showOverrides, setShowOverrides] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  const selectedBorehole = boreholes.find((b) => b.id === selectedBoreholeId)
  const widths = parseNumberList(widthsInput)
  const depths = parseNumberList(depthsInput)
  const comboCount = widths.length * depths.length
  const activeOverrideCount = Object.values(overrides).filter((v) => v !== '' && v != null).length + (soilTypeForce ? 1 : 0)

  function setOv(key: string, val: string) {
    setOverrides((prev) => ({ ...prev, [key]: val }))
  }

  function buildOverridesPayload() {
    const out: Record<string, any> = {}
    for (const { key } of OVERRIDE_FIELDS) {
      const v = overrides[key]
      if (v !== '' && v != null && !isNaN(parseFloat(v))) out[key] = parseFloat(v)
    }
    if (soilTypeForce) out.soil_type = soilTypeForce
    return out
  }

  async function runBatch() {
    setError(''); setResult(null); setProgress(0)
    if (!selectedBoreholeId) { setError('Pehle ek borehole select karo.'); return }
    if (widths.length === 0 || depths.length === 0) { setError('Kam se kam ek width aur ek depth value do.'); return }
    if (comboCount > 400) { setError(`${comboCount} combinations bahut zyada hain (max 400 ek saath) — width/depth list chhoti karo.`); return }

    setLoading(true)
    const allCombos: any[] = []
    let meta: any = null
    try {
      // Chunked by width: one backend call per width (covering all depths for
      // that width). This is what makes the progress bar real -- it advances
      // once per completed chunk, not a fake/simulated animation.
      const overridesPayload = buildOverridesPayload()
      for (let i = 0; i < widths.length; i++) {
        setProgressLabel(`Width ${i + 1} of ${widths.length} (${widths[i]}m) — ${allCombos.length}/${comboCount} done`)
        const r = await api.runBatch({
          borehole_id: selectedBoreholeId,
          widths_m: [widths[i]],
          depths_m: depths,
          length_m: lengthOverride ? parseFloat(lengthOverride) : null,
          shape,
          fos: parseFloat(fos) || 2.5,
          allowable_settlement_mm: parseFloat(allowableSettlement) || 25,
          consolidation_type: consolidationType,
          rigidity_factor: parseFloat(rigidityFactor) || 1,
          overrides: overridesPayload,
        } as any)
        allCombos.push(...r.combinations)
        meta = r
        setProgress(Math.round(((i + 1) / widths.length) * 100))
      }

      const valid = allCombos.filter((c) => !c.error)
      const critical = valid.length > 0
        ? valid.reduce((min, c) => (c.recommended_sbc < min.recommended_sbc ? c : min), valid[0])
        : null

      setResult({
        ...meta,
        combinations: allCombos,
        total: allCombos.length,
        successful: valid.length,
        critical_combination: critical,
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
      setProgress(0)
      setProgressLabel('')
    }
  }

  return (
    <div className="p-6 md:p-8">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2">
        <LayoutGrid size={20} className="text-violet-400" /> Batch Analysis
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        Shear (IS:6403) + settlement (IS:8009) SBC for every footing width × depth combination at once. Each depth auto-picks its founding layer from the borehole — no manual layer selection needed.
      </p>

      {boreholes.length === 0 ? (
        <div className="glass p-8 text-center max-w-md">
          <p className="text-sm text-slate-400 mb-3">Batch analysis reads soil data from a saved borehole profile. Import lab data first.</p>
          <Link to="/lab-reports" className="gm-btn-primary inline-block">Go to Lab Data Import</Link>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-[26rem] shrink-0 space-y-4">
            <div className="glass p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5"><Layers3 size={13} /> Borehole</div>
              <select
                className="gm-input w-full"
                value={selectedBoreholeId}
                onChange={(e) => { setSelectedBoreholeId(e.target.value); setResult(null) }}
              >
                <option value="">Select borehole...</option>
                {boreholes.map((b) => <option key={b.id} value={b.id}>{b.borehole_id} {b.project_name ? `(${b.project_name})` : ''}</option>)}
              </select>

              {selectedBorehole && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[11px] text-slate-500 mb-1">Layers in this borehole (auto-picked by depth — for reference):</p>
                  {selectedBorehole.layers.map((l: any) => (
                    <div key={l.id} className="text-xs text-slate-400 flex justify-between gap-2">
                      <span>{l.from_m}–{l.to_m}m {l.classification ? `(${l.classification})` : ''}</span>
                      <span className="text-slate-500">
                        {l.cohesion_t_m2 == null && l.n_value != null ? 'SPT only' : l.cohesion_t_m2 == null ? 'partial' : 'full'}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500">Water table: {selectedBorehole.water_table_depth_m ?? '—'} m</p>
                </div>
              )}
            </div>

            <div className="glass p-5 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Footing widths B (m) — comma-separated</label>
                <input className="gm-input w-full" value={widthsInput} onChange={(e) => setWidthsInput(e.target.value)} placeholder="e.g. 1.5, 2, 2.5, 3" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Foundation depths D (m) — comma-separated</label>
                <input className="gm-input w-full" value={depthsInput} onChange={(e) => setDepthsInput(e.target.value)} placeholder="e.g. 1.5, 2, 2.5" />
              </div>
              <p className="text-[11px] text-slate-500">
                {comboCount > 0 ? `${widths.length} widths × ${depths.length} depths = ${comboCount} combination${comboCount !== 1 ? 's' : ''}` : 'Enter at least one width and one depth.'} (max 400 at once)
              </p>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Footing length L (blank = square, L=B)</label>
                <input type="number" step="any" className="gm-input w-full" value={lengthOverride} onChange={(e) => setLengthOverride(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Footing shape</label>
                <select className="gm-input w-full" value={shape} onChange={(e) => setShape(e.target.value)}>
                  {['square', 'rectangular', 'strip', 'circular'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Factor of safety</label>
                  <input type="number" step="any" className="gm-input w-full" value={fos} onChange={(e) => setFos(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Allowable settlement (mm)</label>
                  <input type="number" step="any" className="gm-input w-full" value={allowableSettlement} onChange={(e) => setAllowableSettlement(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Consolidation type</label>
                  <select className="gm-input w-full" value={consolidationType} onChange={(e) => setConsolidationType(e.target.value)}>
                    <option value="NCS">NCS</option>
                    <option value="OCS">OCS</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Rigidity factor</label>
                  <input type="number" step="any" className="gm-input w-full" value={rigidityFactor} onChange={(e) => setRigidityFactor(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Soil type per combination</label>
                <select className="gm-input w-full" value={soilTypeForce} onChange={(e) => setSoilTypeForce(e.target.value)}>
                  <option value="">Auto (per founding layer)</option>
                  <option value="cohesive">Force: Clay (Cc/e0-based) for all</option>
                  <option value="noncohesive">Force: Granular (N-based) for all</option>
                </select>
              </div>

              <button onClick={runBatch} disabled={loading} className="gm-btn-primary w-full mt-2 flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={14} className="animate-spin" /> {progress}%</> : `Run Batch (${comboCount || 0})`}
              </button>

              {loading && (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">{progressLabel}</p>
                </div>
              )}
            </div>

            <div className="glass p-4">
              <button onClick={() => setShowOverrides((s) => !s)} className="w-full flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5"><SlidersHorizontal size={13} /> Manual overrides {activeOverrideCount > 0 ? `(${activeOverrideCount} active)` : '(optional)'}</span>
                {showOverrides ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showOverrides && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-2">
                  <p className="text-[11px] text-slate-500 mb-1">Blank = auto-sourced from the borehole (founding layer, then nearest neighbours, then borehole average). Filled = pinned for every combination.</p>
                  {OVERRIDE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-[11px] text-slate-500 mb-0.5 block">{f.label}</label>
                      <input
                        type="number" step="any" className="gm-input w-full text-xs py-1.5"
                        value={overrides[f.key] || ''}
                        onChange={(e) => setOv(f.key, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error && <div className="text-sm text-rose-400">{error}</div>}
          </div>

          {result && (
            <div className="flex-1 min-w-0 space-y-4">
              {result.critical_combination && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1.5"><Target size={13} /> Critical combination (lowest recommended SBC)</div>
                  <div className="text-2xl font-display font-semibold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                    {result.critical_combination.recommended_sbc} <span className="text-sm text-slate-400">{result.unit} net</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Gross: {result.critical_combination.gross_recommended_sbc} {result.unit}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    B = {result.critical_combination.width_m}m, D = {result.critical_combination.depth_m}m ({result.critical_combination.founding_layer}) — governed by {result.critical_combination.governing}
                  </div>
                </motion.div>
              )}

              <div className="glass p-5 print:text-black" id="batch-result">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {result.successful}/{result.total} combinations · {result.borehole_id}
                  </div>
                  <button onClick={() => window.print()} className="gm-btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap print:hidden">
                    <Printer size={13} /> Print
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-slate-400">
                        <th className="text-left py-2 pr-3">B (m)</th>
                        <th className="text-left py-2 pr-3">D (m)</th>
                        <th className="text-left py-2 pr-3">Founding layer</th>
                        <th className="text-left py-2 pr-3">Soil type</th>
                        <th className="text-left py-2 pr-3">Shear SBC</th>
                        <th className="text-left py-2 pr-3">Settlement SBC</th>
                        <th className="text-left py-2 pr-3">Recommended (net)</th>
                        <th className="text-left py-2 pr-3">Recommended (gross)</th>
                        <th className="text-left py-2">Governing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.combinations.map((c: any, i: number) => {
                        const isCritical = result.critical_combination && c.width_m === result.critical_combination.width_m && c.depth_m === result.critical_combination.depth_m && !c.error
                        return (
                          <tr key={i} className={`border-b border-white/[0.04] ${isCritical ? 'bg-violet-500/10' : ''}`}>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.width_m}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.depth_m}</td>
                            <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{c.founding_layer ?? '—'}</td>
                            {c.error ? (
                              <td colSpan={6} className="py-1.5 text-rose-400">{c.error}</td>
                            ) : (
                              <>
                                <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{c.soil_type === 'cohesive' ? 'Clay' : 'Granular'}</td>
                                <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.shear_sbc}</td>
                                <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.settlement_sbc}</td>
                                <td className="py-1.5 pr-3 text-slate-50 font-medium whitespace-nowrap">{c.recommended_sbc}</td>
                                <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.gross_recommended_sbc}</td>
                                <td className="py-1.5 text-slate-400 whitespace-nowrap">{c.governing.includes('shear') ? 'Shear' : 'Settlement'}</td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {result.warnings?.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.06]">
                    <div className="text-xs uppercase tracking-wide text-amber-500/80 mb-1">Warnings</div>
                    <ul className="text-xs text-amber-400/90 list-disc list-inside space-y-0.5">
                      {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
