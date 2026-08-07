import { useState, type ReactNode } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'

// Reusable "Theory / How this is calculated" collapsible block.
// Used under calculator result cards to show: the source code clause,
// the formula(s) in plain text, a simple SVG diagram, and a confidence note.
// Added 5 Aug 2026 -- Raahi asked for calculation theory + diagrams to be
// visible in-app for every Ground Improvement sub-tool (see PROJECT_STATUS).

export interface TheoryStep {
  label: string
  formula: string
  note?: string
}

export default function TheorySection({
  title,
  source,
  confidence,
  steps,
  diagram,
  extraNote,
}: {
  title: string
  source: string
  confidence: 'High' | 'Medium' | 'Low'
  steps: TheoryStep[]
  diagram?: ReactNode
  extraNote?: string
}) {
  const [open, setOpen] = useState(false)

  const confColor =
    confidence === 'High' ? 'text-emerald-400 bg-emerald-500/10' :
    confidence === 'Medium' ? 'text-amber-400 bg-amber-500/10' :
    'text-rose-400 bg-rose-500/10'

  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
      >
        <BookOpen size={13} />
        Theory / How this was calculated (formula + IS code + diagram)
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 bg-navy-800/50 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-300 font-medium">{title}</span>
            <span className={`gm-badge ${confColor}`}>{confidence} confidence</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            <span className="text-slate-300 font-medium">Source: </span>{source}
          </p>

          {diagram && (
            <div className="bg-navy-900/60 rounded-lg p-3 flex justify-center">
              {diagram}
            </div>
          )}

          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={i} className="text-[11px] leading-relaxed">
                <span className="text-slate-300 font-medium">{s.label}: </span>
                <code className="bg-navy-900 text-cyan-300 px-1.5 py-0.5 rounded font-mono text-[11px]">{s.formula}</code>
                {s.note && <span className="text-slate-500"> — {s.note}</span>}
              </div>
            ))}
          </div>

          {extraNote && (
            <p className="text-[11px] text-amber-500/90 leading-relaxed border-t border-white/[0.06] pt-2">{extraNote}</p>
          )}
        </div>
      )}
    </div>
  )
}
