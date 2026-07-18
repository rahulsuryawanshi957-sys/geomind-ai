import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  MessageSquare, Upload, ScrollText, Calculator, FolderPlus, FileText,
  BookOpen, Layers, Activity, Clock, ArrowUpRight,
} from 'lucide-react'
import { api } from '../api/client'

const QUICK_ACTIONS = [
  { to: '/chat', label: 'Ask AI', icon: MessageSquare, gradient: 'from-violet-500 to-violet-400' },
  { to: '/books', label: 'Upload Book', icon: Upload, gradient: 'from-cyan-500 to-cyan-400' },
  { to: '/is-codes', label: 'Upload IS Code', icon: ScrollText, gradient: 'from-violet-500 to-cyan-400' },
  { to: '/calculators', label: 'Open Calculator', icon: Calculator, gradient: 'from-cyan-500 to-violet-400' },
  { to: '/projects', label: 'New Project', icon: FolderPlus, gradient: 'from-violet-400 to-violet-600' },
  { to: '/reports', label: 'Generate Report', icon: FileText, gradient: 'from-cyan-400 to-cyan-600' },
]

function StatCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string | number; accent: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass glass-hover p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${accent}`}>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-display font-semibold text-slate-50">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
    </motion.div>
  )
}

export default function Dashboard() {
  const [docs, setDocs] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])

  useEffect(() => {
    api.listDocuments().then(setDocs).catch(() => {})
    api.listConversations().then(setConversations).catch(() => {})
  }, [])

  const totalBooks = docs.filter((d) => d.category !== 'IS Codes' && d.category !== 'IRC Codes').length
  const totalCodes = docs.filter((d) => d.category === 'IS Codes' || d.category === 'IRC Codes').length
  const indexedPages = docs.reduce((sum, d) => sum + (d.indexed_pages || 0), 0)
  const recentDocs = [...docs].sort((a, b) => +new Date(b.upload_date) - +new Date(a.upload_date)).slice(0, 5)

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-slate-50">Welcome back</h1>
        <p className="text-sm text-slate-400 mt-1">Your geotechnical engineering workspace — grounded in your own documents.</p>
      </motion.div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        {QUICK_ACTIONS.map((a, i) => (
          <motion.div key={a.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Link to={a.to} className="glass glass-hover flex flex-col items-center justify-center gap-2 p-4 text-center h-full">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${a.gradient} flex items-center justify-center`}>
                <a.icon size={16} className="text-navy-950" />
              </div>
              <span className="text-xs text-slate-300 font-medium">{a.label}</span>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard icon={BookOpen} label="Total Books" value={totalBooks} accent="bg-violet-500/15 text-violet-400" />
        <StatCard icon={ScrollText} label="Total IS/IRC Codes" value={totalCodes} accent="bg-cyan-500/15 text-cyan-400" />
        <StatCard icon={Layers} label="Indexed Pages" value={indexedPages} accent="bg-violet-500/15 text-violet-400" />
        <StatCard icon={Activity} label="AI Assistant" value="Online" accent="bg-emerald-500/15 text-emerald-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recently opened documents */}
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2"><Clock size={14} /> Recently Opened Documents</h2>
            <Link to="/books" className="text-xs text-violet-400 flex items-center gap-1">View all <ArrowUpRight size={12} /></Link>
          </div>
          <div className="space-y-2">
            {recentDocs.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">No documents uploaded yet.</p>}
            {recentDocs.map((d) => (
              <div key={d.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-white/[0.04]">
                <span className="text-slate-300 truncate">{d.filename}</span>
                <span className="text-[10px] text-slate-500 shrink-0 ml-2">{d.category}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent conversations */}
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2"><MessageSquare size={14} /> Recent Conversations</h2>
            <Link to="/history" className="text-xs text-violet-400 flex items-center gap-1">View all <ArrowUpRight size={12} /></Link>
          </div>
          <div className="space-y-2">
            {conversations.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">No conversations yet — start one in AI Chat.</p>}
            {conversations.slice(0, 5).map((c) => (
              <Link key={c.id} to="/history" className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-white/[0.04]">
                <span className="text-slate-300 truncate">{c.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
