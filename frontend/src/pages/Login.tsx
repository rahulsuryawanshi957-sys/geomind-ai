import { useState } from 'react'
import { Mail, Loader2 } from 'lucide-react'
import { api } from '../api/client'
import Logo from '../components/Logo'

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token } = await api.login(username, password)
      localStorage.setItem('raahigeo_auth_token', token)
      onLoggedIn()
    } catch (err: any) {
      setError('Incorrect username or password.')
    } finally {
      setLoading(false)
    }
  }

  const mailtoHref =
    'mailto:raahigeo@gmail.com?subject=' +
    encodeURIComponent('RaahiGeo access request') +
    '&body=' +
    encodeURIComponent('Hi,\n\nI would like access to RaahiGeo. Please share the login details.\n\nThanks.')

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center justify-center mb-8 gap-3">
          <Logo variant="full" size={110} />
        </div>

        <form onSubmit={handleSubmit} className="glass p-6 space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Username</label>
            <input
              className="gm-input w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoCapitalize="none"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Password</label>
            <input
              type="password"
              className="gm-input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="text-sm text-rose-400">{error}</div>}

          <button type="submit" disabled={loading} className="gm-btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={14} className="animate-spin" /> Signing in...</> : 'Sign in'}
          </button>
        </form>

        <a
          href={mailtoHref}
          className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
        >
          <Mail size={13} /> Don't have access? Request it from raahigeo@gmail.com
        </a>
      </div>
    </div>
  )
}
