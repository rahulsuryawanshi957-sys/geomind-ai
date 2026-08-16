// Batch Analysis result-comparison helpers (Step 4, Aug 2026).
//
// Deliberately framework-free (no React/JSX, no imports) -- pure functions
// over the EXISTING result row shape Batch Analysis already returns (see
// `_run_one_batch_case` in backend/app/services/calculators.py). This file
// invents NO new engineering values: every field it reads already exists on
// a result row from Step 2/3; every value it computes (status, summary
// counts, sort/filter) is presentation logic over those existing fields,
// never a new calculation. Kept separate from BatchAnalysis.tsx so it can be
// unit-tested directly in plain Node (no bundler/tsc needed in this repo's
// Termux/Render workflow) -- see the "Testing" note in PROJECT_STATUS.md's
// Step 4 changelog entry for how these were actually verified.

export type BatchRow = Record<string, any>

// --- Status -----------------------------------------------------------
// The brief asked for SUCCESS / INVALID / ERROR, "where the existing
// backend provides enough information". As of Step 3, the backend does NOT
// distinguish "bad input" from "a real engineering calculation failure" --
// both paths raise the same ValueError into the same `row.error` string
// (see _run_one_batch_case's single `except (ValueError, ZeroDivisionError)`
// block). Inventing an INVALID/ERROR split by guessing from the error
// message text would be exactly the kind of fabricated distinction the
// brief says not to make -- so this only exposes the TWO states the data
// actually supports. See PROJECT_STATUS.md Known Issues for this note.
export type CaseStatus = 'success' | 'error'

export function getCaseStatus(row: BatchRow): CaseStatus {
  return row && row.error ? 'error' : 'success'
}

// --- Summary ------------------------------------------------------------
// Every number here is either an existing top-level result field
// (`total`/`successful`) or a plain count/min/max over existing per-row
// fields -- no new engineering calculation. `highestRecommendedSbc` /
// `lowestRecommendedSbc` are explicitly numerical extremes across THIS run,
// not an engineering recommendation -- the brief is explicit that a batch
// with no structural applied load/demand can't determine a genuine
// best/optimal/safe case, so this never labels one.
export interface BatchSummary {
  total: number
  successful: number
  errorCount: number
  replacementOn: number
  replacementOff: number
  highestRecommendedSbc: { value: number; row: BatchRow } | null
  lowestRecommendedSbc: { value: number; row: BatchRow } | null
}

export function buildBatchSummary(combinations: BatchRow[]): BatchSummary {
  const rows = combinations || []
  let replacementOn = 0
  let errorCount = 0
  let highest: { value: number; row: BatchRow } | null = null
  let lowest: { value: number; row: BatchRow } | null = null

  for (const row of rows) {
    if (row.replacement_enabled) replacementOn++
    if (getCaseStatus(row) === 'error') {
      errorCount++
      continue
    }
    const v = row.recommended_sbc
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    if (!highest || v > highest.value) highest = { value: v, row }
    if (!lowest || v < lowest.value) lowest = { value: v, row }
  }

  return {
    total: rows.length,
    successful: rows.length - errorCount,
    errorCount,
    replacementOn,
    replacementOff: rows.length - replacementOn,
    highestRecommendedSbc: highest,
    lowestRecommendedSbc: lowest,
  }
}

// --- Sorting --------------------------------------------------------------
// Field accessors over EXISTING row fields only. `status` and
// `replacement_enabled` are derived from existing fields (`error`,
// `replacement_enabled` itself), not new data.
export const SORTABLE_FIELDS: Record<string, (c: BatchRow) => number | string> = {
  case_id: (c) => c.case_id ?? '',
  width_m: (c) => c.width_m,
  length_m: (c) => c.length_m,
  depth_m: (c) => c.depth_m,
  soil_type: (c) => c.soil_type ?? '',
  shear_sbc: (c) => (c.shear_sbc ?? -Infinity),
  settlement_sbc: (c) => (c.settlement_sbc ?? -Infinity),
  recommended_sbc: (c) => (c.recommended_sbc ?? -Infinity),
  gross_recommended_sbc: (c) => (c.gross_recommended_sbc ?? -Infinity),
  governing: (c) => c.governing ?? '',
  replacement_enabled: (c) => (c.replacement_enabled ? 1 : 0),
  replacement_depth_m: (c) => (c.replacement_depth_m ?? -Infinity),
  status: (c) => getCaseStatus(c),
  method: (c) => c.method ?? '',
}

// Stable sort (Array.prototype.sort is spec-guaranteed stable in every
// engine this app runs on -- Node/V8, evergreen browsers -- so equal keys
// keep their original relative order, per the brief's "use stable sorting").
export function sortRows(rows: BatchRow[], sortCol: string | null, sortDir: 'asc' | 'desc'): BatchRow[] {
  if (!sortCol || !SORTABLE_FIELDS[sortCol]) return rows
  const accessor = SORTABLE_FIELDS[sortCol]
  return [...rows].sort((a, b) => {
    const av = accessor(a)
    const bv = accessor(b)
    const cmp = typeof av === 'string' || typeof bv === 'string'
      ? String(av).localeCompare(String(bv))
      : (av as number) - (bv as number)
    return sortDir === 'asc' ? cmp : -cmp
  })
}

// --- Filtering --------------------------------------------------------------
export type ReplacementFilter = 'all' | 'on' | 'off'
export type StatusFilter = 'all' | 'success' | 'error'

export interface RowFilters {
  status?: StatusFilter
  replacement?: ReplacementFilter
  search?: string
}

export function filterRows(rows: BatchRow[], filters: RowFilters): BatchRow[] {
  const status = filters.status ?? 'all'
  const replacement = filters.replacement ?? 'all'
  const q = (filters.search ?? '').trim().toLowerCase()

  return rows.filter((c) => {
    if (status !== 'all' && getCaseStatus(c) !== status) return false
    if (replacement === 'on' && !c.replacement_enabled) return false
    if (replacement === 'off' && c.replacement_enabled) return false
    if (q) {
      const haystack = [
        c.case_id, c.width_m, c.length_m, c.depth_m, c.founding_layer,
        c.soil_type, c.governing, c.error, c.replacement_depth_m, c.method,
      ]
      if (!haystack.some((v) => v != null && String(v).toLowerCase().includes(q))) return false
    }
    return true
  })
}

// Convenience wrapper matching the order the UI applies these in: filter
// (status/replacement/search) first, then sort what's left -- so sorting
// never has to consider rows the user has filtered out, and search results
// stay in the user's chosen sort order.
export function getDisplayedRows(
  combinations: BatchRow[],
  filters: RowFilters,
  sortCol: string | null,
  sortDir: 'asc' | 'desc',
): BatchRow[] {
  return sortRows(filterRows(combinations || [], filters), sortCol, sortDir)
}
