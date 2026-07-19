import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Upload, FlaskConical, Trash2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { api } from '../../api/client'

export default function LabDataImport() {
  const [boreholes, setBoreholes] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    try { setBoreholes(await api.listBoreholes()) } catch { /* ignore on first load */ }
  }
  useEffect(() => { load() }, [])

  async function handleUpload(file: File) {
    setUploading(true); setError(''); setWarnings([])
    try {
      const res = await api.uploadLabData(file)
      setWarnings(res.warnings || [])
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="font-display text-xl font-semibold text-slate-50 mb-1 flex items-center gap-2">
        <FlaskConical size={20} className="text-violet-400" /> Lab Data Import
      </h1>
      <p className="text-sm text-slate-400 mb-6">
        Download the template, fill in your borehole lab/field data, then upload it here. This becomes the
        shared "Borehole Profile" that calculators can pull soil parameters from — no more re-typing the
        same numbers into every calculator.
      </p>

      <div className="glass p-5 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={() => api.downloadLabDataTemplate()} className="gm-btn-secondary flex items-center justify-center gap-2 flex-1">
            <Download size={15} /> Download Template
          </button>
          <label className="gm-btn-primary flex items-center justify-center gap-2 flex-1 cursor-pointer">
            <Upload size={15} /> {uploading ? 'Uploading...' : 'Upload Filled Sheet'}
            <input type="file" accept=".xlsx,.xlsm" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files[0])} />
          </label>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          One row per soil layer. Repeat Borehole ID, Project Name, and Water Table Depth on every row for
          that borehole — the "Instructions" tab in the template explains this.
        </p>
      </div>

      {error && (
        <div className="glass p-4 mb-5 border-rose-500/30 text-sm text-rose-400 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="glass p-4 mb-5 text-sm">
          <div className="text-amber-400 flex items-center gap-2 mb-2 font-medium"><AlertTriangle size={15} /> Some rows had issues</div>
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {boreholes.map((bh) => (
          <motion.div key={bh.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setExpanded(expanded === bh.id ? null : bh.id)} className="flex items-center gap-2 text-left flex-1">
                {expanded === bh.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                <div>
                  <div className="text-sm font-medium text-slate-100">{bh.borehole_id}</div>
                  <div className="text-xs text-slate-500">
                    {bh.project_name || 'No project name'} · {bh.layers.length} layer(s)
                    {bh.water_table_depth_m != null && ` · Water table ${bh.water_table_depth_m}m`}
                  </div>
                </div>
              </button>
              <button onClick={() => api.deleteBorehole(bh.id).then(load)} className="gm-btn-icon hover:!text-rose-400"><Trash2 size={14} /></button>
            </div>

            {expanded === bh.id && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-white/10">
                      <th className="text-left py-1.5 pr-3">Depth (m)</th>
                      <th className="text-left py-1.5 pr-3">Description</th>
                      <th className="text-left py-1.5 pr-3">Class</th>
                      <th className="text-left py-1.5 pr-3">N</th>
                      <th className="text-left py-1.5 pr-3">γ (t/m³)</th>
                      <th className="text-left py-1.5 pr-3">C (t/m²)</th>
                      <th className="text-left py-1.5 pr-3">φ (°)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bh.layers.map((l: any) => (
                      <tr key={l.id} className="border-b border-white/5">
                        <td className="py-1.5 pr-3 text-slate-300">{l.from_m}–{l.to_m}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{l.description || '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{l.classification || '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{l.n_value ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{l.bulk_density_t_m3 ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{l.cohesion_t_m2 ?? '—'}</td>
                        <td className="py-1.5 pr-3 text-slate-300">{l.friction_angle_deg ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        ))}
        {boreholes.length === 0 && (
          <div className="glass p-8 text-center text-sm text-slate-500">No borehole profiles imported yet.</div>
        )}
      </div>

      <div className="glass p-4 mt-5 text-xs text-slate-500">
        <span className="text-violet-400 font-medium">What's next: </span>
        these saved profiles will feed directly into the Calculators (auto-filling shear/settlement SBC
        inputs) and a batch runner that checks many footing sizes at once — coming in the next update.
      </div>
    </div>
  )
}
