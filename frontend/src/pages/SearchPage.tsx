import { useState } from 'react'
import { motion } from 'framer-motion'
import { Search as SearchIcon } from 'lucide-react'
import { api } from '../api/client'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    try { const res = await api.search(query); setResults(res.results); setSearched(true) } finally { setLoading(false) }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1">Universal Search</h1>
      <p className="text-sm text-slate-400 mb-6">Search across every uploaded book and code, ranked by relevance.</p>

      <form onSubmit={runSearch} className="flex gap-2 mb-6">
        <input className="gm-input flex-1" placeholder="e.g. negative skin friction, SPT correction, bearing capacity" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="gm-btn-primary flex items-center gap-2" disabled={loading}><SearchIcon size={15} />Search</button>
      </form>

      <div className="space-y-3">
        {results.map((r, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass px-4 py-3">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
              <span className="text-violet-300 font-medium">{r.filename}</span>
              <span>{r.page_number ? `Page ${r.page_number}` : ''} {r.clause_number ? `· Clause ${r.clause_number}` : ''} · match {(r.score * 100).toFixed(0)}%</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed line-clamp-4">{r.text}</p>
          </motion.div>
        ))}
        {searched && !loading && results.length === 0 && (
          <div className="text-sm text-slate-500 text-center py-10">No matches found in your uploaded documents.</div>
        )}
      </div>
    </div>
  )
}
