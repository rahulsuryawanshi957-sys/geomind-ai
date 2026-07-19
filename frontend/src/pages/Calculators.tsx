import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calculator, Construction, Printer, Save, Layers3, Wand2 } from 'lucide-react'
import { api } from '../api/client'

interface FieldDef { key: string; label: string; unit?: string; type?: 'number' | 'select' | 'text'; options?: string[]; default?: any }
interface CalcDef { id: string; label: string; fields: FieldDef[] }

const CALC_DEFS: CalcDef[] = [
  { id: 'bearing_capacity_terzaghi', label: 'Bearing Capacity (Terzaghi)', fields: [
    { key: 'phi_deg', label: 'Friction angle φ', unit: 'deg', default: 30 },
    { key: 'cohesion_kpa', label: 'Cohesion c', unit: 'kPa', default: 0 },
    { key: 'gamma_kn_m3', label: 'Unit weight γ', unit: 'kN/m³', default: 18 },
    { key: 'width_m', label: 'Footing width B', unit: 'm', default: 2 },
    { key: 'depth_m', label: 'Depth of foundation Df', unit: 'm', default: 1.5 },
    { key: 'shape', label: 'Footing shape', type: 'select', options: ['strip', 'square', 'circular'], default: 'strip' },
  ]},
  { id: 'bearing_capacity_is6403_shear', label: 'SBC — IS:6403 Shear Method', fields: [
    { key: 'length_m', label: 'Footing length L', unit: 'm', default: 3 },
    { key: 'width_m', label: 'Footing width B', unit: 'm', default: 3 },
    { key: 'depth_m', label: 'Depth of footing D', unit: 'm', default: 3 },
    { key: 'cohesion_t_m2', label: 'Cohesion c', unit: 't/m²', default: 2 },
    { key: 'phi_deg', label: 'Angle of internal friction φ', unit: 'deg', default: 28 },
    { key: 'gamma_avg_above_t_m3', label: 'Avg. bulk density above footing', unit: 't/m³', default: 1.8 },
    { key: 'gamma_at_base_t_m3', label: 'Bulk density at footing base', unit: 't/m³', default: 1.8 },
    { key: 'specific_gravity', label: 'Specific gravity G', default: 2.65 },
    { key: 'moisture_content_pct', label: 'Moisture content', unit: '%', default: 15 },
    { key: 'water_table_depth_m', label: 'Water table depth (from NGL)', unit: 'm', default: 3 },
    { key: 'shape', label: 'Footing shape', type: 'select', options: ['square', 'rectangular', 'strip', 'circular'], default: 'square' },
    { key: 'fos', label: 'Factor of safety', default: 2.5 },
    { key: 'scour_correction_m', label: 'Scour depth correction', unit: 'm', default: 0 },
  ]},
  { id: 'settlement_sbc_is8009_noncohesive', label: 'SBC — IS:8009 Settlement (Granular)', fields: [
    { key: 'length_m', label: 'Footing length L', unit: 'm', default: 3 },
    { key: 'width_m', label: 'Footing width B', unit: 'm', default: 3 },
    { key: 'depth_m', label: 'Depth of footing D', unit: 'm', default: 3 },
    { key: 'n_value', label: 'Average SPT N-value', default: 15 },
    { key: 'allowable_settlement_mm', label: 'Allowable settlement', unit: 'mm', default: 25 },
    { key: 'water_table_depth_m', label: 'Water table depth (from NGL)', unit: 'm', default: 3 },
    { key: 'influence_depth_m', label: 'Depth of influence (blank = auto 1.5×B)', unit: 'm', default: '' },
    { key: 'rigidity_factor', label: 'Rigidity factor', default: 1 },
  ]},
  { id: 'settlement_sbc_is8009_cohesive', label: 'SBC — IS:8009 Settlement (Clay)', fields: [
    { key: 'length_m', label: 'Footing length L', unit: 'm', default: 3 },
    { key: 'width_m', label: 'Footing width B', unit: 'm', default: 3 },
    { key: 'depth_m', label: 'Depth of footing D', unit: 'm', default: 3 },
    { key: 'elastic_modulus_t_m2', label: 'Elastic modulus Es', unit: 't/m²', default: 600 },
    { key: 'compression_index_cc', label: 'Compression index Cc', default: 0.17 },
    { key: 'initial_void_ratio_e0', label: 'Initial void ratio e0', default: 0.75 },
    { key: 'gamma_avg_above_t_m3', label: 'Avg. bulk density above footing', unit: 't/m³', default: 1.8 },
    { key: 'allowable_settlement_mm', label: 'Allowable settlement', unit: 'mm', default: 25 },
    { key: 'consolidation_type', label: 'Consolidation type', type: 'select', options: ['NCS', 'OCS'], default: 'NCS' },
    { key: 'layer_thickness_m', label: 'Clay layer thickness (blank = auto 1.5×B)', unit: 'm', default: '' },
    { key: 'rigidity_factor', label: 'Rigidity factor', default: 1 },
  ]},
  { id: 'immediate_settlement', label: 'Immediate (Elastic) Settlement', fields: [
    { key: 'q_kpa', label: 'Applied pressure q', unit: 'kPa', default: 150 },
    { key: 'width_m', label: 'Footing width B', unit: 'm', default: 2 },
    { key: 'es_kpa', label: 'Soil modulus Es', unit: 'kPa', default: 15000 },
    { key: 'mu', label: "Poisson's ratio μ", default: 0.3 },
    { key: 'If', label: 'Influence factor If', default: 0.85 },
  ]},
  { id: 'consolidation_settlement', label: 'Consolidation Settlement', fields: [
    { key: 'cc', label: 'Compression index Cc', default: 0.3 },
    { key: 'e0', label: 'Initial void ratio e0', default: 0.9 },
    { key: 'h_m', label: 'Clay layer thickness H', unit: 'm', default: 3 },
    { key: 'sigma0_kpa', label: "Initial effective stress σ0'", unit: 'kPa', default: 100 },
    { key: 'delta_sigma_kpa', label: 'Stress increase Δσ', unit: 'kPa', default: 50 },
  ]},
  { id: 'spt_correction', label: 'SPT N-value Correction', fields: [
    { key: 'n_field', label: 'Field N value', default: 20 },
    { key: 'sigma_eff_kpa', label: "Effective overburden stress σ'v", unit: 'kPa', default: 80 },
    { key: 'hammer_energy_ratio', label: 'Hammer energy ratio', default: 0.6 },
    { key: 'rod_length_m', label: 'Rod length', unit: 'm', default: 10 },
    { key: 'borehole_dia_mm', label: 'Borehole diameter', unit: 'mm', default: 100 },
  ]},
  { id: 'earth_pressure_rankine', label: 'Rankine Earth Pressure', fields: [
    { key: 'gamma_kn_m3', label: 'Unit weight γ', unit: 'kN/m³', default: 18 },
    { key: 'height_m', label: 'Wall height H', unit: 'm', default: 4 },
    { key: 'phi_deg', label: 'Friction angle φ', unit: 'deg', default: 30 },
    { key: 'surcharge_kpa', label: 'Surcharge q', unit: 'kPa', default: 0 },
    { key: 'condition', label: 'Condition', type: 'select', options: ['active', 'passive'], default: 'active' },
  ]},
]

const SAVED_KEY = 'raahigeo_saved_calculations'

// Converts SoilLayer + BoreholeProfile fields into calculator input values.
// Only fills fields the layer actually has data for; project-specific fields
// (footing width/length, allowable settlement, FOS) are deliberately left
// alone since they aren't soil properties.
const T_M2_TO_KPA = 9.80665

function mapLayerToValues(calcId: string, layer: any, waterTableDepthM: number | null): Record<string, any> {
  const has = (v: any) => v !== null && v !== undefined
  const bowlesEs = (n: number) => 30 * (n + 6) // t/m2, Bowles correlation

  switch (calcId) {
    case 'bearing_capacity_terzaghi':
      return {
        ...(has(layer.friction_angle_deg) && { phi_deg: layer.friction_angle_deg }),
        ...(has(layer.cohesion_t_m2) && { cohesion_kpa: +(layer.cohesion_t_m2 * T_M2_TO_KPA).toFixed(2) }),
        ...(has(layer.bulk_density_t_m3) && { gamma_kn_m3: +(layer.bulk_density_t_m3 * T_M2_TO_KPA).toFixed(2) }),
        ...(has(layer.from_m) && { depth_m: layer.from_m }),
      }
    case 'bearing_capacity_is6403_shear':
      return {
        ...(has(layer.cohesion_t_m2) && { cohesion_t_m2: layer.cohesion_t_m2 }),
        ...(has(layer.friction_angle_deg) && { phi_deg: layer.friction_angle_deg }),
        ...(has(layer.bulk_density_t_m3) && { gamma_avg_above_t_m3: layer.bulk_density_t_m3, gamma_at_base_t_m3: layer.bulk_density_t_m3 }),
        ...(has(layer.specific_gravity) && { specific_gravity: layer.specific_gravity }),
        ...(has(layer.moisture_content_pct) && { moisture_content_pct: layer.moisture_content_pct }),
        ...(has(waterTableDepthM) && { water_table_depth_m: waterTableDepthM }),
        ...(has(layer.from_m) && { depth_m: layer.from_m }),
      }
    case 'settlement_sbc_is8009_noncohesive':
      return {
        ...(has(layer.n_value) && { n_value: layer.n_value }),
        ...(has(waterTableDepthM) && { water_table_depth_m: waterTableDepthM }),
        ...(has(layer.from_m) && { depth_m: layer.from_m }),
      }
    case 'settlement_sbc_is8009_cohesive':
      return {
        ...(has(layer.compression_index_cc) && { compression_index_cc: layer.compression_index_cc }),
        ...(has(layer.initial_void_ratio_e0) && { initial_void_ratio_e0: layer.initial_void_ratio_e0 }),
        ...(has(layer.bulk_density_t_m3) && { gamma_avg_above_t_m3: layer.bulk_density_t_m3 }),
        ...(has(layer.from_m) && { depth_m: layer.from_m }),
        ...(has(layer.n_value) && !has(layer.compression_index_cc) && { elastic_modulus_t_m2: +bowlesEs(layer.n_value).toFixed(1) }),
      }
    case 'spt_correction':
      return { ...(has(layer.n_value) && { n_field: layer.n_value }) }
    case 'consolidation_settlement':
      return {
        ...(has(layer.compression_index_cc) && { cc: layer.compression_index_cc }),
        ...(has(layer.initial_void_ratio_e0) && { e0: layer.initial_void_ratio_e0 }),
      }
    case 'earth_pressure_rankine':
      return {
        ...(has(layer.friction_angle_deg) && { phi_deg: layer.friction_angle_deg }),
        ...(has(layer.bulk_density_t_m3) && { gamma_kn_m3: +(layer.bulk_density_t_m3 * T_M2_TO_KPA).toFixed(2) }),
      }
    case 'immediate_settlement':
      return has(layer.n_value) ? { es_kpa: +(bowlesEs(layer.n_value) * T_M2_TO_KPA).toFixed(0) } : {}
    default:
      return {}
  }
}

export default function Calculators() {
  const [active, setActive] = useState<CalcDef>(CALC_DEFS[0])
  const [values, setValues] = useState<Record<string, any>>({})
  const [result, setResult] = useState<any>(null)
  const [planned, setPlanned] = useState<string[]>([])
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [selectedLayerId, setSelectedLayerId] = useState('')
  const [loadedFieldsMsg, setLoadedFieldsMsg] = useState('')

  useEffect(() => {
    api.availableCalculators().then((r) => setPlanned(r.planned)).catch(() => {})
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  const selectedBorehole = boreholes.find((b) => b.id === selectedBoreholeId)
  const selectedLayer = selectedBorehole?.layers.find((l: any) => l.id === selectedLayerId)

  function applyLayerToForm() {
    if (!selectedLayer) return
    const mapped = mapLayerToValues(active.id, selectedLayer, selectedBorehole?.water_table_depth_m ?? null)
    const filledKeys = Object.keys(mapped)
    if (filledKeys.length === 0) {
      setLoadedFieldsMsg('This layer has no matching data for this calculator.')
      return
    }
    setValues((v) => ({ ...v, ...mapped }))
    const stillMissing = active.fields.filter((f) => !filledKeys.includes(f.key)).map((f) => f.label)
    setLoadedFieldsMsg(
      `Filled: ${filledKeys.length} field(s) from ${selectedBorehole.borehole_id}.` +
      (stillMissing.length ? ` Still need manual input: ${stillMissing.join(', ')}.` : '')
    )
  }

  function selectCalc(def: CalcDef) {
    setActive(def); setResult(null); setError(''); setLoadedFieldsMsg('')
    const defaults: Record<string, any> = {}
    def.fields.forEach((f) => (defaults[f.key] = f.default))
    setValues(defaults)
  }

  useEffect(() => selectCalc(CALC_DEFS[0]), [])

  async function run() {
    setError(''); setResult(null)
    try {
      const numericValues = { ...values }
      active.fields.forEach((f) => { if (f.type !== 'select' && f.type !== 'text') numericValues[f.key] = parseFloat(values[f.key]) })
      setResult(await api.runCalculator(active.id, numericValues))
    } catch (e: any) { setError(e.message) }
  }

  function saveCalculation() {
    if (!result) return
    const existing = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]')
    existing.push({ calculator: active.label, inputs: values, result, savedAt: new Date().toISOString() })
    localStorage.setItem(SAVED_KEY, JSON.stringify(existing))
    setSavedCount(existing.length)
  }

  return (
    <div className="p-6 md:p-8">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1">Engineering Analysis</h1>
      <p className="text-sm text-slate-400 mb-6">Real formulas with full step-by-step working — nothing here is LLM-guessed.</p>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 shrink-0 space-y-1">
          {CALC_DEFS.map((c) => (
            <button key={c.id} onClick={() => selectCalc(c)} className={`w-full text-left px-3 py-2 rounded-xl text-sm flex items-center gap-2 ${active.id === c.id ? 'bg-violet-500/15 text-violet-300' : 'text-slate-400 hover:bg-white/[0.05]'}`}>
              <Calculator size={14} /> {c.label}
            </button>
          ))}
          <div className="pt-3 mt-3 border-t border-white/[0.06]">
            <div className="text-xs text-slate-500 px-3 mb-1">Coming soon</div>
            {planned.map((p) => (
              <div key={p} className="w-full text-left px-3 py-1.5 rounded-xl text-xs text-slate-500 flex items-center gap-2">
                <Construction size={12} /> {p.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 max-w-xl">
          {boreholes.length > 0 && (
            <div className="glass p-4 mb-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5"><Layers3 size={13} /> Load from Borehole Profile</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  className="gm-input flex-1"
                  value={selectedBoreholeId}
                  onChange={(e) => { setSelectedBoreholeId(e.target.value); setSelectedLayerId(''); setLoadedFieldsMsg('') }}
                >
                  <option value="">Select borehole...</option>
                  {boreholes.map((b) => <option key={b.id} value={b.id}>{b.borehole_id} {b.project_name ? `(${b.project_name})` : ''}</option>)}
                </select>
                <select
                  className="gm-input flex-1"
                  value={selectedLayerId}
                  onChange={(e) => setSelectedLayerId(e.target.value)}
                  disabled={!selectedBorehole}
                >
                  <option value="">Select layer...</option>
                  {selectedBorehole?.layers.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.from_m}–{l.to_m}m {l.classification ? `(${l.classification})` : ''} {l.description ? `— ${l.description}` : ''}</option>
                  ))}
                </select>
                <button onClick={applyLayerToForm} disabled={!selectedLayer} className="gm-btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <Wand2 size={13} /> Apply
                </button>
              </div>
              {loadedFieldsMsg && <p className="text-xs text-violet-300 mt-2">{loadedFieldsMsg}</p>}
            </div>
          )}

          <div className="glass p-5 space-y-3">
            {active.fields.map((f) => (
              <div key={f.key}>
                <label className="text-xs text-slate-400 mb-1 block">{f.label} {f.unit && `(${f.unit})`}</label>
                {f.type === 'select' ? (
                  <select className="gm-input w-full" value={values[f.key] ?? f.default} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
                    {f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="number" step="any" className="gm-input w-full" value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                )}
              </div>
            ))}
            <button onClick={run} className="gm-btn-primary w-full mt-2">Calculate</button>
          </div>

          {error && <div className="mt-4 text-sm text-rose-400">{error}</div>}

          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 mt-4 print:text-black" id="calc-result">
              <div className="text-2xl font-display font-semibold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                {result.result} <span className="text-sm text-slate-400">{result.unit}</span>
              </div>
              <div className="text-xs text-slate-500 font-mono mt-1">{result.formula}</div>

              <div className="mt-4">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5">Steps</div>
                <ol className="text-sm text-slate-300 space-y-1 list-decimal list-inside">{result.steps.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Assumptions</div>
                  <ul className="text-xs text-slate-400 list-disc list-inside space-y-0.5">{result.assumptions.map((a: string, i: number) => <li key={i}>{a}</li>)}</ul>
                </div>
                {result.warnings?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-amber-500/80 mb-1">Warnings</div>
                    <ul className="text-xs text-amber-400/90 list-disc list-inside space-y-0.5">{result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-4 pt-4 border-t border-white/[0.06]">
                <button onClick={saveCalculation} className="gm-btn-secondary flex items-center gap-2 text-xs"><Save size={13} /> Save calculation</button>
                <button onClick={() => window.print()} className="gm-btn-secondary flex items-center gap-2 text-xs"><Printer size={13} /> Printable report</button>
                {savedCount > 0 && <span className="text-xs text-emerald-400 self-center">Saved ({savedCount} total, stored on this device)</span>}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
