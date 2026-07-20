import { NavLink } from 'react-router-dom'
import { LayoutDashboard, BookOpen, Calculator, History, MessageSquare } from 'lucide-react'

const ITEMS = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/books', label: 'Library', icon: BookOpen },
  { to: '/calculators', label: 'Analysis', icon: Calculator },
  { to: '/history', label: 'History', icon: History },
]

export default function MobileNav() {
  return (
    <>
      {/* Floating AI button */}
      <NavLink
        to="/chat"
        className="md:hidden fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400
                   flex items-center justify-center shadow-glow active:scale-95 transition-transform"
      >
        <MessageSquare size={22} className="text-navy-950" />
      </NavLink>

      {/* Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-navy-900/90 backdrop-blur-xl border-t border-white/[0.06] flex justify-around py-2">
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
    </>
  )
}
