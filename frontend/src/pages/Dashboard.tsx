import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  BookOpen, ScrollText, Calculator, LayoutGrid, Layers3, FlaskConical,
  Layers, Activity, ArrowUpRight, ArrowRight, Sparkles, FilePlus2,
} from 'lucide-react'
import { api } from '../api/client'

interface ToolItem { to: string; label: string; description: string; img: string; soon?: boolean }
interface RefItem { to: string; label: string; description: string; icon: string; soon?: boolean }

// Photos below are cropped directly from Raahi's own reference mockup
// (public/dashboard/*.jpg|png) -- not AI-generated, not stock. See
// PROJECT_STATUS.md changelog entry for how each was sourced/cropped.
const INVESTIGATION_TOOLS: ToolItem[] = [
  { to: '/borehole-logs', label: 'Borehole & Logs', description: 'Create, manage and visualize borehole logs with soil profile.', img: '/dashboard/tool-borehole.jpg' },
  { to: '/lab-reports', label: 'Lab Tests', description: 'Organize and analyze laboratory test results with graphs.', img: '/dashboard/tool-labtests.jpg' },
  { to: '/field-tests', label: 'Field Tests', description: 'Manage field test data like SPT, CPT, Plate Load, Vane Shear etc.', img: '/dashboard/tool-fieldtests.jpg', soon: true },
  { to: '/soil-profile', label: 'Geological & Soil Profile', description: 'Visualize soil strata, groundwater levels and rock profile.', img: '/dashboard/tool-soilprofile.jpg' },
]

const ANALYSIS_TOOLS: ToolItem[] = [
  { to: '/calculators', label: 'Foundation Design', description: 'Shallow, deep foundation & raft design as per codes.', img: '/dashboard/tool-foundation.jpg' },
  { to: '/ground-improvement', label: 'Ground Improvement', description: 'IS 15284 stone columns, PVD consolidation timeline, vibro-compaction feasibility.', img: '/dashboard/tool-slope.jpg' },
  { to: '/calculators', label: 'Bearing Capacity', description: 'Calculate ultimate & safe bearing capacity for foundations.', img: '/dashboard/tool-bearing.jpg' },
  { to: '/calculators', label: 'Settlement Analysis', description: 'Calculate total & differential settlement of foundations.', img: '/dashboard/tool-settlement.jpg' },
  { to: '/pile-capacity', label: 'Pile Design', description: 'Axial, lateral & group pile analysis and design.', img: '/dashboard/tool-pile.jpg' },
  { to: '/liquefaction-analysis', label: 'Liquefaction Analysis', description: 'Evaluate liquefaction potential as per IS 1893 (Part 1).', img: '/dashboard/tool-liquefaction.jpg' },
]

const REPORT_TILES: RefItem[] = [
  { to: '/reports', label: 'Reports', description: 'Generate professional reports with customizable templates.', icon: '/dashboard/icon-reports.png' },
  { to: '/reports', label: 'Excel Sheets', description: 'Access pre-built excel sheets for geotechnical calculations.', icon: '/dashboard/icon-excel.png', soon: true },
  { to: '/reports', label: 'Plot Generator', description: 'Generate plots for boreholes, profiles, graphs and more.', icon: '/dashboard/icon-plot.png', soon: true },
  { to: '/books', label: 'Document Manager', description: 'Store, manage and share your project documents.', icon: '/dashboard/icon-docmgr.png', soon: true },
]

const REFERENCE_TILES: RefItem[] = [
  { to: '/is-codes', label: 'Code & Standards', description: 'Access IS codes, IRC, ASTM and other geotechnical standards.', icon: '/dashboard/icon-codestandards.png' },
  { to: '/formulas', label: 'Formula Library', description: 'Browse geotechnical formulas and equations.', icon: '/dashboard/icon-formula.png' },
  { to: '/unit-converter', label: 'Unit Converter', description: 'Convert units easily across different systems.', icon: '/dashboard/icon-converter.png', soon: true },
  { to: '/soil-properties', label: 'Soil Properties', description: 'Typical soil properties and empirical data.', icon: '/dashboard/icon-soilprops.png', soon: true },
]

const QUICK_ACTIONS = [
  { to: '/lab-reports', label: 'New Borehole', icon: FlaskConical },
  { to: '/calculators', label: 'New Analysis', icon: Calculator },
  { to: '/batch-analysis', label: 'New Calculation', icon: LayoutGrid },
  { to: '/reports', label: 'Generate Report', icon: FilePlus2 },
  { to: '/chat', label: 'Ask AI', icon: Sparkles },
]

function timeAgo(iso?: string) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function StatCard({ icon: Icon, label, value, color, delay = 0 }: { icon: any; label: string; value: string | number; color: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }} className="glass glass-hover p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${color}`}>
        <Icon size={16} />
      </div>
      <div className="text-xl font-display font-semibold text-slate-50">{value}</div>
      <div className="text-[11px] text-slate-400 mt-0.5">{label}</div>
    </motion.div>
  )
}

function ToolCard({ to, label, description, img, soon, delay = 0 }: { to: string; label: string; description: string; img: string; soon?: boolean; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Link to={to} className="glass glass-hover flex items-stretch overflow-hidden min-h-[96px] relative">
        <div className="flex-1 p-4 flex flex-col justify-center">
          <div className="text-sm font-medium text-slate-100 mb-1">{label}</div>
          <p className="text-[11px] text-slate-400 leading-relaxed">{description}</p>
        </div>
        <div className="w-2/5 shrink-0 relative">
          <img src={img} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-navy-900/70 to-transparent" />
        </div>
        {soon && (
          <span className="absolute top-2.5 right-2.5 z-10 text-[9px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 backdrop-blur-sm">
            Coming Soon
          </span>
        )}
        {!soon && <ArrowRight size={13} className="absolute bottom-3 right-3 text-brand-orange" />}
      </Link>
    </motion.div>
  )
}

function RefTile({ to, label, description, icon, soon }: { to: string; label: string; description: string; icon: string; soon?: boolean }) {
  return (
    <Link to={to} className="glass glass-hover p-4 flex flex-col gap-2 relative">
      {soon && <span className="absolute top-2.5 right-2.5 text-[8px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">Soon</span>}
      <img src={icon} alt="" className="w-8 h-8 rounded-md object-cover" />
      <div className="text-[12.5px] font-medium text-slate-100">{label}</div>
      <p className="text-[10px] text-slate-500 leading-relaxed">{description}</p>
    </Link>
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
  const recentBoreholes = [...boreholes].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5)

  // Real, API-sourced activity feed -- no fabricated entries. Merges borehole
  // creations and document uploads by actual timestamp.
  const activity = [
    ...recentBoreholes.map((bh) => ({ key: `bh-${bh.id}`, time: bh.created_at, label: `Borehole ${bh.borehole_id} created`, color: 'bg-green-400' })),
    ...recentDocs.map((d) => ({ key: `doc-${d.id}`, time: d.upload_date, label: `${d.filename} uploaded`, color: 'bg-brand-orange' })),
  ].sort((a, b) => +new Date(b.time) - +new Date(a.time)).slice(0, 6)

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      {/* ---------------- HERO ---------------- */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-2xl mb-6 border border-white/[0.06]">
        <img src="/dashboard/hero.jpg" alt="Engineering Workspace" className="w-full h-auto block" />
        {/* Real, clickable quick actions -- overlaid on the photo on desktop, where the
            scaled image is tall enough for a button row without colliding with the
            baked-in title text. On mobile the same 819x240 image scales to a very short
            height (~100px), which isn't enough room for 5 buttons -- so on mobile they
            move to their own opaque bar below the image instead (see next block). */}
        <div className="hidden md:flex absolute left-0 right-0 bottom-0 p-4 md:p-6 flex-wrap gap-2.5 bg-gradient-to-t from-navy-950/90 via-navy-950/40 to-transparent pt-10">
          {QUICK_ACTIONS.map((a, i) => (
            <motion.div key={a.to} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to={a.to} className="flex flex-col items-center gap-1.5 w-[76px] py-2.5 rounded-xl border border-white/[0.1] bg-white/[0.05] hover:border-brand-orange/50 hover:bg-white/[0.09] transition-all">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${a.label === 'Ask AI' ? 'bg-blue-500/25 text-blue-300' : 'bg-brand-orange/20 text-brand-orange'}`}>
                  <a.icon size={13} />
                </span>
                <span className="text-[9.5px] font-medium text-slate-200 text-center leading-tight">{a.label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Mobile-only quick actions bar -- below the image, not overlaid, so it never
          collides with the hero's title text regardless of how short the scaled image is. */}
      <div className="md:hidden grid grid-cols-5 gap-1.5 mb-6 -mt-3">
        {QUICK_ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="glass flex flex-col items-center gap-1 py-2.5 rounded-xl active:scale-95 transition-transform">
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${a.label === 'Ask AI' ? 'bg-blue-500/25 text-blue-300' : 'bg-brand-orange/20 text-brand-orange'}`}>
              <a.icon size={12} />
            </span>
            <span className="text-[8.5px] font-medium text-slate-300 text-center leading-tight">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* ---------------- PROJECT OVERVIEW + RECENT ACTIVITY ---------------- */}
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-4 mb-6 items-start">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase">Project Overview</h2>
            <Link to="/books" className="text-[11px] text-brand-orange flex items-center gap-1 hover:underline">View library <ArrowUpRight size={11} /></Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <StatCard icon={BookOpen} label="Total Books" value={totalBooks} color="bg-green-500/15 text-green-400" delay={0.02} />
            <StatCard icon={ScrollText} label="IS / IRC Codes" value={totalCodes} color="bg-brand-orange/15 text-brand-orange" delay={0.04} />
            <StatCard icon={Layers} label="Indexed Pages" value={indexedPages} color="bg-yellow-500/15 text-yellow-400" delay={0.06} />
            <StatCard icon={Layers3} label="Borehole Profiles" value={boreholes.length} color="bg-purple-500/15 text-purple-400" delay={0.08} />
            <StatCard icon={Activity} label="AI Assistant" value="Online" color="bg-blue-500/15 text-blue-400" delay={0.1} />
          </div>
        </div>
        <div className="glass p-4 h-full">
          <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-3">Recent Activity</h2>
          {activity.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">No activity yet -- create a borehole or upload a document.</p>
          ) : (
            <div className="space-y-0.5">
              {activity.map((item) => (
                <div key={item.key} className="flex items-center gap-2.5 text-[12.5px] py-2 border-b border-white/[0.03] last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.color}`} />
                  <span className="text-slate-300 flex-1 min-w-0 truncate">{item.label}</span>
                  <span className="text-[9.5px] text-slate-500 shrink-0">{timeAgo(item.time)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------------- INVESTIGATION TOOLS ---------------- */}
      <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-3">Investigation Tools</h2>
      <div className="grid sm:grid-cols-2 gap-3.5 mb-6">
        {INVESTIGATION_TOOLS.map((t, i) => (
          <ToolCard key={t.label} to={t.to} label={t.label} description={t.description} img={t.img} soon={t.soon} delay={i * 0.02} />
        ))}
      </div>

      {/* ---------------- ANALYSIS & DESIGN ---------------- */}
      <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-3">Analysis & Design</h2>
      <div className="grid sm:grid-cols-2 gap-3.5 mb-6">
        {ANALYSIS_TOOLS.map((t, i) => (
          <ToolCard key={t.label} to={t.to} label={t.label} description={t.description} img={t.img} soon={t.soon} delay={i * 0.02} />
        ))}
      </div>

      {/* ---------------- REPORTS & OUTPUT ---------------- */}
      <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-3">Reports & Output</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {REPORT_TILES.map((t) => (
          <RefTile key={t.label} to={t.to} label={t.label} description={t.description} icon={t.icon} soon={t.soon} />
        ))}
      </div>

      {/* ---------------- REFERENCES & TOOLS ---------------- */}
      <h2 className="text-[11px] font-semibold text-slate-400 tracking-wider uppercase mb-3">References & Tools</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {REFERENCE_TILES.map((t) => (
          <RefTile key={t.label} to={t.to} label={t.label} description={t.description} icon={t.icon} soon={t.soon} />
        ))}
      </div>

      {/* ---------------- AI ASSISTANT BANNER ---------------- */}
      <Link to="/chat" className="glass glass-hover flex items-center justify-between gap-4 p-5 relative overflow-hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">AI Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-base font-display font-semibold text-slate-50">Ask Raahigeo</span>
            <span className="gm-badge bg-blue-500/20 text-blue-300">New</span>
          </div>
          <p className="text-sm text-slate-400 mt-1 max-w-md">Get instant answers, explanations, code references and solution guidance for geotechnical problems.</p>
        </div>
        <img src="/dashboard/ai-banner.jpg" alt="" className="h-16 w-auto rounded-lg shrink-0 hidden sm:block" />
      </Link>
    </div>
  )
}
