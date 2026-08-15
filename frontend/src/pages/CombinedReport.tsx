import { useEffect, useState } from 'react'
import { Layers, Loader2, Download, RefreshCw } from 'lucide-react'
import { api } from '../api/client'

// Combined Project Report -- pick any past calculator runs (batch matrix,
// pile capacity, pile group, rock, wall, liquefaction, lateral, ground
// improvement -- whatever shows up) and generate ONE report. Added 14 Aug
// 2026, per Raahi's request to have every calculator "connected" so a
// final report can be produced from whichever combination is relevant to a
// given project. See combined_report_builder.py's module docstring for
// exactly how each calculator type is rendered in the DOCX.

export default function CombinedReport() {
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('Combined Geotechnical Engineering Report')
  const [projectName, setProjectName] = useState('')
  const [siteLocation, setSiteLocation] = useState('')
  const [writeAiSummary, setWriteAiSummary] = useState(true)
  const [generating, setGenerating] = useState(false)

  async function loadHistory() {
    setLoadingHistory(true); setError('')
    try {
      const h = await api.calculationHistory(undefined, 100)
      setHistory(h)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function generate() {
    if (selected.size === 0) { setError('Pick at least one calculation to include.'); return }
    setError(''); setGenerating(true)
    try {
      const blob = await api.generateCombinedReport({
        title, project_name: projectName || undefined, site_location: siteLocation || undefined,
        log_ids: Array.from(selected), write_ai_summary: writeAiSummary,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'raahigeo_combined_report.docx'; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  const grouped: Record<string, any[]> = {}
  for (const h of history) {
    grouped[h.calculator_title] = grouped[h.calculator_title] || []
    grouped[h.calculator_title].push(h)
  }

  return (
    <div className="p-6 md:p-8">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2">
        <Layers size={20} className="text-violet-400" /> Combined Project Report
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        Pick any past calculator runs -- batch matrix, pile capacity, pile group, rock, wall,
        liquefaction, whatever's relevant -- and combine them into one final report.
      </p>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Report title</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Project name (optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Site location (optional)</label>
          <input className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
            value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={writeAiSummary} onChange={(e) => setWriteAiSummary(e.target.checked)} />
          Write an AI overall engineering conclusion tying everything together
        </label>
        <button onClick={loadHistory} className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1">
          <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="text-sm text-red-400 mb-3">{error}</div>}

      {loadingHistory ? (
        <div className="text-sm text-slate-500 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading past calculations...</div>
      ) : history.length === 0 ? (
        <div className="text-sm text-slate-500">
          No calculations logged yet -- run something in Pile Capacity, Pile Group, Batch Analysis,
          Rock Bearing Capacity, Retaining Wall, etc, then come back here to combine results.
        </div>
      ) : (
        <div className="space-y-4 mb-6">
          {Object.entries(grouped).map(([groupTitle, items]) => (
            <div key={groupTitle} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
              <div className="text-sm font-medium text-slate-200 mb-2">{groupTitle}</div>
              <div className="space-y-1.5">
                {items.map((h) => (
                  <label key={h.id} className="flex items-start gap-2 text-xs text-slate-300 cursor-pointer hover:bg-slate-800/40 rounded px-2 py-1.5">
                    <input type="checkbox" className="mt-0.5" checked={selected.has(h.id)} onChange={() => toggle(h.id)} />
                    <span>
                      <span className="text-slate-400">{new Date(h.created_at).toLocaleString()}</span>
                      {h.borehole_id && <span className="text-slate-500"> · {h.borehole_id}</span>}
                      <br />
                      {h.headline}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={generate} disabled={generating || selected.size === 0}
        className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50">
        {generating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Generate Combined Report ({selected.size} selected)
      </button>
    </div>
  )
}
