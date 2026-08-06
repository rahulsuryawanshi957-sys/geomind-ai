import { useState } from 'react'
import { Milestone as WallIcon, Loader2, Printer } from 'lucide-react'
import { api } from '../api/client'

// Every field here matches the backend's RetainingWallRequest 1:1 -- see
// schemas.py / retaining_wall_calculator.py for the full formula trace back
// to the source reference workbook (retaining_wall_design.xlsx, 3 Aug 2026).
const FIELD_GROUPS: { title: string; fields: { key: string; label: string; unit?: string; placeholder?: string }[] }[] = [
  {
    title: 'Geometry',
    fields: [
      { key: 'H_wall', label: 'Stem Height (above base slab)', unit: 'm', placeholder: '4' },
      { key: 'D_found', label: 'Founding Depth (below EGL)', unit: 'm', placeholder: '1.5' },
      { key: 't_base', label: 'Base Slab Thickness', unit: 'm', placeholder: '0.45' },
      { key: 'B_base', label: 'Base Slab Width (total)', unit: 'm', placeholder: '2.8' },
      { key: 'B_toe', label: 'Toe Width', unit: 'm', placeholder: '0.8' },
      { key: 'B_heel', label: 'Heel Width', unit: 'm', placeholder: '1.55' },
      { key: 't_top', label: 'Stem Thickness at Top', unit: 'm', placeholder: '0.25' },
      { key: 't_bot', label: 'Stem Thickness at Bottom', unit: 'm', placeholder: '0.45' },
    ],
  },
  {
    title: 'Soil Properties',
    fields: [
      { key: 'gamma', label: 'Moist/Bulk Unit Weight of Backfill', unit: 'kN/m³', placeholder: '18' },
      { key: 'gamma_sat', label: 'Saturated Unit Weight', unit: 'kN/m³', placeholder: '20' },
      { key: 'phi', label: 'Angle of Internal Friction φ', unit: 'deg', placeholder: '30' },
      { key: 'cohesion', label: 'Cohesion c', unit: 'kPa', placeholder: '0' },
      { key: 'qa', label: 'Allowable Bearing Capacity (soil report)', unit: 'kPa', placeholder: '150' },
      { key: 'water_table_depth_m', label: 'Groundwater Table Depth (below EGL)', unit: 'm', placeholder: '100 = not encountered' },
      { key: 'beta', label: 'Backfill Slope Angle', unit: 'deg', placeholder: '0' },
      { key: 'delta', label: 'Wall-Backfill Friction Angle (blank = 2/3 φ)', unit: 'deg' },
      { key: 'mu', label: 'Base-Soil Friction Coefficient (blank = tan 2/3 φ)', unit: '-' },
      { key: 'gamma_c', label: 'Unit Weight of Concrete', unit: 'kN/m³', placeholder: '24' },
    ],
  },
  {
    title: 'Surcharge & Seismic',
    fields: [
      { key: 'q_surch', label: 'Uniform Surcharge', unit: 'kPa', placeholder: '10' },
      { key: 'q_traffic', label: 'Traffic Load (equivalent UDL)', unit: 'kPa', placeholder: '0' },
      { key: 'q_build', label: 'Adjacent Building Load (equivalent UDL)', unit: 'kPa', placeholder: '0' },
      { key: 'q_strip', label: 'Strip Load (equivalent UDL)', unit: 'kPa', placeholder: '0' },
      { key: 'kh', label: 'Horizontal Seismic Coefficient kh (blank = Z/2)', unit: '-' },
      { key: 'kv', label: 'Vertical Seismic Coefficient kv (blank = 0.5×kh)', unit: '-' },
    ],
  },
  {
    title: 'Settlement (optional — leave blank for "insufficient data")',
    fields: [
      { key: 'Es_kpa', label: 'Modulus of Elasticity of Soil Es', unit: 'kPa', placeholder: '15000' },
      { key: 'poisson_ratio', label: "Poisson's Ratio", unit: '-', placeholder: '0.3' },
      { key: 'influence_factor', label: 'Influence Factor If', unit: '-', placeholder: '0.8' },
      { key: 'Cc', label: 'Compression Index Cc' },
      { key: 'e0', label: 'Initial Void Ratio e0' },
      { key: 'Hc_m', label: 'Compressible Layer Thickness', unit: 'm' },
      { key: 'sigma0_kpa', label: "Effective Overburden σ0'", unit: 'kPa' },
      { key: 'C_alpha', label: 'Secondary Compression Index Cα' },
      { key: 't_ratio', label: 'Time Ratio t2/t1' },
    ],
  },
]

const DEFAULTS: Record<string, string> = {
  H_wall: '4', D_found: '1.5', t_base: '0.45', B_base: '2.8', B_toe: '0.8', B_heel: '1.55',
  t_top: '0.25', t_bot: '0.45',
  gamma: '18', gamma_sat: '20', phi: '30', cohesion: '0', qa: '150',
  water_table_depth_m: '100', beta: '0', gamma_c: '24',
  q_surch: '10', q_traffic: '0', q_build: '0', q_strip: '0',
  Es_kpa: '15000', poisson_ratio: '0.3', influence_factor: '0.8',
}

function StabilityTable({ static_, seismic }: { static_: any; seismic: any }) {
  const rows: [string, string, (v: any) => string][] = [
    ['sum_V_kn_m', 'ΣV (total vertical load)', (v) => `${v} kN/m`],
    ['horizontal_driving_force_kn_m', 'Horizontal driving force', (v) => `${v} kN/m`],
    ['Mo_knm_m', 'Overturning moment Mo', (v) => `${v} kNm/m`],
    ['Mr_knm_m', 'Resisting moment Mr', (v) => `${v} kNm/m`],
    ['FoS_overturning', 'FoS — Overturning', (v) => `${v}`],
    ['overturning_status', 'Overturning status', (v) => v],
    ['FoS_sliding', 'FoS — Sliding', (v) => `${v}`],
    ['sliding_status', 'Sliding status', (v) => v],
    ['eccentricity_m', 'Eccentricity e', (v) => `${v} m`],
    ['within_middle_third', 'Middle-third check', (v) => (v ? 'OK — within middle third' : 'OUTSIDE — redesign')],
    ['qmax_kpa', 'qmax (base pressure)', (v) => `${v} kPa`],
    ['qmin_kpa', 'qmin (base pressure)', (v) => `${v} kPa`],
  ]
  const statusClass = (v: string) => (v === 'PASS' ? 'text-emerald-500 font-medium' : v === 'FAIL' ? 'text-violet-500 font-medium' : '')
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-white/[0.08] text-slate-400">
          <th className="text-left py-2 pr-3">Check</th>
          <th className="text-left py-2 pr-3">Static</th>
          <th className="text-left py-2">Seismic</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, label, fmt]) => (
          <tr key={key} className="border-b border-white/[0.04]">
            <td className="py-1.5 pr-3 text-slate-400">{label}</td>
            <td className={`py-1.5 pr-3 ${key.endsWith('status') || key === 'within_middle_third' ? statusClass(String(static_[key])) : ''}`}>
              {fmt(static_[key])}
            </td>
            <td className={`py-1.5 ${key.endsWith('status') || key === 'within_middle_third' ? statusClass(String(seismic[key])) : ''}`}>
              {fmt(seismic[key])}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function BearingTable({ static_, seismic }: { static_: any; seismic: any }) {
  const rows: [string, string][] = [
    ['B_effective_m', 'Effective width B\''],
    ['depth_factor_dc', 'Depth factor dc'],
    ['depth_factor_dq_dgamma', 'Depth factor dq = dγ'],
    ['load_inclination_deg', 'Load inclination α (deg)'],
    ['qu_kpa', 'Ultimate bearing capacity qu (kPa)'],
    ['qnu_kpa', 'Net ultimate qnu (kPa)'],
    ['qns_kpa', 'Net safe qns (kPa)'],
    ['qsafe_kpa', 'Gross safe qsafe (kPa)'],
    ['governing_allowable_kpa', 'Governing allowable (kPa)'],
    ['applied_qmax_kpa', 'Applied qmax (kPa)'],
    ['status', 'Status'],
  ]
  const statusClass = (v: string) => (v === 'PASS' ? 'text-emerald-500 font-medium' : v === 'FAIL' ? 'text-violet-500 font-medium' : '')
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b border-white/[0.08] text-slate-400">
          <th className="text-left py-2 pr-3">Check</th>
          <th className="text-left py-2 pr-3">Static</th>
          <th className="text-left py-2">Seismic</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, label]) => (
          <tr key={key} className="border-b border-white/[0.04]">
            <td className="py-1.5 pr-3 text-slate-400">{label}</td>
            <td className={`py-1.5 pr-3 ${key === 'status' ? statusClass(static_[key]) : ''}`}>{String(static_[key])}</td>
            <td className={`py-1.5 ${key === 'status' ? statusClass(seismic[key]) : ''}`}>{String(seismic[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function RetainingWall() {
  const [values, setValues] = useState<Record<string, string>>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }))
  }

  async function run() {
    setError(''); setResult(null)
    const required = ['H_wall', 'D_found', 't_base', 'B_base', 'B_toe', 'B_heel', 't_top', 't_bot', 'gamma', 'gamma_sat', 'phi']
    for (const k of required) {
      if (!values[k] || isNaN(parseFloat(values[k]))) {
        setError(`Provide a valid number for "${k}".`)
        return
      }
    }
    const payload: Record<string, any> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v === '' || v == null) continue
      const n = parseFloat(v)
      payload[k] = isNaN(n) ? v : n
    }
    setLoading(true)
    try {
      const r = await api.runRetainingWall(payload)
      setResult(r)
    } catch (e: any) {
      setError(e?.message || 'Calculation fail ho gayi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="flex items-center gap-2.5 mb-1">
        <WallIcon size={20} className="text-violet-500" />
        <h1 className="font-display text-xl font-semibold text-slate-50">Retaining Wall — Geotechnical Checks</h1>
      </div>
      <p className="text-sm text-slate-400 mb-6">
        Rankine + Coulomb earth pressure, hydrostatic pressure, Mononobe-Okabe seismic pressure (IS 1893:2016),
        sliding/overturning/eccentricity/bearing stability, IS 6403 bearing capacity, and settlement — static and
        seismic cases side by side. Structural/RCC design of the stem, heel, toe and shear key is not covered here.
      </p>

      <div className="space-y-5">
        {FIELD_GROUPS.map((group) => (
          <div key={group.title} className="glass p-5">
            <h2 className="text-xs font-semibold text-slate-400 tracking-wide uppercase mb-3">{group.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.fields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs text-slate-400 mb-1">
                    {f.label} {f.unit ? <span className="text-slate-500">({f.unit})</span> : null}
                  </label>
                  <input
                    type="number" step="any"
                    className="gm-input w-full"
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mt-4 text-sm text-violet-500">{error}</div>}

      <button onClick={run} disabled={loading} className="gm-btn-primary mt-5 flex items-center gap-2">
        {loading ? <Loader2 size={15} className="animate-spin" /> : <WallIcon size={15} />}
        Calculate
      </button>

      {result && (
        <div className="mt-8 space-y-5 print:text-black" id="retaining-wall-result">
          {result.warnings?.length > 0 && (
            <div className="glass p-4 border-violet-500/30">
              <div className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-2">Warnings</div>
              <ul className="text-xs text-slate-300 space-y-1 list-disc pl-4">
                {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-end print:hidden">
            <button onClick={() => window.print()} className="gm-btn-secondary flex items-center gap-1.5 text-xs">
              <Printer size={13} /> Print
            </button>
          </div>

          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Earth Pressure</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-400 mb-1.5">Rankine (reference)</div>
                <div>Ka = {result.earth_pressure.rankine.Ka.toFixed(4)} · Kp = {result.earth_pressure.rankine.Kp.toFixed(4)}</div>
                <div>Pa = {result.earth_pressure.rankine.Pa_kn_m} kN/m · Pp = {result.earth_pressure.rankine.Pp_kn_m} kN/m</div>
              </div>
              <div>
                <div className="text-slate-400 mb-1.5">Coulomb (design basis)</div>
                <div>Ka = {result.earth_pressure.coulomb.Ka.toFixed(4)}</div>
                <div>Pa = {result.earth_pressure.coulomb.Pa_kn_m} kN/m · Pa_h = {result.earth_pressure.coulomb.Pa_h_kn_m} kN/m · ȳ = {result.earth_pressure.coulomb.ybar_m} m</div>
              </div>
            </div>
          </div>

          {result.water_pressure.Hw > 0 && (
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-slate-100 mb-3">Water Pressure</h3>
              <div className="text-xs text-slate-300">
                Hw = {result.water_pressure.Hw} m · Pw = {result.water_pressure.Pw_kn_m} kN/m
                (used in stability: {result.water_pressure.Pw_used_kn_m} kN/m — drainage {result.water_pressure.drainage_provided ? 'assumed provided' : 'not provided'})
                · Uplift = {result.water_pressure.uplift_force_kn_m} kN/m
              </div>
            </div>
          )}

          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Seismic Earth Pressure (Mononobe-Okabe)</h3>
            <div className="text-xs text-slate-300">
              θ = {result.seismic_pressure.theta_deg}° · Kae = {result.seismic_pressure.Kae.toFixed(4)} ·
              Pae = {result.seismic_pressure.Pae_kn_m} kN/m · Pae_h = {result.seismic_pressure.Pae_h_kn_m} kN/m
            </div>
          </div>

          <div className="glass p-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Stability Checks</h3>
            <StabilityTable static_={result.stability.static} seismic={result.stability.seismic} />
          </div>

          <div className="glass p-5 overflow-x-auto">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Bearing Capacity (IS 6403)</h3>
            <div className="text-xs text-slate-400 mb-2">
              Nc = {result.bearing_capacity.Nc} · Nq = {result.bearing_capacity.Nq} · Nγ = {result.bearing_capacity.Ngamma}
            </div>
            <BearingTable static_={result.bearing_capacity.cases.static} seismic={result.bearing_capacity.cases.seismic} />
          </div>

          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">Settlement</h3>
            <div className="text-xs text-slate-300 space-y-1">
              <div>Net foundation pressure qnet = {result.settlement.qnet_kpa} kPa</div>
              <div>Immediate (elastic) settlement = {result.settlement.immediate_settlement_mm} {typeof result.settlement.immediate_settlement_mm === 'number' ? 'mm' : ''}</div>
              <div>Consolidation settlement = {result.settlement.consolidation_settlement_mm} {typeof result.settlement.consolidation_settlement_mm === 'number' ? 'mm' : ''}</div>
              <div>Secondary settlement = {result.settlement.secondary_settlement_mm} {typeof result.settlement.secondary_settlement_mm === 'number' ? 'mm' : ''}</div>
              <div className="font-medium text-slate-100 pt-1">Total = {result.settlement.total_settlement_mm} {typeof result.settlement.total_settlement_mm === 'number' ? 'mm' : ''}</div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">{result.scope_note}</p>
        </div>
      )}
    </div>
  )
}
