# RaahiGeo AI — Project Status & Handoff Document

**Read this first if you're a new Claude session (or any AI) picking up this project.**
This file is the single source of truth for what's built, what's broken, what's next,
and how deployment works. Keep it updated as the project evolves.

---

## What this project is

A RAG-based geotechnical engineering assistant for Raahi, a geotechnical engineer in
India. Long-term goal: upload lab test data → app automatically runs SPT correction,
shear/settlement SBC, liquefaction, pile capacity, generates borehole log charts and a
final report — turning a day of manual reporting into ~1 hour, across 100+ foundation
combinations at once.

## Who's using this and how

Raahi has **zero coding background** and does all development from an **Android phone**
using Termux (terminal app) + GitHub + Render.com (free tier hosting). There is no local
dev machine. Every code change follows this workflow:
1. Claude edits code in its own sandbox, zips it, gives Raahi a download link
2. Raahi downloads the zip on their phone, extracts it in Termux, copies files over
   the existing `~/geomind-ai` folder
3. `git add . && git commit -m "..." && git push https://USERNAME:TOKEN@github.com/...`
4. Render auto-redeploys both services from GitHub

**Implication for future Claude sessions:** always give copy-paste Termux commands, never
assume a local dev environment, IDE, or npm/pip access on Raahi's end. Explain in simple
Hindi/English mix (Hinglish) — Raahi is not fluent in technical English jargon.

---

## Live deployment

- **Frontend:** https://geomind-ai-1.onrender.com (Render Static Site, root dir `frontend`)
- **Backend:** https://geomind-ai.onrender.com (Render Web Service, root dir `backend`)
- **Backend health check:** `/api/health` — reports Gemini key status, DB type, vector store type
- **Swagger/API docs:** https://geomind-ai.onrender.com/docs
- **GitHub repo:** github.com/rahulsuryawanshi957-sys/geomind-ai
- Both services are on **Render's free tier** — no persistent disk, spin down after 15 min
  idle (50+ sec cold start on next request).

## AI provider

**Google Gemini** (not OpenAI — switched early on because OpenAI requires a paid card and
Gemini has a genuinely free tier). Current models (as of July 2026):
- Chat: `gemini-3.5-flash`
- Embeddings: `gemini-embedding-001`
- **Gotcha:** Gemini model names get deprecated/retired periodically (this already happened
  once with `gemini-2.5-flash`). If chat/search suddenly 404s, check `GET /api/health` and
  search for current available Gemini model names before assuming a code bug.
- **Gotcha:** Free tier has low rate limits (RPM) and a daily quota. Bulk PDF indexing
  (large textbooks) can burn through it fast — `ingest.py` paces embedding batches with a
  5s delay between them for this reason. 429 errors are Google's limit, not a bug.

## Persistent storage (optional, currently may or may not be configured — check!)

By default, Render's free tier wipes local disk on every restart/redeploy. Two optional
env vars make things persistent:
- `CHROMA_API_KEY` (+ `CHROMA_TENANT`, `CHROMA_DATABASE`) → Chroma Cloud (free tier) for
  the vector store, instead of local disk.
- `DATABASE_URL` → external Postgres (Supabase/Neon free tier) instead of local SQLite,
  for conversations/documents/borehole profiles.
- Check `GET /api/health` response (`vector_store`, `database` fields) to see which mode
  is currently active.

---

## Architecture

```
frontend/          React + TypeScript + Vite + Tailwind, dark navy/violet/cyan theme
  src/pages/        One file per route (Chat, Books, Calculators, BatchAnalysis,
                      BoreholeLogs, etc.)
  src/pages/planned/  Features that started as "Coming Soon" placeholders -- some have
                      since been built out for real (BoreholeLogs.tsx, LabReports.tsx,
                      SoilProfile.tsx). Still-placeholder: Projects, PdfChat, Bookmarks.
  src/components/    Sidebar, MobileNav, ComingSoon, ReferenceBlock, SourcesPanel
  src/api/client.ts  All backend API calls in one place

backend/
  main.py            FastAPI app, CORS, logging middleware, /api/health
  app/config.py      Settings (env vars), logging setup -- imported first by everything
  app/database.py    SQLAlchemy engine (SQLite or Postgres via DATABASE_URL)
  app/models.py      Document, Chunk, Conversation, Message, CalculationLog,
                      BoreholeProfile, SoilLayer
  app/routers/       One file per API area (chat, documents, search, calculators,
                      reports, clause_finder, history, lab_data)
  app/services/      embeddings.py, llm.py (Gemini calls), calculators.py (all
                      engineering formulas), lab_data.py (Excel template/parsing)
  app/rag/           ingest.py (PDF->chunks->embeddings), retrieval.py, vectorstore.py
```

---

## What's built and working

**Core RAG assistant:** Chat (Gemini + retrieval, Engineering Mode), Document Library
(upload/categorize/re-index PDFs), Universal Search, Clause Finder, Formula Library,
Report Generator (Word/PDF export), History.

**Engineering Analysis (renamed from "Calculators")** — real formulas, not LLM-guessed:
- Bearing Capacity (Terzaghi, general)
- **SBC — IS:6403 Shear Method** — matches a real project workbook exactly (general/local
  shear interpolation by void ratio, shape/depth factors, water table correction)
- **SBC — IS:8009 Settlement (Granular)** — SPT N-value based, IS:8009 Fig-9 chart
  (digitized curve-fit), Boussinesq stress influence, Fox depth correction. Manual
  influence-depth override available.
- **SBC — IS:8009 Settlement (Clay)** — elastic + consolidation (NCS/OCS), same
  Boussinesq/Fox machinery. Manual layer thickness override available.
- Immediate settlement, consolidation settlement, SPT correction, Rankine earth pressure
- Still stubbed (`PLANNED_CALCULATORS` in `calculators.py`): raft/isolated footing, pile
  capacity, group efficiency, lateral pile, retaining wall stability, **liquefaction**,
  plate load test, modulus of subgrade reaction (standalone)

**Batch Analysis (`/batch-analysis`, Phase 3 — done, v2)** — runs shear (IS:6403) +
settlement (IS:8009) SBC across a full width × depth grid (cross-product of a
comma-separated widths list and depths list, up to 400 combinations) for a whole
borehole in one go. Recommended SBC per combination = min(shear, settlement), same
rule as the single calculators; the lowest-recommended combination across the whole
grid is called out as the "critical combination."

**No manual layer picking (v2 redesign, per Raahi's explicit request).** The old v1
made you hand-pick ONE layer for the entire batch, which meant re-running the whole
batch per depth range if a site had multiple strata. v2 auto-locates the *founding
layer* for each depth independently from the borehole's own layers (so one batch run
across depths=[1.5, 3, 6] can span three different strata correctly in one go), and
fills any field missing on that layer (e.g. an SPT-only sand layer with no lab c/phi)
from the nearest layer(s) above/below, or a borehole-wide average as a last resort. The
one exception is overburden density (`gamma_avg_above_t_m3`, the shear surcharge term)
— that's computed as a thickness-weighted average across every layer from ground level
to the founding depth, because it's a genuinely borehole-wide quantity by definition,
not one layer's property (cohesion/phi/N/Cc/e0 stay layer-specific with
neighbour/average fallback, since those really are properties of one stratum).
Every result row shows which `founding_layer` and `soil_type` were actually used, so
the auto-sourcing is never a black box.

**Manual overrides.** A collapsible panel lets Raahi pin any of: cohesion, friction
angle, bulk density, overburden density, specific gravity, moisture content, N-value,
Cc, e0, elastic modulus, or force soil_type — any filled field skips auto-sourcing for
that field across the whole batch. This is the escape hatch when the auto-picked value
isn't trusted or a what-if scenario is being tested.

Backend: `run_batch_matrix()` + helpers `_founding_layer()`, `_resolve_field()`,
`_weighted_overburden()` in `services/calculators.py` (reuses the exact same
`bearing_capacity_is6403_shear` / `settlement_sbc_is8009_*` functions — no duplicated
formulas), `POST /api/calculators/batch` in `routers/calculators.py` (now passes ALL of
`profile.layers`, not one `layer_id`). A combination that individually fails (e.g. N≤3
for the granular chart, or truly no layer anywhere has a required field and no override
was given) is captured as a per-row `error` instead of aborting the whole batch.
Verified against a mock 3-layer borehole (clay/SPT-only-sand/clay) with direct
`run_batch_matrix()` calls — confirmed per-depth founding-layer selection, exact
neighbour-average fallback math, exact weighted-overburden math, and override
precedence, all against hand-calculated expected values (see chat history for the
worked numbers if this needs re-verifying later).

**Progress bar (mandatory requirement from Raahi).** The frontend does NOT send one
giant request — it calls `/api/calculators/batch` once per width value (all depths for
that width per call) and updates a real progress bar after each call completes, then
merges all the returned combinations client-side. This makes the progress bar reflect
actual completed work, not a simulated animation. If a future batch-style feature needs
progress feedback, reuse this same "chunk the request, update progress per chunk"
pattern rather than trying to stream progress from a single request.

**Borehole Log** — full professional field-borelog format: multi-sample layers (D/P/U/C/V/W
types), SPT increments (0-150/150-300/300-450 → N), core recovery/RQD, full USCS group
symbol hatching (GW/GP/GM/GC/SW/SP/SM/SC/ML/MI/MH/CL/CI/CH/OL/OI/OH/Pt + rock grades
I-V) with density-graduated patterns by plasticity. Prints to A4 landscape, empty header
fields auto-hide from print. **Note:** IS codes don't actually mandate graphical hatch
patterns (checked IS SP 36/IS 1498 directly) — these are industry-convention patterns.

**Lab Data Import** (`/lab-reports`) — downloadable Excel template (denormalized: one row
per soil layer, Borehole ID/Project/Water Table repeated per row) → upload → parses into
`BoreholeProfile` + `SoilLayer` DB records. This is meant to be the **shared data source**
for everything else (see Roadmap).

**Soil Profile Viewer** (`/soil-profile`) — was undocumented until now, but is fully built,
not a placeholder. Side-by-side stratigraphy columns for multiple boreholes at once (depth
scale, USCS classification color/pattern hatching reusing the Borehole Log page's
convention, water table line, zoom slider), hover a layer to see its properties (N-value,
cohesion, φ, UCS, RQD, etc). **Purely a visualization/comparison tool — runs no
calculation.** Different from Batch Analysis (which runs the shear+settlement SBC matrix
for one layer but draws no chart) even though both start with a borehole/layer picker
reading the same data — one looks at the ground, the other sizes a foundation.

**Dashboard** — quick actions + stats for every real feature above.

## Known limitations / honest gaps

- Batch engine's width × depth grid is a cross-product only (every width against every
  depth) — no way yet to submit an arbitrary explicit list of (width, depth) pairs that
  skips some combinations. (Multi-layer stratification across the borehole IS handled
  now, per-depth, since the v2 redesign — see "What's built" above.)
- Batch engine's neighbour/average fallback for a missing field treats every field the
  same way (nearest layer above+below, averaged) — it doesn't know that, say, borrowing
  specific gravity from a totally different soil type two layers away is less trustworthy
  than borrowing bulk density. Always check the `founding_layer` column and override
  anything that doesn't look right for the actual site.
- No liquefaction calculator yet.
- No pile capacity calculator yet.
- Settlement calculators treat the depth-of-influence as ONE representative layer, not
  true multi-layer stratification (a simplification from the source Excel workbook, which
  did real per-layer stratification with iterative depth-of-influence convergence).
- `Projects`, `PDF Chat`, `Bookmarks` are still honest "Coming Soon" placeholders in the
  sidebar (see `frontend/src/pages/planned/ComingSoon.tsx` usage). Soil Profile Viewer was
  wrongly listed here in older versions of this doc — it's actually fully built (see
  "What's built" above).

---

## Roadmap (agreed with Raahi, in order)

The end goal: upload lab sheet → get every calculation + a formatted report, for 100+
foundation combinations, in ~1 hour instead of a full day. Phases:

1. **✅ DONE — Lab data import.** Standardized Excel template + parser + BoreholeProfile/
   SoilLayer storage (`/api/lab-data/*`).
2. **✅ DONE — Wire borehole profiles into the calculators.** Analysis page has a "Load
   from Borehole Profile" panel: pick a saved borehole + layer, click Apply, and matching
   fields (N-value, cohesion, friction angle, densities, Cc/e0, water table depth, etc.)
   auto-fill for whichever calculator is open. Project-specific fields (footing size,
   allowable settlement, FOS) are deliberately left for manual entry. Unit conversions
   (t/m² ↔ kPa) are handled where a calculator uses different units than the stored data.
3. **✅ DONE — Batch/matrix engine.** `/batch-analysis` page + `POST /api/calculators/batch`.
   Pick a borehole + layer, enter comma-separated width and depth lists, runs shear +
   settlement SBC for every combination (cross-product, up to 400 at once) and returns a
   results table with the lowest-recommended "critical combination" called out. See
   "What's built" above for implementation details.
4. **NEXT — New calculators:** Liquefaction (IS 1893 simplified procedure, SPT-N based) and
   Pile Capacity (IS 2911, static formula via SPT-N or C-φ).
5. **Auto-report generation.** Combine borehole log chart + batch calculation results +
   summary into one downloadable Word/PDF report.

If you're picking this up fresh: **ask Raahi which phase they're on** before assuming:
they may have skipped ahead or asked for something adjacent (this has happened before —
e.g. the borehole log request came in and grew into a much bigger feature than initially
scoped).

---

## Debugging playbook (things that have bitten us before)

1. **500/503 errors from /api/chat, /api/search, upload indexing:** almost always either
   (a) `GEMINI_API_KEY` not set on Render, or (b) a Gemini model name got retired — check
   `/api/health` first, then Render logs (search "ERROR" or the specific router name like
   `[ingest]`, `[chat]`). Every router logs step-by-step already; read the logs before
   guessing.
2. **Deploy fails with `ResolutionImpossible` / dependency conflicts:** a new package
   (like `google-genai`) needs a newer `pydantic` than what's pinned. Use version ranges
   (`>=x,<y`) not exact pins for `pydantic`/`pydantic-settings` to give pip room to resolve.
3. **Deploy fails with `Client.__init__() got an unexpected keyword argument 'proxies'`:**
   httpx/openai version mismatch (this was from the old OpenAI-based version; shouldn't
   recur now that we're on Gemini, but the pattern — an unpinned transitive dependency
   silently updating and breaking an SDK — is worth remembering).
4. **"Root directory does not exist" on Render deploy:** almost always means a folder
   (usually `frontend`) didn't actually get copied back into `~/geomind-ai` on the phone
   before `git push` — the commit ends up deleting all those files. Always `ls` the
   extracted zip AND the destination folder before committing, not after.
5. **Borehole log / lab data disappearing:** expected on Render free tier unless
   `CHROMA_API_KEY` and `DATABASE_URL` are both set — see "Persistent storage" above.

---

## How to give Raahi an update (workflow reminder for whoever's helping)

1. Make code changes in your own sandbox, verify with `python3 -m py_compile` (backend,
   whole tree not just changed files) and `tsc --ignoreConfig --noEmit --skipLibCheck --jsx
   react-jsx` (frontend — a real global `tsc` binary is available even though
   `node_modules` isn't; ignore `TS2307`/`TS7xxx`/module-not-found noise, those are just
   missing `node_modules`, but treat any `TS1xxx` as a real syntax error). For pure-logic
   backend functions (no DB/FastAPI needed), test them directly with a mock object
   (`types.SimpleNamespace`) standing in for the SQLAlchemy model — this catches real bugs
   without needing `fastapi`/`sqlalchemy` installed, which they aren't in the sandbox.
2. Zip the whole project (exclude `data/uploads/*`, `data/chroma/*`, `node_modules`,
   `__pycache__`), present it as a download.
3. Give copy-paste Termux commands: `unzip -o ... -d geomind-new`, `rm -rf` + `cp -r` the
   specific changed folder(s) (`backend`, `frontend`, or both), then `git add/commit/push`.
4. Remind them to verify `ls` output at each step before moving on — silent copy failures
   have happened before and are hard to debug after the fact.
5. Any new required environment variables → tell them exactly which Render service's
   Environment tab to add them in, and that it triggers an automatic redeploy.
