import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Calculator, History, MessageSquare, Menu, X, Sun, Moon } from 'lucide-react'
import Logo from './Logo'
import { NAV_SECTIONS } from './Sidebar'

const ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/books', label: 'Library', icon: BookOpen },
  { to: '/calculators', label: 'Analysis', icon: Calculator },
  { to: '/history', label: 'History', icon: History },
]

// Added 8 Aug 2026 -- Raahi flagged that most pages (Well Foundation, Batch
// Analysis, every calculator not on the 4-item bottom bar below) had NO way
// to be reached on mobile except by scrolling the Dashboard's tool cards --
// the desktop Sidebar is `hidden md:flex`, and this file had no menu button
// at all. This hamburger + full-screen drawer reuses the exact same
// NAV_SECTIONS list the desktop Sidebar renders (imported, not duplicated),
// so adding/renaming a page in one place keeps both in sync.
export default function MobileNav({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      {/* Mobile top header */}
      <header className="force-dark-scope md:hidden fixed top-0 left-0 right-0 z-30 flex items-center gap-2 px-4 py-2.5 bg-navy-900/90 backdrop-blur-xl border-b border-white/[0.06]">
        <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" className="p-1.5 -ml-1.5 rounded-lg text-slate-300 hover:bg-white/[0.06] active:scale-95 transition-all">
          <Menu size={22} />
        </button>
        <Logo variant="icon" size={34} linkToHome />
        <span className="font-display font-semibold text-[14px] text-slate-50">RaahiGeo</span>
      </header>

      {/* Floating AI button */}
      <NavLink
        to="/chat"
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-violet-500
                   flex items-center justify-center shadow-glow active:scale-95 transition-transform"
      >
        <MessageSquare size={22} className="text-white" />
      </NavLink>

      {/* Bottom nav */}
      <nav className="force-dark-scope md:hidden fixed bottom-0 left-0 right-0 z-30 bg-navy-900/90 backdrop-blur-xl border-t border-white/[0.06] flex justify-around py-2">
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] min-w-[56px] ${
                isActive ? 'text-violet-400' : 'text-slate-500'
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Full sidebar drawer -- same NAV_SECTIONS as desktop Sidebar */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="force-dark-scope relative w-[82%] max-w-[300px] h-full bg-navy-950 border-r border-white/[0.06] flex flex-col overflow-y-auto">
            <div className="px-4 py-4 flex items-center justify-between border-b border-white/[0.06] sticky top-0 bg-navy-950 z-10">
              <div className="flex items-center gap-2.5 min-w-0">
                <Logo variant="icon" size={36} />
                <div className="min-w-0">
                  <div className="font-display font-semibold text-[14px] leading-none text-slate-50 truncate">RaahiGeo</div>
                  <div className="text-[9px] text-slate-400 tracking-wider mt-1">GEOTECHNICAL ENGINEERING</div>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="p-1.5 rounded-lg text-slate-400 hover:bg-white/[0.06]">
                <X size={20} />
              </button>
            </div>

            <nav className="flex-1 px-2.5 py-4 space-y-5">
              {NAV_SECTIONS.map((section, si) => (
                <div key={section.label ?? `s${si}`}>
                  {section.label && (
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2.5 mb-1.5">{section.label}</div>
                  )}
                  <div className="space-y-0.5">
                    {section.items.map(({ to, label, icon: Icon, end, soon }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={() => setDrawerOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[13.5px] transition-all ${
                            isActive
                              ? 'bg-gradient-to-r from-violet-500/15 to-transparent text-violet-300 font-medium'
                              : 'text-slate-300 hover:bg-white/[0.05]'
                          }`
                        }
                      >
                        <Icon size={17} className="shrink-0" />
                        <span className="truncate flex-1">{label}</span>
                        {soon && <span className="gm-badge bg-white/[0.06] text-slate-500">Soon</span>}
                      </NavLink>
                    ))}
                  </div>
                  {si === 0 && <div className="mt-4 border-t border-white/[0.06]" />}
                </div>
              ))}
            </nav>

            <div className="p-2.5 border-t border-white/[0.06]">
              <button onClick={onToggleDark} className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[13.5px] text-slate-300 hover:bg-white/[0.05]">
                {dark ? <Sun size={17} /> : <Moon size={17} />}
                {dark ? 'Light mode' : 'Dark mode'}
              </button>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
