import { useState } from 'react'
import { Wind, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { api } from '../api/client'
import TheorySection from '../components/TheorySection'

// 4 independent sub-tools -- see backend/app/services/ground_improvement.py's
// module docstring for formula sources/confidence per section. Every field
// is optional; the backend runs whichever sub-tool(s) have enough inputs.

// ---------------------------------------------------------------------------
// Diagrams -- added 5 Aug 2026 alongside TheorySection (Raahi asked for
// calculation theory + pictures visible in-app). Plain inline SVG, no image
// files/network needed -- renders instantly, themes with currentColor.
// ---------------------------------------------------------------------------

function StoneColumnDiagram() {
  // Top view: triangular pattern of 3 stone columns, tributary hexagon shaded,
  // D (column diameter) and S (spacing) labelled -- matches Cl 7.5 as = 0.907*(D/S)^2.
  return (
    <svg viewBox="0 0 260 190" width="260" height="190" className="text-slate-400">
      {/* tributary hexagon (shaded) */}
      <polygon points="130,35 178,63 178,119 130,147 82,119 82,63"
        fill="rgb(14 165 164 / 0.08)" stroke="rgb(14 165 164 / 0.45)" strokeDasharray="3 3" strokeWidth="1" />
      {/* 3 columns of the triangular unit */}
      <circle cx="130" cy="63" r="16" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="82" cy="119" r="16" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="178" cy="119" r="16" fill="rgb(148 163 184 / 0.25)" stroke="currentColor" strokeWidth="1.5" />
      {/* D label on one column */}
      <line x1="114" y1="63" x2="146" y2="63" stroke="rgb(45 212 191)" strokeWidth="1" markerStart="url(#gm-arrow)" markerEnd="url(#gm-arrow)" />
      <text x="130" y="55" textAnchor="middle" fontSize="10" fill="rgb(45 212 191)">D</text>
      {/* S label between two columns */}
      <line x1="130" y1="63" x2="82" y2="119" stroke="rgb(226 232 240)" strokeWidth="1" strokeDasharray="2 2" />
      <text x="97" y="86" textAnchor="middle" fontSize="10" fill="rgb(226 232 240)" transform="rotate(-52 97 86)">S</text>
      <defs>
        <marker id="gm-arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgb(45 212 191)" />
        </marker>
      </defs>
      <text x="130" y="178" textAnchor="middle" fontSize="10" fill="currentColor">Triangular pattern (top view)</text>
    </svg>
  )
}

function PvdDiagram() {
  // Cross-section: vertical band drain, zone of influence de, drainage path,
  // radial + vertical water flow arrows into the drain.
  return (
    <svg viewBox="0 0 260 190" width="260" height="190" className="text-slate-400">
      {/* soil block */}
      <rect x="20" y="20" width="220" height="130" fill="rgb(148 163 184 / 0.06)" stroke="currentColor" strokeWidth="1" />
      {/* permeable top boundary (hatch) */}
      <line x1="20" y1="20" x2="240" y2="20" stroke="rgb(45 212 191)" strokeWidth="2" />
      {/* zone of influence (de) - dashed ellipse around drain */}
      <ellipse cx="130" cy="85" rx="85" ry="55" fill="none" stroke="rgb(14 165 164 / 0.5)" strokeDasharray="3 3" strokeWidth="1" />
      {/* the band drain (thin rectangle) */}
      <rect x="126" y="20" width="8" height="130" fill="rgb(45 212 191 / 0.5)" stroke="rgb(45 212 191)" strokeWidth="1" />
      {/* radial arrows (horizontal flow to drain) */}
      {[45, 85, 125].map((y, i) => (
        <g key={i}>
          <line x1="55" y1={y} x2="122" y2={y} stroke="rgb(226 232 240 / 0.6)" strokeWidth="1" markerEnd="url(#gm-arrow2)" />
          <line x1="205" y1={y} x2="138" y2={y} stroke="rgb(226 232 240 / 0.6)" strokeWidth="1" markerEnd="url(#gm-arrow2)" />
        </g>
      ))}
      {/* vertical arrow up out of top (Uv component) */}
      <line x1="130" y1="105" x2="130" y2="25" stroke="rgb(34 211 238 / 0.7)" strokeWidth="1.5" markerEnd="url(#gm-arrow3)" />
      <defs>
        <marker id="gm-arrow2" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgb(226 232 240 / 0.6)" />
        </marker>
        <marker id="gm-arrow3" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill="rgb(34 211 238)" />
        </marker>
      </defs>
      <text x="130" y="12" textAnchor="middle" fontSize="9" fill="rgb(45 212 191)">permeable boundary</text>
      <text x="145" y="90" fontSize="9" fill="currentColor">dw (drain)</text>
      <text x="130" y="172" textAnchor="middle" fontSize="10" fill="currentColor">de = zone of influence, H = drainage path</text>
    </svg>
  )
}

function VibroDiagram() {
  // Simple horizontal scale showing fines-content zones (Suitable / Marginal / Not suitable).
  return (
    <svg viewBox="0 0 260 90" width="260" height="90" className="text-slate-400">
      <rect x="15" y="30" width="86" height="20" fill="rgb(16 185 129 / 0.25)" stroke="rgb(16 185 129)" strokeWidth="1" />
      <rect x="101" y="30" width="60" height="20" fill="rgb(245 158 11 / 0.25)" stroke="rgb(245 158 11)" strokeWidth="1" />
      <rect x="161" y="30" width="84" height="20" fill="rgb(244 63 94 / 0.2)" stroke="rgb(244 63 94)" strokeWidth="1" />
      <text x="58" y="44" textAnchor="middle" fontSize="9" fill="rgb(16 185 129)">Suitable</text>
      <text x="131" y="44" textAnchor="middle" fontSize="9" fill="rgb(245 158 11)">Marginal</text>
      <text x="203" y="44" textAnchor="middle" fontSize="9" fill="rgb(244 63 94)">Not suitable</text>
      <text x="15" y="66" fontSize="9" fill="currentColor">0%</text>
      <text x="97" y="66" fontSize="9" fill="currentColor">10%</text>
      <text x="157" y="66" fontSize="9" fill="currentColor">20%</text>
      <text x="230" y="66" fontSize="9" fill="currentColor">100%</text>
      <text x="130" y="80" textAnchor="middle" fontSize="9" fill="currentColor">Fines content (%) →</text>
    </svg>
  )
}

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
              <TheorySection
                title="Stone Column — Area Replacement Ratio & Reduced Stress Method"
                source="IS 15284 (Part 1):2003 — Cl 7.5 (area replacement ratio), Cl 7.6 (stress concentration factor n), Annex B (Reduced Stress Method)."
                confidence="High"
                diagram={<StoneColumnDiagram />}
                steps={[
                  { label: 'Area replacement ratio (as)', formula: 'as = 0.907 × (D/S)²  [triangular]   or   as = (π/4) × (D/S)²  [square]', note: '0.907 = π/(2√3), the exact geometric ratio of a column circle to its triangular tributary cell' },
                  { label: 'Settlement improvement factor (μ)', formula: 'μ = 1 + (n − 1) × as' },
                  { label: 'Stress carried by soil', formula: 'σ_soil = σ_applied / [1 + (n − 1) × as]' },
                  { label: 'Stress carried by column', formula: 'σ_column = n × σ_soil' },
                  { label: 'Treated settlement (if mv & depth given)', formula: 'Sc = mv × σ_soil × depth' },
                  { label: 'Treated settlement (if untreated settlement given)', formula: 'Sc(treated) = Sc(untreated) / μ' },
                ]}
                extraNote="n (stress concentration factor) is site-specific and decreases with depth — 2.5–5 typical near the surface (Cl 7.6). Verified against an archive.org OCR copy of IS 15284; the 0.907 constant was separately cross-checked algebraically."
              />
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
              <TheorySection
                title="Preloading + PVD — Radial + Vertical Consolidation"
                source="Barron (1948) radial consolidation, adapted for band drains by Hansbo (1981); combined with Terzaghi vertical consolidation using Carrillo's (1942) approximation."
                confidence="High"
                diagram={<PvdDiagram />}
                steps={[
                  { label: 'Zone of influence diameter (de)', formula: 'de = 1.05 × S  [triangular]   or   1.13 × S  [square]' },
                  { label: 'Drain equivalent diameter (dw)', formula: 'dw = (width + thickness) / 2', note: "Rixner et al (1986) flat-drain approximation" },
                  { label: 'Spacing ratio & drain resistance factor', formula: 'n = de/dw,   μ = ln(n) − 0.75' },
                  { label: 'Radial consolidation (Uh)', formula: 'Uh = 100 × [1 − e^(−8·Th/μ)]', note: 'Th = ch·t / de²' },
                  { label: 'Vertical consolidation (Uv)', formula: 'Terzaghi Tv–U curve fit', note: 'Tv = cv·t / H²' },
                  { label: 'Combined degree of consolidation', formula: 'U = 100 × [1 − (1−Uv/100)(1−Uh/100)]', note: "Carrillo's combination" },
                ]}
                extraNote="Ideal drain assumed — smear zone and well resistance are NOT modelled, so the real site will consolidate somewhat slower than this timeline shows."
              />
            </div>
          )}

          {result.vibro_compaction && (
            <div className="glass p-5">
              <div className="text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                Vibro-Compaction Feasibility — <span className="text-violet-400">{result.vibro_compaction.verdict}</span>
              </div>
              <p className="text-xs text-slate-400">{result.vibro_compaction.note}</p>
              {result.vibro_compaction.grain_size_note && <p className="text-xs text-amber-500 mt-1.5">{result.vibro_compaction.grain_size_note}</p>}
              <TheorySection
                title="Vibro-Compaction — Fines Content Screening"
                source="Widely cited geotechnical rule of thumb (not a single IS code clause) for whether vibro-compaction (densification) vs vibro-replacement (stone columns) suits a soil."
                confidence="Medium"
                diagram={<VibroDiagram />}
                steps={[
                  { label: 'Fines content < 10%', formula: 'Suitable', note: 'Vibro-compaction densifies the soil directly by vibration' },
                  { label: 'Fines content 10–20%', formula: 'Marginal', note: 'Effectiveness reduces — field trial recommended' },
                  { label: 'Fines content > 20%', formula: 'Not suitable', note: 'Fines dampen vibration transfer — use stone columns instead' },
                  { label: 'D50 < 0.06mm (if given)', formula: 'flagged regardless of fines %', note: 'very fine/silty soil resists densification' },
                ]}
                extraNote="This is a preliminary screen only, not a substitute for a field trial before finalizing the method."
              />
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
              <TheorySection
                title="Recommendation Engine — Rule-Based Logic (not a formula)"
                source="Simple decision rules linking your Liquefaction FS and Settlement results to a suggested ground-improvement method."
                confidence="Medium"
                steps={[
                  { label: 'FS liquefaction < 1.0', formula: 'IF fines% < 20 → vibro-compaction OR stone columns; ELSE → stone columns only' },
                  { label: 'FS liquefaction 1.0–1.25', formula: 'flagged as marginal', note: 'precaution, not urgent' },
                  { label: 'Predicted settlement > allowable settlement', formula: 'suggests Preloading+PVD (if time allows) or Stone Columns (if not)' },
                ]}
                extraNote="This only combines numbers you type in manually — it does NOT auto-fetch your Liquefaction/Settlement run yet. A qualified engineer should make the final call."
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
