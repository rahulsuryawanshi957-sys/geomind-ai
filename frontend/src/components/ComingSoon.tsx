import { motion } from 'framer-motion'
import { Construction } from 'lucide-react'

/**
 * Honest placeholder for features that are on the roadmap but not built yet
 * (Borehole Logs, Soil Profile Viewer, Lab Reports, Projects, PDF Chat, Bookmarks).
 * These are real, working forms of engineering software in their own right --
 * shipping a fake button that does nothing would be worse than saying so plainly.
 */
export default function ComingSoon({ title, description, plannedFeatures }: { title: string; description: string; plannedFeatures: string[] }) {
  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-4">
          <Construction size={22} className="text-violet-400" />
        </div>
        <h1 className="font-display text-lg text-slate-100 mb-1.5">{title}</h1>
        <p className="text-sm text-slate-400 mb-6">{description}</p>
        <div className="text-left inline-block">
          <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Planned for this section</div>
          <ul className="space-y-1.5">
            {plannedFeatures.map((f) => (
              <li key={f} className="text-sm text-slate-300 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-violet-400" /> {f}
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  )
}
