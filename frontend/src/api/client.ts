const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  return res.json()
}

export const api = {
  chat: (payload: {
    conversation_id?: string | null
    question: string
    engineering_mode: boolean
    category_filter?: string | null
  }) => request<any>('/api/chat', { method: 'POST', body: JSON.stringify(payload) }),

  listDocuments: (category?: string) =>
    request<any[]>(`/api/documents${category ? `?category=${encodeURIComponent(category)}` : ''}`),

  categories: () => request<string[]>('/api/documents/categories'),

  uploadDocument: async (file: File, category: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('category', category)
    const res = await fetch(`${BASE_URL}/api/documents/upload`, { method: 'POST', body: form })
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
}
