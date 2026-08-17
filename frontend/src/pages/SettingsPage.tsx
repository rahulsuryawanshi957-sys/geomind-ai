import { useEffect, useState } from 'react'
import { Settings as SettingsIcon, Download, Upload, WifiOff, Lock, LogOut, Loader2, ShieldAlert, Trash2, AlertTriangle } from 'lucide-react'
import { api } from '../api/client'

const UNIT_SYSTEMS = ['SI (kN, kPa, m)', 'Imperial (lb, psf, ft)']

// "Data Management" (Aug 2026) -- every category of data this app can
// permanently delete, server-side, from one place. `count` fetches how many
// items exist (for the checkbox label); `wipe` does the actual deleting.
// `wipe` reports progress via the `onProgress` callback since documents/
// boreholes/conversations have no bulk-delete-all endpoint -- each one is
// deleted individually in a loop, which can take a few seconds for a large
// library. Calculation history DOES have a real bulk-delete-all endpoint
// (`deleteAllCalculations`), so that one is a single fast call.
type DataCategory = {
  key: string
  label: string
  description: string
  count: () => Promise<number>
  wipe: (onProgress: (done: number, total: number) => void) => Promise<{ deleted: number; failed: number }>
}

const DATA_CATEGORIES: DataCategory[] = [
  {
    key: 'boreholes', label: 'Borehole profiles / lab data',
    description: 'Every borehole, soil layer, and imported lab-data profile — used by all calculators and Batch Analysis.',
    count: async () => (await api.listBoreholes()).length,
    wipe: async (onProgress) => {
      const items = await api.listBoreholes()
      let deleted = 0, failed = 0
      for (const [i, item] of items.entries()) {
        try { await api.deleteBorehole(item.id); deleted++ } catch { failed++ }
        onProgress(i + 1, items.length)
      }
      return { deleted, failed }
    },
  },
  {
    key: 'documents', label: 'Uploaded documents (Document Library)',
    description: 'Every file uploaded to the Document Library, and its indexed content used by Chat.',
    count: async () => (await api.listDocuments()).length,
    wipe: async (onProgress) => {
      const items = await api.listDocuments()
      let deleted = 0, failed = 0
      for (const [i, item] of items.entries()) {
        try { await api.deleteDocument(item.id); deleted++ } catch { failed++ }
        onProgress(i + 1, items.length)
      }
      return { deleted, failed }
    },
  },
  {
    key: 'conversations', label: 'Chat conversation history',
    description: 'Every saved Chat conversation and its messages.',
    count: async () => (await api.listConversations()).length,
    wipe: async (onProgress) => {
      const items = await api.listConversations()
      let deleted = 0, failed = 0
      for (const [i, item] of items.entries()) {
        try { await api.deleteConversation(item.id); deleted++ } catch { failed++ }
        onProgress(i + 1, items.length)
      }
      return { deleted, failed }
    },
  },
  {
    key: 'calculations', label: 'Calculation history',
    description: 'Every logged run of any calculator (individual and Batch) shown in Calculation History.',
    count: async () => (await api.calculationHistory()).length,
    wipe: async (onProgress) => {
      const items = await api.calculationHistory()
      const total = items.length
      await api.deleteAllCalculations()  // real bulk-delete-all endpoint -- one call
      onProgress(total, total)
      return { deleted: total, failed: 0 }
    },
  },
]

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

  const [clearingCache, setClearingCache] = useState(false)

  // "Clear local cache" (Aug 2026) -- this app has no service-worker/API
  // response cache; the only browser-side data is a handful of localStorage
  // keys (theme, saved-calculation list, login session). This nukes ALL of
  // them and reloads -- deliberately blunt/simple rather than a per-item
  // picker, since there are only 3 things and one confirm dialog listing
  // them plainly is clearer than a settings sub-menu. Nothing server-side
  // (boreholes, documents, chat history, saved configurations) is touched.
  function handleClearCache() {
    const ok = window.confirm(
      'Clear all locally saved app data on THIS DEVICE?\n\n' +
      'This removes:\n' +
      '• Your saved-calculation list (export it first below if you want to keep it!)\n' +
      '• Your theme preference\n' +
      '• Your login session -- you will be logged out\n\n' +
      "Nothing on the server is touched -- boreholes, documents, chat history, " +
      "and saved configurations are all safe and unaffected."
    )
    if (!ok) return
    setClearingCache(true)
    localStorage.clear()
    window.location.reload()
  }

  // "Data Management" -- select which SERVER-side categories to permanently
  // delete (boreholes, documents, chat history, calculation history).
  // Separate from "Clear local cache" above, which only ever touches this
  // browser, never the server.
  const [dataCounts, setDataCounts] = useState<Record<string, number | null>>({})
  const [selectedDataCategories, setSelectedDataCategories] = useState<Set<string>>(new Set())
  const [deletingData, setDeletingData] = useState(false)
  const [deleteProgressLabel, setDeleteProgressLabel] = useState('')
  const [deleteDataError, setDeleteDataError] = useState('')
  const [deleteDataResult, setDeleteDataResult] = useState('')

  useEffect(() => {
    DATA_CATEGORIES.forEach((cat) => {
      cat.count().then((n) => setDataCounts((c) => ({ ...c, [cat.key]: n }))).catch(() => setDataCounts((c) => ({ ...c, [cat.key]: null })))
    })
  }, [])

  function toggleDataCategory(key: string) {
    setSelectedDataCategories((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function handleDeleteSelectedData() {
    const selected = DATA_CATEGORIES.filter((c) => selectedDataCategories.has(c.key))
    if (selected.length === 0) return
    const summary = selected.map((c) => `• ${c.label} (${dataCounts[c.key] ?? '?'} item${dataCounts[c.key] === 1 ? '' : 's'})`).join('\n')
    const ok = window.confirm(
      `PERMANENTLY delete the following from the server?\n\n${summary}\n\n` +
      'This cannot be undone. Anything NOT checked above is left completely untouched.'
    )
    if (!ok) return
    setDeletingData(true)
    setDeleteDataError('')
    setDeleteDataResult('')
    let totalDeleted = 0
    let anyFailed = false
    try {
      for (const cat of selected) {
        setDeleteProgressLabel(`Deleting ${cat.label}...`)
        const { deleted, failed } = await cat.wipe((done, total) => setDeleteProgressLabel(`Deleting ${cat.label}... (${done}/${total})`))
        totalDeleted += deleted
        if (failed > 0) anyFailed = true
        setDataCounts((c) => ({ ...c, [cat.key]: 0 }))
      }
      setDeleteDataResult(
        anyFailed
          ? `Done, but some items couldn't be deleted (network or server error) — ${totalDeleted} removed. Re-run for the rest.`
          : `Done — ${totalDeleted} item(s) permanently deleted.`
      )
      setSelectedDataCategories(new Set())
    } catch (err: any) {
      setDeleteDataError('Something went wrong partway through — some items may already be deleted. Refresh to see current counts.')
    } finally {
      setDeletingData(false)
      setDeleteProgressLabel('')
    }
  }

  const [cleaningUp, setCleaningUp] = useState(false)
  const [cleanupResult, setCleanupResult] = useState<string | null>(null)
  const [cleanupError, setCleanupError] = useState('')

  async function handleCleanupOrphans() {
    setCleaningUp(true)
    setCleanupResult(null)
    setCleanupError('')
    try {
      const res = await api.cleanupOrphanedChunks()
      setCleanupResult(
        res.orphaned_documents_purged > 0
          ? `Done — removed leftover data for ${res.orphaned_documents_purged} deleted document(s). Fake references should stop appearing now.`
          : 'Done — nothing to clean up, no leftover data found.'
      )
    } catch (err: any) {
      setCleanupError('Could not run cleanup. Try again in a moment.')
    } finally {
      setCleaningUp(false)
    }
  }

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

        <div className="pt-3 border-t border-white/[0.06] flex flex-wrap gap-2">
          <button onClick={exportLocalData} className="gm-btn-secondary flex items-center gap-2 text-xs"><Download size={13} /> Export saved calculations</button>
          <button disabled className="gm-btn-secondary flex items-center gap-2 text-xs opacity-50 cursor-not-allowed" title="Coming soon"><Upload size={13} /> Import backup</button>
          <button disabled className="gm-btn-secondary flex items-center gap-2 text-xs opacity-50 cursor-not-allowed" title="Coming soon"><WifiOff size={13} /> Offline mode</button>
        </div>

        <div className="pt-3 border-t border-white/[0.06]">
          <button onClick={handleCleanupOrphans} disabled={cleaningUp} className="gm-btn-secondary flex items-center gap-2 text-xs">
            {cleaningUp ? <><Loader2 size={13} className="animate-spin" /> Cleaning up...</> : <><Trash2 size={13} /> Clean up deleted-document references</>}
          </button>
          <div className="text-[11px] text-slate-500 mt-1">
            Run this if Chat ever cites a source file that isn't in your Document Library — it removes leftover
            search data for documents that no longer exist.
          </div>
          {cleanupResult && <div className="text-xs text-emerald-400 mt-1">{cleanupResult}</div>}
          {cleanupError && <div className="text-xs text-rose-400 mt-1">{cleanupError}</div>}
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

      <div className="glass p-5 mt-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-slate-200 font-medium"><AlertTriangle size={15} className="text-rose-400" /> Data Management</div>
        <div className="text-xs text-slate-500">
          Permanently delete data from the server. Check only what you want gone — anything left unchecked is
          completely untouched. This is different from "Clear local cache" below, which only ever affects this browser.
        </div>

        <div className="space-y-2">
          {DATA_CATEGORIES.map((cat) => (
            <label key={cat.key} className="flex items-start gap-2.5 p-2 rounded hover:bg-white/[0.03] cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={selectedDataCategories.has(cat.key)}
                onChange={() => toggleDataCategory(cat.key)}
                disabled={deletingData}
              />
              <div>
                <div className="text-sm text-slate-200">
                  {cat.label}
                  <span className="text-slate-500 font-normal ml-1.5">
                    ({dataCounts[cat.key] === undefined ? '…' : dataCounts[cat.key] === null ? '?' : `${dataCounts[cat.key]} item${dataCounts[cat.key] === 1 ? '' : 's'}`})
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">{cat.description}</div>
              </div>
            </label>
          ))}
        </div>

        <button
          onClick={handleDeleteSelectedData}
          disabled={deletingData || selectedDataCategories.size === 0}
          className="gm-btn-secondary flex items-center gap-2 text-xs text-rose-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {deletingData
            ? <><Loader2 size={13} className="animate-spin" /> {deleteProgressLabel || 'Deleting...'}</>
            : <><Trash2 size={13} /> Delete selected ({selectedDataCategories.size})</>}
        </button>
        {deleteDataResult && <div className="text-xs text-emerald-400">{deleteDataResult}</div>}
        {deleteDataError && <div className="text-xs text-rose-400">{deleteDataError}</div>}
      </div>

      <div className="glass p-5 mt-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-slate-200 font-medium"><Trash2 size={15} className="text-rose-400" /> Clear local cache</div>
        <div className="text-xs text-slate-500">
          Removes everything this app has saved in this browser (theme preference, saved-calculation list,
          login session) and reloads. Doesn't touch anything on the server — boreholes, documents, chat
          history, and saved configurations are all safe. Useful if the app is acting stuck or showing old data.
        </div>
        <button onClick={handleClearCache} disabled={clearingCache} className="gm-btn-secondary flex items-center gap-2 text-xs text-rose-400">
          {clearingCache ? <><Loader2 size={13} className="animate-spin" /> Clearing...</> : <><Trash2 size={13} /> Clear local cache</>}
        </button>
      </div>
    </div>
  )
}
