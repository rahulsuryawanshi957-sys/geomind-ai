import { useEffect, useMemo, useState, Fragment } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, Layers3, Target, Printer, FileDown, Loader2, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'
import { getDisplayedRows, buildBatchSummary, type ReplacementFilter, type StatusFilter } from '../utils/batchResults'

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

// Exact B x D pair mode (Step 2, Aug 2026) -- bulk paste, one case per line.
// Accepts "B, D" (case ID auto-generated C001, C002, ...) or
// "CaseID, B, D" (explicit ID) -- lines can mix both styles. This is the
// "practical bulk-entry method" the brief asked for instead of a
// click-Add-Case-100-times UI, kept as a plain textarea consistent with how
// widths/depths are already entered as comma lists elsewhere on this page.
//
// Soil Replacement (Step 3, Aug 2026) -- an OPTIONAL trailing block after a
// "|" lets a single line carry its own independent replacement config, so
// different cases can use different replacement depths in one paste, e.g.:
//   C001, 1.5, 1.5
//   C002, 1.5, 1.5 | 1.0, 2.0, 0.5, 35
//   C003, 2.0, 2.0 | 1.5, 2.0, 0.5, 35
// "| ReplDepth, ReplGamma, ReplCohesion, ReplPhi" -- ReplDepth and
// ReplGamma are required if the "|" is present at all (matches the
// backend's required-field validation); ReplCohesion/ReplPhi may be left
// blank but at least one of the two must be given. A line with no "|" gets
// no replacement (replacement stays undefined, same as before Step 3).
function parseCases(input: string): { case_id: string; width_m: number; depth_m: number; replacement?: any }[] {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean)
  const cases: { case_id: string; width_m: number; depth_m: number; replacement?: any }[] = []
  let autoIdx = 1
  for (const rawLine of lines) {
    const [linePart, replPart] = rawLine.split('|').map((s) => s.trim())
    const parts = linePart.split(/[,\t]/).map((p) => p.trim()).filter((p) => p !== '')
    if (parts.length < 2) continue
    let case_id: string, width_m: number, depth_m: number
    if (parts.length >= 3 && isNaN(parseFloat(parts[0]))) {
      case_id = parts[0]
      width_m = parseFloat(parts[1])
      depth_m = parseFloat(parts[2])
    } else {
      width_m = parseFloat(parts[0])
      depth_m = parseFloat(parts[1])
      case_id = `C${String(autoIdx).padStart(3, '0')}`
    }
    autoIdx++
    if (!isNaN(width_m) && !isNaN(depth_m) && width_m > 0 && depth_m > 0) {
      const entry: { case_id: string; width_m: number; depth_m: number; replacement?: any } = { case_id, width_m, depth_m }
      if (replPart) {
        const rp = replPart.split(',').map((p) => p.trim())
        const depth = parseFloat(rp[0])
        const gamma = parseFloat(rp[1])
        const cohesion = rp[2] !== undefined && rp[2] !== '' ? parseFloat(rp[2]) : undefined
        const phi = rp[3] !== undefined && rp[3] !== '' ? parseFloat(rp[3]) : undefined
        if (!isNaN(depth) && !isNaN(gamma)) {
          entry.replacement = {
            enabled: true,
            replacement_depth_m: depth,
            bulk_density_t_m3: gamma,
            ...(cohesion !== undefined && !isNaN(cohesion) ? { cohesion_t_m2: cohesion } : {}),
            ...(phi !== undefined && !isNaN(phi) ? { friction_angle_deg: phi } : {}),
          }
        }
      }
      cases.push(entry)
    }
  }
  return cases
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
  const [mode, setMode] = useState<'grid' | 'exact'>('grid')
  const [widthsInput, setWidthsInput] = useState('1.5, 2, 2.5, 3')
  const [depthsInput, setDepthsInput] = useState('1.5, 2, 2.5')
  const [casesInput, setCasesInput] = useState('1.5, 1.5\n2.0, 1.5\n2.0, 2.0\n2.5, 2.0')
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
  // Soil Replacement (Step 3, Aug 2026) -- Grid mode only, applies to EVERY
  // combination in the grid (batch-level; grid has no per-combination case
  // concept -- see run_batch_matrix's docstring). Exact B×D mode gets
  // per-case replacement instead, via the "| depth, γ, c, φ" line syntax
  // (see parseCases below) -- independent per case, as the brief required.
  const [replacementEnabled, setReplacementEnabled] = useState(false)
  const [replDepth, setReplDepth] = useState('')
  const [replGamma, setReplGamma] = useState('')
  const [replCohesion, setReplCohesion] = useState('')
  const [replPhi, setReplPhi] = useState('')
  // Step 5 (Calculation Method Selection, Aug 2026) -- batch-wide default
  // bearing-capacity method, read from GET /api/calculators/batch-methods
  // rather than hard-coded (so a future second method just appears here).
  const [availableMethods, setAvailableMethods] = useState<{ key: string; label: string }[]>([])
  const [batchMethod, setBatchMethod] = useState('IS_6403')
  // 19 Aug 2026 (second reference workbook -- PROJECT_STATUS.md entry #99) --
  // batch-wide SETTLEMENT method (V1/V2), same read-from-backend pattern as
  // batchMethod/availableMethods above (Step 5) rather than hard-coded.
  const [availableSettlementMethods, setAvailableSettlementMethods] = useState<{ key: string; label: string }[]>([])
  const [settlementMethod, setSettlementMethod] = useState('V1')
  // Step 6 (Formula Configuration & Versioning, Aug 2026) -- a saved, named,
  // versioned bundle of fos/allowable_settlement_mm/rigidity_factor/
  // consolidation_type overrides. '' (empty string) means Default -- the
  // request's own fos/etc fields below, unchanged, exactly like before
  // Step 6 existed. New configurations are created from the manual fields
  // already on this page, so no separate formula/coefficient inputs exist.
  const [availableConfigs, setAvailableConfigs] = useState<any[]>([])
  const [batchConfigId, setBatchConfigId] = useState('')
  const [showSaveConfigForm, setShowSaveConfigForm] = useState(false)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigProject, setNewConfigProject] = useState('')
  const [savingConfig, setSavingConfig] = useState(false)
  const [saveConfigError, setSaveConfigError] = useState('')
  const [archivingConfig, setArchivingConfig] = useState(false)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [tableSearch, setTableSearch] = useState('')
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  // Result comparison filters (Step 4, Aug 2026) -- presentation-only, never
  // touch the underlying result/calculation data. See utils/batchResults.ts.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [replacementFilter, setReplacementFilter] = useState<ReplacementFilter>('all')

  const refreshConfigurations = (method: string) => {
    api.listConfigurations(method).then(setAvailableConfigs).catch(() => {})
  }

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
    api.batchMethods().then((r) => {
      setAvailableMethods(r.methods)
      setBatchMethod(r.default)
      refreshConfigurations(r.default)
    }).catch(() => {})
    api.batchSettlementMethods().then((r) => {
      setAvailableSettlementMethods(r.methods)
      setSettlementMethod(r.default)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (batchMethod) refreshConfigurations(batchMethod)
    setBatchConfigId('')  // switching method invalidates any selected configuration (Step 6 section 9)
  }, [batchMethod])

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
  const exactCases = parseCases(casesInput)
  const exactCaseIds = exactCases.map((c) => c.case_id)
  const exactDuplicateIds = [...new Set(exactCaseIds.filter((id, i) => exactCaseIds.indexOf(id) !== i))]
  const activeLayerOverrideCount = Object.values(layerSoilTypeOverrides).filter((v) => v).length
  const activeOverrideCount = Object.values(overrides).filter((v) => v !== '' && v != null).length + activeLayerOverrideCount
  // Step 5 -- key -> display label lookup built from GET /batch-methods, so
  // the results table never hard-codes a method name either.
  const methodLabelMap: Record<string, string> = Object.fromEntries(availableMethods.map((m) => [m.key, m.label]))

  // Step 8 (Performance hardening, Aug 2026) -- memoize the sort/filter/
  // search pipeline and the summary reduce, both of which scan every row in
  // `result.combinations` (up to MAX_BATCH_CASES=400). Previously these ran
  // as inline IIFEs inside the render body, so ANY re-render of this page --
  // including toggling a single row's expand/collapse via `expandedRows`,
  // completely unrelated to sorting/filtering/searching -- re-scanned and
  // re-sorted the full result set every time. useMemo here means that work
  // now only re-runs when one of its actual inputs changes. Purely a render-
  // performance fix -- computes the exact same values as before, still via
  // the same getDisplayedRows/buildBatchSummary functions, so it changes
  // nothing about what's displayed or how rows are sorted/filtered/counted.
  const displayedCombos = useMemo(
    () => result ? getDisplayedRows(result.combinations, { status: statusFilter, replacement: replacementFilter, search: tableSearch }, sortCol, sortDir) : [],
    [result, statusFilter, replacementFilter, tableSearch, sortCol, sortDir]
  )
  const batchSummary = useMemo(() => (result ? buildBatchSummary(result.combinations) : null), [result])

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

  // Soil Replacement payload (Step 3, Aug 2026) -- Grid mode only; returns
  // undefined when the toggle is off (backend then behaves exactly as
  // before Step 3 -- no key sent at all). replacement_depth_m and
  // bulk_density_t_m3 are required by the backend when enabled; cohesion/phi
  // are sent only if filled in (at least one of the two is still required
  // server-side -- validated there with a clear per-case error if missing).
  function buildReplacementPayload(): any {
    if (!replacementEnabled) return undefined
    const payload: Record<string, any> = { enabled: true }
    if (replDepth !== '' && !isNaN(parseFloat(replDepth))) payload.replacement_depth_m = parseFloat(replDepth)
    if (replGamma !== '' && !isNaN(parseFloat(replGamma))) payload.bulk_density_t_m3 = parseFloat(replGamma)
    if (replCohesion !== '' && !isNaN(parseFloat(replCohesion))) payload.cohesion_t_m2 = parseFloat(replCohesion)
    if (replPhi !== '' && !isNaN(parseFloat(replPhi))) payload.friction_angle_deg = parseFloat(replPhi)
    return payload
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
          replacement: buildReplacementPayload(),
          method: batchMethod,
          configuration_id: batchConfigId || null,
          settlement_method: settlementMethod,
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

  async function runExactPairsBatch() {
    setError(''); setResult(null); setProgress(0)
    if (!selectedBoreholeId) { setError('Select a borehole first.'); return }
    if (exactCases.length === 0) { setError('Enter at least one case (width, depth per line).'); return }
    if (exactCases.length > 400) { setError(`${exactCases.length} cases is too many (max 400 at once) — split into smaller batches.`); return }
    if (exactDuplicateIds.length > 0) { setError(`Duplicate case ID(s): ${exactDuplicateIds.join(', ')} — case IDs must be unique.`); return }

    setLoading(true)
    setProgressLabel(`Running ${exactCases.length} case${exactCases.length !== 1 ? 's' : ''}...`)
    try {
      const overridesPayload = buildOverridesPayload()
      const r = await api.runBatchCases({
        borehole_id: selectedBoreholeId,
        cases: exactCases,
        shape,
        fos: parseFloat(fos) || 2.5,
        allowable_settlement_mm: parseFloat(allowableSettlement) || 25,
        consolidation_type: consolidationType,
        rigidity_factor: parseFloat(rigidityFactor) || 1,
        overrides: overridesPayload,
        method: batchMethod,
        configuration_id: batchConfigId || null,
        settlement_method: settlementMethod,
      })
      setResult(r)
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
              <div className="flex gap-1.5 p-0.5 rounded-lg bg-white/[0.04] mb-1">
                <button
                  onClick={() => setMode('grid')}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${mode === 'grid' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:text-slate-300'}`}
                >
                  Grid (cross-product)
                </button>
                <button
                  onClick={() => setMode('exact')}
                  className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${mode === 'exact' ? 'bg-violet-500/20 text-violet-300' : 'text-slate-400 hover:text-slate-300'}`}
                >
                  Exact B×D pairs
                </button>
              </div>

              {mode === 'grid' ? (
                <>
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

                  {/* Soil Replacement (Step 3, Aug 2026) -- batch-level: applies to
                      EVERY combination in this grid. Grid mode has no per-combination
                      case concept, so a per-combination version isn't offered here --
                      use Exact B×D pairs mode (with the "| depth, γ, c, φ" line syntax)
                      for cases that need different replacement depths. */}
                  <div className="rounded-lg border border-white/[0.06] p-3 space-y-2">
                    <label className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={replacementEnabled}
                        onChange={(e) => setReplacementEnabled(e.target.checked)}
                        className="accent-violet-500"
                      />
                      Soil Replacement (applies to every combination above)
                    </label>
                    {replacementEnabled && (
                      <>
                        <p className="text-[11px] text-slate-500">
                          Replaces the top part of the soil profile (from ground level down) with an
                          engineered material, for calculation only — the recorded borehole data is never changed.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-slate-400 mb-0.5 block">Replacement depth (m) *</label>
                            <input type="number" step="any" className="gm-input w-full" value={replDepth} onChange={(e) => setReplDepth(e.target.value)} placeholder="e.g. 1.5" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-400 mb-0.5 block">Bulk density γ (t/m³) *</label>
                            <input type="number" step="any" className="gm-input w-full" value={replGamma} onChange={(e) => setReplGamma(e.target.value)} placeholder="e.g. 2.0" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-400 mb-0.5 block">Cohesion c (t/m²)</label>
                            <input type="number" step="any" className="gm-input w-full" value={replCohesion} onChange={(e) => setReplCohesion(e.target.value)} placeholder="e.g. 0" />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-400 mb-0.5 block">Friction angle φ (°)</label>
                            <input type="number" step="any" className="gm-input w-full" value={replPhi} onChange={(e) => setReplPhi(e.target.value)} placeholder="e.g. 35" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500">* Required. At least one of cohesion or friction angle is also required. Any other property (specific gravity, moisture content, N-value, etc.) is auto-sourced from the nearest original layer, same as any other missing field.</p>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">
                      Exact cases — one per line: "B, D" (case ID auto-generated) or "CaseID, B, D"
                    </label>
                    <textarea
                      className="gm-input w-full font-mono text-xs"
                      rows={6}
                      value={casesInput}
                      onChange={(e) => setCasesInput(e.target.value)}
                      placeholder={'1.5, 1.5\n2.0, 1.5\n2.0, 2.0\n2.5, 2.0'}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {exactCases.length > 0 ? `${exactCases.length} exact case${exactCases.length !== 1 ? 's' : ''} — only these are run, no automatic combinations.` : 'Enter at least one case.'} (max 400 at once)
                  </p>
                  {exactDuplicateIds.length > 0 && (
                    <p className="text-[11px] text-rose-400">Duplicate case ID(s): {exactDuplicateIds.join(', ')} — must be unique.</p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Optional per-case Soil Replacement: add <span className="font-mono">| depth, γ, c, φ</span> after a line
                    to replace soil down to that depth for JUST that case (original data untouched). c and φ can be left blank but at least one is needed. Example:{' '}
                    <span className="font-mono">C002, 1.5, 1.5 | 1.0, 2.0, 0.5, 35</span>
                  </p>
                </>
              )}

              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Calculation method
                  {availableMethods.length <= 1 && (
                    <span className="text-slate-500 font-normal"> (only one verified method available today)</span>
                  )}
                </label>
                <select
                  className="gm-input w-full"
                  value={batchMethod}
                  onChange={(e) => setBatchMethod(e.target.value)}
                  disabled={availableMethods.length <= 1}
                >
                  {(availableMethods.length ? availableMethods : [{ key: 'IS_6403', label: 'IS:6403' }]).map((m) => (
                    <option key={m.key} value={m.key}>{m.label} Shear</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Bearing-capacity method used for shear across this batch. See "Settlement method" below for
                  the settlement (IS:8009) side.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Settlement method
                </label>
                <select
                  className="gm-input w-full"
                  value={settlementMethod}
                  onChange={(e) => setSettlementMethod(e.target.value)}
                >
                  {(availableSettlementMethods.length ? availableSettlementMethods : [{ key: 'V1', label: 'V1' }]).map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Settlement (IS:8009) method for this batch. V1 is the original engine (Boussinesq stress,
                  one water-table correction for the whole influence zone). V2 is a second, independently
                  verified reference workbook's method (2:1 load-spread stress, a separate water-table
                  correction for each sub-layer, and its own granular-soil constant) -- see
                  PROJECT_STATUS.md entry #99 for the full comparison. Pick whichever matches the reference
                  you're checking this batch against; when unsure, V1 is the longer-established default.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Parameter configuration
                  <span className="text-slate-500 font-normal"> (optional -- overrides FOS / allowable settlement / rigidity / consolidation below)</span>
                </label>
                <div className="flex gap-2">
                  <select
                    className="gm-input w-full"
                    value={batchConfigId}
                    onChange={(e) => setBatchConfigId(e.target.value)}
                  >
                    <option value="">Default (use the fields below as typed)</option>
                    {availableConfigs.map((c) => (
                      <option key={c.configuration_id} value={c.configuration_id}>
                        {c.config_name} v{c.version}{c.project_name ? ` — ${c.project_name}` : ''}
                      </option>
                    ))}
                  </select>
                  {batchConfigId && (
                    <button
                      type="button"
                      title="Archive this configuration version -- hides it from this dropdown going forward. Never deletes or changes it, and any past result that used it stays exactly as it was (results store their own resolved values, not a live link back to this configuration)."
                      className="shrink-0 px-3 rounded border border-rose-800/60 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 text-xs disabled:opacity-50"
                      disabled={archivingConfig}
                      onClick={async () => {
                        const c = availableConfigs.find((x) => x.configuration_id === batchConfigId)
                        const label = c ? `${c.config_name} v${c.version}` : batchConfigId
                        if (!window.confirm(`Archive "${label}"? It'll disappear from this dropdown -- past results that used it are unaffected and stay reproducible. This can't be undone from the UI.`)) return
                        setArchivingConfig(true)
                        try {
                          await api.archiveConfiguration(batchConfigId)
                          setBatchConfigId('')
                          refreshConfigurations(batchMethod)
                        } catch (e: any) {
                          setSaveConfigError(e?.message || 'Could not archive configuration.')
                        } finally {
                          setArchivingConfig(false)
                        }
                      }}
                    >
                      {archivingConfig ? '…' : 'Archive'}
                    </button>
                  )}
                </div>
                {batchConfigId && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {(() => {
                      const c = availableConfigs.find((x) => x.configuration_id === batchConfigId)
                      if (!c) return null
                      return `Overrides: ${Object.entries(c.parameters).map(([k, v]) => `${k}=${v}`).join(', ')} — every other parameter still comes from the fields below.`
                    })()}
                  </p>
                )}
                <button
                  type="button"
                  className="text-xs text-emerald-400 hover:text-emerald-300 mt-1"
                  onClick={() => { setShowSaveConfigForm((v) => !v); setSaveConfigError('') }}
                >
                  {showSaveConfigForm ? 'Cancel' : '+ Save current FOS/settlement/rigidity/consolidation as a named configuration'}
                </button>
                {showSaveConfigForm && (
                  <div className="mt-2 p-3 rounded border border-slate-700 bg-slate-800/50 space-y-2">
                    <p className="text-[11px] text-slate-500">
                      Saves the current values of FOS ({fos}), allowable settlement ({allowableSettlement} mm),
                      rigidity factor ({rigidityFactor}), and consolidation type ({consolidationType}) below as a new,
                      permanent version — it never changes an existing version, so old results stay reproducible.
                    </p>
                    <input
                      type="text" placeholder="Configuration name (e.g. Project A)" className="gm-input w-full"
                      value={newConfigName} onChange={(e) => setNewConfigName(e.target.value)}
                    />
                    <input
                      type="text" placeholder="Project name (optional)" className="gm-input w-full"
                      value={newConfigProject} onChange={(e) => setNewConfigProject(e.target.value)}
                    />
                    {saveConfigError && <p className="text-[11px] text-rose-400">{saveConfigError}</p>}
                    <button
                      type="button"
                      className="gm-btn-primary text-xs px-3 py-1.5"
                      disabled={savingConfig || !newConfigName.trim()}
                      onClick={async () => {
                        setSavingConfig(true); setSaveConfigError('')
                        try {
                          const created = await api.createConfiguration({
                            method: batchMethod, config_name: newConfigName.trim(),
                            project_name: newConfigProject.trim() || null,
                            parameters: {
                              fos: parseFloat(fos), allowable_settlement_mm: parseFloat(allowableSettlement),
                              rigidity_factor: parseFloat(rigidityFactor), consolidation_type: consolidationType,
                            },
                          })
                          refreshConfigurations(batchMethod)
                          setBatchConfigId(created.configuration_id)
                          setShowSaveConfigForm(false)
                          setNewConfigName(''); setNewConfigProject('')
                        } catch (e: any) {
                          setSaveConfigError(e?.message || 'Could not save configuration.')
                        } finally {
                          setSavingConfig(false)
                        }
                      }}
                    >
                      {savingConfig ? 'Saving…' : 'Save as new version'}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Footing length L (blank = square, L=B)</label>
                <input type="number" step="any" className="gm-input w-full" value={lengthOverride} onChange={(e) => setLengthOverride(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Footing shape</label>
                <select className="gm-input w-full" value={shape} onChange={(e) => setShape(e.target.value)}>
                  {[
                    { key: 'square', label: 'square' },
                    { key: 'rectangular', label: 'rectangular' },
                    { key: 'strip', label: 'strip' },
                    { key: 'circular', label: 'circular' },
                    { key: 'annular_raft', label: 'annular raft' },
                  ].map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {shape === 'annular_raft' && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Annular raft added 19 Aug 2026 (PROJECT_STATUS.md entry #99) — same convention as
                    "circular" above: enter the EFFECTIVE width in "Footing width B" below, i.e.
                    (Outer diameter − Inner diameter) / 2, not the outer diameter itself.
                  </p>
                )}
                {shape === 'circular' && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    For circular, "Footing width B" below is used as the diameter.
                  </p>
                )}
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

              <button onClick={mode === 'grid' ? runBatch : runExactPairsBatch} disabled={loading} className="gm-btn-primary w-full mt-2 flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={14} className="animate-spin" /> {mode === 'grid' ? `${progress}%` : 'Running...'}</> : `Run Batch (${mode === 'grid' ? (comboCount || 0) : exactCases.length})`}
              </button>

              {loading && (
                <div className="space-y-1">
                  {mode === 'grid' && (
                    <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-300 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
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
                    {result.critical_combination.case_id && <>Case {result.critical_combination.case_id}: </>}
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

                {/* Batch summary (Step 4, Aug 2026) -- plain counts over the
                    existing result rows, no new engineering values. Highest/
                    lowest recommended SBC are labelled as numerical extremes
                    ONLY (see buildBatchSummary's own docstring) -- never
                    "best"/"safe"/"optimal", since there's no structural
                    applied load in this batch to judge that against. */}
                {(() => {
                  const summary = batchSummary
                  // Step 8 Render build fix (18 Aug 2026) -- TypeScript's strict
                  // null checks (this project's tsconfig has `strict: true`)
                  // correctly flag that `batchSummary` (a useMemo -- see its
                  // declaration above) is typed `SummaryType | null`, since TS
                  // has no way to know it's only ever null when `result` itself
                  // is null. At RUNTIME this branch only ever executes inside
                  // the `{result && (...)}` JSX gate around this whole section
                  // (see above), which guarantees `batchSummary` is non-null
                  // here -- but that guarantee isn't visible to TS across two
                  // separate state/memo variables. This guard makes it visible:
                  // a standard, canonical null-narrowing pattern (not a
                  // behavior change -- this branch is unreachable in practice).
                  if (!summary) return null
                  // Bind the two possibly-absent summary fields to local
                  // consts ONCE, right after narrowing `summary` itself --
                  // TypeScript then narrows THESE the same proven way inside
                  // the `lowest && (...)`/`highest && (...)` JSX below and
                  // template literals, with no repeated `summary.foo.bar`
                  // property-chain re-access for TS to lose track of.
                  const highest = summary.highestRecommendedSbc
                  const lowest = summary.lowestRecommendedSbc
                  const Stat = ({ label, value, title }: { label: string; value: any; title?: string }) => (
                    <div className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]" title={title}>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
                      <div className="text-sm font-medium text-slate-200">{value}</div>
                    </div>
                  )
                  return (
                    <div className="flex flex-wrap gap-2 mb-3 print:hidden">
                      <Stat label="Total cases" value={summary.total} />
                      <Stat label="Successful" value={summary.successful} />
                      <Stat label="Errors" value={summary.errorCount} />
                      <Stat label="Replacement ON" value={summary.replacementOn} />
                      <Stat label="Replacement OFF" value={summary.replacementOff} />
                      {highest && (
                        <Stat
                          label="Highest recommended SBC"
                          value={`${highest.value} (${highest.row.case_id ?? `B=${highest.row.width_m}, D=${highest.row.depth_m}`})`}
                          title="Numerical extreme across this batch only -- not an engineering recommendation. No structural applied load is available in this batch to judge 'best'."
                        />
                      )}
                      {lowest && (
                        <Stat
                          label="Lowest recommended SBC"
                          value={`${lowest.value} (${lowest.row.case_id ?? `B=${lowest.row.width_m}, D=${lowest.row.depth_m}`})`}
                          title="Numerical extreme across this batch only -- not an engineering recommendation."
                        />
                      )}
                    </div>
                  )
                })()}

                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {result.successful}/{result.total} combinations · {result.borehole_id}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap print:hidden">
                    {/* Filters (Step 4) -- narrow what's DISPLAYED only; never
                        mutates result.combinations itself. */}
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="gm-input text-xs py-1.5 px-2 w-auto"
                      title="Filter by result status"
                    >
                      <option value="all">All statuses</option>
                      <option value="success">Success only</option>
                      <option value="error">Errors only</option>
                    </select>
                    <select
                      value={replacementFilter}
                      onChange={(e) => setReplacementFilter(e.target.value as ReplacementFilter)}
                      className="gm-input text-xs py-1.5 px-2 w-auto"
                      title="Filter by soil replacement"
                    >
                      <option value="all">Replacement: all</option>
                      <option value="on">Replacement ON</option>
                      <option value="off">Replacement OFF</option>
                    </select>
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
                        {result.mode === 'exact_pairs' && <th className="text-left py-2 pr-3">Case ID</th>}
                        <SortTh col="width_m">B (m)</SortTh>
                        <SortTh col="length_m">L (m)</SortTh>
                        <SortTh col="depth_m">D (m)</SortTh>
                        <th className="text-left py-2 pr-3" title="The borehole layer containing depth D, shown with its own full boundaries -- NOT where the settlement calculation starts. Settlement always starts exactly at D; see the effective layer range in 'Full calc' below.">Founding layer (raw)</th>
                        <SortTh col="replacement_enabled">Replacement</SortTh>
                        <SortTh col="status">Status</SortTh>
                        <SortTh col="method">Method</SortTh>
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
                      {(() => {
                        // Step 5 adds one pre-cell (Method, always shown regardless of
                        // error/success -- same reasoning as Status) alongside Step 4's
                        // Replacement/Status: pre-cells = case_id?(exact only)+B+L+D+
                        // founding+replacement+status+method (8 exact / 7 grid) +
                        // either errorColSpan(6, error row) or 6 cells (soil_type/
                        // shear/settlement/net/gross/governing, success row) + 1
                        // trailing "Full calc" cell.
                        const totalCols = result.mode === 'exact_pairs' ? 15 : 14
                        return displayedCombos.length === 0 && (
                          <tr><td colSpan={totalCols} className="py-6 text-center text-slate-500">No rows match the current search/filters.</td></tr>
                        )
                      })()}
                      {displayedCombos.map((c: any, i: number) => {
                        const totalCols = result.mode === 'exact_pairs' ? 15 : 14
                        const errorColSpan = 6
                        const rowKey = c.case_id ?? `${c.width_m}_${c.length_m}_${c.depth_m}`
                        const isCritical = result.critical_combination && !c.error && (
                          c.case_id != null
                            ? c.case_id === result.critical_combination.case_id
                            : (c.width_m === result.critical_combination.width_m && c.depth_m === result.critical_combination.depth_m)
                        )
                        const hasDetail = true  // Step 7: every case now has at least overrides/soil/parameter
                        // trace to show (set before any calculation can fail -- see calculators.py), so the
                        // "Full calc" / audit trail expander is available for error rows too, not just successes.
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
                            {result.mode === 'exact_pairs' && <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.case_id ?? '—'}</td>}
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.width_m}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.length_m}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.depth_m}</td>
                            <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap" title="Raw layer boundaries -- the calculation itself always starts at D, not necessarily this layer's own top">
                              {c.founding_layer ?? '—'}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap" title={c.replacement_enabled ? `Soil replaced 0–${c.replacement_depth_m}m for this case` : 'No soil replacement for this case'}>
                              {c.replacement_enabled
                                ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-300">ON · {c.replacement_depth_m}m</span>
                                : <span className="text-slate-500">OFF</span>}
                            </td>
                            <td className="py-1.5 pr-3 whitespace-nowrap">
                              {c.error
                                ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300">Error</span>
                                : <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300">Success</span>}
                            </td>
                            <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap" title="Bearing-capacity method used for this case's shear check">
                              {methodLabelMap[c.method] ?? c.method ?? '—'}
                            </td>
                            {c.error ? (
                              <td colSpan={errorColSpan} className="py-1.5 text-rose-400">{c.error}</td>
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
                              <td colSpan={totalCols} className="py-3 pl-6 pr-3 bg-white/[0.02] print:bg-transparent text-[11px] text-slate-400 print:text-black">
                                {/* Step 7 (Full Calculation Traceability, Aug 2026) -- Audit Trail.
                                    Always rendered when present, success OR error, since a case that
                                    failed partway through still has useful trace up to the failure
                                    point (see calculators.py's _run_one_batch_case). Kept compact --
                                    small labeled lists, not a raw JSON dump. */}
                                {c.error && (
                                  <div className="mb-3 text-rose-400">
                                    <span className="text-slate-500 print:text-black font-medium">Error:</span> {c.error}
                                  </div>
                                )}
                                <div className="mb-3">
                                  <div className="uppercase tracking-wide text-slate-500 print:text-black mb-1">Audit Trail</div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                      <div className="text-slate-500 print:text-black mb-0.5">Inputs & overrides</div>
                                      <div>
                                        {c.case_id && <>Case <span className="text-slate-300 print:text-black">{c.case_id}</span> — </>}
                                        B={c.width_m}m, D={c.depth_m}m{c.length_m ? `, L=${c.length_m}m` : ''}
                                      </div>
                                      <div>
                                        {Object.keys(c.overrides_applied || {}).length > 0
                                          ? `Manual overrides: ${Object.entries(c.overrides_applied).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}`
                                          : 'No manual overrides — every value below came from the borehole itself.'}
                                      </div>
                                      <div>Method: {methodLabelMap[c.method] ?? c.method}{c.configuration_id ? ` · Configuration: ${c.configuration_id}` : ' · Configuration: Default'}{c.settlement_method_label ? ` · Settlement: ${c.settlement_method_label}` : ''}</div>
                                      {c.soil_type_source && <div>Soil type ({c.soil_type === 'cohesive' ? 'Clay' : 'Granular'}) — source: {c.soil_type_source}</div>}
                                    </div>
                                    <div>
                                      <div className="text-slate-500 print:text-black mb-0.5">Soil profile — original vs. effective</div>
                                      {c.original_soil_profile?.length > 0 && (
                                        <div>Original: {c.original_soil_profile.map((l: any, li: number) => `${l.from_m}–${l.to_m}m${l.classification ? ` (${l.classification})` : ''}`).join(', ')}</div>
                                      )}
                                      {c.effective_soil_profile?.length > 0 && (
                                        <div>
                                          Effective: {c.effective_soil_profile.map((l: any, li: number) =>
                                            `${l.from_m}–${l.to_m}m${l.classification ? ` (${l.classification})` : ''}${l.source === 'replacement' ? ' [replaced]' : ''}`
                                          ).join(', ')}
                                        </div>
                                      )}
                                      {c.founding_layer && <div>Founding layer: {c.founding_layer}</div>}
                                    </div>
                                  </div>
                                  {c.parameter_trace && Object.keys(c.parameter_trace).length > 0 && (
                                    <div className="mt-2">
                                      <div className="text-slate-500 print:text-black mb-0.5">Parameters used</div>
                                      <table className="text-[10.5px] border-collapse">
                                        <thead>
                                          <tr className="border-b border-white/10 print:border-black text-slate-500 print:text-black">
                                            <th className="text-left py-0.5 pr-4">Parameter</th>
                                            <th className="text-left py-0.5 pr-4">Value</th>
                                            <th className="text-left py-0.5">Source</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {Object.entries(c.parameter_trace).map(([k, v]: [string, any]) => (
                                            <tr key={k} className="border-b border-white/[0.04] print:border-black/20">
                                              <td className="py-0.5 pr-4 whitespace-nowrap">{k}</td>
                                              <td className="py-0.5 pr-4 whitespace-nowrap">{v.value ?? '—'}</td>
                                              <td className="py-0.5 whitespace-nowrap">{v.source}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>

                                {c.configuration_id && (
                                  <div className="mb-2">
                                    <span className="text-slate-500 print:text-black font-medium">Configuration:</span>{' '}
                                    {c.configuration_id} — {c.resolved_parameters ? Object.entries(c.resolved_parameters).map(([k, v]) => `${k}=${v}`).join(', ') : ''}
                                  </div>
                                )}
                                {c.influence_zone_note && (
                                  <div className="mb-2"><span className="text-slate-500 print:text-black font-medium">Influence Zone ({c.influence_zone_mode}):</span> {c.influence_zone_note}</div>
                                )}
                                {c.water_table_correction_note && (
                                  <div className="mb-2"><span className="text-slate-500 print:text-black font-medium">Water table correction:</span> {c.water_table_correction_note}</div>
                                )}

                                {c.replacement_enabled && (
                                  <div className="mb-3">
                                    <div className="uppercase tracking-wide text-slate-500 print:text-black mb-1">Soil Replacement</div>
                                    <div className="mb-1">
                                      Replaced 0–{c.replacement_depth_m}m with: γ={c.replacement_soil_properties?.bulk_density_t_m3} t/m³,
                                      {' '}c={c.replacement_soil_properties?.cohesion_t_m2 ?? '—'} t/m², φ={c.replacement_soil_properties?.friction_angle_deg ?? '—'}°
                                      {c.replacement_soil_properties?.classification ? `, ${c.replacement_soil_properties.classification}` : ''}
                                      {' '}(other properties auto-sourced from the nearest original layer where not given).
                                    </div>
                                    {c.effective_soil_profile?.length > 0 && (
                                      <div>
                                        Effective profile used for this case: {c.effective_soil_profile.map((l: any, li: number) =>
                                          `${l.from_m}–${l.to_m}m (${l.source === 'replacement' ? 'replacement' : 'original'})`
                                        ).join(', ')}
                                      </div>
                                    )}
                                  </div>
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
