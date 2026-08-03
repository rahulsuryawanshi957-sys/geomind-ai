import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  MessageSquare, FolderKanban, BookOpen, ScrollText, Sigma, FileSearch, ScanSearch,
  Calculator, LayoutGrid, Waves, Milestone, ArrowLeftRight, Layers3, FlaskConical,
  Mountain, FileText, History, Bookmark, Layers, Activity, Clock, ArrowUpRight,
  ArrowRight,
} from 'lucide-react'
import { api } from '../api/client'

const MODULE_SECTIONS: {
  label: string
  items: { to: string; label: string; description: string; icon: any; soon?: boolean }[]
}[] = [
  {
    label: 'AI & Knowledge Base',
    items: [
      { to: '/chat', label: 'AI Chat', description: 'Ask questions grounded in your own uploaded books, codes, and reports.', icon: MessageSquare },
      { to: '/books', label: 'Document Library', description: 'All uploaded reference books and reports, organized and searchable.', icon: BookOpen },
      { to: '/is-codes', label: 'IS / IRC Codes', description: 'Indexed Indian Standard and IRC codes for instant lookup.', icon: ScrollText },
      { to: '/clause-finder', label: 'Clause Finder', description: 'Find the exact code clause you need, cited from the source document.', icon: FileSearch },
      { to: '/formulas', label: 'Formula Library', description: 'Standard geotechnical formulas with variable definitions, ready to reference.', icon: Sigma },
      { to: '/pdf-chat', label: 'PDF Chat', description: 'Chat scoped to a single document, with an inline viewer.', icon: ScanSearch, soon: true },
    ],
  },
  {
    label: 'Site Data',
    items: [
      { to: '/borehole-logs', label: 'Borehole Logs', description: 'Build and print IS-format borehole logs with SPT, samples, and strata.', icon: Layers3 },
      { to: '/lab-reports', label: 'Lab Data Import', description: 'Import lab test sheets straight into borehole/soil-layer records.', icon: FlaskConical },
      { to: '/soil-profile', label: 'Soil Profile Viewer', description: 'Visualize strata and classification/weathering across a borehole.', icon: Mountain },
    ],
  },
  {
    label: 'Engineering Analysis',
    items: [
      { to: '/calculators', label: 'Bearing Capacity & Settlement', description: 'IS 6403 shear SBC and IS 8009 settlement, for granular and clay soils.', icon: Calculator },
      { to: '/batch-analysis', label: 'Batch Analysis', description: 'Run a full width x depth matrix of foundation combinations at once.', icon: LayoutGrid },
      { to: '/liquefaction-analysis', label: 'Liquefaction Analysis', description: 'IS 1893:2016 simplified liquefaction procedure, wired to your borehole data.', icon: Waves },
      { to: '/pile-capacity', label: 'Pile Capacity', description: 'IS 2911 pile capacity, with a natural-language command parser.', icon: Milestone },
      { to: '/lateral-capacity', label: 'Lateral Capacity', description: 'Lateral pile capacity analysis for foundation design.', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Reporting & Projects',
    items: [
      { to: '/reports', label: 'Engineering Reports', description: 'Generate a report from your analysis results.', icon: FileText },
      { to: '/history', label: 'History', description: 'Every past AI conversation, ready to pick back up.', icon: History },
      { to: '/projects', label: 'Projects', description: 'A workspace per site, bundling boreholes, reports, and calculations together.', icon: FolderKanban, soon: true },
      { to: '/bookmarks', label: 'Bookmarks', description: 'Saved answers, clauses, and formulas pinned for quick reference.', icon: Bookmark, soon: true },
    ],
  },
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
  const [boreholes, setBoreholes] = useState<any[]>([])

  useEffect(() => {
    api.listDocuments().then(setDocs).catch(() => {})
    api.listConversations().then(setConversations).catch(() => {})
    api.listBoreholes().then(setBoreholes).catch(() => {})
  }, [])

  const totalBooks = docs.filter((d) => d.category !== 'IS Codes' && d.category !== 'IRC Codes').length
  const totalCodes = docs.filter((d) => d.category === 'IS Codes' || d.category === 'IRC Codes').length
  const indexedPages = docs.reduce((sum, d) => sum + (d.indexed_pages || 0), 0)
  const recentDocs = [...docs].sort((a, b) => +new Date(b.upload_date) - +new Date(a.upload_date)).slice(0, 5)

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="font-display text-2xl font-semibold text-slate-50">RaahiGeo Workspace</h1>
        <p className="text-sm text-slate-400 mt-1">Every module, one click away — grounded in your own boreholes, lab data, and reference documents.</p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        <StatCard icon={BookOpen} label="Total Books" value={totalBooks} accent="bg-violet-500/15 text-violet-500" />
        <StatCard icon={ScrollText} label="Total IS/IRC Codes" value={totalCodes} accent="bg-cyan-500/15 text-cyan-500" />
        <StatCard icon={Layers} label="Indexed Pages" value={indexedPages} accent="bg-violet-500/15 text-violet-500" />
        <StatCard icon={Layers3} label="Borehole Profiles" value={boreholes.length} accent="bg-cyan-500/15 text-cyan-500" />
        <StatCard icon={Activity} label="AI Assistant" value="Online" accent="bg-emerald-500/15 text-emerald-500" />
      </div>

      {/* Module sections — the actual control center of the app */}
      {MODULE_SECTIONS.map((section, si) => (
        <div key={section.label} className="mb-8">
          <h2 className="text-xs font-semibold text-slate-400 tracking-wider uppercase mb-3">{section.label}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {section.items.map((m, i) => (
              <motion.div key={m.to} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (si * 6 + i) * 0.02 }}>
                <Link to={m.to} className="glass glass-hover flex items-start gap-3 p-4 h-full relative">
                  {m.soon && (
                    <span className="absolute top-3 right-3 text-[9px] font-medium tracking-wide uppercase px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-500">
                      Coming Soon
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-500 flex items-center justify-center shrink-0">
                    <m.icon size={18} />
                  </div>
                  <div className="min-w-0 pr-14">
                    <div className="text-sm font-medium text-slate-100">{m.label}</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{m.description}</p>
                  </div>
                  {!m.soon && (
                    <ArrowRight size={14} className="text-slate-500 absolute bottom-4 right-4" />
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recently opened documents */}
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2"><Clock size={14} /> Recent Documents</h2>
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

        {/* Recent borehole profiles */}
        <div className="glass p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-slate-200 flex items-center gap-2"><FlaskConical size={14} /> Borehole Profiles</h2>
            <Link to="/lab-reports" className="text-xs text-violet-400 flex items-center gap-1">View all <ArrowUpRight size={12} /></Link>
          </div>
          <div className="space-y-2">
            {boreholes.length === 0 && <p className="text-xs text-slate-500 py-6 text-center">No lab data imported yet.</p>}
            {boreholes.slice(0, 5).map((bh) => (
              <Link key={bh.id} to="/lab-reports" className="flex items-center justify-between text-sm px-3 py-2 rounded-lg hover:bg-white/[0.04]">
                <span className="text-slate-300 truncate">{bh.borehole_id}</span>
                <span className="text-[10px] text-slate-500 shrink-0 ml-2">{bh.layers?.length ?? 0} layers</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
