import { useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sigma } from 'lucide-react'
import { api } from '../api/client'

export default function FormulaLibrary() {
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<any[]>([])

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setLoading(true); setAnswer('')
    try {
      const res = await api.chat({
        question: `Extract the formula for "${topic}" from the uploaded documents. Present it with markdown headings: ## Formula, ## Variable Meanings, ## Units, ## Assumptions, ## Source, ## Worked Example.`,
        engineering_mode: true,
      })
      setAnswer(res.answer); setCitations(res.citations)
    } finally { setLoading(false) }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2"><Sigma size={20} className="text-violet-400" /> Formula Library</h1>
      <p className="text-sm text-slate-400 mb-6">Look up a formula by name — pulled and cited from your uploaded documents.</p>

      <form onSubmit={lookup} className="flex gap-2 mb-6">
        <input className="gm-input flex-1" placeholder="e.g. Meyerhof bearing capacity, group efficiency" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <button className="gm-btn-primary" disabled={loading}>{loading ? 'Looking up...' : 'Look up'}</button>
      </form>

      {answer && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5">
          <div className="gm-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown></div>
          {citations.length > 0 && (
            <div className="mt-3 border-t border-white/[0.06] pt-3 space-y-1">
              {citations.map((c, i) => (
                <div key={i} className="text-xs text-slate-500">{c.filename} {c.page_number ? `· page ${c.page_number}` : ''} {c.clause_number ? `· clause ${c.clause_number}` : ''}</div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
