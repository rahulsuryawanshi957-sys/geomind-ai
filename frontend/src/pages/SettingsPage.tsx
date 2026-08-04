import { useState } from 'react'
import { Settings as SettingsIcon, Download, Upload, WifiOff, Lock, LogOut, Loader2, ShieldAlert } from 'lucide-react'
import { api } from '../api/client'

const UNIT_SYSTEMS = ['SI (kN, kPa, m)', 'Imperial (lb, psf, ft)']

export default function SettingsPage({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  const [units, setUnits] = useState(UNIT_SYSTEMS[0])
  const [engineeringModeDefault, setEngineeringModeDefault] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [ownerPin, setOwnerPin] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [credSaving, setCredSaving] = useState(false)
  const [credError, setCredError] = useState('')
  const [credSuccess, setCredSuccess] = useState(false)

  function exportLocalData() {
    const saved = localStorage.getItem('raahigeo_saved_calculations') || '[]'
    const blob = new Blob([saved], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'raahigeo-saved-calculations.json'; a.click()
  }

  async function handleChangeCredentials(e: React.FormEvent) {
    e.preventDefault()
    setCredError(''); setCredSuccess(false)
    if (!currentPassword || !ownerPin || !newUsername || !newPassword) {
      setCredError('Fill in all fields.'); return
    }
    if (newPassword.length < 6) {
      setCredError('New password must be at least 6 characters.'); return
    }
    setCredSaving(true)
    try {
      const { token } = await api.changeCredentials({
        current_password: currentPassword, owner_pin: ownerPin,
        new_username: newUsername, new_password: newPassword,
      })
      localStorage.setItem('raahigeo_auth_token', token)
      setCredSuccess(true)
      setCurrentPassword(''); setOwnerPin(''); setNewUsername(''); setNewPassword('')
    } catch (err: any) {
      setCredError(err.message?.includes('Owner PIN') ? 'Owner PIN is incorrect.' : err.message?.includes('400') ? 'Current password is incorrect.' : 'Could not change credentials.')
    } finally {
      setCredSaving(false)
    }
  }

  const [loggingOutAll, setLoggingOutAll] = useState(false)
  const [loggedOutAllMsg, setLoggedOutAllMsg] = useState(false)

  async function handleLogout() {
    try { await api.logout() } catch {}
    localStorage.removeItem('raahigeo_auth_token')
    window.location.reload()
  }

  async function handleLogoutAllDevices() {
    setLoggingOutAll(true)
    setLoggedOutAllMsg(false)
    try {
      const { token } = await api.logoutAllDevices()
      localStorage.setItem('raahigeo_auth_token', token)
      setLoggedOutAllMsg(true)
    } catch {
      // ignore -- if this fails the user is still logged in as before
    } finally {
      setLoggingOutAll(false)
    }
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

      <div className="glass p-5 mt-4 space-y-4">
        <div className="flex items-center gap-2 text-sm text-slate-200 font-medium"><Lock size={15} className="text-violet-400" /> Account & Login</div>

        <form onSubmit={handleChangeCredentials} className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Current password</label>
            <input type="password" className="gm-input w-full" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Owner PIN</label>
            <input type="password" className="gm-input w-full" value={ownerPin} onChange={(e) => setOwnerPin(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">New username</label>
            <input className="gm-input w-full" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoCapitalize="none" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">New password</label>
            <input type="password" className="gm-input w-full" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>

          {credError && <div className="text-xs text-rose-400">{credError}</div>}
          {credSuccess && <div className="text-xs text-emerald-400">Login credentials updated. Other open sessions were logged out.</div>}

          <button type="submit" disabled={credSaving} className="gm-btn-primary text-xs flex items-center gap-2">
            {credSaving ? <><Loader2 size={13} className="animate-spin" /> Saving...</> : 'Update login credentials'}
          </button>
        </form>

        <div className="pt-3 border-t border-white/[0.06] space-y-2">
          <button onClick={handleLogout} className="gm-btn-secondary flex items-center gap-2 text-xs text-rose-400"><LogOut size={13} /> Log out</button>
          <div>
            <button onClick={handleLogoutAllDevices} disabled={loggingOutAll} className="gm-btn-secondary flex items-center gap-2 text-xs text-rose-400">
              {loggingOutAll ? <><Loader2 size={13} className="animate-spin" /> Logging out everywhere...</> : <><ShieldAlert size={13} /> Log out from all devices</>}
            </button>
            <div className="text-[11px] text-slate-500 mt-1">Kicks out every other logged-in session everywhere. You stay logged in here.</div>
            {loggedOutAllMsg && <div className="text-xs text-emerald-400 mt-1">Done -- every other session has been logged out.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
