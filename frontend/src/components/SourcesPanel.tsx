import { BookMarked, Sigma } from 'lucide-react'
import { Citation } from './ReferenceBlock'

export default function SourcesPanel({ citations }: { citations: Citation[] }) {
  return (
    <aside className="hidden xl:flex w-72 shrink-0 h-screen sticky top-0 border-l border-white/[0.06] bg-navy-900/60 backdrop-blur-xl flex-col">
      <div className="px-5 py-5 border-b border-white/[0.06]">
        <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2"><BookMarked size={15} className="text-violet-400" /> Live Sources</h2>
        <p className="text-xs text-slate-500 mt-0.5">Grounded in your uploaded documents</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {citations.length === 0 && (
          <div className="text-xs text-slate-500 text-center py-10 px-2">
            Ask a question — matching book pages and code clauses will appear here as they're retrieved.
          </div>
        )}
        {citations.map((c, i) => (
          <div key={i} className="glass p-3">
            <div className="text-xs font-medium text-slate-200 truncate mb-1">{c.filename}</div>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-400">
              {c.page_number != null && <span className="px-1.5 py-0.5 rounded bg-white/[0.05]">Page {c.page_number}</span>}
              {c.clause_number && <span className="px-1.5 py-0.5 rounded bg-white/[0.05]">Clause {c.clause_number}</span>}
              {c.category && <span className="px-1.5 py-0.5 rounded bg-white/[0.05]">{c.category}</span>}
            </div>
            <div className="mt-2 h-1 bg-navy-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400" style={{ width: `${Math.min(100, c.score * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-white/[0.06]">
        <div className="text-xs text-slate-500 flex items-center gap-2"><Sigma size={12} /> Related formulae appear here once you ask a calculation question.</div>
      </div>
    </aside>
  )
}
