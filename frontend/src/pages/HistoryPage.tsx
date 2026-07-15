import { useEffect, useState } from 'react'
import { History as HistoryIcon, Trash2 } from 'lucide-react'
import { api } from '../api/client'

export default function HistoryPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<any>(null)

  async function load(q?: string) { setConversations(await api.listConversations(q)) }
  useEffect(() => { load() }, [])

  return (
    <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6">
      <div className="md:w-80 shrink-0">
        <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2"><HistoryIcon size={20} className="text-violet-400" /> History</h1>
        <input className="gm-input w-full my-3" placeholder="Search past conversations..." value={query} onChange={(e) => { setQuery(e.target.value); load(e.target.value) }} />
        <div className="space-y-1">
          {conversations.map((c) => (
            <div key={c.id} className="flex items-center justify-between group">
              <button onClick={() => api.getConversation(c.id).then(setSelected)} className="flex-1 text-left px-3 py-2 rounded-xl text-sm text-slate-300 hover:bg-white/[0.05] truncate">{c.title}</button>
              <button onClick={() => api.deleteConversation(c.id).then(() => load(query))} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 px-2"><Trash2 size={14} /></button>
            </div>
          ))}
          {conversations.length === 0 && <div className="text-sm text-slate-500 px-3 py-4">No conversations yet.</div>}
        </div>
      </div>

      <div className="flex-1">
        {selected ? (
          <div className="space-y-3 max-w-2xl">
            {selected.messages.map((m: any, i: number) => (
              <div key={i} className="glass px-4 py-3">
                <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{m.role === 'user' ? 'You' : 'GeoMind AI'}</div>
                <div className="text-sm text-slate-200 whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>
        ) : <div className="text-sm text-slate-500 mt-10">Select a conversation to view it.</div>}
      </div>
    </div>
  )
}
