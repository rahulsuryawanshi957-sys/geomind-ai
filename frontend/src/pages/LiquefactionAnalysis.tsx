import { useEffect, useState, Fragment } from 'react'
import { Waves, Layers3, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'

// IS 1893:2016 seismic zone -> amax/g (peak ground acceleration ratio),
// same lookup the reference workbook (LIQUEFACTION.xlsx) uses.
const ZONE_PGA: Record<string, number> = { II: 0.10, III: 0.16, IV: 0.24, V: 0.36 }

// Advanced manual overrides -- hidden by default, matching Batch Analysis's
// panel. hammer_energy_correction is deliberately NOT in here -- see the
// always-visible field below the water table override instead.
const LIQUEFACTION_OVERRIDE_FIELDS: { key: string; label: string }[] = [
  { key: 'hammer_type_correction', label: 'Hammer type correction CH (blank = 1.0)' },
  { key: 'borehole_diameter_correction', label: 'Borehole diameter correction CB (blank = 1.05, 150mm)' },
  { key: 'sampler_correction', label: 'Sampler correction CS (blank = 1.0)' },
  { key: 'static_shear_correction', label: 'Static shear correction Kα (blank = 1.0, flat ground)' },
  { key: 'n_value', label: 'SPT N-value (all layers)' },
  { key: 'fines_content_pct', label: 'Fines content % (all layers)' },
  { key: 'bulk_density_t_m3', label: 'Bulk density γ (t/m³, all layers)' },
]

export default function LiquefactionAnalysis() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [selectedBoreholeId, setSelectedBoreholeId] = useState('')
  const [magnitude, setMagnitude] = useState('7')
  const [zone, setZone] = useState('IV')
  const [pgaOverride, setPgaOverride] = useState('')
  const [waterTableOverride, setWaterTableOverride] = useState('')
  const [hammerEnergyCorrection, setHammerEnergyCorrection] = useState('')
  const [manualOverrides, setManualOverrides] = useState<Record<string, string>>({})
  const [showOverrides, setShowOverrides] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  const selectedBorehole = boreholes.find((b) => b.id === selectedBoreholeId)
  const effectivePga = pgaOverride ? parseFloat(pgaOverride) : ZONE_PGA[zone]

  async function run() {
    setError(''); setResult(null)
    if (!selectedBoreholeId) { setError('Select a borehole first.'); return }
    if (!magnitude || isNaN(parseFloat(magnitude))) { setError('Provide the earthquake magnitude (Mw).'); return }
    if (!pgaOverride && !zone) { setError('Either choose a seismic zone, or provide PGA manually.'); return }

    setLoading(true)
    try {
      const overrides: Record<string, any> = {}
      if (waterTableOverride) overrides.water_table_depth_m = parseFloat(waterTableOverride)
      if (hammerEnergyCorrection) overrides.hammer_energy_correction = parseFloat(hammerEnergyCorrection)
      for (const { key } of LIQUEFACTION_OVERRIDE_FIELDS) {
        if (manualOverrides[key]) overrides[key] = parseFloat(manualOverrides[key])
      }

      const r = await api.runLiquefaction({
        borehole_id: selectedBoreholeId,
        earthquake_magnitude_mw: parseFloat(magnitude),
        earthquake_zone: pgaOverride ? null : zone,
        pga_g: pgaOverride ? parseFloat(pgaOverride) : null,
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
        <Waves size={20} className="text-violet-400" /> Liquefaction Analysis
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        IRC:SP:114 / IS 1893:2016 simplified procedure (Seed-Idriss CSR, NCEER 1997 CRR, Idriss-Boulanger fines
        correction/Ksigma/MSF) — layer-by-layer factor of safety against liquefaction, reading the same soil
        sheet already used for SBC batch analysis.
      </p>

      {boreholes.length === 0 ? (
        <div className="glass p-8 text-center max-w-md">
          <p className="text-sm text-slate-400 mb-3">Liquefaction analysis reads soil data from a saved borehole profile. Import lab data first.</p>
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
                <div className="mt-3 pt-3 border-t border-white/[0.06] space-y-1 max-h-40 overflow-y-auto">
                  <p className="text-[11px] text-slate-500 mb-1">Layers in this borehole:</p>
                  {selectedBorehole.layers.map((l: any) => (
                    <div key={l.id} className="text-xs text-slate-400 flex justify-between gap-2">
                      <span>{l.from_m}–{l.to_m}m {l.classification ? `(${l.classification})` : ''}</span>
                      <span className="text-slate-500">
                        {l.n_value != null && l.fines_content_pct != null ? 'ready' : l.n_value != null ? 'no fines %' : l.rock_type ? 'rock' : 'incomplete'}
                      </span>
                    </div>
                  ))}
                  <p className="text-[11px] text-slate-500">Water table: {selectedBorehole.water_table_depth_m ?? '—'} m</p>
                </div>
              )}
            </div>

            <div className="glass p-5 space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Earthquake magnitude Mw</label>
                <input type="number" step="any" className="gm-input w-full" value={magnitude} onChange={(e) => setMagnitude(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">IS 1893 Seismic Zone</label>
                <select className="gm-input w-full" value={zone} onChange={(e) => { setZone(e.target.value); setPgaOverride('') }} disabled={!!pgaOverride}>
                  {Object.entries(ZONE_PGA).map(([z, pga]) => <option key={z} value={z}>Zone {z} (amax/g = {pga})</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">PGA override (amax/g) — blank = use zone lookup above</label>
                <input type="number" step="any" className="gm-input w-full" value={pgaOverride} onChange={(e) => setPgaOverride(e.target.value)} placeholder={String(ZONE_PGA[zone])} />
              </div>
              <p className="text-[11px] text-slate-500">Effective amax/g used: <span className="text-slate-300">{effectivePga}</span></p>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Water table depth override (m) — blank = borehole's own ({selectedBorehole?.water_table_depth_m ?? '—'}m)</label>
                <input type="number" step="any" className="gm-input w-full" value={waterTableOverride} onChange={(e) => setWaterTableOverride(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">
                  Hammer Energy Correction CE — varies by hammer type (auto trip vs donut vs safety), fill per rig/site; blank = 1.0
                </label>
                <input
                  type="number" step="any" className="gm-input w-full" value={hammerEnergyCorrection}
                  onChange={(e) => setHammerEnergyCorrection(e.target.value)}
                  placeholder="e.g. 0.9 (auto trip), 0.7–0.8 (donut)"
                />
              </div>

              <button onClick={() => setShowOverrides((s) => !s)} className="text-xs text-violet-400 hover:text-violet-300">
                {showOverrides ? '▾ Hide manual overrides' : '▸ Manual overrides (CH, CB, CS, Kα, N, fines, density...)'}
              </button>
              {showOverrides && (
                <div className="space-y-3 pt-1 border-t border-white/[0.06]">
                  {LIQUEFACTION_OVERRIDE_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="text-[11px] text-slate-500 mb-0.5 block">{f.label}</label>
                      <input
                        type="number" step="any" className="gm-input w-full text-xs py-1.5"
                        value={manualOverrides[f.key] || ''}
                        onChange={(e) => setManualOverrides((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <button onClick={run} disabled={loading} className="gm-btn-primary w-full mt-2 flex items-center justify-center gap-2">
                {loading ? <><Loader2 size={14} className="animate-spin" /> Running...</> : 'Run Liquefaction Analysis'}
              </button>
            </div>
          </div>

          {error && <div className="glass p-4 text-sm text-rose-400 h-fit">{error}</div>}

          {result && (
            <div className="flex-1 min-w-0 space-y-4">
              <div className={`glass p-5 border-l-4 ${result.summary.liquefiable_depth_ranges.length > 0 ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Overall Conclusion — {result.borehole_id}</div>
                <div className={`text-lg font-semibold ${result.summary.liquefiable_depth_ranges.length > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {result.summary.overall_conclusion}
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-xs text-slate-400">
                  <div>
                    <div className="text-slate-500 mb-0.5">Liquefiable depth range(s)</div>
                    <div className="text-slate-200">{result.summary.liquefiable_depth_ranges.join(', ') || 'None'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-0.5">Non-liquefiable depth range(s)</div>
                    <div className="text-slate-200">{result.summary.non_liquefiable_depth_ranges.join(', ') || 'None'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-0.5">Minimum FOS</div>
                    <div className="text-slate-200">{result.summary.minimum_fos ?? '> 1.0 throughout'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 mb-0.5">MSF used</div>
                    <div className="text-slate-200">{result.inputs_used.msf} (Mw={result.inputs_used.earthquake_magnitude_mw}, amax/g={result.inputs_used.pga_g} — {result.inputs_used.pga_source})</div>
                  </div>
                </div>
              </div>

              <div className="glass p-5 overflow-x-auto">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Detailed Report — layer-wise</div>
                <table className="w-full text-xs border-collapse min-w-[900px]">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-500">
                      <th className="text-left py-2 pr-3">Depth (m)</th>
                      <th className="text-left py-2 pr-3">Soil</th>
                      <th className="text-left py-2 pr-3">N (raw)</th>
                      <th className="text-left py-2 pr-3">(N1)60</th>
                      <th className="text-left py-2 pr-3">(N1)60cs</th>
                      <th className="text-left py-2 pr-3">CSR</th>
                      <th className="text-left py-2 pr-3">CRR7.5</th>
                      <th className="text-left py-2 pr-3">CRR</th>
                      <th className="text-left py-2 pr-3">FOS</th>
                      <th className="text-left py-2 pr-3">Conclusion</th>
                      <th className="text-left py-2">Source (if not this layer)</th>
                      <th className="text-left py-2 pl-3 print:hidden">Full calc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.layer_report.map((r: any, i: number) => {
                      const isExpanded = expandedRows.has(i)
                      const toggleExpanded = () => {
                        setExpandedRows((prev) => {
                          const next = new Set(prev)
                          if (next.has(i)) next.delete(i); else next.add(i)
                          return next
                        })
                      }
                      return (
                      <Fragment key={i}>
                      <tr className="border-b border-white/[0.04]">
                        <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{r.depth_m}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.classification}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.n_observed ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.n1_60 ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.n1_60cs ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.csr}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.crr_7_5 ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{r.crr ?? '—'}</td>
                        <td className={`py-1.5 pr-3 font-medium whitespace-nowrap ${r.conclusion === 'Liquefiable' ? 'text-rose-400' : 'text-slate-200'}`}>{r.fos}</td>
                        <td className={`py-1.5 whitespace-nowrap ${r.conclusion === 'Liquefiable' ? 'text-rose-400 font-medium' : 'text-slate-400'}`}>{r.conclusion}</td>
                        <td className="py-1.5 text-[10.5px] text-amber-400/80 whitespace-nowrap">
                          {r.n_value_source && !r.n_value_source.includes('this layer') && `N: ${r.n_value_source}`}
                          {r.fines_content_source && !r.fines_content_source.includes('this layer') && (r.n_value_source && !r.n_value_source.includes('this layer') ? ' · ' : '') + `Fines: ${r.fines_content_source}`}
                        </td>
                        <td className="py-1.5 pl-3 print:hidden">
                          {r.steps?.length > 0 && (
                            <button onClick={toggleExpanded} className="text-violet-400 hover:text-violet-300 text-[11px] whitespace-nowrap">
                              {isExpanded ? '▾ Hide' : '▸ Full calc'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {r.steps?.length > 0 && (
                        <tr className={isExpanded ? 'table-row' : 'hidden print:table-row'}>
                          <td colSpan={11} className="py-2 pl-6 pr-3 bg-white/[0.02] print:bg-transparent text-[11px] text-slate-400 print:text-black">
                            <div className="uppercase tracking-wide text-slate-500 print:text-black mb-1">
                              Overburden → CSR → SPT correction → CRR → FOS, step by step
                            </div>
                            <ul className="space-y-0.5">
                              {r.steps.map((s: string, si: number) => <li key={si}>• {s}</li>)}
                            </ul>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {result.warnings?.length > 0 && (
                <div className="glass p-4">
                  <div className="text-xs uppercase tracking-wide text-amber-500/80 mb-1">Warnings</div>
                  <ul className="text-xs text-amber-400/90 list-disc list-inside space-y-0.5">
                    {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
