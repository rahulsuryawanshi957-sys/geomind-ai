import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, Download } from 'lucide-react'
import { api } from '../api/client'

export default function Reports() {
  const [types, setTypes] = useState<string[]>([])
  const [sectionType, setSectionType] = useState('')
  const [projectInputs, setProjectInputs] = useState('{\n  "project_name": "",\n  "site_location": "",\n  "soil_type": ""\n}')
  const [sections, setSections] = useState<{ title: string; content: string }[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => { api.reportSectionTypes().then((t) => { setTypes(t); setSectionType(t[0]) }) }, [])

  async function generate() {
    setLoading(true)
    try {
      let inputs = {}
      try { inputs = JSON.parse(projectInputs) } catch {}
      const res = await api.generateReportSection(sectionType, inputs)
      setSections((s) => [...s, { title: sectionType, content: res.content }])
    } finally { setLoading(false) }
  }

  async function exportDocx() {
    const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/reports/export/docx`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Geotechnical Report', sections }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'geomind_report.docx'; a.click()
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2"><FileText size={20} className="text-violet-400" /> Report Generator</h1>
      <p className="text-sm text-slate-400 mb-6">Build a report section by section, grounded in your documents, then export to Word.</p>

      <div className="glass p-5 space-y-3 mb-6">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Section type</label>
          <select className="gm-input w-full" value={sectionType} onChange={(e) => setSectionType(e.target.value)}>
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Project inputs (JSON)</label>
          <textarea className="gm-input w-full font-mono text-xs h-28" value={projectInputs} onChange={(e) => setProjectInputs(e.target.value)} />
        </div>
        <button onClick={generate} className="gm-btn-primary" disabled={loading}>{loading ? 'Generating...' : 'Add section'}</button>
      </div>

      {sections.map((s, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 mb-3">
          <div className="text-sm font-medium text-violet-300 mb-2">{s.title}</div>
          <div className="gm-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{s.content}</ReactMarkdown></div>
        </motion.div>
      ))}

      {sections.length > 0 && (
        <button onClick={exportDocx} className="gm-btn-secondary flex items-center gap-2"><Download size={15} /> Export to Word</button>
      )}
    </div>
  )
}
