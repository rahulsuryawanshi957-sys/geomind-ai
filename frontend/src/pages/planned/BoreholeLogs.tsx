import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Printer, Layers3 } from 'lucide-react'

interface SoilLayer {
  id: string
  fromM: number
  toM: number
  description: string
  soilType: string
  nValue: string
}

const SOIL_TYPES: Record<string, { label: string; color: string; pattern?: string }> = {
  fill: { label: 'Filled up / Made ground', color: '#8B8680' },
  clay: { label: 'Clay (CL/CH/CI)', color: '#B5772E' },
  silt: { label: 'Silt (ML/MH)', color: '#A69B5C' },
  sand: { label: 'Sand (SP/SW/SM/SC)', color: '#D9B95C' },
  gravel: { label: 'Gravel (GP/GW)', color: '#C77B3E' },
  rock: { label: 'Rock / Weathered rock', color: '#6B6E75' },
}

let idCounter = 0
const newId = () => `layer-${Date.now()}-${idCounter++}`

export default function BoreholeLogs() {
  const [projectName, setProjectName] = useState('')
  const [boreholeNo, setBoreholeNo] = useState('BH-01')
  const [location, setLocation] = useState('')
  const [groundLevel, setGroundLevel] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [totalDepth, setTotalDepth] = useState(10)
  const [gwlDepth, setGwlDepth] = useState<string>('')
  const [layers, setLayers] = useState<SoilLayer[]>([
    { id: newId(), fromM: 0, toM: 1.5, description: 'Filled up soil, brownish', soilType: 'fill', nValue: '' },
    { id: newId(), fromM: 1.5, toM: 4, description: 'Brown silty clay, medium stiff', soilType: 'clay', nValue: '8' },
    { id: newId(), fromM: 4, toM: 10, description: 'Yellowish brown sand, medium dense', soilType: 'sand', nValue: '18' },
  ])

  function addLayer() {
    const last = layers[layers.length - 1]
    setLayers([...layers, { id: newId(), fromM: last ? last.toM : 0, toM: (last ? last.toM : 0) + 1, description: '', soilType: 'clay', nValue: '' }])
  }

  function updateLayer(id: string, patch: Partial<SoilLayer>) {
    setLayers(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function removeLayer(id: string) {
    setLayers(layers.filter((l) => l.id !== id))
  }

  const maxDepth = Math.max(totalDepth, ...layers.map((l) => l.toM), 1)

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-50 flex items-center gap-2">
            <Layers3 size={20} className="text-violet-400" /> Borehole Log
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Enter layer data, then print or save as PDF.</p>
        </div>
        <button onClick={() => window.print()} className="gm-btn-primary flex items-center gap-2">
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      {/* Header details */}
      <div className="glass p-5 mb-5 grid grid-cols-2 md:grid-cols-3 gap-3 print:hidden">
        <div><label className="text-xs text-slate-400 mb-1 block">Project Name</label><input className="gm-input w-full" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
        <div><label className="text-xs text-slate-400 mb-1 block">Borehole No.</label><input className="gm-input w-full" value={boreholeNo} onChange={(e) => setBoreholeNo(e.target.value)} /></div>
        <div><label className="text-xs text-slate-400 mb-1 block">Location</label><input className="gm-input w-full" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
        <div><label className="text-xs text-slate-400 mb-1 block">Ground Level (RL, m)</label><input className="gm-input w-full" value={groundLevel} onChange={(e) => setGroundLevel(e.target.value)} /></div>
        <div><label className="text-xs text-slate-400 mb-1 block">Date</label><input type="date" className="gm-input w-full" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="text-xs text-slate-400 mb-1 block">Groundwater depth (m, blank = not encountered)</label><input type="number" step="any" className="gm-input w-full" value={gwlDepth} onChange={(e) => setGwlDepth(e.target.value)} /></div>
        <div><label className="text-xs text-slate-400 mb-1 block">Total depth (m)</label><input type="number" step="any" className="gm-input w-full" value={totalDepth} onChange={(e) => setTotalDepth(parseFloat(e.target.value) || 1)} /></div>
      </div>

      {/* Layer editor */}
      <div className="glass p-5 mb-5 print:hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-200">Soil Layers</h2>
          <button onClick={addLayer} className="gm-btn-secondary flex items-center gap-1.5 text-xs"><Plus size={13} /> Add layer</button>
        </div>
        <div className="space-y-2">
          {layers.map((l) => (
            <div key={l.id} className="grid grid-cols-12 gap-2 items-center">
              <input type="number" step="any" className="gm-input col-span-1" placeholder="From" value={l.fromM} onChange={(e) => updateLayer(l.id, { fromM: parseFloat(e.target.value) || 0 })} />
              <input type="number" step="any" className="gm-input col-span-1" placeholder="To" value={l.toM} onChange={(e) => updateLayer(l.id, { toM: parseFloat(e.target.value) || 0 })} />
              <select className="gm-input col-span-2" value={l.soilType} onChange={(e) => updateLayer(l.id, { soilType: e.target.value })}>
                {Object.entries(SOIL_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input className="gm-input col-span-5" placeholder="Description" value={l.description} onChange={(e) => updateLayer(l.id, { description: e.target.value })} />
              <input className="gm-input col-span-2" placeholder="SPT N" value={l.nValue} onChange={(e) => updateLayer(l.id, { nValue: e.target.value })} />
              <button onClick={() => removeLayer(l.id)} className="gm-btn-icon hover:!text-rose-400 col-span-1"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Printable log */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-6 print:!bg-white print:!text-black print:shadow-none print:border-black" id="borehole-log-print">
        <div className="text-center mb-4">
          <div className="font-display text-lg font-semibold print:text-black">BOREHOLE LOG</div>
          <div className="text-xs text-slate-400 print:text-black">{projectName || 'Project Name'}</div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs mb-5 border-y border-white/10 print:border-black py-2">
          <div><span className="text-slate-500 print:text-black">Borehole No: </span><span className="text-slate-200 print:text-black font-medium">{boreholeNo}</span></div>
          <div><span className="text-slate-500 print:text-black">Location: </span><span className="text-slate-200 print:text-black font-medium">{location || '—'}</span></div>
          <div><span className="text-slate-500 print:text-black">Ground Level: </span><span className="text-slate-200 print:text-black font-medium">{groundLevel || '—'}</span></div>
          <div><span className="text-slate-500 print:text-black">Date: </span><span className="text-slate-200 print:text-black font-medium">{date}</span></div>
        </div>

        <div className="flex gap-0 border border-white/10 print:border-black">
          {/* Depth scale */}
          <div className="w-14 shrink-0 border-r border-white/10 print:border-black relative" style={{ height: `${maxDepth * 40}px` }}>
            {Array.from({ length: Math.ceil(maxDepth) + 1 }, (_, i) => i).map((m) => (
              <div key={m} className="absolute left-0 right-0 flex items-center justify-end pr-1.5" style={{ top: `${m * 40}px` }}>
                <span className="text-[10px] text-slate-400 print:text-black">{m}m</span>
              </div>
            ))}
          </div>

          {/* Strata column */}
          <div className="w-20 shrink-0 border-r border-white/10 print:border-black relative" style={{ height: `${maxDepth * 40}px` }}>
            {layers.map((l) => (
              <div
                key={l.id}
                className="absolute left-0 right-0 border-b border-white/20 print:border-black flex items-center justify-center"
                style={{ top: `${l.fromM * 40}px`, height: `${(l.toM - l.fromM) * 40}px`, backgroundColor: SOIL_TYPES[l.soilType]?.color }}
              />
            ))}
            {gwlDepth && (
              <div className="absolute left-0 right-0 border-t-2 border-dashed border-cyan-400 print:border-blue-600 z-10 flex items-center" style={{ top: `${parseFloat(gwlDepth) * 40}px` }}>
                <span className="text-[9px] bg-cyan-500 text-navy-950 px-1 rounded print:bg-blue-600 print:text-white">GWL ▽</span>
              </div>
            )}
          </div>

          {/* SPT N column */}
          <div className="w-16 shrink-0 border-r border-white/10 print:border-black relative" style={{ height: `${maxDepth * 40}px` }}>
            {layers.filter((l) => l.nValue).map((l) => (
              <div key={l.id} className="absolute left-0 right-0 flex items-center justify-center" style={{ top: `${((l.fromM + l.toM) / 2) * 40 - 8}px` }}>
                <span className="text-[10px] font-mono text-violet-300 print:text-black">N={l.nValue}</span>
              </div>
            ))}
          </div>

          {/* Description column */}
          <div className="flex-1 relative" style={{ height: `${maxDepth * 40}px` }}>
            {layers.map((l) => (
              <div
                key={l.id}
                className="absolute left-0 right-0 border-b border-white/10 print:border-black px-3 flex items-center overflow-hidden"
                style={{ top: `${l.fromM * 40}px`, height: `${(l.toM - l.fromM) * 40}px` }}
              >
                <span className="text-xs text-slate-300 print:text-black leading-tight">{l.description || SOIL_TYPES[l.soilType]?.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 text-[10px]">
          {Object.entries(SOIL_TYPES).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: v.color }} />
              <span className="text-slate-400 print:text-black">{v.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
