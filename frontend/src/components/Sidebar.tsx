import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard, MessageSquare, FolderKanban, BookOpen, ScrollText, Sigma,
  Calculator, ScanSearch, FileSearch, Layers3, FlaskConical, Mountain, Gem,
  FileText, History, Bookmark, Settings, ChevronsLeft, ChevronsRight,
  Sun, Moon, LayoutGrid, Waves, Milestone, ArrowLeftRight, Boxes, Network,
  Grid3x3, Wind,
} from 'lucide-react'
import Logo from './Logo'

export type NavItem = { to: string; label: string; icon: any; end?: boolean; soon?: boolean }

// Grouped to match the platform's engineering workflow -- Investigation feeds
// Foundation Design, which feeds Reporting -- rather than an AI-first layout.
export const NAV_SECTIONS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/projects', label: 'Projects', icon: FolderKanban, soon: true },
    ],
  },
  {
    label: 'Investigation',
    items: [
      { to: '/borehole-logs', label: 'Borehole Logs', icon: Layers3 },
      { to: '/lab-reports', label: 'Lab Data', icon: FlaskConical },
      { to: '/soil-profile', label: 'Soil Profiles', icon: Mountain },
    ],
  },
  {
    label: 'Foundation Design',
    items: [
      { to: '/calculators', label: 'Bearing Capacity & Settlement', icon: Calculator },
      { to: '/rock-bearing-capacity', label: 'Rock Bearing Capacity', icon: Gem },
      { to: '/rock-socket-pile', label: 'Rock Socket Pile', icon: Gem },
      { to: '/well-foundation', label: 'Well Foundation', icon: Waves },
      { to: '/pile-capacity', label: 'Pile Capacity', icon: Milestone },
      { to: '/pile-group', label: 'Pile Group', icon: Network, soon: true },
      { to: '/raft-foundation', label: 'Raft Foundation', icon: Grid3x3, soon: true },
      { to: '/retaining-wall', label: 'Retaining Wall', icon: Boxes },
      { to: '/lateral-capacity', label: 'Lateral Capacity', icon: ArrowLeftRight },
      { to: '/liquefaction-analysis', label: 'Liquefaction', icon: Waves },
      { to: '/ground-improvement', label: 'Ground Improvement', icon: Wind },
      { to: '/batch-analysis', label: 'Batch Analysis', icon: LayoutGrid },
    ],
  },
  {
    label: 'Knowledge',
    items: [
      { to: '/is-codes', label: 'IS Codes', icon: ScrollText },
      { to: '/irc-codes', label: 'IRC Codes', icon: ScrollText },
      { to: '/formulas', label: 'Formula Library', icon: Sigma },
      { to: '/clause-finder', label: 'Clause Finder', icon: FileSearch },
      { to: '/books', label: 'Document Library', icon: BookOpen },
    ],
  },
  {
    label: 'AI',
    items: [
      { to: '/chat', label: 'AI Assistant', icon: MessageSquare },
      { to: '/pdf-chat', label: 'PDF Chat', icon: ScanSearch, soon: true },
    ],
  },
  {
    label: null,
    items: [
      { to: '/reports', label: 'Engineering Reports', icon: FileText },
      { to: '/history', label: 'History', icon: History },
      { to: '/bookmarks', label: 'Bookmarks', icon: Bookmark, soon: true },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export default function Sidebar({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside className={`force-dark-scope ${collapsed ? 'w-[76px]' : 'w-64'} shrink-0 h-screen sticky top-0 flex flex-col border-r border-white/[0.06] bg-navy-950/95 backdrop-blur-xl transition-all duration-300 hidden md:flex`}>
      <div className="px-4 py-5 flex items-center gap-2.5 border-b border-white/[0.06]">
        <Logo variant="icon" size={collapsed ? 40 : 48} linkToHome />
        {!collapsed && (
          <Link to="/" className="min-w-0">
            <div className="font-display font-semibold text-[15px] leading-none text-slate-50 truncate">RaahiGeo</div>
            <div className="text-[10px] text-slate-400 tracking-wider mt-1">GEOTECHNICAL ENGINEERING PLATFORM</div>
          </Link>
        )}
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => (
          <div key={section.label ?? `s${si}`}>
            {!collapsed && section.label && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2.5 mb-1.5">{section.label}</div>
            )}
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
            {!collapsed && si === 0 && (
              <div className="mt-4 border-t border-white/[0.06]" />
            )}
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
