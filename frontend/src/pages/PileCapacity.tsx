import { useEffect, useState } from 'react'
import { Milestone, Loader2, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// Stress diagram + critical-depth (influence zone) explainer -- added 5 Aug
// 2026, same request pattern as Ground Improvement / Lateral Capacity / Rock
// Socket Pile. Mirrors the actual logic in pile_calculator.py's
// run_pile_capacity(): overburden stress (sigma'v) builds up linearly with
// depth, gets FROZEN once "critical depth" (15D for IS:2911, 20D for
// IRC:78, measured below the ineffective ground level) is crossed -- that
// frozen value is what every deeper segment's skin friction AND the end
// bearing surcharge term both use. That freeze depth IS the "influence
// zone" for this calculator.

function PileStressDiagram({ code }: { code: string }) {
  const criticalLabel = code === 'IRC_78' ? '20 × D' : '15 × D'
  return (
    <svg viewBox="0 0 260 220" width="260" height="220" className="text-slate-400">
      <line x1="10" y1="20" x2="250" y2="20" stroke="rgb(226 232 240 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      <text x="14" y="15" fontSize="9" fill="currentColor">GL</text>
      {/* pile shaft */}
      <rect x="110" y="20" width="20" height="170" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      {/* stress diagram: triangle widening to critical depth, then constant (capped) */}
      <path d="M 108 20 L 70 110 L 70 190 L 108 190 Z" fill="rgb(45 212 191 / 0.15)" stroke="rgb(45 212 191)" strokeWidth="1" />
      <line x1="70" y1="110" x2="108" y2="110" stroke="rgb(45 212 191 / 0.4)" strokeWidth="1" strokeDasharray="2 2" />
      {/* critical depth line */}
      <line x1="20" y1="110" x2="240" y2="110" stroke="rgb(244 63 94 / 0.6)" strokeWidth="1" strokeDasharray="3 2" />
      <text x="150" y="106" fontSize="9" fill="rgb(244 63 94)">critical depth = {criticalLabel} (σ'v frozen below here)</text>
      {/* skin friction arrows along whole shaft */}
      {[45, 75, 105, 135, 165].map((y, i) => (
        <line key={i} x1="95" y1={y} x2="112" y2={y} stroke="rgb(34 211 238)" strokeWidth="1.2" markerEnd="url(#pl-arrow)" />
      ))}
      <text x="20" y="70" fontSize="9" fill="rgb(34 211 238)">qs (skin</text>
      <text x="20" y="82" fontSize="9" fill="rgb(34 211 238)">friction)</text>
      {/* end bearing arrow at toe */}
      <line x1="120" y1="205" x2="120" y2="192" stroke="rgb(244 63 94)" strokeWidth="1.5" markerEnd="url(#pl-arrow2)" />
      <text x="120" y="216" textAnchor="middle" fontSize="9" fill="rgb(244 63 94)">Qp (end bearing)</text>
      {/* sigma'v axis label */}
      <text x="60" y="205" fontSize="9" fill="rgb(45 212 191)" textAnchor="middle">σ'v</text>
      <defs>
        <marker id="pl-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgb(34 211 238)" /></marker>
        <marker id="pl-arrow2" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0,0 L6,0 L3,6 Z" fill="rgb(244 63 94)" /></marker>
      </defs>
    </svg>
  )
}

export default function PileCapacity() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [diameterMm, setDiameterMm] = useState('1000')
  const [pileLength, setPileLength] = useState('18')
  const [cutoffDepth, setCutoffDepth] = useState('1')
  const [code, setCode] = useState('IS_2911')
  const [scourDepth, setScourDepth] = useState('')
  const [liquefactionDepth, setLiquefactionDepth] = useState('')
  const [criticalDepthFactor, setCriticalDepthFactor] = useState('')
  const [waterTableOverride, setWaterTableOverride] = useState('')
  const [densityOverride, setDensityOverride] = useState('')
  const [cohesionOverride, setCohesionOverride] = useState('')
  const [phiOverride, setPhiOverride] = useState('')
  const [fos, setFos] = useState('2.5')
  const [command, setCommand] = useState('')
  const [parsing, setParsing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  async function runCommand() {
    if (!command.trim()) return
    setParsing(true)
    try {
      const { parsed } = await api.parsePileCommand(command)
      if (parsed.diameter_m) setDiameterMm(String(parsed.diameter_m * 1000))
      if (parsed.pile_length_m) setPileLength(String(parsed.pile_length_m))
      if (parsed.cutoff_depth_m) setCutoffDepth(String(parsed.cutoff_depth_m))
      if (parsed.code) setCode(parsed.code)
      if (parsed.fos_compression) setFos(String(parsed.fos_compression))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setParsing(false)
    }
  }

  async function run() {
    setError(''); setResult(null)
    if (!selectedBoreholeId) { setError('Pehle ek borehole select karo.'); return }
    if (!diameterMm || !pileLength) { setError('Pile diameter aur length dono do.'); return }

    setLoading(true)
    try {
      const overrides: Record<string, number> = {}
      if (densityOverride) overrides.bulk_density_t_m3 = parseFloat(densityOverride)
      if (cohesionOverride) overrides.cohesion_t_m2 = parseFloat(cohesionOverride)
      if (phiOverride) overrides.friction_angle_deg = parseFloat(phiOverride)

      const r = await api.runPileCapacity({
        borehole_id: selectedBoreholeId,
        diameter_m: parseFloat(diameterMm) / 1000,
        pile_length_m: parseFloat(pileLength),
        cutoff_depth_m: cutoffDepth ? parseFloat(cutoffDepth) : 0,
        code,
        water_table_depth_m: waterTableOverride ? parseFloat(waterTableOverride) : null,
        scour_depth_m: scourDepth ? parseFloat(scourDepth) : null,
        liquefaction_depth_m: liquefactionDepth ? parseFloat(liquefactionDepth) : null,
        critical_depth_factor: criticalDepthFactor ? parseFloat(criticalDepthFactor) : null,
        fos_compression: parseFloat(fos),
        fos_uplift: parseFloat(fos),
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
        <Milestone size={20} className="text-violet-400" /> Pile Capacity (IS 2911 / IRC:78)
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        Bored cast-in-situ pile -- compression + uplift capacity, static formula method. Phase 1:
        driven piles, rock sockets, and pile groups aren't covered yet.
      </p>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 mb-4">
        <label className="text-xs text-slate-400 mb-1 block">AI command (e.g. "Design a 1000mm pile using IRC:78")</label>
        <div className="flex gap-2">
          <input
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={command} onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runCommand()}
            placeholder="Type a command..."
          />
          <button onClick={runCommand} disabled={parsing}
            className="px-3 py-2 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-700/50 text-sm flex items-center gap-1">
            {parsing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Apply
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Borehole</label>
          <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={selectedBoreholeId} onChange={(e) => setSelectedBoreholeId(e.target.value)}>
            <option value="">Select borehole...</option>
            {boreholes.map((b) => <option key={b.id} value={b.id}>{b.borehole_id} {b.project_name ? `(${b.project_name})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Design code</label>
          <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="IS_2911">IS 2911 Part-1 Sec-2:2010 (Building)</option>
            <option value="IRC_78">IRC:78:2024 (Bridge)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Pile diameter (mm)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={diameterMm} onChange={(e) => setDiameterMm(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Pile length below cutoff (m)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={pileLength} onChange={(e) => setPileLength(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Cutoff depth (m)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={cutoffDepth} onChange={(e) => setCutoffDepth(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Water table depth override (m, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={waterTableOverride} onChange={(e) => setWaterTableOverride(e.target.value)}
            placeholder="blank = use borehole's own recorded value" />
          <p className="text-[11px] text-slate-500 mt-1">Set to 0 to solve fully submerged (e.g. monsoon/flood check), or any other depth for sensitivity.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Scour depth (m, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={scourDepth} onChange={(e) => setScourDepth(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Liquefaction depth (m, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={liquefactionDepth} onChange={(e) => setLiquefactionDepth(e.target.value)}
            placeholder="from Liquefaction Analysis, if run" />
          <p className="text-[11px] text-slate-500 mt-1">Whichever of scour/liquefaction depth is deeper governs the ineffective ground level.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Critical depth multiplier override (xD, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={criticalDepthFactor} onChange={(e) => setCriticalDepthFactor(e.target.value)}
            placeholder={code === 'IS_2911' ? 'default 15' : 'default 20'} />
        </div>

        <div className="pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Manual soil property overrides (optional) -- applies borehole-wide, always wins over recorded/estimated values</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Bulk density (t/m³)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={densityOverride} onChange={(e) => setDensityOverride(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cohesion c (t/m²)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={cohesionOverride} onChange={(e) => setCohesionOverride(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Friction angle φ (deg)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={phiOverride} onChange={(e) => setPhiOverride(e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Factor of Safety</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={fos} onChange={(e) => setFos(e.target.value)} />
        </div>
      </div>

      <button onClick={run} disabled={loading}
        className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50">
        {loading && <Loader2 size={14} className="animate-spin" />} Calculate Pile Capacity
      </button>

      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Compression Capacity</div>
              <div className="text-2xl font-semibold text-slate-50">{result.allowable_compression_capacity_t} t</div>
              <div className="text-xs text-slate-500 mt-1">
                Ultimate {result.ultimate_compression_capacity_t} t / FOS {result.fos_compression}
                {' '}(Qs {result.ultimate_skin_friction_t} t + Qp {result.ultimate_end_bearing_t} t)
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Uplift Capacity</div>
              <div className="text-2xl font-semibold text-slate-50">{result.allowable_uplift_capacity_t} t</div>
              <div className="text-xs text-slate-500 mt-1">
                Ultimate {result.ultimate_uplift_capacity_t} t / FOS {result.fos_uplift}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <div className="text-sm font-medium text-slate-200 mb-2">Layer-wise skin friction -- full working, every segment</div>
            <table className="text-xs text-slate-300 min-w-[1400px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left py-1 pr-3">Depth (m)</th>
                  <th className="pr-3">Thickness</th>
                  <th className="pr-3">Soil</th>
                  <th className="pr-3">Below WT?</th>
                  <th className="pr-3">c (t/m²)</th>
                  <th className="pr-3">φ (°)</th>
                  <th className="pr-3">N used</th>
                  <th className="pr-3">γ bulk</th>
                  <th className="pr-3">γ eff</th>
                  <th className="pr-3">σ'v start</th>
                  <th className="pr-3">σ'v end</th>
                  <th className="pr-3">σ'v avg</th>
                  <th className="pr-3">Capped?</th>
                  <th className="pr-3">K</th>
                  <th className="pr-3">tanφ</th>
                  <th className="pr-3">α</th>
                  <th className="pr-3">Cohesion term (t)</th>
                  <th className="pr-3">Friction term (t)</th>
                  <th className="pr-3">Segment Qs (t)</th>
                  <th>Running Qs (t)</th>
                </tr>
              </thead>
              <tbody>
                {result.layer_report.map((l: any, i: number) => (
                  <tr key={i} className={`border-t border-slate-800 ${l.ignored_scour_or_liquefaction ? 'text-slate-600 italic' : ''}`}>
                    <td className="py-1 pr-3 whitespace-nowrap">{l.from_m}-{l.to_m}</td>
                    <td className="text-center pr-3">{l.thickness_m}</td>
                    <td className="text-center pr-3 whitespace-nowrap">{l.founding_layer_classification}</td>
                    <td className="text-center pr-3">{l.below_water_table ? 'Yes' : 'No'}</td>
                    <td className="text-center pr-3">{l.cohesion_t_m2}</td>
                    <td className="text-center pr-3">{l.phi_deg}</td>
                    <td className="text-center pr-3">{l.n_value_used ?? '-'}</td>
                    <td className="text-center pr-3">{l.gamma_bulk_t_m3}</td>
                    <td className="text-center pr-3">{l.gamma_eff_t_m3}</td>
                    <td className="text-center pr-3">{l.sigma_v_start_t_m2}</td>
                    <td className="text-center pr-3">{l.sigma_v_end_t_m2}</td>
                    <td className="text-center pr-3">{l.sigma_v_avg_t_m2}</td>
                    <td className="text-center pr-3">{l.overburden_capped_here ? 'Yes' : 'No'}</td>
                    <td className="text-center pr-3">{l.K_used}</td>
                    <td className="text-center pr-3">{l.tan_phi}</td>
                    <td className="text-center pr-3">{l.alpha ?? '-'}</td>
                    <td className="text-center pr-3">{l.cohesion_term_t}</td>
                    <td className="text-center pr-3">{l.friction_term_t}</td>
                    <td className="text-center pr-3 font-medium">{l.ignored_scour_or_liquefaction ? '0 (scour/liq.)' : l.skin_friction_t}</td>
                    <td className="text-center">{l.running_skin_friction_t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <div className="text-sm font-medium text-slate-200 mb-2">
              End bearing candidates -- full working (governing: {result.governing_end_bearing_zone})
            </div>
            <table className="text-xs text-slate-300 min-w-[900px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left py-1 pr-3">Zone</th>
                  <th className="pr-3">Depth (m)</th>
                  <th className="pr-3">c (t/m²)</th>
                  <th className="pr-3">φ (°)</th>
                  <th className="pr-3">γ eff</th>
                  <th className="pr-3">σ'v toe</th>
                  <th className="pr-3">Ap (m²)</th>
                  <th className="pr-3">Nc</th>
                  <th className="pr-3">Nq</th>
                  <th className="pr-3">Ny</th>
                  <th className="pr-3">c·Nc term (t)</th>
                  <th className="pr-3">σ'v·Nq term (t)</th>
                  <th className="pr-3">γ·D·Ny term (t)</th>
                  <th>Qp (t)</th>
                </tr>
              </thead>
              <tbody>
                {result.end_bearing_candidates.map((c: any, i: number) => (
                  <tr key={i} className={`border-t border-slate-800 ${c.at === result.governing_end_bearing_zone ? 'text-violet-300' : ''}`}>
                    <td className="py-1 pr-3 whitespace-nowrap">{c.at}</td>
                    <td className="text-center pr-3">{c.depth_m}</td>
                    <td className="text-center pr-3">{c.cohesion_t_m2}</td>
                    <td className="text-center pr-3">{c.phi_deg}</td>
                    <td className="text-center pr-3">{c.gamma_eff_t_m3}</td>
                    <td className="text-center pr-3">{c.sigma_v_toe_t_m2}</td>
                    <td className="text-center pr-3">{c.Ap_m2}</td>
                    <td className="text-center pr-3">{c.Nc}</td>
                    <td className="text-center pr-3">{c.Nq}</td>
                    <td className="text-center pr-3">{c.Ny}</td>
                    <td className="text-center pr-3">{c.cohesion_term_t}</td>
                    <td className="text-center pr-3">{c.surcharge_term_t}</td>
                    <td className="text-center pr-3">{c.weight_term_t}</td>
                    <td className="text-center font-medium">{c.end_bearing_t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.estimated_fields?.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
              <div className="text-sm font-medium text-amber-300 mb-1">Estimated values (not directly measured)</div>
              <ul className="text-xs text-amber-200/80 list-disc list-inside space-y-0.5">
                {result.estimated_fields.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <TheorySection
              title="Pile Compression + Uplift — Overburden Stress Diagram & Critical Depth (Influence Zone)"
              source={`${code === 'IRC_78' ? 'IRC:78:2024' : 'IS 2911 Part-1 Sec-2:2010'} — static formula method (α-method for cohesion, earth-pressure-coefficient method for friction).`}
              confidence="High"
              diagram={<PileStressDiagram code={code} />}
              steps={[
                { label: "Effective overburden stress σ'v", formula: "σ'v = Σ γ_eff × thickness, from GL down (γ_eff = γ_bulk − 1.0 t/m³ below water table)" },
                { label: 'Critical depth (influence zone limit)', formula: code === 'IRC_78' ? '20 × D below the ineffective ground level' : '15 × D below the ineffective ground level', note: 'ineffective ground level = the deeper of scour depth / liquefaction depth, if given' },
                { label: "Beyond critical depth", formula: "σ'v is FROZEN at its value at the critical depth", note: "every deeper segment reuses this same frozen σ'v — it does not keep increasing with depth" },
                { label: 'Skin friction per segment', formula: 'qs = [α×c + K×σ\'v,avg×tanφ] × (π×D) × thickness', note: 'α = adhesion factor (from cohesion for IS:2911, from N-value for IRC:78); K = 1.0 (IS:2911) or 1.5 (IRC:78)' },
                { label: 'End bearing (checked at 3 depths, lowest governs)', formula: 'Qp = Ap × (c×Nc + σ\'v,toe×Nq + 0.5×γ×D×Nγ)', note: 'checked at toe−2D, toe, and toe+2D — the governing (lowest) one is used' },
              ]}
              extraNote="The critical-depth cap exists because in a deep uniform sand/clay stratum, skin friction and end-bearing pressure don't keep growing forever with depth — field tests show they plateau. Capping σ'v beyond 15D/20D avoids over-estimating capacity for long piles. Nq/Nγ here use this app's own Vesic-type formula (same as the IS:6403 shear calculator) rather than a code chart, for internal consistency — see the warnings below."
            />
          </div>

          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-300 mb-1">Assumptions & warnings</div>
            <ul className="text-xs text-slate-400 list-disc list-inside space-y-0.5">
              {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
