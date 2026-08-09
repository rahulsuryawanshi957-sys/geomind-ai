import { useState } from 'react'
import {
  Mail, Loader2, User, Lock, Eye, EyeOff,
  ShieldCheck, Target, Handshake, BarChart3,
  ClipboardList, Building2, Mountain, Gauge, Activity, FileText,
} from 'lucide-react'
import { api } from '../api/client'
import Logo from '../components/Logo'
import LoginBackground from '../components/LoginBackground'

const FEATURES = [
  { icon: ShieldCheck, label: 'Code Compliant', sub: 'IS Standards' },
  { icon: Target, label: 'Reliable Analysis', sub: 'Accurate Results' },
  { icon: Handshake, label: 'Engineering', sub: 'Excellence' },
  { icon: BarChart3, label: 'Data Driven', sub: 'Decisions' },
]

const SERVICES = [
  { icon: ClipboardList, label: 'Geotechnical Investigations' },
  { icon: Building2, label: 'Foundation Design' },
  { icon: Mountain, label: 'Slope Stability Analysis' },
  { icon: Gauge, label: 'Settlement Analysis' },
  { icon: Activity, label: 'Seismic & Liquefaction' },
  { icon: FileText, label: 'Reports & Documentation' },
]

// Shared input styling: intentionally brand-locked to RaahiGeo orange rather than the
// app's theme-variable accent (`.gm-input` uses --violet-*, which is teal in light mode /
// amber in dark mode) -- the login page's premium navy+orange identity should look the
// same regardless of the in-app light/dark toggle.
const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-3.5 py-[11px] text-[15px] text-white ' +
  'placeholder:text-slate-500 outline-none transition-colors focus:border-brand-orange/60 focus:bg-white/[0.06] ' +
  'focus:ring-2 focus:ring-brand-orange/20'

export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
    <div className="relative min-h-screen bg-[#050B14] overflow-hidden">
      <LoginBackground />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-6xl mx-auto flex flex-col gap-12 md:gap-16">
          {/* Branding + login card */}
          <div className="flex flex-col xl:flex-row items-center xl:items-start gap-10 xl:gap-20">
            {/* Left: branding */}
            <div className="w-full xl:flex-1 flex flex-col items-center xl:items-start text-center xl:text-left">
              <Logo variant="icon" size={60} className="mb-6" />

              <div className="flex items-center gap-3 mb-2 text-brand-orange text-sm font-semibold tracking-wide">
                <span className="h-px w-8 bg-brand-orange/50" />
                <span>Welcome to</span>
              </div>

              <h1 className="text-[2.75rem] leading-[1.05] sm:text-6xl font-extrabold tracking-tight text-white">
                Raahi<span className="text-brand-orange">Geo</span>
              </h1>

              <p className="mt-3 text-xl sm:text-2xl font-medium text-slate-200">
                Geotechnical Intelligence, <span className="text-brand-orange">Simplified.</span>
              </p>

              <p className="mt-4 max-w-md text-sm sm:text-[15px] leading-relaxed text-slate-400">
                Your all-in-one platform for geotechnical consulting, analysis, and engineering
                solutions — accurate, reliable, and code-compliant.
              </p>

              <div className="mt-9 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-5 sm:gap-6 w-full max-w-md xl:max-w-none">
                {FEATURES.map(({ icon: Icon, label, sub }) => (
                  <div key={label} className="flex flex-col items-center xl:items-start gap-2">
                    <div className="h-10 w-10 rounded-lg border border-brand-orange/30 flex items-center justify-center text-brand-orange">
                      <Icon size={18} />
                    </div>
                    <div className="text-xs text-slate-300 leading-tight text-center xl:text-left">
                      <div className="font-medium text-slate-200">{label}</div>
                      <div className="text-slate-500">{sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: login card */}
            <div className="w-full max-w-sm xl:w-[380px] xl:shrink-0 xl:pt-2">
              <form
                onSubmit={handleSubmit}
                className="rounded-2xl border border-white/10 bg-[#0B1626]/85 backdrop-blur-xl p-6 sm:p-7 shadow-[0_25px_70px_-20px_rgba(0,0,0,0.65)]"
              >
                <h2 className="text-lg font-semibold text-white text-center">Sign In to Your Account</h2>
                <div className="mx-auto mt-2 mb-6 h-0.5 w-10 rounded-full bg-brand-orange" />

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Username</label>
                    <div className="relative">
                      <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        className={inputClass}
                        placeholder="Enter your username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoFocus
                        autoCapitalize="none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 block">Password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className={inputClass + ' pr-10'}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {error && <div className="text-sm text-rose-400">{error}</div>}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-orange to-orange-500 hover:from-orange-600 hover:to-orange-500 text-white font-semibold py-[11px] shadow-[0_10px_30px_-10px_rgba(249,115,22,0.55)] transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? <><Loader2 size={15} className="animate-spin" /> Signing in...</> : 'Sign In'}
                  </button>
                </div>
              </form>

              <a
                href={mailtoHref}
                className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                <Mail size={13} /> Don't have access? Request it from{' '}
                <span className="text-brand-orange">raahigeo@gmail.com</span>
              </a>
            </div>
          </div>

          {/* Service strip */}
          <div className="w-full border-t border-white/[0.06] pt-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-4">
              {SERVICES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center text-center gap-2">
                  <Icon size={20} className="text-slate-400" />
                  <div className="text-xs text-slate-400 leading-tight">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center -mt-4">
            <div className="flex items-center justify-center gap-3 text-brand-orange text-xs font-medium tracking-wide">
              <span className="h-px w-8 bg-brand-orange/40" />
              Empowering Geotechnical Excellence
              <span className="h-px w-8 bg-brand-orange/40" />
            </div>
            <p className="mt-2 text-[11px] text-slate-600">© 2026 RaahiGeo. All rights reserved.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
