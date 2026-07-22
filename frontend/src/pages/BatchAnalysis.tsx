import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, Layers3, Target, Printer, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

function parseNumberList(input: string): number[] {
  return input
    .split(',')
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !isNaN(n) && n > 0)
}

export default function BatchAnalysis() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [selectedLayerId, setSelectedLayerId] = useState('')
  const [soilType, setSoilType] = useState<'cohesive' | 'noncohesive'>('noncohesive')
  const [widthsInput, setWidthsInput] = useState('1.5, 2, 2.5, 3')
  const [depthsInput, setDepthsInput] = useState('1.5, 2, 2.5')
  const [lengthOverride, setLengthOverride] = useState('')
  const [shape, setShape] = useState('square')
  const [fos, setFos] = useState('2.5')
  const [allowableSettlement, setAllowableSettlement] = useState('25')
  const [consolidationType, setConsolidationType] = useState('NCS')
  const [esOverride, setEsOverride] = useState('')
  const [rigidityFactor, setRigidityFactor] = useState('1')
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  const selectedBorehole = boreholes.find((b) => b.id === selectedBoreholeId)
  const selectedLayer = selectedBorehole?.layers.find((l: any) => l.id === selectedLayerId)

  useEffect(() => {
    if (selectedLayer) {
      setSoilType(selectedLayer.compression_index_cc != null ? 'cohesive' : 'noncohesive')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLayerId])

  const widths = parseNumberList(widthsInput)
  const depths = parseNumberList(depthsInput)
  const comboCount = widths.length * depths.length

  async function runBatch() {
    setError(''); setResult(null); setProgress(0)
    if (!selectedLayer) { setError('Pehle borehole aur layer select karo.'); return }
    if (widths.length === 0 || depths.length === 0) { setError('Kam se kam ek width aur ek depth value do.'); return }
    if (comboCount > 400) { setError(`${comboCount} combinations bahut zyada hain (max 400 ek saath) — width/depth list chhoti karo.`); return }

    setLoading(true)
    const allCombos: any[] = []
    let meta: any = null
    try {
      // Chunked by width: one backend call per width (covering all depths for
      // that width). This is what makes the progress bar real -- it advances
      // once per completed chunk, not a fake/simulated animation.
      for (let i = 0; i < widths.length; i++) {
        setProgressLabel(`Width ${i + 1} of ${widths.length} (${widths[i]}m) — ${allCombos.length}/${comboCount} done`)
        const r = await api.runBatch({
          borehole_id: selectedBoreholeId,
          layer_id: selectedLayerId,
          soil_type: soilType,
          widths_m: [widths[i]],
          depths_m: depths,
          length_m: lengthOverride ? parseFloat(lengthOverride) : null,
          shape,
          fos: parseFloat(fos) || 2.5,
          allowable_settlement_mm: parseFloat(allowableSettlement) || 25,
          consolidation_type: consolidationType,
          elastic_modulus_t_m2: esOverride ? parseFloat(esOverride) : null,
          rigidity_factor: parseFloat(rigidityFactor) || 1,
        })
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
        Shear (IS:6403) + settlement (IS:8009) SBC for every footing width × depth combination at once — recommended SBC is the lower of the two, per combination.
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
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1.5"><Layers3 size={13} /> Borehole & Layer</div>
              <div className="flex flex-col gap-2">
                <select
                  className="gm-input w-full"
                  value={selectedBoreholeId}
                  onChange={(e) => { setSelectedBoreholeId(e.target.value); setSelectedLayerId(''); setResult(null) }}
                >
                  <option value="">Select borehole...</option>
                  {boreholes.map((b) => <option key={b.id} value={b.id}>{b.borehole_id} {b.project_name ? `(${b.project_name})` : ''}</option>)}
                </select>
                <select
                  className="gm-input w-full"
                  value={selectedLayerId}
                  onChange={(e) => { setSelectedLayerId(e.target.value); setResult(null) }}
                  disabled={!selectedBorehole}
                >
                  <option value="">Select layer...</option>
                  {selectedBorehole?.layers.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.from_m}–{l.to_m}m {l.classification ? `(${l.classification})` : ''} {l.description ? `— ${l.description}` : ''}</option>
                  ))}
                </select>
              </div>

              {selectedLayer && (
                <div className="mt-3 pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-slate-500">Cohesion c</span><span className="text-slate-300">{selectedLayer.cohesion_t_m2 ?? '—'} t/m²</span>
                  <span className="text-slate-500">Friction angle φ</span><span className="text-slate-300">{selectedLayer.friction_angle_deg ?? '—'}°</span>
                  <span className="text-slate-500">Bulk density γ</span><span className="text-slate-300">{selectedLayer.bulk_density_t_m3 ?? '—'} t/m³</span>
                  <span className="text-slate-500">SPT N-value</span><span className="text-slate-300">{selectedLayer.n_value ?? '—'}</span>
                  <span className="text-slate-500">Cc / e0</span><span className="text-slate-300">{selectedLayer.compression_index_cc ?? '—'} / {selectedLayer.initial_void_ratio_e0 ?? '—'}</span>
                  <span className="text-slate-500">Water table</span><span className="text-slate-300">{selectedBorehole?.water_table_depth_m ?? '—'} m</span>
                </div>
              )}
            </div>

            <div className="glass p-5 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Soil type for this layer</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSoilType('noncohesive')}
                    className={`flex-1 gm-input text-center ${soilType === 'noncohesive' ? 'ring-2 ring-violet-500/50 border-violet-500/40' : ''}`}
                  >
                    Granular (N-based)
                  </button>
                  <button
                    onClick={() => setSoilType('cohesive')}
                    className={`flex-1 gm-input text-center ${soilType === 'cohesive' ? 'ring-2 ring-violet-500/50 border-violet-500/40' : ''}`}
                  >
                    Clay (Cc/e0-based)
                  </button>
                </div>
              </div>

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

              {soilType === 'cohesive' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Consolidation type</label>
                    <select className="gm-input w-full" value={consolidationType} onChange={(e) => setConsolidationType(e.target.value)}>
                      <option value="NCS">NCS</option>
                      <option value="OCS">OCS</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Elastic modulus Es (blank = auto)</label>
                    <input type="number" step="any" className="gm-input w-full" value={esOverride} onChange={(e) => setEsOverride(e.target.value)} placeholder="Bowles estimate" />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Rigidity factor</label>
                <input type="number" step="any" className="gm-input w-full" value={rigidityFactor} onChange={(e) => setRigidityFactor(e.target.value)} />
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

            {error && <div className="text-sm text-rose-400">{error}</div>}
          </div>

          {result && (
            <div className="flex-1 min-w-0 space-y-4">
              {result.critical_combination && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1.5 flex items-center gap-1.5"><Target size={13} /> Critical combination (lowest recommended SBC)</div>
                  <div className="text-2xl font-display font-semibold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                    {result.critical_combination.recommended_sbc} <span className="text-sm text-slate-400">{result.unit}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    B = {result.critical_combination.width_m}m, D = {result.critical_combination.depth_m}m — governed by {result.critical_combination.governing}
                  </div>
                </motion.div>
              )}

              <div className="glass p-5 print:text-black" id="batch-result">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {result.successful}/{result.total} combinations · {result.borehole_id} · {result.layer_label}
                  </div>
                  <button onClick={() => window.print()} className="gm-btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap print:hidden">
                    <Printer size={13} /> Print
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-slate-400">
                        <th className="text-left py-2 pr-3">B (m)</th>
                        <th className="text-left py-2 pr-3">D (m)</th>
                        <th className="text-left py-2 pr-3">Shear SBC</th>
                        <th className="text-left py-2 pr-3">Settlement SBC</th>
                        <th className="text-left py-2 pr-3">Recommended</th>
                        <th className="text-left py-2">Governing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.combinations.map((c: any, i: number) => {
                        const isCritical = result.critical_combination && c.width_m === result.critical_combination.width_m && c.depth_m === result.critical_combination.depth_m && !c.error
                        return (
                          <tr key={i} className={`border-b border-white/[0.04] ${isCritical ? 'bg-violet-500/10' : ''}`}>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.width_m}</td>
                            <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.depth_m}</td>
                            {c.error ? (
                              <td colSpan={4} className="py-1.5 text-rose-400">{c.error}</td>
                            ) : (
                              <>
                                <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.shear_sbc}</td>
                                <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{c.settlement_sbc}</td>
                                <td className="py-1.5 pr-3 text-slate-50 font-medium whitespace-nowrap">{c.recommended_sbc}</td>
                                <td className="py-1.5 text-slate-400 whitespace-nowrap">{c.governing.includes('shear') ? 'Shear' : 'Settlement'}</td>
                              </>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

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
