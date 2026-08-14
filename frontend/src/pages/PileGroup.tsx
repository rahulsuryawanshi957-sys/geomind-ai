import { useEffect, useState } from 'react'
import { Network, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// ---- Diagrams -----------------------------------------------------------

function GroupPlanDiagram({ rows, cols }: { rows: number; cols: number }) {
  const r = Math.max(1, Math.min(rows, 5))
  const c = Math.max(1, Math.min(cols, 5))
  const spacingPx = 32
  const w = (c - 1) * spacingPx + 60
  const h = (r - 1) * spacingPx + 60
  const dots: JSX.Element[] = []
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const x = 30 + j * spacingPx
      const y = 30 + i * spacingPx
      dots.push(<circle key={`${i}-${j}`} cx={x} cy={y} r="7" fill="rgb(148 163 184 / 0.3)" stroke="rgb(45 212 191)" strokeWidth="1.5" />)
    }
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={Math.min(w, 260)} height={Math.min(h, 220)} className="text-slate-400">
      <rect x="14" y="14" width={w - 28} height={h - 28} fill="none" stroke="rgb(244 63 94 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      {dots}
      <line x1="30" y1="30" x2={30 + spacingPx} y2="30" stroke="rgb(34 211 238)" strokeWidth="1" markerEnd="url(#gp-arrow)" />
      <text x={30 + spacingPx / 2} y="22" fontSize="9" fill="rgb(34 211 238)" textAnchor="middle">s</text>
      <text x="18" y={h - 4} fontSize="9" fill="rgb(244 63 94)">Lg × Bg envelope</text>
      <defs>
        <marker id="gp-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgb(34 211 238)" /></marker>
      </defs>
    </svg>
  )
}

function RaftDiagram({ friction }: { friction: boolean }) {
  const raftY = friction ? 130 : 175
  return (
    <svg viewBox="0 0 260 220" width="260" height="220" className="text-slate-400">
      <line x1="10" y1="20" x2="250" y2="20" stroke="rgb(226 232 240 / 0.5)" strokeWidth="1" strokeDasharray="4 2" />
      <text x="14" y="15" fontSize="9" fill="currentColor">GL</text>
      {[80, 120, 160].map((x, i) => (
        <rect key={i} x={x} y="20" width="10" height="170" fill="rgb(148 163 184 / 0.2)" stroke="currentColor" strokeWidth="1" />
      ))}
      <line x1="40" y1={raftY} x2="220" y2={raftY} stroke="rgb(244 63 94)" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x="45" y={raftY - 4} fontSize="9" fill="rgb(244 63 94)">
        equivalent raft ({friction ? '2/3 × L' : 'pile toe'})
      </text>
      <path d={`M 40 ${raftY} L 10 210 L 250 210 L 220 ${raftY} Z`} fill="rgb(45 212 191 / 0.12)" stroke="rgb(45 212 191)" strokeWidth="1" />
      <text x="130" y="205" fontSize="9" fill="rgb(45 212 191)" textAnchor="middle">stress bulb (Boussinesq)</text>
    </svg>
  )
}

function CapLoadDiagram() {
  return (
    <svg viewBox="0 0 260 160" width="260" height="160" className="text-slate-400">
      <rect x="40" y="30" width="180" height="16" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      <line x1="130" y1="10" x2="130" y2="30" stroke="rgb(244 63 94)" strokeWidth="1.5" markerEnd="url(#cl-arrow)" />
      <text x="134" y="20" fontSize="9" fill="rgb(244 63 94)">P</text>
      <path d="M 165 12 A 20 20 0 0 1 185 30" fill="none" stroke="rgb(34 211 238)" strokeWidth="1.5" markerEnd="url(#cl-arrow2)" />
      <text x="190" y="24" fontSize="9" fill="rgb(34 211 238)">M</text>
      {[60, 100, 160, 200].map((x, i) => (
        <g key={i}>
          <rect x={x - 4} y="46" width="8" height="60" fill="rgb(148 163 184 / 0.2)" stroke="currentColor" strokeWidth="1" />
          <line x1={x} y1="106" x2={x} y2={120 - Math.abs(x - 130) * 0.15} stroke="rgb(45 212 191)" strokeWidth="1.5" markerEnd="url(#cl-arrow3)" />
        </g>
      ))}
      <text x="130" y="140" fontSize="9" fill="rgb(45 212 191)" textAnchor="middle">Qi varies with distance from centroid</text>
      <defs>
        <marker id="cl-arrow" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0,0 L6,0 L3,6 Z" fill="rgb(244 63 94)" /></marker>
        <marker id="cl-arrow2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="rgb(34 211 238)" /></marker>
        <marker id="cl-arrow3" markerWidth="6" markerHeight="6" refX="3" refY="5" orient="auto"><path d="M0,0 L6,0 L3,6 Z" fill="rgb(45 212 191)" /></marker>
      </defs>
    </svg>
  )
}

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
  const [nValueOverride, setNValueOverride] = useState('')
  const [ccOverride, setCcOverride] = useState('')
  const [e0Override, setE0Override] = useState('')
  const [fos, setFos] = useState('2.5')

  const [runSettlement, setRunSettlement] = useState(true)
  const [influenceMultiplier, setInfluenceMultiplier] = useState('1.5')

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
      if (nValueOverride) overrides.n_value = parseFloat(nValueOverride)
      if (ccOverride) overrides.compression_index_cc = parseFloat(ccOverride)
      if (e0Override) overrides.initial_void_ratio_e0 = parseFloat(e0Override)

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
        run_settlement: runSettlement,
        settlement_influence_multiplier: influenceMultiplier ? parseFloat(influenceMultiplier) : 1.5,
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
        distribution, and layer-wise equivalent-raft settlement -- building on the single-pile
        capacity engine and the borehole's real soil layers (not a single assumed soil type).
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
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            Manual soil property overrides (optional) -- applies borehole-wide, always wins over
            recorded/estimated values. Everything is otherwise read straight from the borehole's
            real layers -- these overrides let you test "what if" without editing the borehole.
          </div>
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
            <div>
              <label className="text-xs text-slate-400 mb-1 block">SPT N-value</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={nValueOverride} onChange={(e) => setNValueOverride(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cc (settlement)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={ccOverride} onChange={(e) => setCcOverride(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">e0 (settlement)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={e0Override} onChange={(e) => setE0Override(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="md:col-span-2 pt-2 border-t border-slate-800">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">Group settlement -- layer-wise equivalent raft</div>
          <label className="flex items-center gap-2 text-sm text-slate-300 mb-2">
            <input type="checkbox" checked={runSettlement} onChange={(e) => setRunSettlement(e.target.checked)} />
            Run settlement check against the borehole's real layers
          </label>
          {runSettlement && (
            <div className="w-1/2">
              <label className="text-xs text-slate-400 mb-1 block">Influence zone multiplier (× min(Lg,Bg) below the raft)</label>
              <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                value={influenceMultiplier} onChange={(e) => setInfluenceMultiplier(e.target.value)} />
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

          {/* ---------- 1. Group efficiency ---------- */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-200 mb-2">1. Group efficiency (Converse-Labarre)</div>
            <div className="text-xs text-slate-400 space-y-1">
              <div>θ = arctan(D/s) = {result.group_efficiency.theta_deg}°</div>
              <div>Efficiency Eg = {result.group_efficiency.efficiency}</div>
              <div className="pt-1 text-slate-300">Group ultimate = Eg × n × Qu(single) = {result.group_capacity_efficiency_method.ultimate_t} t</div>
              <div className="text-slate-300">Group allowable = {result.group_capacity_efficiency_method.allowable_t} t</div>
            </div>
            <TheorySection
              title="Group Efficiency -- Converse-Labarre Formula"
              source="IS 2911 (commentary) -- empirical reduction, standard practice alongside the code, not a formula given inside IS 2911 itself."
              confidence="Medium"
              diagram={<GroupPlanDiagram rows={parseInt(numRows) || 3} cols={parseInt(numCols) || 3} />}
              steps={[
                { label: 'Why it exists', formula: 'closely-spaced piles interfere with each other\'s stress zones', note: 'each pile carries less than it would alone -- the group as a whole is less efficient than n independent piles' },
                { label: 'θ (interference angle)', formula: 'θ = arctan(D/s), in degrees', note: 'D = pile diameter, s = centre-to-centre spacing' },
                { label: 'Efficiency', formula: 'Eg = 1 - θ[(n-1)m + (m-1)n] / (90mn)', note: 'm = rows, n = columns' },
                { label: 'Group ultimate capacity', formula: 'Qu(group) = Eg × (total piles) × Qu(single pile)' },
              ]}
              extraNote="This method estimates capacity loss from PILE-TO-PILE interference. It does NOT check the group failing as one large block -- that's the separate Block Failure check below. The governing (design) capacity is the lower of the two."
            />
          </div>

          {/* ---------- 2. Block failure ---------- */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-200 mb-2">2. Block failure (equivalent pier) -- full layer-wise working</div>
            <div className="text-xs text-slate-400 space-y-1 mb-3">
              <div>Perimeter {result.block_failure.perimeter_m} m, base area {result.block_failure.base_area_m2} m²</div>
              <div>Qs {result.block_failure.ultimate_skin_friction_t} t + Qp {result.block_failure.ultimate_end_bearing_t} t (governing zone: {result.block_failure.governing_end_bearing_zone})</div>
              <div className="pt-1 text-slate-300">Block ultimate = {result.group_capacity_block_method.ultimate_t} t</div>
              <div className="text-slate-300">Block allowable = {result.group_capacity_block_method.allowable_t} t</div>
            </div>

            <div className="overflow-x-auto">
              <div className="text-xs text-slate-400 mb-1">Skin friction along the block perimeter -- every segment</div>
              <table className="text-xs text-slate-300 min-w-[1200px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1 pr-3">Depth (m)</th>
                    <th className="pr-3">Soil</th>
                    <th className="pr-3">Below WT?</th>
                    <th className="pr-3">c (t/m²)</th>
                    <th className="pr-3">φ (°)</th>
                    <th className="pr-3">σ'v avg</th>
                    <th className="pr-3">Capped?</th>
                    <th className="pr-3">α</th>
                    <th className="pr-3">K·tanφ term (t)</th>
                    <th className="pr-3">α·c term (t)</th>
                    <th className="pr-3">Segment Qs (t)</th>
                    <th>Running Qs (t)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.block_failure.layer_report.map((l: any, i: number) => (
                    <tr key={i} className={`border-t border-slate-800 ${l.ignored_scour_or_liquefaction ? 'text-slate-600 italic' : ''}`}>
                      <td className="py-1 pr-3 whitespace-nowrap">{l.from_m}-{l.to_m}</td>
                      <td className="text-center pr-3 whitespace-nowrap">{l.founding_layer_classification}</td>
                      <td className="text-center pr-3">{l.below_water_table ? 'Yes' : 'No'}</td>
                      <td className="text-center pr-3">{l.cohesion_t_m2}</td>
                      <td className="text-center pr-3">{l.phi_deg}</td>
                      <td className="text-center pr-3">{l.sigma_v_avg_t_m2}</td>
                      <td className="text-center pr-3">{l.overburden_capped_here ? 'Yes' : 'No'}</td>
                      <td className="text-center pr-3">{l.alpha ?? '-'}</td>
                      <td className="text-center pr-3">{l.friction_term_t}</td>
                      <td className="text-center pr-3">{l.cohesion_term_t}</td>
                      <td className="text-center pr-3 font-medium">{l.ignored_scour_or_liquefaction ? '0' : l.skin_friction_t}</td>
                      <td className="text-center">{l.running_skin_friction_t}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto mt-3">
              <div className="text-xs text-slate-400 mb-1">End bearing candidates -- full working (governing: {result.block_failure.governing_end_bearing_zone})</div>
              <table className="text-xs text-slate-300 min-w-[900px]">
                <thead className="text-slate-500">
                  <tr>
                    <th className="text-left py-1 pr-3">Zone</th>
                    <th className="pr-3">Depth (m)</th>
                    <th className="pr-3">c (t/m²)</th>
                    <th className="pr-3">φ (°)</th>
                    <th className="pr-3">σ'v toe</th>
                    <th className="pr-3">Nc</th>
                    <th className="pr-3">Nq</th>
                    <th className="pr-3">Ny</th>
                    <th className="pr-3">c·Nc term</th>
                    <th className="pr-3">σ'v·Nq term</th>
                    <th className="pr-3">γ·B·Ny term</th>
                    <th>Qp (t)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.block_failure.end_bearing_candidates.map((c: any, i: number) => (
                    <tr key={i} className={`border-t border-slate-800 ${c.at === result.block_failure.governing_end_bearing_zone ? 'text-violet-300' : ''}`}>
                      <td className="py-1 pr-3 whitespace-nowrap">{c.at}</td>
                      <td className="text-center pr-3">{c.depth_m}</td>
                      <td className="text-center pr-3">{c.cohesion_t_m2}</td>
                      <td className="text-center pr-3">{c.phi_deg}</td>
                      <td className="text-center pr-3">{c.sigma_v_toe_t_m2}</td>
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

            <TheorySection
              title="Block Failure -- Group as One Large Equivalent Pier"
              source="Same skin-friction (α/K method) + end-bearing (Nc/Nq/Nγ) machinery as the single pile capacity calculator, applied to the group's own outer perimeter and base area instead of one pile's circumference/cross-section."
              confidence="Medium"
              diagram={<GroupPlanDiagram rows={parseInt(numRows) || 3} cols={parseInt(numCols) || 3} />}
              steps={[
                { label: 'Why it exists', formula: 'closely-spaced piles in soft clay can fail together as one big block, even if each pile individually has capacity', note: 'this check catches that failure mode -- it does NOT happen in widely-spaced groups in sand, which is why the two methods can give very different answers' },
                { label: 'Block perimeter', formula: 'perimeter = 2×(Lg + Bg)', note: 'Lg, Bg = group envelope length/width (outer pile centres + one radius on each side)' },
                { label: 'Block skin friction', formula: 'Qs = Σ[(α·c + K·σ\'v,avg·tanφ) × perimeter × thickness]', note: 'same α (adhesion factor) and K (earth-pressure coefficient) as the single pile, per code' },
                { label: 'Block end bearing', formula: 'Qp = base_area × (c×Nc + σ\'v,toe×Nq + 0.5×γ×Bmin×Nγ)', note: 'checked at toe−2×Deq, toe, and toe+2×Deq -- the lowest governs, same idea as the single pile' },
              ]}
              extraNote="Deq (equivalent diameter for the critical-depth cap) = (Lg+Bg)/2, since a rectangular block has no single diameter the way one pile does -- flagged as an assumption. Governing group capacity = the LOWER of this block method and the group-efficiency method above."
            />
          </div>

          {/* ---------- 3. Pile cap load distribution ---------- */}
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
            <TheorySection
              title="Pile Cap Load Distribution -- Rigid Cap, Elastic Method"
              source="Standard rigid-pile-cap elastic method (assumes the cap itself doesn't bend/rotate under load, and pile reactions vary linearly with distance from the group centroid)."
              confidence="High"
              diagram={<CapLoadDiagram />}
              steps={[
                { label: 'Per-pile load', formula: 'Qi = P/n ± My·xi/Σxi² ± Mx·yi/Σyi²', note: 'P = total vertical load, n = number of piles, xi/yi = pile position from group centroid' },
                { label: 'Sign convention', formula: '+ on the side the moment pushes down, − on the side it lifts', note: 'the corner pile farthest from the centroid, on the loaded side, always governs' },
              ]}
              extraNote="Assumes a RIGID cap and piles of equal stiffness/length -- if piles have very different lengths or the cap is thin/flexible, a proper structural (FE) analysis of the cap is needed instead."
            />
          </div>

          {/* ---------- 4. Settlement ---------- */}
          {result.settlement && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">4. Settlement (equivalent raft) -- layer-wise, every sub-layer</div>
              <div className="text-2xl font-semibold text-slate-50">{result.settlement.result} mm</div>
              <div className="text-xs text-slate-500 mt-1 mb-3">
                Raft depth {result.settlement.raft_depth_m} m, influence zone to {result.settlement.influence_zone_to_m} m,
                net pressure {result.settlement.net_pressure_t_m2} t/m², {result.settlement.sub_layer_count} sub-layer(s),
                Fox factor {result.settlement.fox_depth_correction_factor}
              </div>

              <div className="overflow-x-auto">
                <table className="text-xs text-slate-300 min-w-[1100px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left py-1 pr-3">Depth (m)</th>
                      <th className="pr-3">Soil</th>
                      <th className="pr-3">Class</th>
                      <th className="pr-3">Method</th>
                      <th className="pr-3">P0 (t/m²)</th>
                      <th className="pr-3">Iz</th>
                      <th className="pr-3">Δσ (t/m²)</th>
                      <th className="pr-3">Layer settlement (mm)</th>
                      <th>Running (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.settlement.layer_report.map((l: any, i: number) => (
                      <tr key={i} className={`border-t border-slate-800 ${l.gap_filled ? 'text-slate-500 italic' : ''}`}>
                        <td className="py-1 pr-3 whitespace-nowrap">{l.from_m}-{l.to_m}{l.gap_filled ? ' (gap-filled)' : ''}</td>
                        <td className="text-center pr-3">{l.soil_type}</td>
                        <td className="text-center pr-3">{l.classification}</td>
                        <td className="text-center pr-3 whitespace-nowrap">{l.settlement_method}</td>
                        <td className="text-center pr-3">{l.P0_t_m2}</td>
                        <td className="text-center pr-3">{l.Iz}</td>
                        <td className="text-center pr-3">{l.stress_increase_t_m2}</td>
                        <td className="text-center pr-3 font-medium">{l.layer_settlement_mm}</td>
                        <td className="text-center">{l.running_settlement_mm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <TheorySection
                title="Settlement -- Layer-Wise Equivalent Raft"
                source="Same method as the app's Bearing Capacity & Settlement multi-layer tool: Boussinesq rectangular-load stress attenuation + IS:8009 consolidation (clay/silt) or Fig-9 chart (sand/gravel) formulas, per real borehole sub-layer, Fox depth-corrected."
                confidence="Medium"
                diagram={<RaftDiagram friction={pileBehaviour === 'friction'} />}
                steps={[
                  { label: 'Equivalent raft', formula: 'a footing of the group\'s own plan size (Lg × Bg), placed at 2/3×L below cutoff (friction piles) or at the pile toe (end-bearing piles)', note: 'no outward load-spread widening with depth is applied -- a simplification, flagged below' },
                  { label: 'Net pressure', formula: 'q = cap load P / (Lg × Bg)' },
                  { label: 'Stress at each sub-layer', formula: 'Δσ = Iz × q', note: 'Iz = Boussinesq influence factor for a rectangular loaded area, evaluated at each sub-layer\'s mid-depth below the raft' },
                  { label: 'Clay/Silt sub-layer', formula: 'Sc = (H/(1+e0))·Cc·log10((P0+Δσ)/P0)' },
                  { label: 'Sand/Gravel sub-layer', formula: 'Sc = (Settlement-at-10t/m² × Δσ)/(10×Aw)', note: 'IS:8009 Fig-9 chart, via SPT N-value' },
                ]}
                extraNote="Every real borehole layer within the influence zone gets its own settlement contribution, summed -- this is NOT a single assumed soil type for the whole depth. Cc, e0, and N-value are read straight from the borehole (with the same estimate-from-void-ratio fallback used elsewhere in the app); manual overrides above always win if given."
              />
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
