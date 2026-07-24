import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, ShieldCheck, Copy, Download, RefreshCw, Pin, Bookmark,
  ThumbsUp, ThumbsDown, Mic, Paperclip, Check,
} from 'lucide-react'
import { api } from '../api/client'
import { Citation } from '../components/ReferenceBlock'
import SourcesPanel from '../components/SourcesPanel'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  pinned?: boolean
  bookmarked?: boolean
  feedback?: 'up' | 'down' | null
}

const SAMPLE_QUESTIONS = [
  'Explain Terzaghi bearing capacity.',
  'IS 2911 pile capacity calculation.',
  'Difference between Meyerhof and Terzaghi.',
  'Liquefaction procedure according to IS codes.',
]

const ANSWER_FORMAT_HINT =
  ' Structure your answer with markdown headings in this order where applicable: ' +
  '## Summary, ## Theory, ## Formula, ## Step-by-step, ## Worked Example, ## Engineering Notes, ## Warnings.'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="gm-btn-icon"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      title="Copy"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  )
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [engineeringMode, setEngineeringMode] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [lastCitations, setLastCitations] = useState<Citation[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function send(question: string) {
    if (!question.trim() || loading) return
    setMessages((m) => [...m, { role: 'user', content: question }])
    setInput('')
    setLoading(true)
    try {
      const res = await api.chat({
        conversation_id: conversationId,
        question: question + ANSWER_FORMAT_HINT,
        engineering_mode: engineeringMode,
      })
      setConversationId(res.conversation_id)
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, citations: res.citations, feedback: null }])
      setLastCitations(res.citations || [])
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Couldn't reach the backend: ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function regenerate(index: number) {
    const priorUser = [...messages.slice(0, index)].reverse().find((m) => m.role === 'user')
    if (priorUser) send(priorUser.content)
  }

  function toggle(index: number, key: 'pinned' | 'bookmarked') {
    setMessages((m) => m.map((msg, i) => (i === index ? { ...msg, [key]: !msg[key] } : msg)))
  }

  function setFeedback(index: number, value: 'up' | 'down') {
    setMessages((m) => m.map((msg, i) => (i === index ? { ...msg, feedback: msg.feedback === value ? null : value } : msg)))
  }

  function exportAnswer(content: string) {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'raahigeo-answer.md'; a.click()
  }

  function toggleVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) { alert('Voice input is not supported in this browser.'); return }
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onresult = (e: any) => setInput((prev) => (prev ? prev + ' ' : '') + e.results[0][0].transcript)
    recognition.start()
  }

  async function handleFileUpload(file: File) {
    setMessages((m) => [...m, { role: 'assistant', content: `Uploading **${file.name}**... it'll be indexed in the Document Library and available to cite once processing finishes.` }])
    try {
      await api.uploadDocument(file, 'Personal Notes')
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Upload failed: ${e.message}` }])
    }
  }

  return (
    <div className="flex h-screen">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="px-5 md:px-8 py-4 md:py-5 border-b border-white/[0.06] flex items-center justify-between glass !rounded-none !border-x-0 !border-t-0">
          <div>
            <h1 className="font-display text-lg md:text-xl font-semibold text-slate-50">AI Chat</h1>
            <p className="text-xs md:text-sm text-slate-400">Retrieval-grounded answers from your books and IS codes</p>
          </div>
          <button
            onClick={() => setEngineeringMode((v) => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shrink-0 ${
              engineeringMode ? 'bg-violet-500/15 text-violet-300 border-violet-500/30' : 'bg-white/[0.04] text-slate-400 border-white/10'
            }`}
          >
            <ShieldCheck size={13} />
            <span className="hidden sm:inline">Engineering Mode</span> {engineeringMode ? 'ON' : 'OFF'}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 md:px-8 py-6 space-y-5 pb-28 md:pb-6">
          {messages.length === 0 && (
            <div className="max-w-2xl mx-auto mt-10">
              <p className="text-slate-400 text-sm mb-3">Try asking:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SAMPLE_QUESTIONS.map((q, i) => (
                  <motion.button
                    key={q} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    onClick={() => send(q)} className="glass glass-hover text-left px-4 py-3 text-sm text-slate-300"
                  >
                    {q}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`max-w-2xl ${m.role === 'user' ? 'ml-auto' : ''}`}
              >
                {m.role === 'user' ? (
                  <div className="bg-gradient-to-br from-violet-600/80 to-violet-500/70 rounded-2xl rounded-tr-sm px-4 py-3">
                    <div className="text-sm text-white">{m.content.replace(ANSWER_FORMAT_HINT, '')}</div>
                  </div>
                ) : (
                  <div className="glass px-4 py-4 rounded-tl-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs uppercase tracking-wide text-violet-300 font-medium">RaahiGeo</div>
                      {m.pinned && <Pin size={12} className="text-cyan-400" />}
                    </div>

                    <div className="gm-prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    </div>

                    {m.citations && (
                      <div className="mt-3 border-t border-white/[0.06] pt-2.5">
                        {m.citations.length === 0 ? (
                          <div className="text-xs text-rose-400">No matching source found in your uploaded documents.</div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {m.citations.map((c, ci) => (
                              <span key={ci} className="text-[10px] px-2 py-1 rounded-full bg-white/[0.05] text-slate-400">
                                {c.filename}{c.page_number ? ` · p.${c.page_number}` : ''}{c.clause_number ? ` · cl.${c.clause_number}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-white/[0.06]">
                      <CopyButton text={m.content} />
                      <button className="gm-btn-icon" title="Export" onClick={() => exportAnswer(m.content)}><Download size={14} /></button>
                      <button className="gm-btn-icon" title="Regenerate" onClick={() => regenerate(i)}><RefreshCw size={14} /></button>
                      <button className={`gm-btn-icon ${m.pinned ? 'text-cyan-400' : ''}`} title="Pin" onClick={() => toggle(i, 'pinned')}><Pin size={14} /></button>
                      <button className={`gm-btn-icon ${m.bookmarked ? 'text-violet-400' : ''}`} title="Bookmark" onClick={() => toggle(i, 'bookmarked')}><Bookmark size={14} /></button>
                      <div className="flex-1" />
                      <button className={`gm-btn-icon ${m.feedback === 'up' ? 'text-emerald-400' : ''}`} onClick={() => setFeedback(i, 'up')}><ThumbsUp size={14} /></button>
                      <button className={`gm-btn-icon ${m.feedback === 'down' ? 'text-rose-400' : ''}`} onClick={() => setFeedback(i, 'down')}><ThumbsDown size={14} /></button>
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div className="max-w-2xl glass px-4 py-4 space-y-2">
              <div className="gm-skeleton h-3 w-3/4" />
              <div className="gm-skeleton h-3 w-1/2" />
              <div className="text-xs text-slate-500 mt-1">Retrieving from your documents...</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-5 md:px-8 py-4 md:py-5 border-t border-white/[0.06] glass !rounded-none !border-x-0 !border-b-0 fixed md:static bottom-16 left-0 right-0 md:bottom-auto">
          <form className="max-w-2xl mx-auto flex gap-2 items-center" onSubmit={(e) => { e.preventDefault(); send(input) }}>
            <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden"
              onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])} />
            <button type="button" className="gm-btn-icon" title="Attach PDF" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={16} />
            </button>
            <button type="button" className={`gm-btn-icon ${listening ? 'text-rose-400 animate-pulse' : ''}`} title="Voice input" onClick={toggleVoice}>
              <Mic size={16} />
            </button>
            <input
              className="gm-input flex-1"
              placeholder="Ask a geotechnical engineering question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="gm-btn-primary flex items-center gap-2" disabled={loading}>
              <Send size={15} /> <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>

      <SourcesPanel citations={lastCitations} />
    </div>
  )
}
