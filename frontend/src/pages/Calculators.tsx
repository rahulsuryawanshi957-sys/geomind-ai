import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Calculator, Construction, Printer, Save } from 'lucide-react'
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

const SAVED_KEY = 'geomind_saved_calculations'

export default function Calculators() {
  const [active, setActive] = useState<CalcDef>(CALC_DEFS[0])
  const [values, setValues] = useState<Record<string, any>>({})
  const [result, setResult] = useState<any>(null)
  const [planned, setPlanned] = useState<string[]>([])
  const [error, setError] = useState('')
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => { api.availableCalculators().then((r) => setPlanned(r.planned)).catch(() => {}) }, [])

  function selectCalc(def: CalcDef) {
    setActive(def); setResult(null); setError('')
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
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1">Engineering Calculators</h1>
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
