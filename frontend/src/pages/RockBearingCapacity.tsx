import { useState } from 'react'
import { Mountain, Loader2, Printer, AlertTriangle } from 'lucide-react'
import { api } from '../api/client'

// Every field here matches the backend's RockBearingCapacityRequest 1:1 -- see
// schemas.py / rock_bearing_capacity.py (IS 12070:1987) for the formula trace.
// Every method is optional -- the backend runs whichever ones have enough
// inputs and reports the minimum (governing) value, per Raahi's explicit
// "sab methods + jo bhi minimum ho" instruction (4 Aug 2026).

const ROCK_TYPES = [
  { value: 'massive_crystalline', label: 'Massive crystalline bedrock (granite, diorite, gneiss, trap rock)' },
  { value: 'foliated_sound', label: 'Foliated rock (schist/slate), sound condition' },
  { value: 'limestone_sound', label: 'Bedded limestone, sound condition' },
  { value: 'sedimentary_hard', label: 'Sedimentary rock (hard shales, sandstones)' },
  { value: 'soft_broken', label: 'Soft or broken bedrock (excl. shale), soft limestone' },
  { value: 'soft_shale', label: 'Soft shale' },
]

export default function RockBearingCapacity() {
  const [rockType, setRockType] = useState('')
  const [rmr, setRmr] = useState('')
  const [ucs, setUcs] = useState('')
  const [spacing, setSpacing] = useState('')
  const [aperture, setAperture] = useState('')
  const [apertureFilled, setApertureFilled] = useState(false)
  const [footingWidth, setFootingWidth] = useState('')
  const [limitPressure, setLimitPressure] = useState('')
  const [gammaRock, setGammaRock] = useState('')
  const [depth, setDepth] = useState('')
  const [footingRadius, setFootingRadius] = useState('')
  const [plateLoadValue, setPlateLoadValue] = useState('')
  const [correctionFactor, setCorrectionFactor] = useState('1')

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
      rock_type: rockType || undefined,
      rmr: num(rmr),
      ucs_t_m2: num(ucs),
      joint_spacing_cm: num(spacing),
      joint_aperture_mm: num(aperture),
      joint_filled_with_soil: apertureFilled,
      footing_width_cm: num(footingWidth),
      limit_pressure_t_m2: num(limitPressure),
      gamma_t_m3: num(gammaRock),
      depth_m: num(depth),
      footing_radius_m: num(footingRadius),
      plate_load_field_value_t_m2: num(plateLoadValue),
      correction_factor: num(correctionFactor) ?? 1,
    }
    setLoading(true)
    try {
      const r = await api.runRockSbc(payload)
      setResult(r)
    } catch (e: any) {
      setError(e.message || 'Calculation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl print:p-0">
      <div className="flex items-center gap-2.5 mb-1 print:hidden">
        <div className="w-9 h-9 rounded-xl bg-violet-500/12 text-violet-500 flex items-center justify-center"><Mountain size={18} /></div>
        <h1 className="font-display text-xl font-semibold text-slate-50">Rock Bearing Capacity — IS 12070:1987</h1>
      </div>
      <p className="text-xs text-slate-400 mb-5 print:hidden">
        Fill in whichever method(s) you have data for — leave the rest blank. Every method you fill in gets
        calculated; the lowest (most conservative) result is shown as the governing value.
      </p>

      {/* Method 1 */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Method 1 — Classification Table (Cl 5.2)</div>
        <label className="text-xs text-slate-400 mb-1 block">Rock type</label>
        <select className="gm-input w-full" value={rockType} onChange={(e) => setRockType(e.target.value)}>
          <option value="">— not used —</option>
          {ROCK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Method 2 */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Method 2 — RMR Table (Cl 5.3)</div>
        <label className="text-xs text-slate-400 mb-1 block">Rock Mass Rating (0–100)</label>
        <input className="gm-input w-full" value={rmr} onChange={(e) => setRmr(e.target.value)} placeholder="e.g. 55" />
      </div>

      {/* Method 3 */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Method 3 — Core Strength Formula (Cl 6.2)</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Avg. UCS of rock cores (t/m²)</label>
            <input className="gm-input w-full" value={ucs} onChange={(e) => setUcs(e.target.value)} placeholder="e.g. 5000" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Footing width (cm)</label>
            <input className="gm-input w-full" value={footingWidth} onChange={(e) => setFootingWidth(e.target.value)} placeholder="e.g. 200" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Joint spacing (cm)</label>
            <input className="gm-input w-full" value={spacing} onChange={(e) => setSpacing(e.target.value)} placeholder="e.g. 100" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Joint aperture / opening (mm)</label>
            <input className="gm-input w-full" value={aperture} onChange={(e) => setAperture(e.target.value)} placeholder="e.g. 5" />
          </div>
        </div>
        <label className="flex items-center gap-2 mt-2.5 text-xs text-slate-400">
          <input type="checkbox" checked={apertureFilled} onChange={(e) => setApertureFilled(e.target.checked)} />
          Joint is filled with soil/rock debris (allows up to 15mm aperture instead of 10mm)
        </label>
      </div>

      {/* Method 4a */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-1">Method 4 — Pressuremeter Formula (Cl 7.2)</div>
        <div className="text-[11px] text-amber-500/90 flex items-start gap-1.5 mb-2.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          Reconstructed from a degraded scan of the 1987 code — cross-check against a clean copy before relying on this for a real submission.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Limit pressure Pl (t/m²)</label>
            <input className="gm-input w-full" value={limitPressure} onChange={(e) => setLimitPressure(e.target.value)} placeholder="e.g. 800" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Unit weight of rock/soil (t/m³)</label>
            <input className="gm-input w-full" value={gammaRock} onChange={(e) => setGammaRock(e.target.value)} placeholder="e.g. 2.2" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Depth of foundation Df (m)</label>
            <input className="gm-input w-full" value={depth} onChange={(e) => setDepth(e.target.value)} placeholder="e.g. 2" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Equivalent footing radius (m)</label>
            <input className="gm-input w-full" value={footingRadius} onChange={(e) => setFootingRadius(e.target.value)} placeholder="e.g. 1" />
          </div>
        </div>
      </div>

      {/* Method 4b */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-1">Method 5 — Plate Load Test (Cl 8)</div>
        <p className="text-[11px] text-slate-500 mb-2.5">
          Cl 8 is a field-test procedure, not a formula — enter the value you already read off your own
          pressure-settlement curve at 12mm settlement.
        </p>
        <label className="text-xs text-slate-400 mb-1 block">Field-determined SBC (t/m²)</label>
        <input className="gm-input w-full" value={plateLoadValue} onChange={(e) => setPlateLoadValue(e.target.value)} placeholder="e.g. 90" />
      </div>

      {/* Correction factor */}
      <div className="glass p-4 mb-4">
        <div className="text-sm font-medium text-slate-200 mb-1">Correction Factor (Cl 9.1, optional)</div>
        <p className="text-[11px] text-slate-500 mb-2.5">
          Applied to Methods 1, 3 and 4 only (Cl 9.1 — not applicable to the RMR method). Code gives ranges
          like "1 to 1/3" for submerged joints, cavities, and unfavourable slope orientation — pick a factor
          based on your own site judgement. 1.0 = no reduction.
        </p>
        <input className="gm-input w-40" value={correctionFactor} onChange={(e) => setCorrectionFactor(e.target.value)} />
      </div>

      {error && <div className="text-xs text-rose-400 mb-3">{error}</div>}

      <button onClick={run} disabled={loading} className="gm-btn-primary text-sm flex items-center gap-2 print:hidden">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : 'Calculate'}
      </button>

      {result && (
        <div className="mt-6 space-y-4" id="rock-sbc-print">
          <div className="glass p-5 border-violet-500/30">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs text-slate-400 uppercase tracking-wide">Governing (minimum) SBC</div>
              <button onClick={() => window.print()} className="gm-btn-icon print:hidden"><Printer size={14} /></button>
            </div>
            <div className="text-3xl font-display font-semibold text-violet-400">
              {result.governing.qns_t_m2} t/m² <span className="text-base text-slate-400 font-normal">({result.governing.qns_kpa} kPa)</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">{result.governing.method} — {result.governing.clause}</div>
          </div>

          {result.warnings?.length > 0 && (
            <div className="glass p-4 border-amber-500/30 space-y-1.5">
              {result.warnings.map((w: string, i: number) => (
                <div key={i} className="text-xs text-amber-500 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {w}
                </div>
              ))}
            </div>
          )}

          <div className="glass p-5">
            <div className="text-sm font-medium text-slate-200 mb-3">All Method Results</div>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400">
                  <th className="text-left py-2 pr-3">Method</th>
                  <th className="text-left py-2 pr-3">Result</th>
                  <th className="text-left py-2">Basis</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r: any, i: number) => (
                  <tr key={i} className={`border-b border-white/[0.04] ${r === result.governing ? 'text-violet-400' : ''}`}>
                    <td className="py-1.5 pr-3">{r.method}<div className="text-slate-500">{r.description}</div></td>
                    <td className="py-1.5 pr-3">{r.qns_t_m2} t/m² ({r.qns_kpa} kPa)</td>
                    <td className="py-1.5 text-slate-400">{r.basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
