import { useState } from 'react'
import { Settings as SettingsIcon, Download, Upload, WifiOff } from 'lucide-react'

const UNIT_SYSTEMS = ['SI (kN, kPa, m)', 'Imperial (lb, psf, ft)']

export default function SettingsPage({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [units, setUnits] = useState(UNIT_SYSTEMS[0])
  const [engineeringModeDefault, setEngineeringModeDefault] = useState(true)

  function exportLocalData() {
    const saved = localStorage.getItem('geomind_saved_calculations') || '[]'
    const blob = new Blob([saved], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'geomind-saved-calculations.json'; a.click()
  }

  return (
    <div className="p-6 md:p-8 max-w-xl">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2"><SettingsIcon size={20} className="text-violet-400" /> Settings</h1>
      <p className="text-sm text-slate-400 mb-6">Some settings apply instantly in this browser; server-side settings (models, keys) live in the backend's <code className="font-mono text-violet-300">.env</code> file.</p>

      <div className="glass p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-200">Theme</div>
            <div className="text-xs text-slate-500">Dark by default, matches the whole app</div>
          </div>
          <button onClick={onToggleDark} className="gm-btn-secondary text-xs">{dark ? 'Dark' : 'Light'} — switch</button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-200">Engineering Mode default</div>
            <div className="text-xs text-slate-500">New chats start with this on/off</div>
          </div>
          <button onClick={() => setEngineeringModeDefault((v) => !v)} className={`gm-btn-secondary text-xs ${engineeringModeDefault ? '!text-violet-300' : ''}`}>{engineeringModeDefault ? 'ON' : 'OFF'}</button>
        </div>

        <div>
          <div className="text-sm text-slate-200 mb-1.5">Units</div>
          <select className="gm-input w-full" value={units} onChange={(e) => setUnits(e.target.value)}>
            {UNIT_SYSTEMS.map((u) => <option key={u}>{u}</option>)}
          </select>
          <div className="text-xs text-slate-500 mt-1">Calculators currently compute in SI regardless of this setting — imperial conversion is on the roadmap.</div>
        </div>

        <div>
          <div className="text-sm text-slate-200 mb-1">AI Model</div>
          <div className="font-mono text-xs text-slate-400">Configured server-side (CHAT_MODEL in backend/.env), currently gpt-4o.</div>
        </div>

        <div>
          <div className="text-sm text-slate-200 mb-1">API Keys</div>
          <div className="text-xs text-slate-500">Your OpenAI key stays in the backend's <code className="font-mono text-violet-300">.env</code> file — never entered here, never sent to the browser.</div>
        </div>

        <div className="pt-3 border-t border-white/[0.06] flex flex-wrap gap-2">
          <button onClick={exportLocalData} className="gm-btn-secondary flex items-center gap-2 text-xs"><Download size={13} /> Export saved calculations</button>
          <button disabled className="gm-btn-secondary flex items-center gap-2 text-xs opacity-50 cursor-not-allowed" title="Coming soon"><Upload size={13} /> Import backup</button>
          <button disabled className="gm-btn-secondary flex items-center gap-2 text-xs opacity-50 cursor-not-allowed" title="Coming soon"><WifiOff size={13} /> Offline mode</button>
        </div>
      </div>
    </div>
  )
}
