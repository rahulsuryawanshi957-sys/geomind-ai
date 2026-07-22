import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import Dashboard from './pages/Dashboard'
import Chat from './pages/Chat'
import Books from './pages/Books'
import SearchPage from './pages/SearchPage'
import Calculators from './pages/Calculators'
import BatchAnalysis from './pages/BatchAnalysis'
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

  useEffect(() => { document.documentElement.classList.toggle('light', !dark) }, [dark])

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
