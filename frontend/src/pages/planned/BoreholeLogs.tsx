import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Trash2, Printer, Layers3, ChevronDown, ChevronUp } from 'lucide-react'

type SampleType = 'D' | 'P' | 'U' | 'C' | 'V' | 'W'

interface Sample {
  id: string
  fromM: number
  toM: number
  type: SampleType
  refNo: string
  spt0: string   // blows 0-150mm
  spt1: string   // blows 150-300mm
  spt2: string   // blows 300-450mm
  coreRecovery: string  // %
  rqd: string           // %
  remarks: string
}

interface StrataLayer {
  id: string
  fromM: number
  toM: number
  description: string
  classification: string
  symbolType: string
  samples: Sample[]
}

const SYMBOL_TYPES: Record<string, { label: string; pattern: string; color: string }> = {
  // --- Fill / Topsoil ---
  filled_up: {
    label: 'Filled up / Made ground', color: '#E8E4DA',
    pattern: 'radial-gradient(circle at 20% 30%, transparent 3px, #8B8680 3px, #8B8680 4px, transparent 4px), radial-gradient(circle at 60% 70%, transparent 3px, #8B8680 3px, #8B8680 4px, transparent 4px)',
  },
  // --- Coarse-grained: Gravels (circles) ---
  gw: { label: 'GW — Well-graded gravel', color: '#F0E2C4', pattern: 'radial-gradient(circle, transparent 3px, #7A4E1E 3px, #7A4E1E 3.6px, transparent 3.6px)' },
  gp: { label: 'GP — Poorly-graded gravel', color: '#F0E2C4', pattern: 'radial-gradient(circle, transparent 2.2px, #7A4E1E 2.2px, #7A4E1E 2.8px, transparent 2.8px)' },
  gm: { label: 'GM — Silty gravel', color: '#EDE3CC', pattern: 'radial-gradient(circle, transparent 2.5px, #7A4E1E 2.5px, #7A4E1E 3.1px, transparent 3.1px), repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1px, transparent 1px, transparent 10px)' },
  gc: { label: 'GC — Clayey gravel', color: '#EAE0CB', pattern: 'radial-gradient(circle, transparent 2.5px, #7A4E1E 2.5px, #7A4E1E 3.1px, transparent 3.1px), repeating-linear-gradient(0deg, #333 0, #333 1.5px, transparent 1.5px, transparent 6px)' },
  // --- Coarse-grained: Sands (dots) ---
  sw: { label: 'SW — Well-graded sand', color: '#F3EBCB', pattern: 'radial-gradient(circle, #8A6D1E 1.5px, transparent 1.8px)' },
  sp: { label: 'SP — Poorly-graded sand', color: '#F3EBCB', pattern: 'radial-gradient(circle, #8A6D1E 1px, transparent 1.3px)' },
  sm: { label: 'SM — Silty sand', color: '#F0E7CC', pattern: 'radial-gradient(circle, #8A6D1E 1.2px, transparent 1.5px), repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1px, transparent 1px, transparent 10px)' },
  sc: { label: 'SC — Clayey sand', color: '#EDE4CC', pattern: 'radial-gradient(circle, #8A6D1E 1.2px, transparent 1.5px), repeating-linear-gradient(0deg, #333 0, #333 1.5px, transparent 1.5px, transparent 6px)' },
  // --- Fine-grained: Silts (dashes, thin/sparse -> thick/dense with plasticity L/I/H) ---
  ml: { label: 'ML — Silt, low plasticity', color: '#EFEAE0', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1px, transparent 1px, transparent 11px)' },
  mi: { label: 'MI — Silt, intermediate plasticity', color: '#EFEAE0', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1.2px, transparent 1.2px, transparent 8px)' },
  mh: { label: 'MH — Silt, high plasticity', color: '#EFEAE0', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1.5px, transparent 1.5px, transparent 5px)' },
  // --- Fine-grained: Clays (dashes, denser than silt at each level) ---
  cl: { label: 'CL — Clay, low plasticity', color: '#EDE7D8', pattern: 'repeating-linear-gradient(0deg, #333 0, #333 1.5px, transparent 1.5px, transparent 9px)' },
  ci: { label: 'CI — Clay, intermediate plasticity', color: '#EDE7D8', pattern: 'repeating-linear-gradient(0deg, #333 0, #333 1.8px, transparent 1.8px, transparent 6.5px)' },
  ch: { label: 'CH — Clay, high plasticity', color: '#EDE7D8', pattern: 'repeating-linear-gradient(0deg, #333 0, #333 2px, transparent 2px, transparent 4.5px)' },
  // --- Organic soils (dashes + dot overlay) ---
  ol: { label: 'OL — Organic silt/clay, low plasticity', color: '#E3DEC5', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1px, transparent 1px, transparent 10px), radial-gradient(circle at 70% 50%, #4A4A4A 1px, transparent 1.2px)' },
  oi: { label: 'OI — Organic silt/clay, intermediate plasticity', color: '#E3DEC5', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1.3px, transparent 1.3px, transparent 7px), radial-gradient(circle at 70% 50%, #4A4A4A 1px, transparent 1.2px)' },
  oh: { label: 'OH — Organic silt/clay, high plasticity', color: '#E3DEC5', pattern: 'repeating-linear-gradient(0deg, #4A4A4A 0, #4A4A4A 1.6px, transparent 1.6px, transparent 5px), radial-gradient(circle at 70% 50%, #4A4A4A 1px, transparent 1.2px)' },
  pt: { label: 'Pt — Peat / highly organic soil', color: '#DDD7B8', pattern: 'repeating-linear-gradient(90deg, #5C4A2E 0, #5C4A2E 1.5px, transparent 1.5px, transparent 7px)' },
  // --- Rock (weathering grades) ---
  rock_g1: { label: 'Rock — Grade I (Fresh)', color: '#D8D8D8', pattern: 'repeating-linear-gradient(45deg, #333 0, #333 1.5px, transparent 1.5px, transparent 6px), repeating-linear-gradient(-45deg, #333 0, #333 1.5px, transparent 1.5px, transparent 6px)' },
  rock_g2: { label: 'Rock — Grade II (Slightly weathered)', color: '#E0E0E0', pattern: 'repeating-linear-gradient(45deg, #555 0, #555 1.2px, transparent 1.2px, transparent 8px)' },
  rock_g3: { label: 'Rock — Grade III (Moderately weathered)', color: '#E6E0D2', pattern: 'radial-gradient(circle, #6B5B45 1.5px, transparent 2px)' },
  rock_g4: { label: 'Rock — Grade IV (Highly weathered)', color: '#EAE3D3', pattern: 'repeating-linear-gradient(90deg, #7A7A7A 0, #7A7A7A 1px, transparent 1px, transparent 10px), repeating-linear-gradient(0deg, #7A7A7A 0, #7A7A7A 1px, transparent 1px, transparent 10px)' },
  rock_g5: { label: 'Rock — Grade V (Residual soil)', color: '#E2D8C3', pattern: 'radial-gradient(circle, #9C8B6E 1px, transparent 1.5px)' },
}

const SAMPLE_TYPE_LABELS: Record<SampleType, string> = { D: 'Disturbed', P: 'SPT', U: 'Undisturbed', C: 'Core', V: 'Vane Test', W: 'Water Sample' }

let idCounter = 0
const newId = () => `id-${Date.now()}-${idCounter++}`

function newSample(fromM: number, toM: number, type: SampleType = 'D'): Sample {
  return { id: newId(), fromM, toM, type, refNo: '', spt0: '', spt1: '', spt2: '', coreRecovery: '', rqd: '', remarks: '' }
}

function newLayer(fromM: number, toM: number): StrataLayer {
  return { id: newId(), fromM, toM, description: '', classification: '', symbolType: 'ci', samples: [newSample(fromM, Math.min(fromM + 0.45, toM))] }
}

export default function BoreholeLogs() {
  const [projectName, setProjectName] = useState('')
  const [jobNo, setJobNo] = useState('')
  const [boreholeName, setBoreholeName] = useState('BH-01')
  const [site, setSite] = useState('')
  const [client, setClient] = useState('')
  const [location, setLocation] = useState('')
  const [groundLevel, setGroundLevel] = useState('')
  const [waterLevel, setWaterLevel] = useState('')
  const [commencedOn, setCommencedOn] = useState('')
  const [completedOn, setCompletedOn] = useState('')
  const [diaOfHole, setDiaOfHole] = useState('')
  const [typeOfBoring, setTypeOfBoring] = useState('')
  const [easting, setEasting] = useState('')
  const [northing, setNorthing] = useState('')
  const [sitePerson, setSitePerson] = useState('')

  const [layers, setLayers] = useState<StrataLayer[]>([
    { ...newLayer(0, 1.5), description: 'Filled up', classification: '', symbolType: 'filled_up' },
    { ...newLayer(1.5, 10), description: 'Stiff to hard, yellowish brown silty clay of high plasticity', classification: 'CI', symbolType: 'ci' },
  ])
  const [expanded, setExpanded] = useState(true)

  function addLayer() {
    const last = layers[layers.length - 1]
    setLayers([...layers, newLayer(last ? last.toM : 0, (last ? last.toM : 0) + 1.5)])
  }
  function updateLayer(id: string, patch: Partial<StrataLayer>) {
    setLayers(layers.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }
  function removeLayer(id: string) {
    setLayers(layers.filter((l) => l.id !== id))
  }
  function addSample(layerId: string) {
    setLayers(layers.map((l) => {
      if (l.id !== layerId) return l
      const last = l.samples[l.samples.length - 1]
      const from = last ? last.toM : l.fromM
      return { ...l, samples: [...l.samples, newSample(from, Math.min(from + 0.45, l.toM))] }
    }))
  }
  function updateSample(layerId: string, sampleId: string, patch: Partial<Sample>) {
    setLayers(layers.map((l) => l.id !== layerId ? l : {
      ...l, samples: l.samples.map((s) => (s.id === sampleId ? { ...s, ...patch } : s)),
    }))
  }
  function removeSample(layerId: string, sampleId: string) {
    setLayers(layers.map((l) => l.id !== layerId ? l : { ...l, samples: l.samples.filter((s) => s.id !== sampleId) }))
  }

  const allSamples = layers.flatMap((l) => l.samples)
  const counts: Record<SampleType, number> = { D: 0, P: 0, U: 0, C: 0, V: 0, W: 0 }
  allSamples.forEach((s) => counts[s.type]++)

  function nValue(s: Sample) {
    const b1 = parseFloat(s.spt1), b2 = parseFloat(s.spt2)
    if (isNaN(b1) || isNaN(b2)) return null
    return b1 + b2
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <div>
          <h1 className="font-display text-xl font-semibold text-slate-50 flex items-center gap-2">
            <Layers3 size={20} className="text-violet-400" /> Borehole Log
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Field borelog format — strata, samples, SPT, core recovery. Print or save as PDF.</p>
        </div>
        <button onClick={() => window.print()} className="gm-btn-primary flex items-center gap-2">
          <Printer size={15} /> Print / Save PDF
        </button>
      </div>

      {/* Header details */}
      <div className="glass p-5 mb-5 print:hidden">
        <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 text-sm text-slate-200 mb-3">
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />} Project & Borehole Details
        </button>
        {expanded && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="text-xs text-slate-400 mb-1 block">Project Name</label><input className="gm-input w-full" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Job No.</label><input className="gm-input w-full" value={jobNo} onChange={(e) => setJobNo(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Borehole Name</label><input className="gm-input w-full" value={boreholeName} onChange={(e) => setBoreholeName(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Location of Borehole</label><input className="gm-input w-full" value={location} onChange={(e) => setLocation(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Site</label><input className="gm-input w-full" value={site} onChange={(e) => setSite(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Client</label><input className="gm-input w-full" value={client} onChange={(e) => setClient(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Existing Ground Level (m)</label><input className="gm-input w-full" value={groundLevel} onChange={(e) => setGroundLevel(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Standing Water Level (m)</label><input className="gm-input w-full" value={waterLevel} onChange={(e) => setWaterLevel(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Commenced on</label><input type="date" className="gm-input w-full" value={commencedOn} onChange={(e) => setCommencedOn(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Completed on</label><input type="date" className="gm-input w-full" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Dia of Hole (mm)</label><input className="gm-input w-full" value={diaOfHole} onChange={(e) => setDiaOfHole(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Type of Boring</label><input className="gm-input w-full" value={typeOfBoring} onChange={(e) => setTypeOfBoring(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Easting (E)</label><input className="gm-input w-full" value={easting} onChange={(e) => setEasting(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Northing (N)</label><input className="gm-input w-full" value={northing} onChange={(e) => setNorthing(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 mb-1 block">Site Person</label><input className="gm-input w-full" value={sitePerson} onChange={(e) => setSitePerson(e.target.value)} /></div>
          </div>
        )}
      </div>

      {/* Layer + sample editor */}
      <div className="glass p-5 mb-5 print:hidden">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-slate-200">Strata Layers & Samples</h2>
          <button onClick={addLayer} className="gm-btn-secondary flex items-center gap-1.5 text-xs"><Plus size={13} /> Add layer</button>
        </div>
        <div className="space-y-4">
          {layers.map((l) => (
            <div key={l.id} className="border border-white/10 rounded-xl p-3">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2">
                <input type="number" step="any" className="gm-input" placeholder="From (m)" value={l.fromM} onChange={(e) => updateLayer(l.id, { fromM: parseFloat(e.target.value) || 0 })} />
                <input type="number" step="any" className="gm-input" placeholder="To (m)" value={l.toM} onChange={(e) => updateLayer(l.id, { toM: parseFloat(e.target.value) || 0 })} />
                <select className="gm-input col-span-2" value={l.symbolType} onChange={(e) => updateLayer(l.id, { symbolType: e.target.value })}>
                  {Object.entries(SYMBOL_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input className="gm-input" placeholder="Classification (e.g. CI, GRADE-IV)" value={l.classification} onChange={(e) => updateLayer(l.id, { classification: e.target.value })} />
                <button onClick={() => removeLayer(l.id)} className="gm-btn-icon hover:!text-rose-400 justify-self-end"><Trash2 size={14} /></button>
              </div>
              <input className="gm-input w-full mb-2" placeholder="Description of strata" value={l.description} onChange={(e) => updateLayer(l.id, { description: e.target.value })} />

              <div className="space-y-1.5 pl-2 border-l-2 border-violet-500/30">
                {l.samples.map((s) => (
                  <div key={s.id} className="grid grid-cols-2 md:grid-cols-12 gap-1.5 items-center">
                    <input type="number" step="any" className="gm-input col-span-1" placeholder="From" value={s.fromM} onChange={(e) => updateSample(l.id, s.id, { fromM: parseFloat(e.target.value) || 0 })} />
                    <input type="number" step="any" className="gm-input col-span-1" placeholder="To" value={s.toM} onChange={(e) => updateSample(l.id, s.id, { toM: parseFloat(e.target.value) || 0 })} />
                    <select className="gm-input col-span-1" value={s.type} onChange={(e) => updateSample(l.id, s.id, { type: e.target.value as SampleType })}>
                      {Object.entries(SAMPLE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{k} - {v}</option>)}
                    </select>
                    <input className="gm-input col-span-1" placeholder="Ref No." value={s.refNo} onChange={(e) => updateSample(l.id, s.id, { refNo: e.target.value })} />
                    {s.type === 'P' && (
                      <>
                        <input className="gm-input col-span-1" placeholder="0-150" value={s.spt0} onChange={(e) => updateSample(l.id, s.id, { spt0: e.target.value })} />
                        <input className="gm-input col-span-1" placeholder="150-300" value={s.spt1} onChange={(e) => updateSample(l.id, s.id, { spt1: e.target.value })} />
                        <input className="gm-input col-span-1" placeholder="300-450" value={s.spt2} onChange={(e) => updateSample(l.id, s.id, { spt2: e.target.value })} />
                      </>
                    )}
                    {s.type === 'C' && (
                      <>
                        <input className="gm-input col-span-1" placeholder="Recovery %" value={s.coreRecovery} onChange={(e) => updateSample(l.id, s.id, { coreRecovery: e.target.value })} />
                        <input className="gm-input col-span-1" placeholder="RQD %" value={s.rqd} onChange={(e) => updateSample(l.id, s.id, { rqd: e.target.value })} />
                      </>
                    )}
                    <input className={`gm-input ${s.type === 'P' || s.type === 'C' ? 'col-span-2' : 'col-span-5'}`} placeholder="Remarks" value={s.remarks} onChange={(e) => updateSample(l.id, s.id, { remarks: e.target.value })} />
                    <button onClick={() => removeSample(l.id, s.id)} className="gm-btn-icon hover:!text-rose-400 col-span-1"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={() => addSample(l.id)} className="text-xs text-violet-400 flex items-center gap-1 mt-1"><Plus size={12} /> Add sample</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Printable field borelog table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass p-5 overflow-x-auto print:!bg-white print:!text-black print:shadow-none print:border-black" id="borehole-log-print">
        <div className="text-center mb-3">
          <div className="font-display text-lg font-semibold print:text-black">Field Borelog</div>
          {(projectName || jobNo) && (
            <div className="text-xs text-slate-400 print:text-black">{projectName} {jobNo && `— Job No. ${jobNo}`}</div>
          )}
        </div>

        {(() => {
          const headerItems = [
            { label: 'Borehole Name', value: boreholeName },
            { label: 'Existing Ground Level(m)', value: groundLevel },
            { label: 'Standing Water Level(m)', value: waterLevel },
            { label: 'Type of Boring', value: typeOfBoring },
            { label: 'Commenced on', value: commencedOn },
            { label: 'Completed on', value: completedOn },
            { label: 'Dia of Hole (mm)', value: diaOfHole },
            { label: 'Site', value: site },
            { label: 'Location of Borehole', value: location },
            { label: 'Client', value: client },
            { label: 'Job No.', value: jobNo },
            { label: 'Co-ordinates', value: (easting || northing) ? `E-${easting || '—'} & N-${northing || '—'}` : '' },
          ].filter((item) => item.value)

          return headerItems.length > 0 ? (
            <div className="flex flex-wrap border border-white/20 print:border-black mb-3 -mt-px -ml-px">
              {headerItems.map((item) => (
                <div key={item.label} className="border border-white/20 print:border-black px-2 py-1 text-[10px] print:text-black -mt-px -ml-px flex-1 min-w-[160px]">
                  <span className="text-slate-400 print:text-black">{item.label}: </span>
                  <span className="font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null
        })()}

        <table className="w-full text-[10px] border-collapse print:text-black">
          <thead>
            <tr className="bg-white/5 print:bg-gray-100">
              {['Depth of Strata', 'Thickness', 'Sample Depth(m)', 'Sample Type', 'Sample Ref.No.', 'Description of Strata', 'Classification', 'Symbol', '0-150', '150-300', '300-450', 'N', 'SPT (N)', 'Core Rec. %', 'R.Q.D. %', 'Remarks'].map((h) => (
                <th key={h} className="border border-white/20 print:border-black px-1.5 py-1.5 font-medium text-slate-300 print:text-black whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {layers.map((l) => l.samples.length === 0 ? (
              <tr key={l.id}>
                <td className="border border-white/20 print:border-black px-1.5 py-1 text-center">{l.fromM} To {l.toM}</td>
                <td className="border border-white/20 print:border-black px-1.5 py-1 text-center">{(l.toM - l.fromM).toFixed(2)}</td>
                <td colSpan={3} className="border border-white/20 print:border-black px-1.5 py-1 text-center text-slate-500">—</td>
                <td className="border border-white/20 print:border-black px-1.5 py-1">{l.description}</td>
                <td className="border border-white/20 print:border-black px-1.5 py-1 text-center">{l.classification}</td>
                <td className="border border-white/20 print:border-black p-0" style={{ background: SYMBOL_TYPES[l.symbolType]?.color }}><div className="w-full h-8" style={{ backgroundImage: SYMBOL_TYPES[l.symbolType]?.pattern }} /></td>
                <td colSpan={6} className="border border-white/20 print:border-black px-1.5 py-1 text-center text-slate-500">—</td>
              </tr>
            ) : l.samples.map((s, si) => {
              const n = nValue(s)
              return (
                <tr key={s.id}>
                  {si === 0 && <td rowSpan={l.samples.length} className="border border-white/20 print:border-black px-1.5 py-1 text-center align-top">{l.fromM} To {l.toM}</td>}
                  {si === 0 && <td rowSpan={l.samples.length} className="border border-white/20 print:border-black px-1.5 py-1 text-center align-top">{(l.toM - l.fromM).toFixed(2)}</td>}
                  <td className="border border-white/20 print:border-black px-1.5 py-1 text-center whitespace-nowrap">{s.fromM} To {s.toM}</td>
                  <td className="border border-white/20 print:border-black px-1.5 py-1 text-center">{s.type}</td>
                  <td className="border border-white/20 print:border-black px-1.5 py-1 text-center whitespace-nowrap">{s.refNo}</td>
                  {si === 0 && <td rowSpan={l.samples.length} className="border border-white/20 print:border-black px-1.5 py-1 align-top">{l.description}</td>}
                  {si === 0 && <td rowSpan={l.samples.length} className="border border-white/20 print:border-black px-1.5 py-1 text-center align-top">{l.classification}</td>}
                  {si === 0 && (
                    <td rowSpan={l.samples.length} className="border border-white/20 print:border-black p-0 align-top" style={{ background: SYMBOL_TYPES[l.symbolType]?.color, minWidth: '28px' }}>
                      <div className="w-full h-full" style={{ backgroundImage: SYMBOL_TYPES[l.symbolType]?.pattern, minHeight: '32px' }} />
                    </td>
                  )}
                  <td className="border border-white/20 print:border-black px-1 py-1 text-center">{s.type === 'P' ? s.spt0 : ''}</td>
                  <td className="border border-white/20 print:border-black px-1 py-1 text-center">{s.type === 'P' ? s.spt1 : ''}</td>
                  <td className="border border-white/20 print:border-black px-1 py-1 text-center">{s.type === 'P' ? s.spt2 : ''}</td>
                  <td className="border border-white/20 print:border-black px-1 py-1 text-center font-medium">{s.type === 'P' && n !== null ? n : ''}</td>
                  <td className="border border-white/20 print:border-black px-1 py-1" style={{ minWidth: '70px' }}>
                    {s.type === 'P' && n !== null && (
                      <div className="w-full h-2.5 bg-white/10 print:bg-gray-200 rounded-sm overflow-hidden">
                        <div className="h-full bg-rose-500 print:bg-red-600" style={{ width: `${Math.min(100, (n / 50) * 100)}%` }} />
                      </div>
                    )}
                  </td>
                  <td className="border border-white/20 print:border-black px-1 py-1 text-center">{s.type === 'C' ? s.coreRecovery : ''}</td>
                  <td className="border border-white/20 print:border-black px-1 py-1 text-center">{s.type === 'C' ? s.rqd : ''}</td>
                  <td className="border border-white/20 print:border-black px-1.5 py-1">{s.remarks}</td>
                </tr>
              )
            }))}
          </tbody>
        </table>

        <div className="flex flex-wrap justify-between items-center gap-3 mt-3 pt-2 border-t border-white/10 print:border-black text-[10px]">
          <div className="text-slate-400 print:text-black">D-Disturbed Sample, U-Undisturbed Sample, P-Standard Penetration Test, C-Core, W-Water Sample, V-Vane Test</div>
          {sitePerson && <div className="text-slate-400 print:text-black">Site Person: {sitePerson}</div>}
        </div>
        <div className="flex gap-4 mt-1.5 text-[10px] font-medium text-slate-300 print:text-black">
          <span>D: {counts.D}</span><span>U: {counts.U}</span><span>V: {counts.V}</span><span>C: {counts.C}</span><span>P: {counts.P}</span><span>W: {counts.W}</span>
        </div>

        <div className="flex flex-wrap gap-3 mt-4 text-[10px]">
          {Object.entries(SYMBOL_TYPES).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-sm inline-block" style={{ background: v.color, backgroundImage: v.pattern }} />
              <span className="text-slate-400 print:text-black">{v.label}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
