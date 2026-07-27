import { useEffect, useState } from 'react'
import { Milestone, Loader2, Sparkles } from 'lucide-react'
import { api } from '../api/client'

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
      const r = await api.runPileCapacity({
        borehole_id: selectedBoreholeId,
        diameter_m: parseFloat(diameterMm) / 1000,
        pile_length_m: parseFloat(pileLength),
        cutoff_depth_m: cutoffDepth ? parseFloat(cutoffDepth) : 0,
        code,
        scour_depth_m: scourDepth ? parseFloat(scourDepth) : null,
        liquefaction_depth_m: liquefactionDepth ? parseFloat(liquefactionDepth) : null,
        critical_depth_factor: criticalDepthFactor ? parseFloat(criticalDepthFactor) : null,
        fos_compression: parseFloat(fos),
        fos_uplift: parseFloat(fos),
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
            <option value="IRC_78">IRC:78:2014 (Bridge)</option>
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

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-200 mb-2">Layer-wise skin friction</div>
            <table className="w-full text-xs text-slate-300">
              <thead className="text-slate-500">
                <tr><th className="text-left py-1">Depth (m)</th><th>c (t/m²)</th><th>φ (°)</th><th>α</th><th>σ'v avg</th><th>Skin friction (t)</th></tr>
              </thead>
              <tbody>
                {result.layer_report.map((l: any, i: number) => (
                  <tr key={i} className="border-t border-slate-800">
                    <td className="py-1">{l.from_m}-{l.to_m}</td>
                    <td className="text-center">{l.cohesion_t_m2}</td>
                    <td className="text-center">{l.phi_deg}</td>
                    <td className="text-center">{l.alpha ?? '-'}</td>
                    <td className="text-center">{l.sigma_v_avg_t_m2}</td>
                    <td className="text-center">{l.skin_friction_t}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="text-sm font-medium text-slate-200 mb-2">
              End bearing candidates (governing: {result.governing_end_bearing_zone})
            </div>
            <table className="w-full text-xs text-slate-300">
              <thead className="text-slate-500">
                <tr><th className="text-left py-1">Zone</th><th>Depth (m)</th><th>c</th><th>φ</th><th>Nq</th><th>Ny</th><th>Qp (t)</th></tr>
              </thead>
              <tbody>
                {result.end_bearing_candidates.map((c: any, i: number) => (
                  <tr key={i} className={`border-t border-slate-800 ${c.at === result.governing_end_bearing_zone ? 'text-violet-300' : ''}`}>
                    <td className="py-1">{c.at}</td>
                    <td className="text-center">{c.depth_m}</td>
                    <td className="text-center">{c.cohesion_t_m2}</td>
                    <td className="text-center">{c.phi_deg}</td>
                    <td className="text-center">{c.Nq}</td>
                    <td className="text-center">{c.Ny}</td>
                    <td className="text-center">{c.end_bearing_t}</td>
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
