import { useEffect, useState, Fragment } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, Layers3, Target, Printer, FileDown, Loader2, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// Settlement stress-diagram / influence-zone explainer -- added 5 Aug 2026,
// same request pattern as the other calculators. Mirrors the actual logic
// in calculators.py's run_settlement_multilayer(): the influence zone
// (depth range the settlement sum is taken over) defaults to
// Df + 1.5*B below ground, and within it, the applied surface pressure is
// reduced with depth using a Boussinesq-type stress-influence factor Iz
// (rectangular loaded area, exact closed-form -- see the `_iz` function),
// which is what actually shapes the classic "pressure bulb" under a footing.

function SettlementInfluenceDiagram() {
  return (
    <svg viewBox="0 0 260 210" width="260" height="210" className="text-slate-400">
      <line x1="10" y1="45" x2="250" y2="45" stroke="rgb(226 232 240 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      <text x="14" y="40" fontSize="9" fill="currentColor">GL</text>
      {/* footing */}
      <rect x="95" y="30" width="70" height="15" fill="rgb(148 163 184 / 0.3)" stroke="currentColor" strokeWidth="1.5" />
      <text x="130" y="27" textAnchor="middle" fontSize="9" fill="currentColor">B (footing width)</text>
      {/* pressure bulb (isobar-style outline, narrowing with depth) */}
      <path d="M 95 45 Q 40 100 75 175 Q 130 195 185 175 Q 220 100 165 45 Z"
        fill="rgb(45 212 191 / 0.1)" stroke="rgb(45 212 191 / 0.6)" strokeWidth="1" strokeDasharray="2 2" />
      <path d="M 108 45 Q 85 90 105 155 Q 130 168 155 155 Q 175 90 152 45 Z"
        fill="rgb(45 212 191 / 0.18)" stroke="rgb(45 212 191)" strokeWidth="1" />
      {/* influence zone boundary */}
      <line x1="15" y1="175" x2="245" y2="175" stroke="rgb(244 63 94 / 0.6)" strokeWidth="1" strokeDasharray="3 2" />
      <text x="130" y="188" textAnchor="middle" fontSize="9" fill="rgb(244 63 94)">Influence zone limit = Df + 1.5×B</text>
      {/* z arrow */}
      <line x1="30" y1="45" x2="30" y2="150" stroke="rgb(34 211 238)" strokeWidth="1" markerEnd="url(#se-arrow)" />
      <text x="22" y="100" fontSize="9" fill="rgb(34 211 238)">z</text>
      <text x="130" y="112" textAnchor="middle" fontSize="9" fill="rgb(45 212 191)">Δσ = Iz × q</text>
      <text x="130" y="124" textAnchor="middle" fontSize="8" fill="currentColor">(stress reduces with depth)</text>
      <defs>
        <marker id="se-arrow" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0,0 L6,0 L3,6 Z" fill="rgb(34 211 238)" /></marker>
      </defs>
    </svg>
  )
}

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
  { key: 'influence_zone_m', label: 'Influence Zone override (m below founding depth; blank = auto Df+1.5B)' },
  { key: 'elastic_modulus_t_m2', label: 'Elastic modulus Es (t/m²)' },
  { key: 'lambda_correction', label: 'λ correction on consolidation settlement (IS:8009 Table 1; blank = not applied)' },
]

// IS:8009 (Part I)-1976, Table 1 "Values of λ" -- used when the pore pressure
// parameter A (Fig. 10) isn't available. Each category is a RANGE, not a
// single value (the standard itself says so) -- picking a category only
// pre-fills the midpoint into the editable λ field below; it never silently
// decides the number for the engineer.
const CLAY_LAMBDA_TABLE: { label: string; min: number; max: number }[] = [
  { label: 'Very sensitive clays (soft alluvial, estuarine, marine)', min: 1.0, max: 1.2 },
  { label: 'Normally consolidated clays', min: 0.7, max: 1.0 },
  { label: 'Overconsolidated clays', min: 0.5, max: 0.7 },
  { label: 'Heavily overconsolidated clays', min: 0.2, max: 0.5 },
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
  const [includeElastic, setIncludeElastic] = useState(false)
  const [rigidityFactor, setRigidityFactor] = useState('1')
  const [layerSoilTypeOverrides, setLayerSoilTypeOverrides] = useState<Record<string, string>>({}) // layer.id -> 'cohesive' | 'noncohesive' | '' (auto)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [clayLambdaType, setClayLambdaType] = useState('')
  const [showOverrides, setShowOverrides] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [tableSearch, setTableSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  const selectedBorehole = boreholes.find((b) => b.id === selectedBoreholeId)

  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState('')

  async function generateReport() {
    if (!result || !selectedBoreholeId) return
    setReportLoading(true); setReportError('')
    try {
      const blob = await api.autoGenerateBatchReport(selectedBoreholeId, result)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `raahigeo_batch_report_${result.borehole_id || selectedBoreholeId}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setReportError(e.message || 'Report generation failed.')
    } finally {
      setReportLoading(false)
    }
  }
  const widths = parseNumberList(widthsInput)
  const depths = parseNumberList(depthsInput)
  const comboCount = widths.length * depths.length
  const activeLayerOverrideCount = Object.values(layerSoilTypeOverrides).filter((v) => v).length
  const activeOverrideCount = Object.values(overrides).filter((v) => v !== '' && v != null).length + activeLayerOverrideCount

  function setOv(key: string, val: string) {
    setOverrides((prev) => ({ ...prev, [key]: val }))
  }

  function selectClayLambda(idxStr: string) {
    setClayLambdaType(idxStr)
    if (idxStr === '') return
    const row = CLAY_LAMBDA_TABLE[parseInt(idxStr, 10)]
    const mid = Math.round(((row.min + row.max) / 2) * 100) / 100
    setOv('lambda_correction', String(mid))
  }

  function buildOverridesPayload() {
    const out: Record<string, any> = {}
    for (const { key } of OVERRIDE_FIELDS) {
      const v = overrides[key]
      if (v !== '' && v != null && !isNaN(parseFloat(v))) out[key] = parseFloat(v)
    }
    const layerOv = Object.fromEntries(Object.entries(layerSoilTypeOverrides).filter(([, v]) => v))
    if (Object.keys(layerOv).length) out.layer_soil_type = layerOv
    if (includeElastic) out.include_elastic = true
    return out
  }

  async function runBatch() {
    setError(''); setResult(null); setProgress(0)
    if (!selectedBoreholeId) { setError('Select a borehole first.'); return }
    if (widths.length === 0 || depths.length === 0) { setError('Provide at least one width and one depth value.'); return }
    if (comboCount > 400) { setError(`${comboCount} combinations is too many (max 400 at once) — shorten your width/depth list.`); return }

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
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1.5 max-h-56 overflow-y-auto">
                  <p className="text-[11px] text-slate-500 mb-1">
                    Layers in this borehole (auto-picked by depth) — override soil type per layer to test "what if this were sand/clay instead":
                  </p>
                  {selectedBorehole.layers.map((l: any) => (
                    <div key={l.id} className="text-xs text-slate-400 flex items-center justify-between gap-2">
                      <span className="flex-1 min-w-0 truncate">
                        {l.from_m}–{l.to_m}m {l.classification ? `(${l.classification})` : ''}
                        <span className="text-slate-500 ml-1">
                          {l.cohesion_t_m2 == null && l.n_value != null ? 'SPT only' : l.cohesion_t_m2 == null ? 'partial' : 'full'}
                        </span>
                      </span>
                      <select
                        className="gm-input text-[11px] py-0.5 w-28 shrink-0"
                        value={layerSoilTypeOverrides[l.id] || ''}
                        onChange={(e) => setLayerSoilTypeOverrides((prev) => ({ ...prev, [l.id]: e.target.value }))}
                      >
                        <option value="">Auto</option>
                        <option value="cohesive">Force Clay</option>
                        <option value="noncohesive">Force Sand</option>
                      </select>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500 pt-1">Water table: {selectedBorehole.water_table_depth_m ?? '—'} m</p>
                  {activeLayerOverrideCount > 0 && (
                    <button
                      onClick={() => setLayerSoilTypeOverrides({})}
                      className="text-[11px] text-violet-400 hover:text-violet-300"
                    >
                      Clear {activeLayerOverrideCount} layer override{activeLayerOverrideCount !== 1 ? 's' : ''}
                    </button>
                  )}
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
              <div className="flex items-center gap-2">
                <input type="checkbox" id="include-elastic" checked={includeElastic} onChange={(e) => setIncludeElastic(e.target.checked)} className="accent-violet-500" />
                <label htmlFor="include-elastic" className="text-xs text-slate-400">Include elastic (immediate) settlement — off by default, matching the reference workbook's typical setting; NCS clay's consolidation formula alone doesn't use Es, only this adds it</label>
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
                <label className="text-xs text-slate-400 mb-1 block">Soil type per layer</label>
                <p className="text-[11px] text-slate-500">
                  {activeLayerOverrideCount > 0
                    ? `${activeLayerOverrideCount} layer${activeLayerOverrideCount !== 1 ? 's' : ''} manually forced — see the layer list above.`
                    : 'Auto (per founding layer\'s own classification). Force a specific layer above to override it.'}
                </p>
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
                      {f.key === 'lambda_correction' && (
                        <select
                          className="gm-input w-full text-xs py-1.5 mb-1"
                          value={clayLambdaType}
                          onChange={(e) => selectClayLambda(e.target.value)}
                        >
                          <option value="">IS:8009 Table 1 -- pick clay type to auto-fill λ...</option>
                          {CLAY_LAMBDA_TABLE.map((row, idx) => (
                            <option key={idx} value={idx}>{row.label} (λ = {row.min}–{row.max})</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="number" step="any" className="gm-input w-full text-xs py-1.5"
                        value={overrides[f.key] || ''}
                        onChange={(e) => { setOv(f.key, e.target.value); if (f.key === 'lambda_correction') setClayLambdaType('') }}
                      />
                      {f.key === 'lambda_correction' && clayLambdaType !== '' && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Midpoint of the range shown above -- Table 1 gives a range, not one fixed value.
                          Edit the number directly if a more specific value (from Fig. 10's pore-pressure
                          chart, or your own judgement) applies.
                        </div>
                      )}
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
                  <TheorySection
                    title="Settlement (IS:8009) — Stress Diagram & Influence Zone"
                    source="IS 8009 (Part I)-1976 -- multi-layer settlement, Boussinesq/Steinbrenner-type stress-influence factor Iz for a rectangular loaded area."
                    confidence="High"
                    diagram={<SettlementInfluenceDiagram />}
                    steps={[
                      { label: 'Influence zone (depth range summed)', formula: 'Df + 1.5 × B below ground', note: 'Automatic; can be overridden per batch via the Influence Zone override field' },
                      { label: 'Stress-influence factor Iz', formula: 'closed-form Boussinesq solution for a rectangular loaded area, function of L, B and depth z below the footing', note: 'reduces the applied surface pressure q to the stress increment Δσ at each depth' },
                      { label: 'Stress increment at depth z', formula: 'Δσ(z) = Iz(z) × q' },
                      { label: 'Each real borehole layer inside the influence zone', formula: 'gets its own Δσ, its own settlement contribution (NCS log formula / OCS mv-linear / IS:8009 Fig-9 chart for granular), then all contributions are summed' },
                      { label: 'Water table correction (Aw)', formula: '0.5 at/above founding depth, scaling linearly to 1.0 at the base of the influence zone', note: 'applied to granular sub-layers only' },
                      { label: 'Final answer', formula: 'the applied pressure q is numerically solved (bisection) so that total settlement = your allowable settlement input' },
                    ]}
                    extraNote="The influence zone is where the footing's own pressure bulb still matters — deeper than Df+1.5B, the stress increment Δσ becomes small enough to ignore. A wider or deeper footing pushes this boundary down, which is why it scales with B, not a fixed depth."
                  />
                </motion.div>
              )}

              <div className="glass p-5 print:text-black" id="batch-result">
                {reportError && <div className="text-xs text-rose-400 mb-2">{reportError}</div>}
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {result.successful}/{result.total} combinations · {result.borehole_id}
                  </div>
                  <div className="flex items-center gap-2 print:hidden">
                    <input
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Search rows…"
                      className="gm-input text-xs py-1.5 px-2.5 w-40"
                    />
                    <button onClick={() => window.print()} className="gm-btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap">
                      <Printer size={13} /> Print
                    </button>
                    <button onClick={generateReport} disabled={reportLoading} className="gm-btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap">
                      {reportLoading ? <><Loader2 size={13} className="animate-spin" /> Generating...</> : <><FileDown size={13} /> Generate Report</>}
                    </button>
                  </div>
                </div>

                {(() => {
                  const SORTABLE: Record<string, (c: any) => number | string> = {
                    width_m: (c) => c.width_m, length_m: (c) => c.length_m, depth_m: (c) => c.depth_m,
                    soil_type: (c) => c.soil_type ?? '', shear_sbc: (c) => c.shear_sbc ?? -Infinity,
                    settlement_sbc: (c) => c.settlement_sbc ?? -Infinity, recommended_sbc: (c) => c.recommended_sbc ?? -Infinity,
                    gross_recommended_sbc: (c) => c.gross_recommended_sbc ?? -Infinity, governing: (c) => c.governing ?? '',
                  }
                  const q = tableSearch.trim().toLowerCase()
                  let rows: any[] = q
                    ? result.combinations.filter((c: any) =>
                        [c.width_m, c.length_m, c.depth_m, c.founding_layer, c.soil_type, c.governing, c.error]
                          .some((v) => v != null && String(v).toLowerCase().includes(q)))
                    : result.combinations
                  if (sortCol && SORTABLE[sortCol]) {
                    const accessor = SORTABLE[sortCol]
                    rows = [...rows].sort((a, b) => {
                      const av = accessor(a), bv = accessor(b)
                      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)
                      return sortDir === 'asc' ? cmp : -cmp
                    })
                  }
                  const displayedCombos = rows

                  function SortTh({ col, children, className = '' }: { col: string; children: any; className?: string }) {
                    const active = sortCol === col
                    return (
                      <th
                        className={`text-left py-2 pr-3 cursor-pointer select-none hover:text-slate-200 ${className}`}
                        onClick={() => {
                          if (active) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
                          else { setSortCol(col); setSortDir('asc') }
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          {children}
                          {active && (sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                        </span>
                      </th>
                    )
                  }

                  return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-slate-400">
                        <SortTh col="width_m">B (m)</SortTh>
                        <SortTh col="length_m">L (m)</SortTh>
                        <SortTh col="depth_m">D (m)</SortTh>
                        <th className="text-left py-2 pr-3" title="The borehole layer containing depth D, shown with its own full boundaries -- NOT where the settlement calculation starts. Settlement always starts exactly at D; see the effective layer range in 'Full calc' below.">Founding layer (raw)</th>
                        <SortTh col="soil_type">Soil type</SortTh>
                        <SortTh col="shear_sbc">Shear SBC</SortTh>
                        <SortTh col="settlement_sbc">Settlement SBC</SortTh>
                        <SortTh col="recommended_sbc">Recommended (net)</SortTh>
                        <SortTh col="gross_recommended_sbc">Recommended (gross)</SortTh>
                        <SortTh col="governing">Governing</SortTh>
                        <th className="text-left py-2 pl-3 print:hidden">Full calc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedCombos.length === 0 && (
                        <tr><td colSpan={11} className="py-6 text-center text-slate-500">No rows match "{tableSearch}".</td></tr>
                      )}
                      {displayedCombos.map((c: any, i: number) => {
                        const rowKey = `${c.width_m}_${c.length_m}_${c.depth_m}`
                        const isCritical = result.critical_combination && c.width_m === result.critical_combination.width_m && c.depth_m === result.critical_combination.depth_m && !c.error
                        const hasDetail = !c.error && (c.settlement_layer_report?.length > 0 || c.shear_steps?.length > 0)
                        const isExpanded = expandedRows.has(rowKey)
                        const toggleExpanded = () => {
                          setExpandedRows(prev => {
                            const next = new Set(prev)
                            if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey)
                            return next
                          })
                        }
                        return (
                          <Fragment key={rowKey}>
                          <tr className={`border-b border-white/[0.04] ${isCritical ? 'bg-violet-500/10' : ''}`}>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.width_m}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.length_m}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.depth_m}</td>
                            <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap" title="Raw layer boundaries -- the calculation itself always starts at D, not necessarily this layer's own top">{c.founding_layer ?? '—'}</td>
                            {c.error ? (
                              <td colSpan={7} className="py-1.5 text-rose-400">{c.error}</td>
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
                            <td className="py-1.5 pl-3 print:hidden">
                              {hasDetail && (
                                <button onClick={toggleExpanded} className="text-violet-400 hover:text-violet-300 text-[11px] whitespace-nowrap">
                                  {isExpanded ? '▾ Hide' : '▸ Full calc'}
                                </button>
                              )}
                            </td>
                          </tr>
                          {hasDetail && (
                            <tr className={isExpanded ? 'table-row' : 'hidden print:table-row'}>
                              <td colSpan={11} className="py-3 pl-6 pr-3 bg-white/[0.02] print:bg-transparent text-[11px] text-slate-400 print:text-black">
                                {c.influence_zone_note && (
                                  <div className="mb-2"><span className="text-slate-500 print:text-black font-medium">Influence Zone ({c.influence_zone_mode}):</span> {c.influence_zone_note}</div>
                                )}
                                {c.water_table_correction_note && (
                                  <div className="mb-2"><span className="text-slate-500 print:text-black font-medium">Water table correction:</span> {c.water_table_correction_note}</div>
                                )}

                                {c.shear_steps?.length > 0 && (
                                  <div className="mb-3">
                                    <div className="uppercase tracking-wide text-slate-500 print:text-black mb-1">Shear (IS:6403) — working</div>
                                    <ul className="space-y-0.5">
                                      {c.shear_steps.map((line: string, li: number) => <li key={li}>• {line}</li>)}
                                    </ul>
                                  </div>
                                )}

                                {c.settlement_layer_report?.length > 0 && (
                                  <div>
                                    <div className="uppercase tracking-wide text-slate-500 print:text-black mb-1">Settlement (IS:8009) — layer-wise working</div>
                                    <table className="w-full text-[10.5px] border-collapse">
                                      <thead>
                                        <tr className="border-b border-white/10 print:border-black text-slate-500 print:text-black">
                                          <th className="text-left py-1 pr-2">Layer (effective)</th>
                                          <th className="text-left py-1 pr-2">Soil type</th>
                                          <th className="text-left py-1 pr-2">Method</th>
                                          <th className="text-left py-1 pr-2">N used (source)</th>
                                          <th className="text-left py-1 pr-2">Es used</th>
                                          <th className="text-left py-1 pr-2">Δσ (t/m²)</th>
                                          <th className="text-left py-1 pr-2">Layer settlement (mm)</th>
                                          <th className="text-left py-1">Running total (mm)</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {c.settlement_layer_report.map((lr: any, li: number) => (
                                          <Fragment key={li}>
                                            <tr className="border-b border-white/[0.04] print:border-black/20">
                                              <td className="py-1 pr-2 whitespace-nowrap">
                                                {lr.gap_filled && <span title="No borehole layer covers this interval -- properties borrowed from the nearest layer">~ </span>}
                                                {lr.effective_from_m}-{lr.effective_to_m}m ({lr.effective_thickness_m}m)
                                              </td>
                                              <td className="py-1 pr-2 whitespace-nowrap">{lr.soil_type}</td>
                                              <td className="py-1 pr-2 whitespace-nowrap">{lr.settlement_method}</td>
                                              <td className="py-1 pr-2 whitespace-nowrap">{lr.spt_n_used} ({lr.spt_n_source})</td>
                                              <td className="py-1 pr-2 whitespace-nowrap">{lr.elastic_modulus_used}</td>
                                              <td className="py-1 pr-2 whitespace-nowrap">{lr.stress_increase_t_m2}</td>
                                              <td className="py-1 pr-2 whitespace-nowrap">{lr.layer_settlement_mm}</td>
                                              <td className="py-1 whitespace-nowrap">{lr.running_settlement_mm}</td>
                                            </tr>
                                            <tr className="border-b border-white/[0.04] print:border-black/20">
                                              <td colSpan={8} className="pb-1.5 pt-0 text-slate-500 print:text-black/70 italic whitespace-normal break-words">
                                                {lr.working}
                                              </td>
                                            </tr>
                                          </Fragment>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                  )
                })()}

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
