import { useEffect, useState } from 'react'
import { Network, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../api/client'

export default function PileGroup() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [diameterMm, setDiameterMm] = useState('1000')
  const [pileLength, setPileLength] = useState('18')
  const [cutoffDepth, setCutoffDepth] = useState('1')
  const [code, setCode] = useState('IS_2911')
  const [numRows, setNumRows] = useState('3')
  const [numCols, setNumCols] = useState('3')
  const [spacingM, setSpacingM] = useState('2.5')
  const [capLoad, setCapLoad] = useState('500')
  const [momentX, setMomentX] = useState('0')
  const [momentY, setMomentY] = useState('0')
  const [pileBehaviour, setPileBehaviour] = useState('friction')
  const [waterTableOverride, setWaterTableOverride] = useState('')
  const [scourDepth, setScourDepth] = useState('')
  const [liquefactionDepth, setLiquefactionDepth] = useState('')
  const [densityOverride, setDensityOverride] = useState('')
  const [cohesionOverride, setCohesionOverride] = useState('')
  const [phiOverride, setPhiOverride] = useState('')
  const [fos, setFos] = useState('2.5')

  const [settlementType, setSettlementType] = useState('')
  const [es, setEs] = useState('')
  const [mu, setMu] = useState('0.3')
  const [cc, setCc] = useState('')
  const [e0, setE0] = useState('')
  const [hM, setHM] = useState('')
  const [sigma0, setSigma0] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  async function run() {
    setError(''); setResult(null)
    if (!selectedBoreholeId) { setError('Select a borehole first.'); return }
    if (!diameterMm || !pileLength || !numRows || !numCols || !spacingM || !capLoad) {
      setError('Fill diameter, pile length, rows, columns, spacing and cap load.')
      return
    }

    setLoading(true)
    try {
      const overrides: Record<string, number> = {}
      if (densityOverride) overrides.bulk_density_t_m3 = parseFloat(densityOverride)
      if (cohesionOverride) overrides.cohesion_t_m2 = parseFloat(cohesionOverride)
      if (phiOverride) overrides.friction_angle_deg = parseFloat(phiOverride)

      const payload: any = {
        borehole_id: selectedBoreholeId,
        diameter_m: parseFloat(diameterMm) / 1000,
        pile_length_m: parseFloat(pileLength),
        cutoff_depth_m: cutoffDepth ? parseFloat(cutoffDepth) : 0,
        code,
        num_rows: parseInt(numRows), num_cols: parseInt(numCols), spacing_m: parseFloat(spacingM),
        cap_load_t: parseFloat(capLoad),
        moment_x_t_m: momentX ? parseFloat(momentX) : 0,
        moment_y_t_m: momentY ? parseFloat(momentY) : 0,
        pile_behaviour: pileBehaviour,
        water_table_depth_m: waterTableOverride ? parseFloat(waterTableOverride) : null,
        scour_depth_m: scourDepth ? parseFloat(scourDepth) : null,
        liquefaction_depth_m: liquefactionDepth ? parseFloat(liquefactionDepth) : null,
        fos_compression: parseFloat(fos),
        fos_uplift: parseFloat(fos),
        overrides,
      }
      if (settlementType) {
        payload.settlement_soil_type = settlementType
        if (settlementType === 'granular') {
          payload.settlement_es_t_m2 = es ? parseFloat(es) : null
          payload.settlement_mu = mu ? parseFloat(mu) : null
        } else if (settlementType === 'clay') {
          payload.settlement_cc = cc ? parseFloat(cc) : null
          payload.settlement_e0 = e0 ? parseFloat(e0) : null
          payload.settlement_h_m = hM ? parseFloat(hM) : null
          payload.settlement_sigma0_kpa = sigma0 ? parseFloat(sigma0) : null
        }
      }

      const r = await api.runPileGroup(payload)
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
        <Network size={20} className="text-violet-400" /> Pile Group Analysis
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        Group efficiency (Converse-Labarre), block failure (equivalent pier), pile cap load
        distribution, and equivalent-raft settlement -- building on the single-pile capacity engine.
      </p>

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

        <div className="md:col-span-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Single pile (same as Pile Capacity)</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Diameter (mm)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={diameterMm} onChange={(e) => setDiameterMm(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Length below cutoff (m)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={pileLength} onChange={(e) => setPileLength(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cutoff depth (m)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={cutoffDepth} onChange={(e) => setCutoffDepth(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Group layout</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Rows</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={numRows} onChange={(e) => setNumRows(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Columns</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={numCols} onChange={(e) => setNumCols(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Spacing c/c (m)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={spacingM} onChange={(e) => setSpacingM(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Rectangular grid, same centre-to-centre spacing both directions.</p>
        </div>

        <div className="md:col-span-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Pile cap loading</div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Total vertical load P (t)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={capLoad} onChange={(e) => setCapLoad(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Moment Mx (t·m, optional)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={momentX} onChange={(e) => setMomentX(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Moment My (t·m, optional)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={momentY} onChange={(e) => setMomentY(e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Pile behaviour</label>
          <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={pileBehaviour} onChange={(e) => setPileBehaviour(e.target.value)}>
            <option value="friction">Friction pile (raft at 2/3 L)</option>
            <option value="end_bearing">End-bearing pile (raft at toe)</option>
          </select>
          <p className="text-[11px] text-slate-500 mt-1">Only affects the equivalent-raft depth used for settlement, below.</p>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Factor of Safety</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={fos} onChange={(e) => setFos(e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1 block">Water table depth override (m, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={waterTableOverride} onChange={(e) => setWaterTableOverride(e.target.value)}
            placeholder="blank = use borehole's own recorded value" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Scour depth (m, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={scourDepth} onChange={(e) => setScourDepth(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Liquefaction depth (m, optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={liquefactionDepth} onChange={(e) => setLiquefactionDepth(e.target.value)} />
        </div>

        <div className="md:col-span-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Manual soil property overrides (optional) -- applies borehole-wide</div>
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

        <div className="md:col-span-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Group settlement (optional -- equivalent raft, simplified)</div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Soil type at raft level</label>
              <select className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={settlementType} onChange={(e) => setSettlementType(e.target.value)}>
                <option value="">Skip settlement check</option>
                <option value="granular">Granular (elastic)</option>
                <option value="clay">Clay (consolidation)</option>
              </select>
            </div>
          </div>
          {settlementType === 'granular' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Es (t/m²)</label>
                <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  value={es} onChange={(e) => setEs(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Poisson's ratio μ</label>
                <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  value={mu} onChange={(e) => setMu(e.target.value)} />
              </div>
            </div>
          )}
          {settlementType === 'clay' && (
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Cc</label>
                <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  value={cc} onChange={(e) => setCc(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">e0</label>
                <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  value={e0} onChange={(e) => setE0(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Clay thickness H (m)</label>
                <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  value={hM} onChange={(e) => setHM(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">σ0' at raft (kPa)</label>
                <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  value={sigma0} onChange={(e) => setSigma0(e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={run} disabled={loading}
        className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50">
        {loading && <Loader2 size={14} className="animate-spin" />} Analyze Pile Group
      </button>

      {error && <div className="mt-4 text-sm text-red-400">{error}</div>}

      {result && (
        <div className="mt-6 space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Group</div>
              <div className="text-xl font-semibold text-slate-50">{result.n_piles} piles ({result.layout})</div>
              <div className="text-xs text-slate-500 mt-1">Envelope {result.group_length_m}m × {result.group_width_m}m</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Governing allowable group capacity</div>
              <div className="text-2xl font-semibold text-slate-50">{result.governing_group_capacity_t} t</div>
              <div className="text-xs text-slate-500 mt-1">via {result.governing_mode === 'group_efficiency' ? 'group efficiency method' : 'block failure method'} / FOS {result.fos_compression}</div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">Single pile allowable</div>
              <div className="text-xl font-semibold text-slate-50">{result.single_pile.allowable_compression_capacity_t} t</div>
              <div className="text-xs text-slate-500 mt-1">Ultimate {result.single_pile.ultimate_compression_capacity_t} t</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">1. Group efficiency (Converse-Labarre)</div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>θ = arctan(D/s) = {result.group_efficiency.theta_deg}°</div>
                <div>Efficiency Eg = {result.group_efficiency.efficiency}</div>
                <div className="pt-1 text-slate-300">Group ultimate = Eg × n × Qu(single) = {result.group_capacity_efficiency_method.ultimate_t} t</div>
                <div className="text-slate-300">Group allowable = {result.group_capacity_efficiency_method.allowable_t} t</div>
              </div>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">2. Block failure (equivalent pier)</div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>Perimeter {result.block_failure.perimeter_m} m, base area {result.block_failure.base_area_m2} m²</div>
                <div>Qs {result.block_failure.ultimate_skin_friction_t} t + Qp {result.block_failure.ultimate_end_bearing_t} t (governing zone: {result.block_failure.governing_end_bearing_zone})</div>
                <div className="pt-1 text-slate-300">Block ultimate = {result.group_capacity_block_method.ultimate_t} t</div>
                <div className="text-slate-300">Block allowable = {result.group_capacity_block_method.allowable_t} t</div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <div className="text-sm font-medium text-slate-200 mb-2">3. Pile cap load distribution -- every pile</div>
            <div className="flex items-center gap-2 mb-2 text-xs">
              {result.cap_load_distribution.within_capacity
                ? <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={14} /> Max pile load within allowable</span>
                : <span className="flex items-center gap-1 text-red-400"><XCircle size={14} /> Max pile load EXCEEDS allowable per pile</span>}
              <span className="text-slate-500">(allowable per pile, efficiency-reduced = {result.cap_load_distribution.allowable_per_pile_t} t)</span>
            </div>
            <table className="text-xs text-slate-300 min-w-[500px]">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left py-1 pr-3">Pile #</th>
                  <th className="pr-3">x (m)</th>
                  <th className="pr-3">y (m)</th>
                  <th>Load (t)</th>
                </tr>
              </thead>
              <tbody>
                {result.cap_load_distribution.positions.map((p: any) => (
                  <tr key={p.pile} className={`border-t border-slate-800 ${p.load_t === result.cap_load_distribution.max_pile_load_t ? 'text-amber-300' : ''}`}>
                    <td className="py-1 pr-3">{p.pile}</td>
                    <td className="text-center pr-3">{p.x_m}</td>
                    <td className="text-center pr-3">{p.y_m}</td>
                    <td className="text-center font-medium">{p.load_t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.settlement && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">4. Settlement (equivalent raft)</div>
              <div className="text-2xl font-semibold text-slate-50">{result.settlement.result} mm</div>
              <div className="text-xs text-slate-500 mt-1 space-y-0.5">
                <div>Raft depth {result.settlement.equivalent_raft_depth_m} m, size {result.settlement.equivalent_raft_size_m} m, net pressure {result.settlement.net_pressure_kpa} kPa</div>
              </div>
            </div>
          )}

          {result.block_failure.estimated_fields?.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4">
              <div className="text-sm font-medium text-amber-300 mb-1">Estimated values (not directly measured)</div>
              <ul className="text-xs text-amber-200/80 list-disc list-inside space-y-0.5">
                {result.block_failure.estimated_fields.map((f: string, i: number) => <li key={i}>{f}</li>)}
              </ul>
            </div>
          )}

          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-300 mb-1">Assumptions & warnings</div>
            <ul className="text-xs text-slate-400 list-disc list-inside space-y-0.5">
              {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              {result.settlement?.warnings?.map((w: string, i: number) => <li key={`s${i}`}>{w}</li>)}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
