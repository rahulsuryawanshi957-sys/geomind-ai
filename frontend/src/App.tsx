import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Login from './pages/Login'
import { api } from './api/client'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Books from './pages/Books'
import SearchPage from './pages/SearchPage'
import Calculators from './pages/Calculators'
import BatchAnalysis from './pages/BatchAnalysis'
import LiquefactionAnalysis from './pages/LiquefactionAnalysis'
import PileCapacity from './pages/PileCapacity'
import LateralCapacity from './pages/LateralCapacity'
import FormulaLibrary from './pages/FormulaLibrary'
import ClauseFinder from './pages/ClauseFinder'
import Reports from './pages/Reports'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import Projects from './pages/planned/Projects'
import BoreholeLogs from './pages/planned/BoreholeLogs'
import LabReports from './pages/planned/LabReports'
import SoilProfile from './pages/planned/SoilProfile'
import Bookmarks from './pages/planned/Bookmarks'
import PdfChat from './pages/planned/PdfChat'

export default function App() {
  const [dark, setDark] = useState(true)
  // 'checking' avoids a Login-screen flash while we verify a token that's
  // already in localStorage; 'in'/'out' are the settled states.
  const [authState, setAuthState] = useState<'checking' | 'in' | 'out'>('checking')

  useEffect(() => { document.documentElement.classList.toggle('light', !dark) }, [dark])

  useEffect(() => {
    const token = localStorage.getItem('raahigeo_auth_token')
    if (!token) { setAuthState('out'); return }
    api.me().then(() => setAuthState('in')).catch(() => setAuthState('out'))
  }, [])

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 size={20} className="animate-spin text-slate-500" />
      </div>
    )
  }

  if (authState === 'out') {
    return <Login onLoggedIn={() => setAuthState('in')} />
  }

  return (
    <HashRouter>
      <div className="flex">
        <Sidebar dark={dark} onToggleDark={() => setDark((d) => !d)} />
        <main className="flex-1 min-w-0 pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/books" element={<Books />} />
            <Route path="/is-codes" element={<Books fixedCategory="IS Codes" />} />
            <Route path="/formulas" element={<FormulaLibrary />} />
            <Route path="/clause-finder" element={<ClauseFinder />} />
            <Route path="/pdf-chat" element={<PdfChat />} />
            <Route path="/calculators" element={<Calculators />} />
            <Route path="/batch-analysis" element={<BatchAnalysis />} />
            <Route path="/liquefaction-analysis" element={<LiquefactionAnalysis />} />
            <Route path="/pile-capacity" element={<PileCapacity />} />
            <Route path="/lateral-capacity" element={<LateralCapacity />} />
            <Route path="/borehole-logs" element={<BoreholeLogs />} />
            <Route path="/lab-reports" element={<LabReports />} />
            <Route path="/soil-profile" element={<SoilProfile />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/bookmarks" element={<Bookmarks />} />
            <Route path="/settings" element={<SettingsPage dark={dark} onToggleDark={() => setDark((d) => !d)} />} />
          </Routes>
        </main>
        <MobileNav />
      </div>
    </HashRouter>
  )
}
