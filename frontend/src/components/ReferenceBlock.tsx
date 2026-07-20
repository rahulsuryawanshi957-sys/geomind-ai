import { BookMarked } from 'lucide-react'

export interface Citation {
  filename: string
  page_number?: number | null
  clause_number?: string | null
  category?: string | null
  score: number
}

function confidenceLabel(score: number) {
  if (score >= 0.55) return { label: 'High', color: 'text-emerald-400' }
  if (score >= 0.35) return { label: 'Medium', color: 'text-amber-400' }
  return { label: 'Low', color: 'text-rose-400' }
}

export default function ReferenceBlock({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) {
    return (
      <div className="mt-3 text-xs text-rose-400 flex items-center gap-2">
        <BookMarked size={14} /> No matching source found in your uploaded documents.
      </div>
    )
  }
  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3 space-y-1.5">
      {citations.map((c, i) => {
        const conf = confidenceLabel(c.score)
        return (
          <div key={i} className="text-xs text-slate-400 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-slate-300 font-medium">{c.filename}</span>
            {c.page_number != null && <span>Page {c.page_number}</span>}
            {c.clause_number && <span>Clause {c.clause_number}</span>}
            <span className={conf.color}>Confidence: {conf.label}</span>
          </div>
        )
      })}
    </div>
  )
}
