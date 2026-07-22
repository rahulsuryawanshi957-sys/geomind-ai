import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, FolderKanban, BookOpen, ScrollText, Sigma,
  Calculator, ScanSearch, FileSearch, Layers3, FlaskConical, Mountain,
  FileText, History, Bookmark, Settings, ChevronsLeft, ChevronsRight,
  Sun, Moon, Sparkles, LayoutGrid,
} from 'lucide-react'

const NAV_SECTIONS: { label: string; items: { to: string; label: string; icon: any; end?: boolean; soon?: boolean }[] }[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/chat', label: 'AI Chat', icon: MessageSquare },
      { to: '/projects', label: 'Projects', icon: FolderKanban, soon: true },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/books', label: 'Document Library', icon: BookOpen },
      { to: '/is-codes', label: 'IS Codes', icon: ScrollText },
      { to: '/formulas', label: 'Formula Library', icon: Sigma },
      { to: '/clause-finder', label: 'Clause Finder', icon: FileSearch },
      { to: '/pdf-chat', label: 'PDF Chat', icon: ScanSearch, soon: true },
    ],
  },
  {
    label: 'Engineering',
    items: [
      { to: '/calculators', label: 'Analysis', icon: Calculator },
      { to: '/batch-analysis', label: 'Batch Analysis', icon: LayoutGrid },
      { to: '/borehole-logs', label: 'Borehole Logs', icon: Layers3 },
      { to: '/lab-reports', label: 'Lab Data Import', icon: FlaskConical },
      { to: '/soil-profile', label: 'Soil Profile Viewer', icon: Mountain },
      { to: '/reports', label: 'Engineering Reports', icon: FileText },
    ],
  },
  {
    label: 'You',
    items: [
      { to: '/history', label: 'History', icon: History },
      { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark, soon: true },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`${collapsed ? 'w-[76px]' : 'w-64'} shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/[0.06] bg-navy-900/80 backdrop-blur-xl transition-all duration-300 hidden md:flex`}>
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-white/[0.06]">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-navy-950" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-semibold text-[15px] leading-none text-slate-50 truncate">RaahiGeo AI</div>
            <div className="text-[10px] text-slate-400 tracking-wider mt-1">ENGINEERING WORKSPACE</div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && <div className="text-[10px] uppercase tracking-wider text-slate-500 px-2.5 mb-1.5">{section.label}</div>}
            <div className="space-y-0.5">
              {section.items.map(({ to, label, icon: Icon, end, soon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={collapsed ? label : undefined}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] transition-all relative ${
                      isActive
                        ? 'bg-gradient-to-r from-violet-500/15 to-transparent text-violet-300 font-medium'
                        : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                    }`
                  }
                >
                  <Icon size={16} className="shrink-0" />
                  {!collapsed && <span className="truncate flex-1">{label}</span>}
                  {!collapsed && soon && <span className="gm-badge bg-white/[0.06] text-slate-500">Soon</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-2.5 border-t border-white/[0.06] space-y-1">
        <button onClick={onToggleDark} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] text-slate-400 hover:bg-white/[0.05] hover:text-slate-100">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
        </button>
        <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-[13px] text-slate-400 hover:bg-white/[0.05] hover:text-slate-100">
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}
