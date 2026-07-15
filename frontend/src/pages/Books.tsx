import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Upload, Trash2, RefreshCw, FileText, Search as SearchIcon } from 'lucide-react'
import { api } from '../api/client'

interface Doc {
  id: string; filename: string; category: string; upload_date: string
  indexed_pages: number; total_pages: number; status: string
}

const STATUS_STYLE: Record<string, string> = {
  indexed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-rose-500/15 text-rose-400',
  pending: 'bg-amber-500/15 text-amber-400',
  indexing: 'bg-cyan-500/15 text-cyan-400',
}

export default function Books({ fixedCategory }: { fixedCategory?: string }) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [category, setCategory] = useState(fixedCategory || '')
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState(false)

  async function load() {
    const [d, c] = await Promise.all([api.listDocuments(fixedCategory), api.categories()])
    setDocs(d); setCategories(c)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 4000)
    return () => clearInterval(interval)
  }, [fixedCategory])

  async function handleUpload(file: File) {
    const cat = fixedCategory || category || categories[0]
    setUploading(true)
    try { await api.uploadDocument(file, cat); await load() } finally { setUploading(false) }
  }

  const filtered = docs.filter((d) => (!category || d.category === category) && d.filename.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="p-6 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-50">{fixedCategory || 'Document Library'}</h1>
          <p className="text-sm text-slate-400 mt-0.5">Upload PDFs to make them searchable, citable, and chat-ready.</p>
        </div>
        <label className="gm-btn-primary flex items-center gap-2 cursor-pointer w-fit">
          <Upload size={15} /> {uploading ? 'Uploading...' : 'Upload PDF'}
          <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files[0])} />
        </label>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="gm-input w-full pl-9" placeholder="Search by filename..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {!fixedCategory && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-xs border ${category === '' ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'text-slate-400 border-white/10'}`}>All</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-xs border ${category === c ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'text-slate-400 border-white/10'}`}>{c}</button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((d, i) => (
          <motion.div key={d.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }} className="glass glass-hover p-4 flex flex-col">
            <div className="w-full aspect-[4/3] rounded-xl bg-gradient-to-br from-violet-500/15 to-cyan-500/10 flex items-center justify-center mb-3">
              <FileText size={28} className="text-violet-300" />
            </div>
            <div className="text-sm text-slate-100 font-medium truncate" title={d.filename}>{d.filename}</div>
            <div className="text-[11px] text-slate-500 mt-1">{d.category}</div>
            <div className="text-[11px] text-slate-500">{new Date(d.upload_date).toLocaleDateString()} · {d.indexed_pages}/{d.total_pages || '?'} pages</div>
            <div className="flex items-center justify-between mt-3">
              <span className={`gm-badge ${STATUS_STYLE[d.status] || 'bg-white/10 text-slate-400'}`}>{d.status}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => api.reindexDocument(d.id).then(load)} className="gm-btn-icon" title="Re-index"><RefreshCw size={14} /></button>
                <button onClick={() => api.deleteDocument(d.id).then(load)} className="gm-btn-icon hover:!text-rose-400" title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full glass p-10 text-center text-sm text-slate-500">No documents yet. Upload a PDF to get started.</div>
        )}
      </div>
    </div>
  )
}
