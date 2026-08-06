const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('raahigeo_auth_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// A 401 means the session is gone (expired, or credentials were changed
// elsewhere) -- clear the stale token and reload, which sends the user back
// to the Login screen (App.tsx gates on token presence).
function handleUnauthorized() {
  localStorage.removeItem('raahigeo_auth_token')
  window.location.reload()
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  })
  if (res.status === 401) { handleUnauthorized(); throw new Error('Not authenticated.') }
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  return res.json()
}

export type ChatStreamEvent =
  | { type: 'text'; content: string }
  | { type: 'done'; conversation_id: string; citations: any[]; found_in_documents: boolean }
  | { type: 'error'; message: string }

// Reads a Server-Sent Events response chunk by chunk and yields each parsed
// event as soon as it arrives -- this is what lets the chat UI show text
// progressively instead of waiting for the whole answer.
async function* streamRequest(path: string, options: RequestInit = {}): AsyncGenerator<ChatStreamEvent> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    ...options,
  })
  if (res.status === 401) { handleUnauthorized(); throw new Error('Not authenticated.') }
  if (!res.ok || !res.body) {
    const body = res.body ? await res.text() : ''
    throw new Error(`API error ${res.status}: ${body}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''
    for (const raw of events) {
      const line = raw.trim()
      if (!line.startsWith('data: ')) continue
      try {
        yield JSON.parse(line.slice(6)) as ChatStreamEvent
      } catch {
        // Malformed SSE line -- skip rather than crash the whole stream
      }
    }
  }
}

export const api = {
  chat: (payload: {
    conversation_id?: string | null
    question: string
    engineering_mode: boolean
    category_filter?: string | null
  }) => request<any>('/api/chat', { method: 'POST', body: JSON.stringify(payload) }),

  chatStream: (payload: {
    conversation_id?: string | null
    question: string
    engineering_mode: boolean
    category_filter?: string | null
  }) => streamRequest('/api/chat', { method: 'POST', body: JSON.stringify(payload) }),

  listDocuments: (category?: string) =>
    request<any[]>(`/api/documents${category ? `?category=${encodeURIComponent(category)}` : ''}`),

  categories: () => request<string[]>('/api/documents/categories'),

  uploadDocument: async (file: File, category: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('category', category)
    const res = await fetch(`${BASE_URL}/api/documents/upload`, { method: 'POST', body: form, headers: authHeaders() })
    if (res.status === 401) { handleUnauthorized(); throw new Error('Not authenticated.') }
    if (!res.ok) throw new Error(await res.text())
    return res.json()
  },

  deleteDocument: (id: string) => request(`/api/documents/${id}`, { method: 'DELETE' }),
  reindexDocument: (id: string) => request(`/api/documents/${id}/reindex`, { method: 'POST' }),

  search: (query: string, category_filter?: string) =>
    request<any>('/api/search', { method: 'POST', body: JSON.stringify({ query, category_filter }) }),

  findClause: (code_name: string, topic: string) =>
    request<any>('/api/clause-finder', { method: 'POST', body: JSON.stringify({ code_name, topic }) }),

  availableCalculators: () => request<any>('/api/calculators/available'),

  runCalculator: (calculator_type: string, inputs: Record<string, any>) =>
    request<any>('/api/calculators/run', { method: 'POST', body: JSON.stringify({ calculator_type, inputs }) }),

  runBatch: (payload: {
    borehole_id: string
    widths_m: number[]; depths_m: number[]; length_m?: number | null
    shape?: string; fos?: number; allowable_settlement_mm?: number
    consolidation_type?: string; rigidity_factor?: number
    overrides?: Record<string, number | string>
  }) => request<any>('/api/calculators/batch', { method: 'POST', body: JSON.stringify(payload) }),

  runLiquefaction: (payload: {
    borehole_id: string
    earthquake_magnitude_mw: number
    earthquake_zone?: string | null
    pga_g?: number | null
    overrides?: Record<string, any>
  }) => request<any>('/api/calculators/liquefaction', { method: 'POST', body: JSON.stringify(payload) }),

  runPileCapacity: (payload: {
    borehole_id: string
    diameter_m: number; pile_length_m: number; cutoff_depth_m?: number
    code?: string; water_table_depth_m?: number | null; scour_depth_m?: number | null
    liquefaction_depth_m?: number | null; critical_depth_factor?: number | null
    fos_compression?: number; fos_uplift?: number
    overrides?: Record<string, any>
  }) => request<any>('/api/calculators/pile', { method: 'POST', body: JSON.stringify(payload) }),

  parsePileCommand: (text: string, borehole_id?: string | null) =>
    request<any>('/api/calculators/pile/parse-command', { method: 'POST', body: JSON.stringify({ text, borehole_id }) }),

  runLateralCapacity: (payload: {
    borehole_id: string
    width_m: number; embedded_length_m: number; free_length_above_ground_m?: number
    pile_material_modulus_t_m2?: number; allowable_deflection_pct_dia?: number
    overrides?: Record<string, any>
  }) => request<any>('/api/calculators/lateral', { method: 'POST', body: JSON.stringify(payload) }),

  runRetainingWall: (payload: Record<string, any>) =>
    request<any>('/api/calculators/retaining-wall', { method: 'POST', body: JSON.stringify(payload) }),

  runRockSbc: (payload: Record<string, any>) =>
    request<any>('/api/calculators/rock-sbc', { method: 'POST', body: JSON.stringify(payload) }),

  runRockSocketPile: (payload: Record<string, any>) =>
    request<any>('/api/calculators/rock-socket-pile', { method: 'POST', body: JSON.stringify(payload) }),

  runGroundImprovement: (payload: Record<string, any>) =>
    request<any>('/api/calculators/ground-improvement', { method: 'POST', body: JSON.stringify(payload) }),

  reportSectionTypes: () => request<string[]>('/api/reports/section-types'),

  generateReportSection: (section_type: string, project_inputs: Record<string, any>, reference_query?: string) =>
    request<any>('/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ section_type, project_inputs, reference_query }),
    }),

  listConversations: (q?: string) =>
    request<any[]>(`/api/history/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  getConversation: (id: string) => request<any>(`/api/history/conversations/${id}`),
  deleteConversation: (id: string) => request(`/api/history/conversations/${id}`, { method: 'DELETE' }),

  downloadLabDataTemplate: async () => {
    const res = await fetch(`${BASE_URL}/api/lab-data/template`, { headers: authHeaders() })
    if (res.status === 401) { handleUnauthorized(); throw new Error('Not authenticated.') }
    if (!res.ok) throw new Error(await res.text())
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'raahigeo_lab_data_template.xlsx'; a.click()
  },

  uploadLabData: (file: File, opts?: { onProgress?: (pct: number) => void; force?: boolean }) =>
    new Promise<any>((resolve, reject) => {
      const attempt = (retriesLeft: number) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BASE_URL}/api/lab-data/upload`)
        const token = localStorage.getItem('raahigeo_auth_token')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        // Generous timeout -- Render free tier can take 30-50s to wake from a
        // cold start (see PROJECT_STATUS.md) on top of actual upload+parse time.
        xhr.timeout = 120000
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) opts?.onProgress?.(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status === 401) { handleUnauthorized(); reject(new Error('Not authenticated.')); return }
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) } catch { reject(new Error('Server returned an unreadable response.')) }
            return
          }
          // 400/409/413/422/500 etc. are application-level responses (validation,
          // duplicate file, file too large...) -- meaningful already, never retried.
          let message = xhr.responseText || `Upload failed (${xhr.status}).`
          try { message = JSON.parse(xhr.responseText).detail || message } catch { /* not JSON, use raw text */ }
          const err: any = new Error(message)
          err.status = xhr.status
          reject(err)
        }
        const retryOrFail = (fallbackMessage: string) => {
          if (retriesLeft > 0) { setTimeout(() => attempt(retriesLeft - 1), 1500) }
          else reject(new Error(fallbackMessage))
        }
        // Network-level failures (connection dropped, DNS, CORS preflight
        // failure...) and timeouts are transient -- worth one automatic retry
        // before bothering the user.
        xhr.onerror = () => retryOrFail('Network error — could not reach the server. Check your connection and try again.')
        xhr.ontimeout = () => retryOrFail('Upload timed out. The server may be waking up from idle (Render free tier) — try again in a moment.')
        const form = new FormData()
        form.append('file', file)
        if (opts?.force) form.append('force', 'true')
        xhr.send(form)
      }
      attempt(1)
    }),

  listBoreholes: () => request<any[]>('/api/lab-data'),
  getBorehole: (id: string) => request<any>(`/api/lab-data/${id}`),
  deleteBorehole: (id: string) => request(`/api/lab-data/${id}`, { method: 'DELETE' }),

  login: (username: string, password: string) =>
    request<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  logoutAllDevices: () => request<{ ok: boolean; token: string }>('/api/auth/logout-all', { method: 'POST' }),

  me: () => request<{ username: string }>('/api/auth/me'),

  changeCredentials: (payload: { current_password: string; owner_pin: string; new_username: string; new_password: string }) =>
    request<{ ok: boolean; token: string }>('/api/auth/change-credentials', { method: 'POST', body: JSON.stringify(payload) }),
}
