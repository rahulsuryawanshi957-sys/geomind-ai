import { useState } from 'react'
import { Wind, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '../api/client'

// 4 independent sub-tools -- see backend/app/services/ground_improvement.py's
// module docstring for formula sources/confidence per section. Every field
// is optional; the backend runs whichever sub-tool(s) have enough inputs.

export default function GroundImprovement() {
  // Stone column
  const [colDia, setColDia] = useState('')
  const [scSpacing, setScSpacing] = useState('')
  const [scPattern, setScPattern] = useState('triangular')
  const [n, setN] = useState('3')
  const [appliedStress, setAppliedStress] = useState('')
  const [mv, setMv] = useState('')
  const [treatedDepth, setTreatedDepth] = useState('')
  const [untreatedSettlement, setUntreatedSettlement] = useState('')

  // PVD
  const [pvdSpacing, setPvdSpacing] = useState('')
  const [pvdPattern, setPvdPattern] = useState('triangular')
  const [drainWidth, setDrainWidth] = useState('100')
  const [drainThickness, setDrainThickness] = useState('4')
  const [ch, setCh] = useState('')
  const [cv, setCv] = useState('')
  const [drainagePath, setDrainagePath] = useState('')
  const [targetU, setTargetU] = useState('90')
  const [elapsedTime, setElapsedTime] = useState('')

  // Vibro
  const [fines, setFines] = useState('')
  const [d50, setD50] = useState('')

  // Recommendation
  const [fsLiq, setFsLiq] = useState('')
  const [predSettle, setPredSettle] = useState('')
  const [allowSettle, setAllowSettle] = useState('')

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
      column_dia_m: num(colDia), sc_spacing_m: num(scSpacing), sc_pattern: colDia ? scPattern : undefined,
      stress_ratio_n: num(n), applied_stress_kpa: num(appliedStress),
      mv_m2_per_kn: num(mv), treated_depth_m: num(treatedDepth), untreated_settlement_mm: num(untreatedSettlement),

      pvd_spacing_m: num(pvdSpacing), pvd_pattern: pvdSpacing ? pvdPattern : undefined,
      drain_width_mm: num(drainWidth), drain_thickness_mm: num(drainThickness),
      ch_m2_per_year: num(ch), cv_m2_per_year: num(cv), drainage_path_m: num(drainagePath),
      target_U_percent: num(targetU), elapsed_time_years: num(elapsedTime),

      fines_content_percent: num(fines), d50_mm: num(d50),

      fs_liquefaction: num(fsLiq), predicted_settlement_mm: num(predSettle), allowable_settlement_mm: num(allowSettle),
    }
    setLoading(true)
    try {
      const r = await api.runGroundImprovement(payload)
      setResult(r)
    } catch (e: any) {
      setError(e.message || 'Calculation failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="w-9 h-9 rounded-xl bg-violet-500/12 text-violet-500 flex items-center justify-center"><Wind size={18} /></div>
        <h1 className="font-display text-xl font-semibold text-slate-50">Ground Improvement</h1>
      </div>
      <p className="text-xs text-slate-400 mb-5">
        4 independent tools — fill in whichever section(s) apply to your site, leave the rest blank.
      </p>

      {/* Stone Column */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Stone Column — Spacing & Improvement Factor (IS 15284 Part 1)</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Column diameter (m)</label>
            <input className="gm-input w-full" value={colDia} onChange={(e) => setColDia(e.target.value)} placeholder="e.g. 0.9" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Spacing (m)</label>
            <input className="gm-input w-full" value={scSpacing} onChange={(e) => setScSpacing(e.target.value)} placeholder="e.g. 1.8" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Pattern</label>
            <select className="gm-input w-full" value={scPattern} onChange={(e) => setScPattern(e.target.value)}>
              <option value="triangular">Triangular</option><option value="square">Square</option>
            </select></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Stress concentration factor n (2.5–5 typical)</label>
            <input className="gm-input w-full" value={n} onChange={(e) => setN(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Applied stress (kPa)</label>
            <input className="gm-input w-full" value={appliedStress} onChange={(e) => setAppliedStress(e.target.value)} placeholder="e.g. 147" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Untreated settlement (mm, optional)</label>
            <input className="gm-input w-full" value={untreatedSettlement} onChange={(e) => setUntreatedSettlement(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">mv of soil (m²/kN, optional)</label>
            <input className="gm-input w-full" value={mv} onChange={(e) => setMv(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Treated depth (m, optional)</label>
            <input className="gm-input w-full" value={treatedDepth} onChange={(e) => setTreatedDepth(e.target.value)} /></div>
        </div>
      </div>

      {/* PVD */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Preloading + PVD — Consolidation Timeline</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Drain spacing (m)</label>
            <input className="gm-input w-full" value={pvdSpacing} onChange={(e) => setPvdSpacing(e.target.value)} placeholder="e.g. 1.5" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Pattern</label>
            <select className="gm-input w-full" value={pvdPattern} onChange={(e) => setPvdPattern(e.target.value)}>
              <option value="triangular">Triangular</option><option value="square">Square</option>
            </select></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Drain width (mm)</label>
            <input className="gm-input w-full" value={drainWidth} onChange={(e) => setDrainWidth(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Drain thickness (mm)</label>
            <input className="gm-input w-full" value={drainThickness} onChange={(e) => setDrainThickness(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">ch — horizontal (m²/year)</label>
            <input className="gm-input w-full" value={ch} onChange={(e) => setCh(e.target.value)} placeholder="e.g. 2" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">cv — vertical (m²/year)</label>
            <input className="gm-input w-full" value={cv} onChange={(e) => setCv(e.target.value)} placeholder="e.g. 1" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Drainage path (m)</label>
            <input className="gm-input w-full" value={drainagePath} onChange={(e) => setDrainagePath(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Target U% (leave blank to skip)</label>
            <input className="gm-input w-full" value={targetU} onChange={(e) => setTargetU(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Or: check U% at elapsed time (years)</label>
            <input className="gm-input w-full" value={elapsedTime} onChange={(e) => setElapsedTime(e.target.value)} /></div>
        </div>
        <p className="text-[11px] text-slate-500 mt-2.5">Ideal drain assumed — no smear zone or well resistance modelled, so real timelines run somewhat slower than shown.</p>
      </div>

      {/* Vibro */}
      <div className="glass p-4 mb-3">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Vibro-Compaction — Feasibility Check</div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Fines content (%)</label>
            <input className="gm-input w-full" value={fines} onChange={(e) => setFines(e.target.value)} placeholder="e.g. 8" /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">D50 (mm, optional)</label>
            <input className="gm-input w-full" value={d50} onChange={(e) => setD50(e.target.value)} /></div>
        </div>
      </div>

      {/* Recommendation */}
      <div className="glass p-4 mb-4">
        <div className="text-sm font-medium text-slate-200 mb-2.5">Recommendation — Linked to Liquefaction/Settlement Results</div>
        <div className="grid grid-cols-3 gap-3">
          <div><label className="text-xs text-slate-400 mb-1 block">Liquefaction FS (from your analysis)</label>
            <input className="gm-input w-full" value={fsLiq} onChange={(e) => setFsLiq(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Predicted settlement (mm)</label>
            <input className="gm-input w-full" value={predSettle} onChange={(e) => setPredSettle(e.target.value)} /></div>
          <div><label className="text-xs text-slate-400 mb-1 block">Allowable settlement (mm)</label>
            <input className="gm-input w-full" value={allowSettle} onChange={(e) => setAllowSettle(e.target.value)} /></div>
        </div>
      </div>

      {error && <div className="text-xs text-rose-400 mb-3">{error}</div>}
      <button onClick={run} disabled={loading} className="gm-btn-primary text-sm flex items-center gap-2">
        {loading ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : 'Calculate'}
      </button>

      {result && (
        <div className="mt-6 space-y-4">
          {result.stone_column && (
            <div className="glass p-5">
              <div className="text-sm font-medium text-slate-200 mb-3">Stone Column Result</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400">Area replacement ratio (as):</span> <span className="text-slate-100">{result.stone_column.area_replacement_ratio}</span></div>
                <div><span className="text-slate-400">Settlement improvement factor (μ):</span> <span className="text-slate-100">{result.stone_column.settlement_improvement_factor}</span></div>
                <div><span className="text-slate-400">Stress in soil:</span> <span className="text-slate-100">{result.stone_column.stress_in_soil_kpa} kPa</span></div>
                <div><span className="text-slate-400">Stress in column:</span> <span className="text-slate-100">{result.stone_column.stress_in_column_kpa} kPa</span></div>
                {result.stone_column.settlement_treated_mm != null && <div><span className="text-slate-400">Treated settlement:</span> <span className="text-violet-400 font-medium">{result.stone_column.settlement_treated_mm} mm</span></div>}
                {result.stone_column.settlement_treated_from_untreated_mm != null && <div><span className="text-slate-400">Treated settlement (from untreated):</span> <span className="text-violet-400 font-medium">{result.stone_column.settlement_treated_from_untreated_mm} mm</span></div>}
              </div>
              {result.stone_column.warnings?.map((w: string, i: number) => (
                <div key={i} className="text-[11px] text-amber-500 flex items-start gap-1.5 mt-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{w}</div>
              ))}
            </div>
          )}

          {result.pvd && (
            <div className="glass p-5">
              <div className="text-sm font-medium text-slate-200 mb-3">PVD Consolidation Result</div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-400">Equivalent diameter de:</span> <span className="text-slate-100">{result.pvd.equivalent_soil_cylinder_diameter_de_m} m</span></div>
                <div><span className="text-slate-400">Spacing ratio n:</span> <span className="text-slate-100">{result.pvd.spacing_ratio_n}</span></div>
                {result.pvd.degree_of_consolidation_percent != null && (
                  <div><span className="text-slate-400">U at {result.pvd.at_time_years}yr:</span> <span className="text-violet-400 font-medium">{result.pvd.degree_of_consolidation_percent}%</span></div>
                )}
                {result.pvd.time_required_years != null && (
                  <div><span className="text-slate-400">Time for {result.pvd.target_U_percent}% U:</span> <span className="text-violet-400 font-medium">{result.pvd.time_required_years} yr ({result.pvd.time_required_months} mo)</span></div>
                )}
              </div>
              {result.pvd.warnings?.map((w: string, i: number) => (
                <div key={i} className="text-[11px] text-amber-500 flex items-start gap-1.5 mt-2"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{w}</div>
              ))}
            </div>
          )}

          {result.vibro_compaction && (
            <div className="glass p-5">
              <div className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                Vibro-Compaction Feasibility — <span className="text-violet-400">{result.vibro_compaction.verdict}</span>
              </div>
              <p className="text-xs text-slate-400">{result.vibro_compaction.note}</p>
              {result.vibro_compaction.grain_size_note && <p className="text-xs text-amber-500 mt-1.5">{result.vibro_compaction.grain_size_note}</p>}
            </div>
          )}

          {result.recommendation && (
            <div className="glass p-5">
              <div className="text-sm font-medium text-slate-200 mb-2.5">Recommendation</div>
              {result.recommendation.flags.map((f: string, i: number) => (
                <div key={i} className="text-xs text-amber-500 flex items-start gap-1.5 mb-1.5"><AlertTriangle size={12} className="shrink-0 mt-0.5" />{f}</div>
              ))}
              {result.recommendation.suggestions.map((s: string, i: number) => (
                <div key={i} className="text-xs text-slate-200 flex items-start gap-1.5 mb-1.5"><CheckCircle2 size={12} className="shrink-0 mt-0.5 text-violet-400" />{s}</div>
              ))}
              <p className="text-[11px] text-slate-500 mt-2">{result.recommendation.note}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
