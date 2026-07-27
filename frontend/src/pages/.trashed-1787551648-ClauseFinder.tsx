import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileSearch } from 'lucide-react'
import { api } from '../api/client'

export default function ClauseFinder() {
  const [codeName, setCodeName] = useState('IS 2911')
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function find(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setLoading(true)
    setResult(null)
    try { setResult(await api.findClause(codeName, topic)) } finally { setLoading(false) }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2">
        <FileSearch size={20} className="text-violet-400" /> Clause Finder
      </h1>
      <p className="text-sm text-slate-400 mb-6">Never invents a clause number — only returns what's actually in your uploaded code.</p>

      <form onSubmit={find} className="glass p-5 space-y-3 mb-6">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Code name</label>
          <input className="gm-input w-full" value={codeName} onChange={(e) => setCodeName(e.target.value)} placeholder="e.g. IS 2911" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Topic</label>
          <input className="gm-input w-full" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. negative skin friction" />
        </div>
        <button className="gm-btn-primary" disabled={loading}>{loading ? 'Searching...' : 'Find clause'}</button>
      </form>

      {result && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5">
          {!result.found ? (
            <p className="text-sm text-rose-400">{result.message}</p>
          ) : (
            <>
              <div className="gm-prose whitespace-pre-wrap">{result.explanation}</div>
              <div className="mt-3 border-t border-white/[0.06] pt-3 space-y-1">
                {result.sources.map((s: any, i: number) => (
                  <div key={i} className="text-xs text-slate-500">{s.filename} {s.page_number ? `· page ${s.page_number}` : ''} {s.clause_number ? `· clause ${s.clause_number}` : ''}</div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  )
}
