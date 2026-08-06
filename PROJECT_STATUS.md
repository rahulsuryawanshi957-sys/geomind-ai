# RaahiGeo — Project Status & Handoff Document

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
- **Custom domain:** raahigeo.in is now live (added 2 Aug 2026, per Raahi). Raahi says it
  points at **both frontend and backend** -- but one domain can't directly point at two
  separate Render services without subdomains (e.g. `api.raahigeo.in` for the backend); this
  hasn't been confirmed yet (asked Raahi for a screenshot of the Render custom-domain
  settings, not yet received). **Still unconfirmed:** whether the backend's CORS
  allowed-origins list includes whatever domain(s) are actually in play. If login or any API
  call from raahigeo.in fails with a CORS error or "Failed to fetch", check this first (see
  playbook #43 for a similar past dead-end with cross-checking the wrong Render service URL).
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
frontend/          React + TypeScript + Vite + Tailwind. Enterprise geotech-platform
                      theme (4 Aug 2026 redesign) -- light workspace by default
                      (bg #F6F8FA, white cards, #E2E8F0 borders, #0F172A text, #0EA5A4
                      teal accent), dark mode toggle available.
  src/pages/        One file per route (Chat, Books, Calculators, BatchAnalysis,
                      BoreholeLogs, etc.)
  src/pages/planned/  Features that started as "Coming Soon" placeholders -- some have
                      since been built out for real (BoreholeLogs.tsx, LabReports.tsx,
                      SoilProfile.tsx). Still-placeholder: Projects, PdfChat, Bookmarks,
                      PileGroup, RaftFoundation (added 4 Aug 2026). GroundImprovement was
                      also added 4 Aug 2026 as a placeholder but is now a REAL module
                      (built out 5 Aug 2026, see PROJECT_STATUS #60).
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
- **Retaining Wall (`/retaining-wall`, 3 Aug 2026)** — geotechnical checks only (earth
  pressure, water pressure, seismic, stability, IS 6403 bearing capacity, settlement) --
  see playbook entry below for the full build/verification trace.
- Still stubbed (`PLANNED_CALCULATORS` in `calculators.py`): raft/isolated footing,
  group efficiency, plate load test, modulus of subgrade reaction (standalone), rock
  bearing capacity, safe bearing capacity. (This list was stale before 3 Aug 2026 --
  pile capacity, liquefaction, and retaining wall were already built; corrected here.)

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

*Fix applied 22 Jul 2026, commit `a410da2`, done in a separate Claude session (not this
one).* Fixed missing table cells/header fields in `frontend/src/pages/planned/LabReports.tsx`:
Easting/Northing/RL/Date header fields and the Sample + Cc table body cells weren't
rendering. Applied via a Python patch script (`patch_labreports_v2.py`) run locally in
Termux, not hand-edited. *(This session re-synced from a fresh zip on 24 Jul 2026 and
confirmed this fix is present and intact -- see entry 12 in the debugging playbook for
why re-syncing before touching frontend files matters when more than one Claude session
is working on this project.)*

**Borehole Log** also picked up related improvements in that same separate session (same
sync, same commit range): sample-type mapping now uses the backend's real `sample_type`
field when present (falls back to inferring from `n_value`/`core_recovery_pct`/etc. only
for older uploads without it), `date_of_boring` gets parsed into start/end date fields,
and Easting/Northing/RL now auto-fill from the borehole profile instead of needing manual
re-entry.

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
- ~~No liquefaction calculator yet~~ / ~~No pile capacity calculator yet~~ -- **stale, corrected
  2 Aug 2026:** a codebase audit found `LiquefactionAnalysis.tsx`, `PileCapacity.tsx`, AND
  `LateralCapacity.tsx` (the last one wasn't even mentioned in this doc before) all fully
  built, routed in `App.tsx`/`Sidebar.tsx`, and backed by real endpoints
  (`/api/calculators/liquefaction`, `/pile`, `/lateral` in `pile_calculator.py`/
  `calculators.py`). This doc's Roadmap section below was not kept in sync with actual
  code -- see the Roadmap correction note.
- Batch Analysis settlement IS true multi-layer now (see debugging playbook #8) -- but the
  single Calculators.tsx page's standalone Settlement calculator still is NOT (playbook
  #11). Also: no submerged/buoyant unit weight adjustment anywhere yet when the water
  table is shallow -- open question, see playbook #10, needs Raahi's input before fixing.
  Elastic (immediate) settlement is off by default in the multi-layer engine -- see the
  engine's own `warnings` output for what a given run actually included. Water-table
  correction (Aw) on granular sub-layers, manual Influence Zone override, and a fully
  transparent per-layer report (layer boundaries, method used, SPT/Es source, stress
  increase, running settlement) were all added 25 Jul 2026 -- see playbook #17.
- `Projects`, `PDF Chat`, `Bookmarks` are still honest "Coming Soon" placeholders in the
  sidebar (see `frontend/src/pages/planned/ComingSoon.tsx` usage). Soil Profile Viewer was
  wrongly listed here in older versions of this doc — it's actually fully built (see
  "What's built" above).
- **Rock Bearing Capacity** (added 4 Aug 2026, IS 12070) — the Clause 7 (pressuremeter)
  formula was reconstructed from an OCR-garbled scan and is NOT independently verified
  against a clean copy of the code — flagged with an in-app warning, but treat with more
  caution than the other 4 methods until someone checks it. Clause 8 (plate load test) is
  a direct pass-through of a field-read value, not a computed formula — this is
  deliberate (the code itself has no clean closed-form equation here), not a gap to fix.

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
4. **✅ DONE — Liquefaction, Pile Capacity, AND Lateral Capacity.** IRC:SP:114 / IS
   1893:2016 simplified procedure (Seed-Idriss CSR, NCEER 1997 CRR curve fit,
   Idriss-Boulanger fines correction/Ksigma/MSF), `run_liquefaction_analysis()` in
   `calculators.py` + `POST /api/calculators/liquefaction` -- reads the SAME borehole/
   SoilLayer records already used for SBC batch analysis (Raahi's request: "isko bhi
   soil sheet se connect karna"). See debugging playbook #21 for the full build/audit
   notes and the one deliberate deviation from the source Excel (water-table-aware
   effective stress). **Correction, 2 Aug 2026:** this item previously said "no frontend
   yet" for Liquefaction and "Pile Capacity is next, not started" -- both were stale. A
   codebase audit found `LiquefactionAnalysis.tsx`, `PileCapacity.tsx` (IS 2911, with a
   natural-language command parser), and `LateralCapacity.tsx` all fully built, routed,
   and backed by working endpoints (`pile_calculator.py`: `run_pile_capacity`,
   `parse_pile_command`, `run_lateral_capacity`; routes `/api/calculators/pile` and
   `/lateral`). All three are done. **If you're picking this up fresh, ask Raahi to
   confirm current status rather than trusting this roadmap blindly** -- it has drifted
   from actual code before.
5. **Auto-report generation.** Combine borehole log chart + batch calculation results +
   summary into one downloadable Word/PDF report. **Still the next real open item**, as
   far as this doc can tell after the 2 Aug 2026 audit above.

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
6. **Python patch scripts that insert code by matching an "anchor" string can silently
   apply fewer fixes than expected** if the live file has a different unicode character
   at the anchor point than the script expects (curly quote vs straight quote, en/em-dash
   vs hyphen, non-breaking space vs regular space). If a patch script's "applied" count is
   lower than the number of intended fixes, check for a unicode mismatch at the anchor
   before assuming the fix logic itself is wrong.
7. **CRITICAL BUG, fixed 23 Jul 2026: shear SBC was being compared against settlement SBC
   on inconsistent bases (gross vs net).** `bearing_capacity_is6403_shear()` was silently
   adding `γ_avg_above × D` before returning `result` (mislabeled "gross allowable SBC"),
   while both `settlement_sbc_is8009_*()` functions return net SBC with no such addition.
   Every `min(shear, settlement)` comparison in the app (single calculator's "take the
   lower of the two" guidance AND the batch engine) was therefore comparing a gross number
   against a net one -- shear looked artificially higher than it should relative to
   settlement by exactly `γ_avg_above × D` every time. Caught by comparing against Raahi's
   reference workbook (`SBC_Cal_Fixed.xlsm`, `Shear!H47` = net, confirmed via the
   `SUMMARY` sheet's separate `I` "SHEAR", `J` "SETTLEMENT", `K` "RECOMMENDED SBC" columns,
   which are all net -- `N` "GROSS ALLOWABLE" is a distinct column computed **once**, on
   the already-minimized recommended value, not independently per method). Fix: shear now
   returns net SBC like settlement does; the batch engine adds a separate
   `gross_recommended_sbc` field computed the same way the reference workbook does (once,
   on `min(shear, settlement)`), not by gross-converting each method independently before
   comparing. **Lesson: when a calculator's output is going to be compared against or
   combined with another calculator's output (min, sum, etc.), verify they're on the same
   basis (units, net vs gross, before vs after a correction) -- a plausible-looking,
   correctly-computed number can still break a comparison it's used in.**
8. **UPDATE 23 Jul 2026: the multi-layer settlement gap from entry above is now built** --
   `run_settlement_multilayer()` in `services/calculators.py`, replacing
   `settlement_sbc_is8009_noncohesive/cohesive()` inside `run_batch_matrix()` (those two
   single-layer functions still exist and still power the single Calculators.tsx page's
   standalone Settlement calculator -- not yet migrated, see entry 11). Splits the
   influence zone `[D, D+1.5B]` at the borehole's real layer boundaries, computes each
   sub-layer's own consolidation (NCS log-formula or OCS linear) or IS:8009 Fig-9
   settlement using that sub-layer's own P0/Iz, sums them, Fox+rigidity-corrects, then
   **numerically solves (bisection) for the pressure hitting the target allowable
   settlement** -- direct closed-form inversion isn't possible once cohesive (log-
   nonlinear) and granular (linear) sub-layers are mixed in the same sum. Verified against
   the reference workbook's own worked example to 9 decimal places (`3.2524220291` vs
   `3.2524220290942716`) once entry 9's bug was also fixed and `lambda_correction=0.7`
   was supplied to match that example's configuration.
9. **BUG, fixed alongside #8: Boussinesq/Steinbrenner depth was measured from the wrong
   origin.** Both old single-layer settlement functions computed `z_mid = depth_m +
   0.5*H` (measuring from GROUND SURFACE) and fed that directly into the Iz and
   Steinbrenner-O formulas. Those formulas need depth measured from the **footing base**
   (where the stress bulb actually originates), not from ground level -- P0/overburden
   stress is correctly surface-referenced, but Iz is not, and both functions used the
   same (surface-referenced) value for both. Confirmed via the reference workbook: with
   the bug, computed Iz=0.504; footing-base-referenced, Iz=0.628, matching the workbook's
   implied value (back-calculated from its settlement output) almost exactly. Fixed in
   both the old single-layer functions (now split into `z_mid_surface` for P0 and
   `z_below_footing` for Iz/Steinbrenner) and built correctly from the start in the new
   `run_settlement_multilayer()`.
10. **OPEN QUESTION, not yet resolved: submerged/buoyant unit weight isn't applied
    anywhere in this app's overburden calculations.** Discovered while verifying #8/#9 --
    the reference workbook's `Shear!H19` ("Average Bulk Density of Soil Above Foundation
    Level") was 0.81 t/m³ for a site with the water table at ground level, which is a
    submerged/buoyant unit weight (roughly `saturated_density - 1.0`), not a raw bulk
    density (which would read more like 1.5-1.6 t/m³ for the same soil). This app's
    `bulk_density_t_m3` field and every overburden calculation built on it (Shear's
    `_weighted_overburden`, Settlement's `_cumulative_overburden_stress`) currently use
    the raw value with no submerged adjustment below the water table -- meaning P0 comes
    out too HIGH when water is shallow, which understates settlement, which OVERSTATES
    the settlement-based SBC (unconservative) for shallow-water-table sites specifically.
    Confirmed present but not root-caused: unclear whether Raahi's lab data entry already
    stores a submerged value in `bulk_density_t_m3` when relevant (in which case there's
    no bug, just a labeling question), or whether a proper fix needs a separate stored
    `saturated_density_t_m3` field plus a below-water-table `-1.0 t/m³` adjustment applied
    automatically. **Needs Raahi's input on how density data is actually entered/stored
    before attempting a fix** -- guessing at this one risks making it worse, not better,
    given it's already a safety-relevant (unconservative) direction.
11. **Follow-up not yet done:** the single Calculators.tsx page's standalone "Settlement"
    calculator still uses the old single-layer functions (bug #9 fixed there too, but
    still single-layer, not multi-layer like the batch engine now is). Migrating it to
    multi-layer would mean it needs a borehole selection instead of one manually-loaded
    layer, similar to how Batch Analysis works -- a real UX change, not just a formula
    swap.
12. **Raahi actively works on this project across MULTIPLE Claude sessions in parallel**
    (this one, and at least one other that produced the LabReports/BoreholeLogs fixes
    above). A Claude session's sandbox is a point-in-time snapshot from whatever zip it
    was given -- it has NO live access to the actual GitHub repo (no internet in the
    sandbox) and will NOT automatically see changes another session made. Concretely
    this bit us once already: a zip delivered from a stale sandbox would have reverted
    the LabReports.tsx fix if Raahi had applied it before catching the mismatch. **Before
    delivering any change that touches a file another session might also be touching
    (frontend especially), ask Raahi whether other sessions have made changes since your
    sandbox was last synced, and if there's any doubt, ask for a fresh zip (repo page →
    Code → Download ZIP) rather than assuming your sandbox is current.** Backend-only
    changes are lower-risk to ship from a possibly-stale sandbox IF you've confirmed
    (e.g. via diff against a fresh zip, or by asking) that no other session touches
    backend files -- but confirm, don't assume.
13. **Renamed 24 Jul 2026: "RaahiGeo AI" -> "RaahiGeo"** (dropped "AI" from the product
    name) across the app title (`index.html`), sidebar/chat/history UI labels, the
    backend's FastAPI title and startup logs, the LLM system prompt's self-identification,
    `README.md`, and this file. `frontend/package.json`'s internal `name` field
    (`raahigeo-frontend`) wasn't touched -- it's a package identifier, not user-facing
    branding, and never had "AI" in it to begin with.
14. **BUG, fixed 24 Jul 2026, found via live testing on real project data (BH-01, Mokama
    to Munger Highway, Bihar):** `_cumulative_overburden_stress()` silently skipped any
    layer segment missing `bulk_density_t_m3` (treated it as zero contribution) instead
    of falling back to a nearby layer like `_resolve_field()` already does for shear's
    cohesion/phi. SPT-only layers very commonly lack lab-tested bulk density, so on a
    borehole with several SPT-only layers near the founding depth, cumulative overburden
    could come out to zero (or even negative from floating-point noise), which aborted
    the whole settlement calculation with "overburden stress works out to zero or
    negative." Also added an "L (m)" column to the Batch Analysis results table --
    footing length was always being used correctly, but with no column showing it, Raahi
    (reasonably) couldn't tell from the UI whether it was.

    **Same live-testing round also found two more instances of the identical pattern**
    inside `run_settlement_multilayer()` itself: `compression_index_cc`, `initial_void_
    ratio_e0`, and `n_value` were all read with a plain `getattr()` and no fallback,
    so a real layer with SOME but not all lab data (e.g. Cc recorded but not e0 -- a
    real gap hit on this same borehole, at its 2.5-2.8m layer) hard-failed instead of
    borrowing from a neighbour. Fixed by routing all of these through `_resolve_field()`
    too, same as overburden density above.

    **A related, more fundamental bug found in the same pass:** whether a layer was
    treated as cohesive vs granular was being decided by "does this layer have
    compression_index_cc" -- i.e. by which lab test happened to be run, not by the
    soil's actual type. An SPT-only CI (clay) layer -- exactly what much of BH-01 is --
    would get MISCLASSIFIED as granular purely because Cc wasn't tested, and then run
    through the sand-only IS:8009 Fig-9 chart, which is physically wrong for clay. Fixed
    to use the layer's actual USCS `classification` first (C../M.. prefix = cohesive,
    S../G.. = granular), only falling back to "does it have Cc" when a layer has no
    classification recorded at all. Applied in both `run_settlement_multilayer()` and
    the batch loop's own soil-type display logic in `run_batch_matrix()`.

    **General lesson reinforced three times in one debugging session:** any field read
    directly off ONE layer via `getattr()`, without going through `_resolve_field()`'s
    borehole-wide fallback, is a latent bug waiting for real field data (which is messy
    and incomplete far more often than clean test data suggests) to hit it. When adding
    a new field to the batch/settlement engines, route it through `_resolve_field()`
    unless there's a specific reason not to.
15. **BUG, fixed 24 Jul 2026, found immediately after #14 on the same borehole (which
    turns out to have NO `initial_void_ratio_e0` anywhere at all -- not a gap, a total
    absence for this field):** manual overrides for `compression_index_cc`,
    `initial_void_ratio_e0`, `n_value`, and `bulk_density_t_m3` were silently ignored by
    `run_settlement_multilayer()` and `_cumulative_overburden_stress()` -- Raahi typed a
    value into the Manual Overrides panel and the settlement engine never looked at it,
    since these two functions only checked each layer's own data plus `_resolve_field()`
    fallback, never the `overrides` dict. (Shear's `field()` closure in `run_batch_matrix`
    already checked overrides correctly -- this bug was specific to the settlement side,
    introduced when the multi-layer engine was built without wiring overrides all the way
    through.) Fixed: both functions now take an `overrides` param and check it before
    `_resolve_field`, and `run_batch_matrix` passes the full overrides dict through to
    settlement, not just `elastic_modulus_t_m2`/`lambda_correction`/`include_elastic`.
    **When a borehole has no data at all for some field even a good fallback can't fix,
    manual override is the ONLY way through -- so a bug that makes overrides silently
    do nothing looks, to the user, exactly like the calculator is broken, not like a
    one-line wiring gap.** Worth remembering next time an override doesn't seem to work.

16. **Excel-vs-code audit, 24 Jul 2026: compared `SBC_Cal_Fixed.xlsm` (reference workbook)
    formula-by-formula against `bearing_capacity_is6403_shear()` and
    `run_settlement_multilayer()`.** Confirmed MATCH on: void ratio/dry density formula,
    Nq/Nγ Meyerhof factors, local-shear φ' reduction, shape/depth factors, water-table
    Rw 3-zone logic, gross-SBC-computed-once-on-recommended, shear-vs-settlement
    governing logic. Two findings acted on:
    - **BUG FIXED:** at φ=0 (purely cohesive), the reference workbook uses Nc=5.14 for
      GENERAL shear (`Shear!H26`, classic Prandtl) but Nc=**5.7** for LOCAL shear
      (`Shear!H29`) -- a different constant, not the same one twice. The shared
      `bearing_factors()` helper was using 5.14 for both. Fixed: `bearing_factors()` now
      takes an explicit `nc_at_zero` param (5.14 for general, 5.7 for local).
    - **GAP FILLED (per Raahi's decision):** added a Cc (compression index) auto-estimate
      fallback in `run_settlement_multilayer()`, matching the reference workbook's
      Input!Z-column "VOID RATIO" branch: `Cc = 0.3*(e0-0.27)`, used only when no lab-tested
      Cc exists anywhere on the borehole (after `_resolve_field`'s normal neighbour-layer
      fallback also comes up empty). The workbook has a second correlation option
      (liquid-limit based, `Cc = 0.009*(LL-10)`, Terzaghi & Peck) gated by a toggle
      (`Input!$AH$2`) -- **not implemented**, since it needs a `liquid_limit_pct` field
      that doesn't exist yet on `SoilLayer` (would need a model + lab-data-template
      migration, out of scope for this pass). The `layers_used` transparency string now
      notes when Cc was estimated vs lab-sourced, so this is never a silent black box.
    - **Explicitly declined by Raahi, do NOT add without asking again:** a "WORST case"
      water table toggle (`Input!AF4="WORST"` forces Rw=0.5 regardless of actual water
      table depth). Exists in the reference workbook; Raahi said not needed for this app.
    - **Confirmed intentionally different, NOT a bug:** the workbook computes
      `gamma_avg_above` (overburden density) as a plain average of test-row densities
      above the footing depth (`AVERAGEIFS` on raw lab rows), while this app's
      `_weighted_overburden()` uses a thickness-weighted average across the borehole's
      layer model. Raahi confirmed: keep the current thickness-weighted approach.
    - **Not fully audited (flagged, not chased further this pass):** `Input!AC3` site-
      condition modifiers (Filled up / Scourable Depth / Basement / Disturbed Soil) change
      which density feeds `gamma_avg_above` and, for Filled up, add a fixed density
      override -- only scour (`scour_correction_m`, already a param on
      `bearing_capacity_is6403_shear`) has an equivalent in this app. Also,
      `Input!$AJ$2` ("WEIGHTED AVERAGE?") toggles between two different lookup branches
      inside the workbook (a direct depth-indexed average vs an alternate `BI`-column
      path) -- this specific project's workbook has it set to the second branch, which
      wasn't traced to full depth. Worth a closer look if a future borehole's numbers
      don't match the workbook's, but not chased blind given the size of the workbook
      (~6,400 formulas) and the risk of guessing on something this safety-relevant.

17. **Excel audit + settlement engine improvements, 25 Jul 2026, prompted by Raahi's
    request to "rebuild the SBC Batch Analysis engine to exactly match the Excel
    workbook."** Re-audited `SBC_Cal_Fixed.xlsm`'s `Settlement-1/2/3` sheets formula-by-
    formula (not just the shear sheet, which entry #16 already covered) against
    `run_settlement_multilayer()`. **Finding: the core architecture Raahi asked for
    (settlement starts exactly at Df with the first geological layer split at Df, not at
    its own top; every contributing layer inside the Influence Zone is summed, not just
    the founding layer; the calculation stops exactly at the Influence Zone boundary) was
    already correct** -- built during the entry #8/#9 rework on 23-24 Jul, before this
    request came in. Re-rebuilding an already-correct, already-tested engine from scratch
    would have been pure risk with no upside, so this pass **patched the two real gaps
    the audit found** instead of a blind rewrite:
    - Water-table correction (Aw, per the same 3-zone formula the single-layer granular
      function already had) was computed nowhere in the multi-layer engine -- granular
      sub-layer settlement was silently uncorrected for water table depth. Now applied to
      every granular sub-layer.
    - No way to manually override the Influence Zone (only the `Df + 1.5B` automatic
      multiplier existed). Added `overrides["influence_zone_m"]` (absolute thickness
      below Df); the result now always states `influence_zone_mode`: "Automatic" or
      "Manual", per Raahi's report-transparency requirement.
    - Added `layer_report`: a structured (not just a text string) per-sub-layer
      breakdown -- effective from/to, thickness, soil type, method used (with silt
      explicitly labelled "Cohesive (incl. Silt)"), SPT-N used + its source
      (own layer / borrowed / override), elastic modulus used + source, stress increase,
      per-layer settlement, and running cumulative settlement -- so Raahi can verify every
      step without reading code, per the report-transparency requirement. Exposed on each
      batch row as `settlement_layer_report`.
    - `water_table_depth_m` (borehole's own, or `overrides["water_table_depth_m"]`) is now
      actually passed from `run_batch_matrix()` into `run_settlement_multilayer()` -- it
      was being fetched from the profile and used for shear, but never forwarded to
      settlement at all before this fix.
    **Confirmed by re-audit, not changed:** the reference workbook has only TWO soil
    routing categories, COHESIVE and NON-COHESIVE -- silt (MI/MH/ML) is COHESIVE in the
    workbook (uses the clay consolidation method), there is no separate third "silt
    method." This app's classification logic (`classification[0] in ("C","M")` = cohesive)
    already matched this exactly; confirmed with Raahi before proceeding rather than
    inventing a new method that would diverge from the Excel source of truth.
    Verified with a synthetic 4-layer profile (sand/clay/sand/clay spanning Df) that the
    first sub-layer correctly starts at Df (not the geological layer's own top), the
    running settlement sums exactly to the target allowable settlement at the solved SBC,
    and both the manual Influence Zone override and the water-table Aw correction change
    the result in the expected direction. **Not yet re-verified against BH-01's actual
    live numbers with this change** -- do that before treating this as fully closed.

18. **Frontend added 25 Jul 2026, per Raahi's request "influence zone change karne ke liye
    optional option chahiye, our sabka backend calculation bhi show/print karna hai":**
    the backend (entry #17, from a parallel session) already supported
    `overrides["influence_zone_m"]` (manual Influence Zone override) and a fully
    structured `layer_report` for settlement -- neither was exposed in the UI yet.
    Added in `frontend/src/pages/BatchAnalysis.tsx`:
    - "Influence Zone override (m)" as a normal entry in the existing generic Manual
      Overrides panel (blank = automatic Df+1.5B, same as before).
    - A "▸ Full calc" toggle per result row showing: Influence Zone mode/note,
      water-table correction note, the shear (IS:6403) step-by-step working (was
      already computed by `bearing_capacity_is6403_shear()` but never passed through
      `run_batch_matrix()` to the row before this -- small backend addition,
      `row["shear_steps"]`), and the settlement structured `layer_report` as a proper
      table (effective layer range, soil type, method, N used + source, Es used +
      source, stress increase, per-layer settlement, running total).
    - Same pattern as entry #18(old)/#19's "▸ Layers" toggle: hidden on screen unless
      expanded, but forced visible when printing (`print:table-row`) regardless of
      on-screen state -- so the printed report always includes the complete backend
      calculation. **Note: the older settlement-only "▸ Layers" toggle from the 24 Jul
      session (using `settlement_layers`, the plain-text version) was not present in
      this codebase when this session picked the project back up -- possibly never
      pushed, or overwritten some other way. This session's "▸ Full calc" toggle
      replaces and supersedes it (uses the richer structured `settlement_layer_report`
      instead of the plain-text `settlement_layers`) -- if `settlement_layers` /
      `layers_used` ever seems to have vanished again, this is why: it's superseded,
      not missing.**
19. **CRITICAL BUG, fixed 25 Jul 2026, found by Raahi on real BH-05 data (Pirpainti):**
    `_founding_layer()`'s gap handling was wrong. It correctly clamped to the shallowest
    layer when depth was above everything, and to the deepest layer when depth was below
    everything -- but for a depth landing in a GAP *between* two recorded layers (very
    common: real borehole logs have un-sampled intervals between SPT test depths), it
    fell through to the same "deepest layer" branch as the below-everything case. Result:
    a footing at D=4m on a borehole with a gap between ~3.45m and 4.5m returned a
    founding layer at 30m depth -- the deepest layer in the *entire* borehole, tens of
    metres away, not the nearest one. Every downstream value (shear's c/phi/depth
    factors, which soil type got used, everything) was consequently wrong. Fixed to use
    genuine nearest-boundary logic for a mid-borehole gap (compares distance to the
    layer above's bottom vs the layer below's top, picks whichever is closer).

    **Same root cause, second symptom:** the settlement influence zone's sub-layer
    construction only included borehole layers that actually overlapped
    `[depth_m, depth_m+1.5B]` -- if the zone started in a gap (as above), the first
    real sub-layer could start well after Df, silently shrinking the accounted-for
    thickness (Raahi's report: settlement started at 4.5m instead of 4m for a 4m-deep
    footing). Fixed: any gap inside the influence zone (start, middle, or end) is now
    filled by borrowing the nearest layer's properties for that thickness, same
    nearest-boundary principle as the founding_layer fix, flagged as `gap_filled: true`
    per row so it's visibly distinguishable from a real logged layer.

    **Also added, per Raahi's request for a way to manually verify settlement by
    hand:** each `layer_report` row now includes a `working` string -- the actual
    IS:8009 formula (NCS log formula / OCS linear / Fig-9 chart, whichever applies)
    with every number plugged in, e.g. `Sc = (H/(1+e0))·Cc·log10((P0+Δσ)/P0)·1000 =
    (0.45/(1+0.720))·0.2500·log10((3.19+1.878)/3.19)·1000 = 13.15 mm -> ×Fox×Rigidity
    = 9.56 mm`. Shown as an italic sub-row under each layer in the "▸ Full calc" table
    on the frontend. Gap-filled rows are marked with a "~" prefix on the depth range.

20. **UI clarity + two override-exposure gaps, fixed 25 Jul 2026, both raised by Raahi
    while reading his own "Full calc" output against IS:6403/8009 directly:**
    - The "Founding layer" column showed the raw borehole layer's own boundaries (e.g.
      "1.95-2.25m"), which Raahi reasonably read as "the calculation starts at 1.95m" --
      it doesn't; settlement always starts exactly at Df (visible in the settlement
      table's own first row). Relabelled to "Founding layer (raw)" with a tooltip on
      both the header and the cell explaining the distinction.
    - `lambda_correction` (IS:8009 Table 1 λ) existed as a working backend override
      (`overrides["lambda_correction"]`, applied as a multiplier on consolidation
      settlement) since entry #17-18's work, but was never added to the frontend's
      `OVERRIDE_FIELDS` list -- there was no way to actually set it from the UI. Added.
    - `include_elastic` existed as a backend flag but had no UI control at all (always
      false, no way to turn it on). Added as a checkbox above Consolidation Type,
      wired through `overrides.include_elastic`.
    - **Confirmed NOT a bug, just needs explaining:** for the default configuration
      (NCS + elastic off, matching the reference workbook's typical setup), the
      settlement formula genuinely doesn't use Elastic Modulus at all -- IS:8009's
      primary consolidation formula only needs Cc/e0/H/P0/Δσ. Es only enters when OCS
      (mv=1/Es) or elastic settlement is explicitly turned on -- both already existed
      in the engine, just weren't exposed until this entry. Fox's depth correction
      factor (the settlement equivalent of shear's depth factors) was already being
      applied the whole time -- visible as "×Fox(...)" in every layer's `working`
      string -- just not obviously labelled as "the depth factor" to someone scanning
      for that exact term.
    - **Still open:** λ is applied as a flat manual multiplier across every cohesive
      layer in a run; the actual IS:8009 Table 1 look-up (which Raahi says depends on
      drainage conditions -- e.g. whether the clay layer is bounded by a sand layer,
      giving single vs double drainage) is NOT implemented, because the actual table
      values/criteria have never been seen in this codebase's context (only the
      *existence* of a "IS-8009(I)-Tab-1 (λ)" cell label in the reference workbook, and
      one example value of 0.7). If Raahi wants this automatic, the actual IS:8009
      Table 1 (a photo, like the IS:6403 Table 3 one that resolved the shear
      Dense/Medium/Loose question) is needed before implementing it -- guessing at
      drainage-condition criteria here is exactly the kind of thing "never guess
      engineering values" (Raahi's own spec doc, 24-25 Jul) warns against.

21. **Feature added 25 Jul 2026, per Raahi's photo of IS:8009 (Part I)-1976 Table 1 +
    Fig. 10:** the λ correction override (`lambda_correction`, existing since entries
    #17-18/#20) required typing a raw number with no guidance on what's reasonable.
    Added a "Clay type (IS:8009 Table 1)" dropdown right above the λ number field in
    Batch Analysis's Manual Overrides panel (`CLAY_LAMBDA_TABLE` in
    `frontend/src/pages/BatchAnalysis.tsx`) with the standard's 4 categories and their
    ranges (very sensitive 1.0-1.2, normally consolidated 0.7-1.0, overconsolidated
    0.5-0.7, heavily overconsolidated 0.2-0.5). Picking a category auto-fills the
    midpoint of its range into the (still freely editable) λ field, with a note
    reminding Raahi it's a range, not a fixed value, and that Fig. 10's pore-pressure-A
    chart gives a more specific number if that data is available. **Deliberately NOT
    implemented:** Fig. 10 itself (the actual λ-vs-pore-pressure-parameter-A curves) --
    digitizing a hand-drawn chart into exact lookup values from a photo risks
    misreading it, and entry #20 already flagged that the *drainage-condition* criteria
    for picking a curve/category in the first place haven't been confirmed either.
    Table 1's textual ranges are unambiguous to transcribe; the curves are not -- if
    Raahi wants Fig. 10 automated later, that needs either digitized curve data he's
    confident in, or explicit accepted-approximation sign-off before guessing at reading
    a scanned graph.

22. **Liquefaction Analysis built, 25 Jul 2026** -- roadmap phase 4, per Raahi's explicit
    "roadmap ka agla step" request. Source of truth: `LIQUEFACTION.xlsx` (ARUN SOIL LAB,
    "Typical Computation of Liquefaction Potential as per IRC:SP:114 / IS:1893", 7 borehole
    sheets, identical formula structure). Audited formula-by-formula, implemented as
    `run_liquefaction_analysis()` in `calculators.py` + `POST /api/calculators/liquefaction`
    in `routers/calculators.py`. **Connected to the existing soil sheet, not a separate
    data-entry flow** (Raahi: "isko bhi soil sheet se connect karna") -- reads the same
    `BoreholeProfile.layers` already used by SBC batch analysis.
    - Full SPT correction chain: (N1)60 = N_observed x CN x CE x CH x CB x CR x CS, with CN
      (overburden correction, capped 1.7), CR (rod length, piecewise on depth+1.5m) computed
      per layer exactly per the workbook's formulas; CE/CH/CB/CS default to the workbook's own
      literal values (1, 1, 1.05, 1) and are overridable.
    - Fines correction (alpha/beta -> (N1)60cs), CRR7.5 (NCEER 1997 curve fit, "NA" i.e. None
      above (N1)60cs=30), Ksigma (via Dr% and the f exponent), MSF = 10^2.24/Mw^2.56, CRR =
      CRR7.5 x Ksigma x Kalpha x MSF, FOS = CRR/CSR -- all per-layer, all exact formula matches.
    - **Real finding from the audit, replicated exactly rather than "cleaned up":** the
      workbook computes (N1)60/(N1)60cs/CRR7.5 for EVERY layer regardless of soil type (no
      soil-type check on those columns at all) -- only Dr% and the final FOS are skipped for
      cohesive/plastic soils, and via TWO DIFFERENT classification lists (Dr%'s skip-list has
      no "MH" but has "Fill"; FOS's skip-list has "MH" but no "Fill", and spells the CL/ML
      mixed class the other way round: "ML-CL" vs "CL-ML"). Both lists kept separate and
      literal, not merged/harmonized -- flagged in the function's own `warnings` output.
    - Required a new field: `fines_content_pct` on `SoilLayer` (didn't exist before -- the
      fines correction needs it for every layer, not just clay). Added to the model, the
      lab-data Excel template (new "Fines Content (%)" column, right after SPT N), the parser,
      and `SoilLayerOut`. **Needed a startup migration** (`main.py`, right after
      `Base.metadata.create_all`) since `create_all` only creates missing tables, not missing
      columns on tables that already exist -- if persistent storage is configured (see
      `/api/health`), an old DB file wouldn't have this column without it; the migration
      does a plain `ALTER TABLE ... ADD COLUMN`, ignoring "already exists" errors, safe either
      way.
    - **One deliberate deviation from the literal Excel, confirmed with Raahi (the one real
      ambiguity found in this workbook):** the source sheet has a "Water table assumed for
      Calculation" input cell that is NEVER actually referenced by any formula in the sheet --
      effective stress subtracts 1 t/m3 (submerged/buoyant unit weight) from EVERY layer
      unconditionally, which only happens to be correct in the example because that
      borehole's water table is at 0m (ground level), so every layer legitimately is
      submerged. Raahi chose (asked directly, didn't guess): apply full bulk density above
      the actual water table depth (no buoyancy) and submerged density (bulk-1) below it,
      splitting a slice that straddles the water table proportionally -- see
      `_stress_increment()`'s docstring for the full reasoning.
    - Validated numerically against the workbook's own cached (data_only) computed values for
      BH-01, depths 1.5m through 22.5m: total/effective overburden stress, CSR, (N1)60,
      (N1)60cs all match to 3-4 decimal places once a real bug was caught and fixed --
      overburden stress increments use the PREVIOUS layer's density for the interval leading
      up to the current point (K[i]=K[i-1]+D[i-1]*(Depth[i]-Depth[i-1]) in the workbook's own
      terms), not the current layer's own density -- an off-by-one that would have silently
      thrown off every downstream number if shipped uncaught.
    - Depth convention: each layer's `from_m` is treated as the workbook's "depth below EGL"
      point (the workbook is one-SPT-test-per-row, not a from/to range like this app's
      SoilLayer model) -- reusing the existing range-based layer records rather than a new
      point-based data shape.
    - **Frontend page added same day** (25 Jul 2026, right after Raahi confirmed the backend):
      `/liquefaction-analysis` (`frontend/src/pages/LiquefactionAnalysis.tsx`, linked in the
      sidebar under Engineering) -- borehole selector (reusing the same picker as Batch
      Analysis), Mw + IS 1893 zone dropdown (or a direct PGA override), water-table override,
      Summary card (liquefiable/non-liquefiable depth ranges, minimum FOS, overall
      conclusion) and a full layer-wise Detailed Report table (depth, soil, N, (N1)60,
      (N1)60cs, CSR, CRR7.5, CRR, FOS, conclusion). Not build-verified with `npm run build`
      (no `node_modules`/network in the sandbox this was written in) -- Raahi should treat
      the first real load after deploying this as the actual verification step, same as any
      other change. Not implemented: lateral spreading / settlement-from-liquefaction
      estimates (the workbook only goes as far as FOS + Liquefiable/Non Liquefiable per
      layer) -- out of scope unless Raahi asks.

23. **BUG, fixed 26 Jul 2026, found by Raahi: Lab Data Import broke for his own
    `BH_Log_Converter_Master` tool's output.** `parse_uploaded_workbook()` required the
    "Soil Data" sheet's header row to match `COLUMNS` EXACTLY, position-for-position --
    so the moment entry #22 added "Fines Content (%)" to the template (right after SPT
    N, for Liquefaction Analysis), every sheet from Raahi's own older converter tool
    (which doesn't have that column) hard-failed on upload with "column headers don't
    match", even though every OTHER column was present and fine. Fixed: header matching
    is now BY NAME (a `header_to_col` lookup), not position or full-set equality --
    only `Borehole ID`, `Project Name`, `Water Table Depth (m)`, `From (m)`, `To (m)`
    are actually required; any other expected column that's simply absent (older
    template, different tool) is now treated as blank for every row (with a warning),
    same as an individual blank cell already was, instead of failing the whole upload.
    Verified directly against Raahi's actual `BH_Log_Converter_Master` file: BH-01,
    20 layers, parses cleanly now (one warning noting Fines Content is blank
    throughout -- expected, since liquefaction analysis on this borehole will need it
    filled in separately if he wants that feature for it). This also means the
    template can keep growing new optional columns in the future without breaking
    every external/older sheet again.

24. **BUG, fixed 26 Jul 2026, found by Raahi live-testing Liquefaction Analysis:**
    `run_liquefaction_analysis()`'s `_get()` helper only checked overrides and the
    layer's OWN value for `bulk_density_t_m3`/`n_value`/`fines_content_pct` -- unlike
    the SBC/settlement engines (`_resolve_field()`), it never borrowed from a
    neighbouring layer, so a single incomplete layer (e.g. the top "Filled up" layer
    with no lab test, or any SPT-only row missing fines content) hard-failed the WHOLE
    borehole's liquefaction run with a 422. Fixed: added `_get_required()`, which
    checks override -> this layer's own value -> nearest recorded layer above/below
    (reusing the exact same `_resolve_field()` the other engines already use) -- only
    raises if truly no layer anywhere on the borehole has the field AND no override
    was given. Applied to all three fields. Each layer's report row now also carries
    `bulk_density_source` / `n_value_source` / `fines_content_source` (e.g. "1.5-1.95m
    (nearest layer below)") for transparency, same spirit as the SBC engines' source
    notes -- **not yet surfaced in `LiquefactionAnalysis.tsx`'s UI**, only in the API
    response; add that if Raahi wants to see sources on screen, not just in the raw
    result.

25. **Frontend added 26 Jul 2026, per Raahi's request "pura manual bhi dikhna chahiye
    hide mein, our hammer energy correction manual fill hona chahiye":**
    `LiquefactionAnalysis.tsx` had NO way to set CE/CH/CB/CS/Kα or per-layer N/fines/
    density manually at all -- only Mw, zone/PGA, and water table had inputs; the SPT
    corrections silently used the backend's hardcoded defaults (CE=1.0, CH=1.0,
    CB=1.05, CS=1.0, Kα=1.0) with zero UI control, even though `overrides` already
    accepted all of them generically (no backend change needed here, same as the λ
    dropdown in entry #21). Added:
    - **Hammer Energy Correction (CE) as an ALWAYS-VISIBLE field** (not hidden) --
      Raahi's specific point: CE genuinely varies by hammer type (automatic trip vs
      donut vs safety hammer) per rig/site, so defaulting it silently is wrong far more
      often than right; it needs to be an explicit per-job decision, not a buried
      override.
    - A collapsible "Manual overrides" panel (hidden by default, same UX pattern as
      Batch Analysis's) for the less frequently changed ones: CH, CB, CS, Kα, plus
      per-layer N-value/fines content/bulk density pins.
    - The layer-report table also now shows a "Source (if not this layer)" column,
      surfacing the `n_value_source`/`fines_content_source` transparency data entry #24
      added to the API but never displayed -- blank when the value came from the
      layer's own lab data, otherwise says which neighbouring layer (or override)
      it was borrowed from.

26. **Feature added 26 Jul 2026, per Raahi's request "ek side me liquefaction ke
    calculation bhi dikhe... our liquefaction ko engineering se hatakar analysis me
    daal do":**
    - `run_liquefaction_analysis()` now builds a full per-layer `steps` array (same
      pattern as Batch Analysis's settlement `steps` from entry #17): overburden
      stress build-up (which density/interval was used and why), rd, the CSR formula
      with real numbers, the full (N1)60 correction chain (CN x CE x CH x CB x CR x CS),
      the fines alpha/beta correction, CRR7.5, Dr%/Ksigma (or the exemption reason),
      MSF, Kalpha, the final CRR formula, and the FOS formula/rule applied -- every
      number that went into every column, not just the column values themselves.
    - `LiquefactionAnalysis.tsx` got the same "▸ Full calc" per-row toggle as Batch
      Analysis (entry #18): hidden on screen unless expanded, forced visible when
      printing regardless of on-screen state.
    - **Sidebar reorganized:** the old single "Engineering" section (7 items) is now
      two sections -- "Analysis" (Analysis/calculators, Batch Analysis, Liquefaction
      Analysis -- the three calculation tools) and a slimmer "Engineering" (Borehole
      Logs, Lab Data Import, Soil Profile Viewer, Engineering Reports -- data/document
      management). No route paths changed, just the grouping in
      `frontend/src/components/Sidebar.tsx`.

27. **Feature built 26 Jul 2026, per Raahi's request to make Document Library
    survive restarts without needing a credit card anywhere:** migrated persistence
    to Supabase (Postgres + Storage, genuinely free tier, no card required -- only
    catch is the project auto-pauses after 7 days with zero traffic, one click to
    resume). Three independent pieces, all optional/backward-compatible via env vars:
    - **Database:** `DATABASE_URL` already supported swapping SQLite->Postgres with
      ZERO code changes (the whole app goes through the SQLAlchemy ORM) -- just needs
      the env var set to Supabase's Postgres connection string. Not done yet on
      Render as of this entry; Raahi still needs to create the project and set it.
    - **Vector search:** NEW -- `app/rag/pgvector_store.py`, used automatically by
      `app/rag/vectorstore.py` instead of ChromaDB whenever `DATABASE_URL` is
      Postgres (checked at import time). Stores chunks + embeddings in a
      `document_chunks` table in the SAME Postgres database via pgvector
      (`CREATE EXTENSION vector`), using plain SQL through the existing
      SQLAlchemy engine/psycopg2 -- no new Python package needed for this part.
      Embedding dimension hardcoded to 3072 (gemini-embedding-001's default,
      unchanged since no `output_dimensionality` is passed in
      `services/embeddings.py`) -- deliberately NOT using an ANN index
      (ivfflat/hnsw), since pgvector's index size limits (~2000 dims) don't cover
      3072 and a personal document library's scale (hundreds/thousands of chunks,
      not millions) doesn't need one -- exact `ORDER BY embedding <=> query LIMIT k`
      is plenty fast at this scale. If usage ever grows enough that this becomes
      slow, the fix is reducing embedding dimension (via `output_dimensionality`,
      requires re-indexing everything) so an index becomes possible, not adding
      one now.
    - **File storage:** NEW -- `app/services/file_storage.py`. When
      `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` are set, uploaded PDFs go to a
      Supabase Storage bucket named exactly `documents` (Raahi needs to create
      this bucket manually in the Supabase dashboard -- code does NOT
      auto-create it) instead of local disk. `routers/documents.py` updated to
      go through this module for save/delete; `_run_indexing()` downloads a
      temp local copy for PyMuPDF (which needs a real file path) and cleans it
      up afterward when the source is Supabase, since indexing still needs
      actual bytes on disk however they're stored permanently.
    - **NOT tested against a real Postgres/pgvector instance** -- no
      network access in this sandbox to spin one up. The SQL pattern (raw
      `CAST(:x AS vector)`/`<=>` via SQLAlchemy `text()`) is a standard, widely
      documented way to use pgvector without its dedicated Python package, but
      this should be watched closely on first real use -- if `add_chunks`/
      `query` throw anything, that's the first place to look.
    - **Still needed from Raahi to actually go live:** (1) create a Supabase
      project, (2) create a Storage bucket named `documents`, (3) set
      `DATABASE_URL` (Postgres connection string), `SUPABASE_URL`, and
      `SUPABASE_SERVICE_KEY` (the `service_role` key, not `anon`) as environment
      variables on the Render backend service, (4) redeploy. Existing SQLite
      data (if any) does NOT migrate automatically -- this is a fresh start for
      the Document Library specifically; Batch Analysis/Liquefaction boreholes
      are unaffected either way (separate tables, but same DB -- they'll also
      move to Postgres automatically once `DATABASE_URL` is set, which is fine,
      they don't use Chroma/pgvector at all).

28. **BUG, fixed 26 Jul 2026, found immediately on the first deploy attempt of #27's
    Supabase migration:** `requirements.txt` pinned `httpx==0.27.2` (for the new
    `file_storage.py`'s Supabase Storage REST calls) without checking what
    `google-genai` itself needs -- it requires `httpx>=0.28.1,<1.0.0`, so pip's
    dependency resolver had no valid combination and the Render build failed outright
    (`pip install -r requirements.txt` exited 1, nothing deployed). Fixed: loosened to
    `httpx>=0.28.1,<1.0.0` to satisfy both. Lesson for next time a new pinned
    dependency is added: check what ALREADY-pinned packages require of the SAME
    library before hard-pinning a specific version, especially anything `google-genai`
    touches (it's fairly strict about its own httpx floor).
29. **Feature added 26 Jul 2026, per Raahi's report "chat ka jawab aane mein bahut slow
    hai" (chat response is very slow):** AI Chat now streams via Server-Sent Events
    instead of waiting for the complete answer before showing anything. Investigation
    first: `grep`ped for "stream" across the chat router and frontend and found zero
    matches -- the whole request (embed question -> pgvector search -> full Gemini
    generation -> DB write) was one blocking round trip, so even a normal total time
    (which wasn't separately profiled -- no access to the live Render/Supabase instance
    from this sandbox) FELT much slower than necessary, since nothing appeared on
    screen until every step finished.

    Backend: `_call_chat_stream()` / `answer_question_stream()` in `services/llm.py`
    use the Gemini SDK's `generate_content_stream()` instead of `generate_content()`,
    same retry-on-quota/overload logic as the non-streaming version but ONLY before any
    chunk has been yielded (retrying after partial output would duplicate already-sent
    text, so a mid-stream failure now surfaces directly as an error event instead).
    `POST /api/chat` (routers/chat.py) now returns a `StreamingResponse` of
    `text/event-stream` events (`{"type":"text","content":...}` per chunk, then one
    `{"type":"done","conversation_id":...,"citations":[...]}` once Gemini finishes and
    the DB write completes, or `{"type":"error","message":...}` on failure). The old
    single-JSON-response behavior is preserved at `POST /api/chat/sync` in case
    anything else needs a plain request/response later.

    Frontend: `api.chatStream()` (client.ts) is an async generator that reads the
    response body's `ReadableStream`, splits on SSE's blank-line delimiter, and yields
    parsed events -- `Chat.tsx`'s `send()` now does `for await (const event of
    api.chatStream(...))` and appends each `text` event's content to the last message
    as it arrives, so the answer visibly builds up token-by-token instead of appearing
    all at once. The "Retrieving from your documents..." skeleton now only shows before
    the first token arrives (`loading && !lastMessage.content`), not for the whole
    request -- it would otherwise show redundantly alongside text that's already
    streaming in.

    **Not yet confirmed against the live deployment** (no network access from this
    sandbox to actually watch a real stream arrive) -- test on first real use, and if
    text doesn't appear progressively (e.g. Render or a proxy in front of it buffers the
    whole response before forwarding it, which some hosting setups do for streaming
    responses), that's the next thing to check.

    **Separately, still worth checking if chat continues to feel slow even with
    streaming:** how many chunks/documents are indexed matters, because
    `rag/pgvector_store.py` (per entry #27) deliberately does an exact
    `ORDER BY embedding <=> query LIMIT k` search with no ANN index, on the assumption
    that scale would stay small. If retrieval itself (before any text can start
    streaming at all) is the slow part rather than generation, streaming won't fix
    that -- an ANN index (ivfflat/hnsw) would be the next thing to add, but wasn't
    added now since it wasn't confirmed to be the actual bottleneck.
30. **BUG, fixed 27 Jul 2026, found by Raahi uploading IS-1893 Part 1 (a scanned PDF):
    document showed "FAILED", 0/44 pages indexed even though total_pages=44 was read
    correctly.** Root cause: `extract_pages()` used PyMuPDF's plain `page.get_text()`
    only -- for a scanned/photocopied PDF with no embedded text layer (very common for
    older IS codes, which are often distributed as scans), every page returns an empty
    string, so every page produces zero chunks, so the whole document silently ends up
    with `indexed_chunks=0` despite the page count being perfectly readable (page count
    doesn't need a text layer, only chunking does). Fixed: any page with under ~20
    extracted characters now falls back to Gemini vision OCR (`_ocr_page_via_gemini()`
    in `rag/ingest.py`) -- renders the page as a PNG via PyMuPDF and asks Gemini to
    transcribe it, reusing the SAME Gemini client already configured for chat/
    embeddings rather than adding a Tesseract system dependency, which Render's
    standard Python buildpack doesn't have and would need a custom Dockerfile for.
    Paced 2s between OCR calls (on top of the existing embedding-batch pacing) so a
    large fully-scanned PDF doesn't blow through Gemini's free-tier per-minute quota.
    **Expected effect:** indexing a scanned PDF will now take noticeably longer
    (roughly one extra Gemini call per scanned page) but should actually succeed
    instead of silently producing zero chunks. If a document STILL fails after this,
    the server log now says exactly why (OCR call failures are logged per-page as
    warnings, and a final error log states plainly that even OCR found no text) --
    check Render's logs for the specific reason rather than assuming the same bug.

    **Separate, NOT fixed here, needs Raahi to verify:** he also reported uploads via
    the website aren't showing up in Supabase Storage at all (only a manual/direct
    Supabase upload "works"). `services/file_storage.py`'s `save_upload()` already
    uploads to Supabase Storage synchronously, BEFORE indexing even starts, whenever
    `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are both set -- so if website uploads
    aren't appearing there, the most likely cause is that those two env vars aren't
    actually set correctly on the RENDER BACKEND service specifically (setting up the
    Supabase project itself doesn't automatically connect Render to it -- the env vars
    have to be added on Render's side too, per entry #27's setup steps). Couldn't
    verify this from the sandbox (no access to Raahi's actual Render dashboard) --
    check Render -> backend service -> Environment for typos or missing values before
    assuming this is a code bug.

31. **Feature added 27 Jul 2026, per Raahi's detailed spec doc + a real project
    Excel workbook (New Delhi Railway Station redevelopment, IS-2911 Part-1
    Sec-2:2010 / IRC:78:2014) uploaded as reference: Pile Foundation Design
    Module, Phase 1.** New page `/pile-capacity` (Sidebar > Analysis).

    **What's built:** Bored cast-in-situ pile, compression + uplift capacity,
    static formula method, both IS 2911 and IRC:78. Reuses the EXISTING
    BoreholeProfile/SoilLayer data (same lab-data upload already used by
    Batch Analysis/Liquefaction) -- no separate Excel import was built, since
    the app already has one. New files: `backend/app/services/
    pile_calculator.py` (the engine: `run_pile_capacity()`,
    `parse_pile_command()`), `backend/app/routers/calculators.py` gained
    `POST /api/calculators/pile` and `POST /api/calculators/pile/
    parse-command`, `frontend/src/pages/PileCapacity.tsx`. `pile_capacity`
    removed from `PLANNED_CALCULATORS` (it now has its own dedicated
    endpoint, same pattern as `/batch` and `/liquefaction`).

    **Method (matches the reference workbook's logic):** skin friction =
    Σ(α·c + K·σ'v·tanφ)·perimeter·Δdepth per layer, with the IS 2911
    cohesion-based alpha curve (digitized polynomial) or IRC:78's N-value
    adhesion bands; overburden stress capped beyond a critical depth (15D
    for IS 2911, 20D for IRC:78) below scour level; end bearing = Ap·(c·Nc +
    σ'v·Nq + 0.5·γ·D·Ny) with Nc=9 (pile value, not the 5.14/5.7 shallow-
    footing value used elsewhere), evaluated at toe-2D/toe/toe+2D and the
    LOWEST of the three governs (same "critical founding zone" idea as the
    workbook's candidate columns). Submerged density used below the water
    table. Missing cohesion/phi/density/N-value on any layer falls back to
    the SAME `_founding_layer`/`_resolve_field` helpers already used by
    batch/liquefaction (nearest layer -> borehole average), and every
    estimated value is listed in the response's `estimated_fields` (shown in
    an amber "estimated values" box on the page) -- Strict vs Engineering
    mode toggle from the spec was NOT added separately, since this
    fallback-with-disclosure already surfaces every estimate transparently;
    revisit if Raahi wants a hard-strict mode that refuses instead of
    estimating.

    **Deliberately NOT copied from the reference workbook:** its own Nq
    lookup table (Sheet2) for phi>=25 -- the extracted values looked
    inconsistent with a standard Nq chart on inspection (e.g. Nq=10 for
    phi=21-24 is far below the ~7 the standard Vesic formula gives, and
    several formula cells elsewhere in that same workbook already had
    `#REF!` errors), so blindly copying an unverified table risked being
    WORSE than a consistent formula. Used the same Vesic-type Nq/Ny formula
    this app's own `bearing_capacity_is6403_shear` already uses instead, and
    said so plainly in the result's `warnings` list rather than silently
    picking one. **Flag this to Raahi to verify against his own engineering
    judgement/a current IS:6403 chart before using results for a real
    submission** -- this is the one place Phase 1 diverges from "exact
    match" on principle (a broken source value isn't ground truth), not from
    running out of time.

    **NOT yet built (Phase 2+, same "listed not skipped" approach as
    PLANNED_CALCULATORS elsewhere in this file):** driven piles (different
    skin friction formulae), rock-socketed resistance, pile groups/group
    efficiency, negative skin friction, lateral pile capacity, pile
    self-weight in the uplift check (add it manually for now), a dedicated
    Word/PDF calculation-sheet export for pile results specifically (the
    page shows the full transparent breakdown in-app; reuse the existing
    Reports module's pattern next if a downloadable sheet is wanted), and a
    real Strict/Engineering mode toggle. The AI command parser
    (`parse_pile_command`) is a deterministic regex parser (diameter,
    length, cutoff, FOS, code name/"bridge"/"building") -- NOT an LLM call,
    since numbers feeding straight into a capacity calculation should be
    deterministic; it only recognizes the phrasings tested so far, not
    arbitrary free text.

    **Verified:** `python3 -m py_compile` clean on the whole backend tree;
    `run_pile_capacity()` tested directly with mock `SimpleNamespace` layers
    (no DB/FastAPI needed, per this file's own testing convention) -- ran
    without error and gave plausible-magnitude results (hundreds of tonnes
    for a 1m-dia/17m pile), but was NOT checked against the reference
    workbook's own numbers cell-by-cell (different/incomplete borehole data
    was used for the test, and the workbook's own broken refs make an exact
    reconciliation unreliable anyway) -- **first real use should sanity-check
    one result against a hand calculation** before trusting it for a live
    project.

32. **Pile Capacity: liquefaction depth + critical-depth-factor override added, 27 Jul 2026,
    per Raahi's request** (built in a chat session, on top of entry #31's engine). Two
    changes to `run_pile_capacity()`:
    - New optional `liquefaction_depth_m` param, treated the same way `scour_depth_m`
      already was (soil above it doesn't count for skin friction) -- whichever of the two is
      DEEPER becomes the `ineffective_ground_level_m` that both the critical-depth
      calculation and the skin-friction skip measure from (matches how IRC:78/IITK-GSDMA
      seismic guidance combines scour+liquefaction as one effective ground level, since both
      mean "don't rely on this depth of soil"). If both are given, the response's `warnings`
      names which one governed.
    - New optional `critical_depth_factor` param, overriding the code's default multiplier
      (15D for IS 2911, 20D for IRC:78) -- Raahi wanted this adjustable rather than
      hardcoded, in case a specific project's geotechnical report specifies a different
      value. Reported back in the result as `critical_depth_factor_used`, and the warnings
      note explicitly when an override was used instead of the code default.
    - Frontend (`PileCapacity.tsx`): two new optional fields, "Liquefaction depth (m)" and
      "Critical depth multiplier override (xD)", right after Scour depth.
    - **NOT done -- needs Raahi's input, don't guess:** Raahi separately asked for
      "IRC:78:2024" instead of/alongside the current "IRC:78:2014" label. Whether the 2014
      and 2024 editions actually differ in the skin-friction/end-bearing/critical-depth
      FORMULAS themselves (not just the year printed on the cover) is unknown -- entry #31
      already flagged one instance (the Nq table) where blindly trusting a source document
      over a consistent formula was the wrong call. Silently relabeling "2014" to "2024"
      without checking whether the formulas changed would be exactly the kind of guess this
      project's own spec docs (entries #12, #17, #22) explicitly warn against. Whoever picks
      this up next should ask Raahi for the actual IRC:78:2024 document (or confirm it's
      the same formulas, just a re-issued/amended edition) before touching the `code` label
      or any formula.

33. **Pile Capacity: full per-segment working exposed, 27 Jul 2026, per Raahi's "ek bhi step
    nhi chhutna chahiye" (not a single step should be missing) request.** Both
    `run_pile_capacity()`'s `layer_report` (skin friction) and `end_bearing_candidates`
    entries now carry every intermediate value, not just the final per-segment number:
    - Skin friction rows: thickness, founding-layer classification, above/below water table,
      N used (IRC:78 only), bulk vs effective unit weight, overburden stress at the
      segment's start/end/average, whether the critical-depth cap was already active for
      this segment, K, tan(phi), alpha, the cohesion term and friction term computed
      SEPARATELY (not just their sum), the segment's own Qs, and a running cumulative Qs
      total. Segments zeroed out by scour/liquefaction are shown greyed out with "0
      (scour/liq.)" rather than just a bare 0, so it's visually obvious why.
    - End-bearing candidate rows (toe-2D/toe/toe+2D): effective unit weight, toe overburden
      stress, pile base area Ap, and the three end-bearing terms (c.Nc, sigma'v.Nq,
      0.5.gamma.D.Ny) computed separately, not just their sum.
    - Frontend (`PileCapacity.tsx`): both tables widened to a fixed min-width with
      horizontal scroll (mobile-friendly) to fit every new column rather than cramming or
      dropping any.
    No engineering values changed here -- this is purely exposing math that was already
    being computed internally, per the same "engineer must verify every step without
    reading code" principle already applied to the SBC settlement engine (entry #22) and
    liquefaction (entry #22/23).

34. **Pile Capacity: water table override + manual soil property overrides added to the
    frontend, 27 Jul 2026, per Raahi's request.** Backend already supported both (the
    `overrides` dict mechanism was already there for the batch/settlement/liquefaction
    engines -- entry #31's pile engine reused `_resolve_field`/`_founding_layer` from
    `calculators.py`, which already honors it), but the Pile Capacity PAGE had no UI for
    either -- Raahi could not actually reach them without editing the borehole record
    itself. Fixed:
    - `PileCapacityRequest.water_table_depth_m` (new, optional) -- overrides the
      borehole's own recorded water table for this calculation only, same "manual override
      never touches the saved borehole" principle as everywhere else in this app. Raahi's
      stated use case: solving fully submerged (water table at 0m) for a monsoon/flood
      check, without editing the real borehole record.
    - Frontend: three new "Manual soil property overrides" fields -- Bulk density (t/m3),
      Cohesion c (t/m2), Friction angle phi (deg) -- feeding the existing `overrides` dict
      (`bulk_density_t_m3` / `cohesion_t_m2` / `friction_angle_deg`), applied borehole-wide,
      always winning over recorded/estimated values (same convention as every other
      calculator's overrides).
    **RESOLVED 27 Jul 2026:** Raahi confirmed same formulas, just relabel the year -- done
    (the `<option>` label in `PileCapacity.tsx`, the docstring, and the `"code"` string in
    the result dict all now say "IRC:78:2024"; zero formula changes, exactly as scoped
    above).
35. **Feature added 28 Jul 2026, applied by Raahi directly via `patch_lab_data_universal.py`
    (run in Termux, not through a Claude session -- documented here now since it wasn't
    documented anywhere before this entry):** `services/universal_soil_parser.py` (new
    file, ~525 lines) is a THIRD fallback for lab data upload, tried only when both
    RaahiGeo's own flat "Soil Data" template AND its own office-style `bh_log_parser`
    format fail to match. Matches an arbitrary consultant/lab's spreadsheet (unknown
    column names/order/units) via a synonym dictionary + fuzzy column matching, so
    RaahiGeo can accept soil-investigation data from any source, not just its own
    templates. `parse_uploaded_workbook_auto()` in `lab_data.py` now tries all three in
    order: own template -> own office format -> universal parser, same combined dict
    shape (`{"boreholes": {...}, "warnings": [...]}`) regardless of which one matched.
    Not independently reviewed by a Claude session (Raahi wrote/applied it directly) --
    if a future session touches lab data import and something looks unfamiliar, this is
    why; read `universal_soil_parser.py` before assuming a bug.
36. **Feature added 28 Jul 2026: Lateral Pile Capacity, per Raahi's two reference
    workbooks (`Lateral_capacity_cohesive_soil.xlsm`, `Lateral_capacity_Cohesionless.xlsm`)
    plus a photo of IS:2911 (Part 1/Sec 1):2010 Annex C (Table 5, Fig.3).** `services/
    pile_calculator.py` -> `run_lateral_capacity()`. Method: the 1%-of-pile-diameter
    deflection criterion (equivalent-cantilever approach), NOT Broms' ultimate-capacity
    method -- a different question (serviceability vs failure) that isn't directly
    comparable to a Broms-based result if one ever gets built later.

    Two stiffness regimes, matching IS:2911 C-2.3 exactly: sand and Normally Consolidated
    (NCS) clay both use stiffness factor T = (EI/nh)^0.2 (nh increases linearly with
    depth) -- confirmed by IS:2911's own C-2.3.1 heading, "For Piles in Sand and Normally
    Loaded Clays". Preloaded/Over-Consolidated (OCS) clay uses R = (EI/(K.B))^0.25 (K
    constant with depth) instead. Pile behaviour (short/rigid, long/elastic, or
    intermediate) follows IS:2911 Table 5 exactly: short if L<=2T (or 2R for OCS), long if
    L>=4T (or 3.5R for OCS), intermediate in between -- IS:2911 gives no separate formula
    for intermediate, so (matching Raahi's own reference workbooks) the long-pile
    equivalent-cantilever method is used for that case too. Both free-head and fixed-head
    results are always returned together -- IS:2911 gives no rule for picking one, since
    that's a pile-cap connection detail, not a soil property.

    Verified EXACTLY against Raahi's own BH-P-194_1 example (preloaded/OCS clay): stiffness
    factor R=4.962m, short-pile boundary 9.92m, long-pile boundary 17.37m, fixed-head safe
    load 20.9t -- all match to the precision shown. Free-head safe load is 9.3t here vs the
    workbook's 9.2t; the 0.1t gap is the workbook's own intermediate floor-to-nearest-0.1t
    rounding step (not replicated here), not a formula error.

    **PRECISION CAVEAT, told to Raahi directly, repeated here for whoever picks this up
    next:** the clay-side free/fixed-head Fig.3 chart factors are exact 6th-degree
    polynomials lifted straight from Raahi's own workbook (hence the exact match above).
    The SAND-side chart factors are only a piecewise-linear digitization of IS:2911 Fig.3,
    anchored at 3 real data points pulled from Raahi's workbook (L1/T = 0, 0.79, 1.04) and
    extended by eye across the rest of the 0-10 chart range for lack of a polynomial fit
    anywhere in either reference file. This has NOT been verified against a known sand
    case the way clay was -- `run_lateral_capacity()` emits an explicit warning every time
    the sand path runs, saying exactly this. **Verify a real sand case against a trusted
    source before relying on this for anything real.**

    **Not yet done:** no API endpoint or frontend page wired up yet -- only the backend
    calculation function exists and is tested. Next step is a router endpoint (probably
    `POST /api/calculators/lateral`, following the same override/borehole-aware pattern as
    `run_pile_capacity`) and a `LateralCapacity.tsx` page, same shape as the axial Pile
    Capacity page.

    **RESOLVED 28 Jul 2026:** `POST /api/calculators/lateral` added to
    `routers/calculators.py` -- borehole-aware, auto-picks the founding layer at ground
    level (`free_length_above_ground_m`), soil type auto-detected from that layer's USCS
    classification (same C../M..=cohesive, S../G..=cohesionless rule as everywhere else in
    this app), cohesion/N-value/soil_type/consolidation_type all override-able. Frontend
    `LateralCapacity.tsx` (route `/lateral-capacity`, sidebar entry added) shows pile
    behaviour classification + both free-head and fixed-head safe loads side by side, plus
    the engine's own warnings (including the sand-precision caveat when that path is used).
    End-to-end tested with a mock founding-layer lookup + override resolution, matching the
    standalone function test above.

38. **`bh_log_parser.py` rebuilt from scratch, 29 Jul 2026, using 6 REAL company report
    templates Raahi provided** (not guessed -- see entry #37 for why the old one was
    missing). This is a genuinely different problem from `universal_soil_parser.py`'s
    "flat table, header in the first ~40 rows" case: report-style workbooks have a
    header that can be 1-4 rows tall, start anywhere in the sheet, span 15-250+
    columns, and metadata (project name, BH no, water table, RL, coordinates) scattered
    in a title block rather than clean label:value pairs.
    - **Approach:** scans a window of rows x header-heights (1-4), concatenating each
      column's text across the window and matching it against
      `universal_soil_parser.py`'s `CANONICAL_FIELDS`/`match_header()` (reused, not
      duplicated) -- picks whichever (start_row, height) scores the most matched
      layer-level fields with plausible numeric depth data beneath it. Metadata is
      label-scanned in the area strictly above the detected header, requiring near-
      exact confidence (>=90) since title-block text produces far more incidental
      fuzzy false-positives than a real column header row does.
    - **Three real-world quirks found and handled, each from an actual file:**
      (a) a decorative "column index numbers" row (1,2,3...) some templates insert
      right after the real header labels, which was being misread as the first data
      row -- now detected and skipped; (b) a "Depth" convention split across 3 columns
      (value / literal "-" / value) under ONE shared header, instead of separate
      From/To column headers -- now detected via a dash-separator + numeric-neighbour
      check; (c) a blank spacer row between the header block and the real data.
      (b) and (c) combined were why sheet "R.S. BH 1" (`bh_01.xlsx`) failed until both
      were fixed together.
    - **Tested against all 6 real files, every sheet, honestly (not cherry-picked):**
      the PRIMARY soil-log sheet in all 6 files now parses with plausible real data
      (verified cohesion/moisture/void-ratio values against what's visible in the raw
      cells, e.g. cohesion 0.42-0.47 t/m² for CI clay in `bh_01.xlsx`). Auxiliary sheets
      named "SPT", "Summary", "1N" (raw blow-count worksheets / index sheets, not
      classified soil-layer tables) correctly fail to match -- that's expected, not a
      bug, since they genuinely don't have a soil-layer table.
    - **Known limitation, not yet solved:** when one physical borehole's data is split
      across multiple sheets (e.g. the ROCK file's "1R"/"1S"/"1L" -- rock/soil/lab
      sub-logs for what's likely ONE borehole), each sheet becomes a SEPARATE
      "borehole" in the output (borehole_id = sheet title) rather than being merged
      into one. No general way to know from sheet names alone whether sheets belong to
      the same physical borehole or genuinely different ones -- flagging this rather
      than guessing a merge rule. If this turns out to matter in practice, Raahi will
      see it immediately as 3 "boreholes" with suspiciously few layers each in the Lab
      Data Import review screen.
    - **This has NOT been tested via the actual `/api/lab-data/upload` endpoint end-to-
      end (only the parser functions directly, in sandbox)** -- next real upload
      through the website is the first true end-to-end test. Watch for it.

39. **REGRESSION, fixed 30 Jul 2026, self-caught -- entry #37's router fix silently
    reverted itself.** When building entry #38's `bh_log_parser.py` rebuild, the new
    working copy was set up from the zip Raahi had uploaded for "yaha tak kaam pahucha
    apna" -- which predates entry #37 (the fix wiring `routers/lab_data.py` to call
    `parse_uploaded_workbook_auto()` instead of the strict-only `parse_uploaded_workbook()`).
    That upload's timing meant entry #37's fix wasn't in it yet, so rebasing onto it
    silently brought back the OLD strict-only router code -- Raahi hit the exact same
    "Expected a sheet named 'Soil Data'" error again after the #38 deploy, even though
    the actual parser code (bh_log_parser.py) was correct. Re-applied the same one-line
    fix. **Process lesson for next time:** when starting a new working copy from a
    freshly uploaded zip, always grep for the last few PROJECT_STATUS.md entries'
    specific code signatures (not just read the changelog text) to confirm they're
    actually present in that zip before building on top of it -- a zip's upload
    timestamp doesn't guarantee it contains every fix mentioned as "already done" in
    the conversation, if that fix was delivered in a LATER message than the zip's own
    upload.

40. **CRITICAL BUG, fixed 31 Jul 2026, found live: real uploads through the website were
    timing out ("ERR_CONNECTION_TIMED_OUT" on `/api/lab-data/upload`).** Root cause:
    entry #38's `bh_log_parser.py` brute-force-tried EVERY (start_row, header_height)
    combination across up to 80 rows x 4 heights x 260 columns, calling
    `match_header()` (fuzzy `difflib.SequenceMatcher` scoring against ~30 fields'
    synonym lists) for essentially every populated cell in that whole window --
    profiling one real file showed **2.2 million SequenceMatcher calls, 68 seconds,
    for a single sheet**. A multi-sheet real workbook could take minutes total,
    guaranteed to time out. Fixed in two layers:
    - `universal_soil_parser.py`'s `match_header()` is now `@lru_cache`'d (pure
      function, safe -- nothing mutates its return value anywhere) -- cuts repeated
      identical lookups.
    - `bh_log_parser.py`'s header search is now two-stage instead of brute-force: a
      cheap single pass scores every row by how many DISTINCT high-confidence
      (>=70%) fields it contains, then the expensive multi-row-height matching only
      runs around the top 5 highest-scoring rows -- not all 80. (An earlier attempt at
      this used a low single-hit threshold across up to 249 columns, which matched
      almost every row as a false-positive "candidate" and didn't help at all --
      requiring the row's TOTAL distinct-field count, not just a single hit, is what
      actually made the pruning effective.)
    - **Result, re-verified against all 6 real files:** every file now parses in
      1-8 seconds (was up to 68s for the worst one), with IDENTICAL layer counts to
      before the optimization -- same correctness, just no longer timing out.
    - **Lesson for next time a parser like this gets built:** always test wall-clock
      time against a REAL, full-size file before considering a report-style/brute-
      force-search parser done -- entry #38 was verified for correctness (right
      answers) but never for performance, and a slow-but-correct parser is just as
      broken in production as a wrong one once it exceeds any request timeout.

41. **CRITICAL BUG, fixed 1 Aug 2026, found live via Render logs (Raahi's actual
    traceback, not a guess):** even after entry #40's speed fix, real uploads still
    failed -- this time with a 500 error, not a timeout. Traceback showed
    `db.add(SoilLayer(borehole_id_fk=profile.id, **layer_data))` raising a `TypeError`
    from SQLAlchemy's declarative constructor. Root cause: `bh_log_parser.py`'s
    `to_lab_data_format()` passed EVERY field key the parser recognized straight
    through into the dict handed to `SoilLayer(**layer_data)` -- but
    `universal_soil_parser.py`'s own `CANONICAL_FIELDS` dict already distinguishes real
    soil properties that HAVE a database column (`"db": True`, e.g. `cohesion_t_m2`)
    from ones this parser can recognize but the schema has no column for (`"db": False`,
    e.g. `liquid_limit`, `plastic_limit`, `elastic_modulus`, `cbr`, `dry_density`,
    `ocr`...) -- `universal_soil_parser.py` itself already filters on this flag before
    returning layers (line ~472), but `bh_log_parser.py` never applied the same filter,
    so any report sheet with a recognizable Atterberg-limits or similar non-DB column
    crashed the whole upload. Fixed: `to_lab_data_format()` now filters
    `CANONICAL_FIELDS[k]["db"]` the same way. Verified against all 6 real files --
    every layer dict now contains only real `SoilLayer` column names.
    **This is the second bug entries #37-#41 chased through this same code path in one
    sitting** (missing router wiring -> missing bh_log_parser.py file -> regressed
    router wiring -> 68-second timeout -> this db-column mismatch) -- each one only
    surfaced after the previous one was fixed and Raahi tried a real upload again. Real
    end-to-end testing against Raahi's actual files/actual deployment, not just sandbox
    unit tests, is what caught every one of these; none were visible from parser-
    function-level testing alone.

42. **CRITICAL BUG, found 1 Aug 2026 from Raahi's live Render logs (psycopg2
    NotNullViolation), partially fixed -- root cause still needs the actual file.**
    Uploading a real file (`43+250.xlsm`) that doesn't match RaahiGeo's own "Soil Data"
    template fell through to the office-borehole-log auto-detect tier (`bh_log_parser.py`,
    entries #37-#41), which matched SOME sheet but extracted a layer with `from_m=None`
    while `to_m=1.5` -- `from_m`/`to_m` are NOT NULL columns on `SoilLayer`, so the INSERT
    raised a raw `IntegrityError` that crashed the ENTIRE upload with a 500, losing every
    other (possibly correctly-parsed) layer in the same file too. Also noticed:
    `n_value` came out as ~0.0155 for that same row -- physically impossible for a real SPT
    N-value (these run 0-100+), strongly suggesting the column-detection heuristic in
    `bh_log_parser.py` matched the wrong column entirely for this particular file's layout.
    **Fixed defensively (`routers/lab_data.py`):** every parsed layer is now validated
    (`from_m`/`to_m` both present, numeric, and `from_m < to_m`) BEFORE the DB insert --
    a bad row is skipped with a specific warning naming the row and what was wrong,
    instead of the raw DB error taking down the whole upload. If a borehole ends up with
    zero usable layers, that's reported explicitly too rather than silently creating an
    empty profile. **NOT yet fixed: the actual root cause in `bh_log_parser.py`'s column
    detection for this file's specific layout** -- the defensive fix stops the crash and
    protects other layers in the same upload, but this particular file will likely still
    import with few/no usable layers (or wrong values that happen to pass validation,
    like a plausible-looking but wrong N-value) until the real file is available to debug
    against. Per this project's own repeated lesson (entries #37-#41 immediately above,
    and the "never guess, get the actual reference" principle throughout this whole
    project) -- guessing at a fix for a 400-line fuzzy-matching heuristic without the
    actual failing file risks silently breaking one of the 6 real files it was already
    verified against. **Whoever picks this up next: get `43+250.xlsm` (or whatever file
    reproduces this) from Raahi first, reproduce locally, then fix bh_log_parser.py's
    column detection for real.**

43. **Follow-up to #42, root cause found and fixed WITHOUT the actual file -- the entry
    #42 defensive fix's own warning messages gave enough evidence.** Once #42 stopped the
    crash, Raahi's next upload attempt against `43+250.xlsm` produced ~85 clean "row N
    skipped" warnings instead of a 500, and the pattern across them was completely
    unambiguous: one detected table had `From=None` on every single row while `To` had a
    clean, steadily-increasing sequence (0.0, 1.5, 2.5, 3.0, 4.5, ... 40.0); a second table
    had the exact mirror image (`From` populated with a clean sequence, `To=None` every
    row). That signature -- always exactly one of the pair, never both, never neither --
    pointed straight at `bh_log_parser.py`'s column-matching: `from_m`'s and `to_m`'s
    synonym lists both contain the word "depth" ("depth from" / "depth to" / "top depth" /
    "bottom depth"), so a column header that's just plain "Depth (m)" -- a single POINT
    depth per row (e.g. one SPT test every ~1-1.5m, same convention as the Liquefaction
    workbook audited in entry #22) rather than a From/To range pair -- scores close enough
    against both synonym lists that `match_header` picks one fairly arbitrarily, leaving
    every row missing the other required column entirely.
    **Fixed:** after a table's layers are extracted, if exactly one of `from_m`/`to_m` was
    matched (never both), every row's single depth value is now treated as a point depth
    and the missing boundary is synthesized from consecutive rows (row i's `to_m` = row
    i+1's point, chaining from 0.0) -- exactly the point-log-to-range-log conversion this
    project already uses for the Liquefaction workbook's K/L cumulative stress build.
    Every table this applies to gets an explicit warning naming which column was
    single-matched and that the boundaries were synthesized, so Raahi can verify against
    the source rather than silently trust it.
    Verified with a synthetic single-"Depth (m)"-column workbook (5 rows, 1.5m steps):
    output layers came out as clean continuous 0.0-1.5, 1.5-3.0, 3.0-4.5m ranges with the
    expected warning. **RESOLVED same day:** Raahi shared the actual `43+250.xlsm` file --
    tested directly against it (not just the synthetic case): parses cleanly in ~9.3s, no
    crash, no timeout. BH-01 came out as 21 real from/to layers (not synthesized -- this
    sheet DOES have a proper From/To pair); GSA-BH-01 came out as 19 synthesized layers
    (this one IS the single-"Depth"-column case the fix targets) -- confirming the earlier
    diagnosis was correct. **New, separate (non-crashing) issue found while verifying:**
    GSA-BH-01's matched "N Value" column reads out as ~0.015 for every row -- physically
    impossible for a real SPT N-value (0-100+ range) -- strongly suggesting that sheet is
    actually a Grain Size Analysis table (hence "GSA") and some %-passing/fraction column is
    being mismatched onto n_value, not a real SPT log at all. Not fixed -- flagged to Raahi
    to manually verify/ignore N-values from that specific sheet for now; a GSA-vs-SPT sheet
    classifier is a separate, future fix if this recurs on other files.
    Separately, the SAME session also chased down an unrelated red herring: an early
    "Failed to fetch" was actually Render's free-tier cold start (first request after 15min
    idle can take 50+ seconds) combined with checking `/api/health` on the wrong Render
    service URL (the frontend's domain, not the backend's -- they're two separate Render
    services, `geomind-ai-1` vs `geomind-ai`) -- not a real bug, just a diagnosis dead-end
    worth remembering before assuming every "Failed to fetch" is a code problem.

44. **Login added, 1 Aug 2026, per Raahi's explicit request -- single shared username/
    password protecting the ENTIRE site (API + docs), not per-user accounts.** New:
    - `AppCredential` (singleton row, pbkdf2_hmac password hash, stdlib only -- no new
      dependency) and `AuthSession` (opaque server-side token, not a JWT, so any session can
      be trivially revoked -- e.g. every session is revoked on a credential change) in
      `models.py`. `app/auth.py` has the hashing/session logic; `routers/auth.py` exposes
      `/api/auth/login`, `/logout`, `/me`, `/change-credentials`.
    - `main.py`'s existing request-logging middleware now ALSO enforces the session token
      (`Authorization: Bearer <token>`) on every request under `/api/` plus `/docs`/`/redoc`/
      `/openapi.json` -- except `/api/auth/login` and `/api/health` themselves, and CORS
      preflight (OPTIONS). One place, not a `Depends()` added to every router.
    - **First-run default credential** (seeded automatically if the `app_credentials` table
      is empty): username `raahi`, password `raahigeo2026` -- overridable via
      `INITIAL_ADMIN_USERNAME`/`INITIAL_ADMIN_PASSWORD` env vars, but the default only
      matters for the very first login. **Raahi must change this immediately after first
      deploy** (Settings -> Account & Login).
    - **Per Raahi's explicit follow-up ("sirf main change kar saku, koi nahi"):** changing
      the credentials requires a SECOND secret beyond just being logged in -- `OWNER_PIN`,
      set only in Render's Environment tab (never in git, never sent to the frontend by
      default, default placeholder `raahi-owner-2026` that Raahi should override). This
      means even someone who somehow obtained the shared login password still can't change
      it (and lock Raahi out) without also knowing this separate PIN.
    - **Per Raahi's explicit follow-up (access requests):** rather than building real email-
      sending (SMTP credentials, deliverability risk, a new dependency, for a low-volume
      need), the Login page has a `mailto:raahigeo@gmail.com` link with a pre-filled subject/
      body -- opens the visitor's own mail client. Zero backend work, zero new secrets.
    - Frontend: `pages/Login.tsx` (new), `App.tsx` gates the whole app behind a token check
      (calls `/api/auth/me` on load; shows Login if that fails or no token exists),
      `api/client.ts` attaches the token to every request (including the three raw
      `fetch()` calls that bypass the shared `request()` helper -- document/lab-data
      upload and template download) and clears the token + reloads to Login on any 401,
      `SettingsPage.tsx` has the change-credentials form (current password + Owner PIN +
      new username + new password) and a Logout button.
    - **Not run through a real FastAPI/SQLAlchemy test** -- the sandbox this was built in
      doesn't have those packages installed and there's no network to add them. The pure
      password hash/verify logic (`hashlib.pbkdf2_hmac`, no DB needed) WAS tested in
      isolation and is correct; every touched file passed a Python/structural compile
      check. The actual login flow (seed -> login -> protected route -> change credentials
      -> old session revoked) has NOT been exercised end-to-end anywhere yet -- **first
      real login after deploying this is the real test**, same as any other change to this
      project. If it doesn't work, check Render logs for a traceback first, same playbook
      as every other bug in this file.

45. **"Log out from all devices" added, 1 Aug 2026, per Raahi's follow-up question.** New
    `POST /api/auth/logout-all` -- revokes every open session (any device/browser), then
    issues the CALLER a fresh one so they don't lock themselves out in the process (the
    point is removing OTHER access, e.g. if Raahi suspects someone else has the login, not
    logging Raahi out too). Only requires being logged in already -- no Owner PIN needed
    (unlike changing credentials), since the worst case of misuse is just having to log
    back in with the password you already know, not an actual account takeover risk.
    Settings -> Account & Login has the button, separate from the regular single-device
    Logout button just above it.

46. **Official logo + branding integrated across the app, 2 Aug 2026, per Raahi's uploaded
    logo file (hexagon + "R" mark over soil layers, navy #0B2A5B / orange #F97316, wordmark
    "RaahiGeo" + tagline "Geotechnical Engineering Platform").** What was done:
    - Logo assets cropped from Raahi's source PNG (no recoloring/reproportioning) into
      `frontend/public/brand/`: `logo-icon.png` (hexagon+R only, square, for header/sidebar/
      favicon use) and `logo-full.png` (icon + wordmark + tagline, tightly cropped, for
      Login page). Favicons generated at 16/32/48/180/512px into `brand/` plus standard-named
      copies at the `public/` root (`favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`,
      `apple-touch-icon.png`, `icon-512.png`) and a `manifest.json` for PWA installs.
    - New shared `frontend/src/components/Logo.tsx` (`variant="icon"` or `"full"`, `size`,
      `linkToHome`) -- use this everywhere instead of a raw `<img>` so the logo stays
      consistent if it's ever swapped.
    - `Sidebar.tsx`: real logo replaces the old gradient-sparkle placeholder box, top-left,
      45px, linked to `/`. `MobileNav.tsx`: added a new fixed top mobile header (34px logo +
      wordmark, was previously missing entirely -- mobile only had the bottom nav) --
      `App.tsx`'s `<main>` got `pt-14 md:pt-0` to avoid content sitting under it.
    - `Login.tsx`: centered full logo (110px wide) above the form, replacing the old lock-icon
      + text lockup (wordmark/tagline are baked into the logo image itself, so no separate
      text elements needed).
    - `App.tsx`'s auth-check loading screen now shows the logo + "Loading RaahiGeo..." instead
      of a bare spinner.
    - New `Footer.tsx` ("© 2026 RaahiGeo. All Rights Reserved." / "Geotechnical Engineering
      Platform"), rendered once at the end of `<main>` in `App.tsx` so it appears on every
      route.
    - `tailwind.config.js`: added `brand.navy` (#0B2A5B) / `brand.orange` (#F97316) as named
      colors, additive alongside the existing dark navy/violet/cyan workspace palette --
      **NOT a full re-theme.** Raahi's brief described a light navy/orange/white visual
      theme throughout, but the app's current design is an intentional dark
      navy/violet/cyan "engineering workspace" look (there's already a working light/dark
      toggle -- see `html.light` rules in `index.css` -- built on that same dark-first
      palette, not the brand colors). Converting every page's actual color scheme to
      navy/orange/white is a much bigger, separate visual-redesign task that touches every
      page and risks breaking the existing polish -- **not done here, flagged to Raahi to
      confirm before attempting.**
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx` on every
      touched file -- only pre-existing `TS7026`/`TS2875` "no react/jsx-runtime" noise
      (present on untouched files too, confirmed missing-`node_modules` artifact), zero
      `TS1xxx` syntax errors.
    - **Separately found while doing this (unrelated to branding):** this doc's Roadmap
      section (item 4) was stale -- see that section's own correction note and the Known
      Limitations correction above. `LiquefactionAnalysis.tsx`, `PileCapacity.tsx`, and
      `LateralCapacity.tsx` are all already fully built + wired to real backend endpoints;
      the doc previously said Liquefaction had no frontend and Pile Capacity hadn't started.

---

47. **Full app-wide light/brand theme (navy #0B2A5B / orange #F97316 / white), 2 Aug 2026,
    per Raahi's explicit follow-up ("professional geotechnical wala lage") after entry #46's
    logo-only pass.** The app previously had ONE fixed visual design (dark navy/violet/cyan
    "engineering workspace"), with only a couple of components (`.glass`, `.gm-input`, body
    bg) having a real `html.light` override wired to the existing dark/light toggle button --
    everything else (~20 pages) used raw dark-mode Tailwind classes with no light variant.
    Rewriting every page's JSX classes individually would've meant touching ~20 files with
    high risk of missed spots and copy/paste-into-Termux friction. **Instead, did this the
    low-risk way:** every `navy-*`/`slate-*`/`violet-*`/`cyan-*` shade in `tailwind.config.js`
    was converted from a fixed hex to a CSS variable (`rgb(var(--x) / <alpha-value>)`), and
    `index.css` now defines two full variable sets: `:root` (the original dark values,
    unchanged) and `html.light` (new brand values -- white/near-white surfaces, brand-navy
    text hierarchy, and violet→orange / cyan→navy-blue accent remapping). Because every page
    already used these exact class names, this re-skins the ENTIRE app -- Dashboard,
    Calculators, Batch Analysis, Liquefaction, Pile Capacity (including its raw
    `bg-slate-900`/`border-slate-800` inputs, a pre-existing inconsistency in that one page --
    `slate-800/900/950` were added to the CSS-variable conversion specifically to catch it),
    Reports, Login, everywhere -- **without editing per-page JSX at all.**
    - `bg-white/[x]` / `border-white/[x]` / `hover:bg-white/[x]` / `hover:text-white` /
      `divide-white/[x]` were used everywhere as a "translucent overlay on a dark surface"
      pattern; on a white page those are invisible, so `index.css` adds substring
      attribute-selectors (`html.light [class*="bg-white/"]` etc.) that catch every one of
      these across every page/component and re-tint them navy instead, again with no
      per-file edits.
    - `.shadow-glow`/`.shadow-glow-cyan` (hardcoded violet/cyan rgba shadows) and
      `::selection` got explicit `html.light` overrides since they don't go through the
      variable system.
    - **App now defaults to the light/brand theme** (`App.tsx`: `useState(false)` for
      `dark`, was `true`) and `index.html` sets `<html class="light">` + `<body
      class="bg-white">` directly so there's no dark-theme flash before React mounts. The
      existing Sun/Moon toggle (Sidebar + Settings) still fully works to switch back to the
      original dark workspace look -- **this was additive, the dark theme was not deleted.**
    - **Known minor cosmetic quirk, not fixed:** the generic `hover:bg-white/[x]` substring
      override can't cleanly distinguish "always-on bg-white/[x]" from "hover-only
      bg-white/[x]" using plain CSS attribute selectors, so a few hover-only tints may show
      a very faint tint (~4.5% navy) at rest instead of only on hover, then a slightly
      stronger tint on actual hover. Purely cosmetic, not a functional bug -- fix would need
      per-element JSX changes if it turns out to matter in practice.
    - **Not visually verified in a real browser** -- this sandbox has no way to run
      `vite build`/`npm install` (no network, no `node_modules`). Verified instead via: (a)
      brace-balance check on the full `index.css`, (b) `node -c` on `tailwind.config.js`,
      (c) `tsc --noEmit` on every touched `.tsx` file (only pre-existing
      `react/jsx-runtime`-missing noise, zero real syntax errors), and (d) manually tracing
      through the CSS-variable/class-name mapping page by page. **First real look at this
      in a browser after deploying is the actual test** -- if any page looks visually wrong
      (a color that didn't remap, low contrast text, etc.), tell the next Claude session
      exactly which page/element so the specific override can be added, rather than
      re-deriving the whole variable-remap approach again.

---

48. **Phase 1 of the "full enterprise redesign" brief Raahi pasted 2 Aug 2026** (a large
    spec asking for a Bentley/PLAXIS/GeoStudio-style redesign: soft-gray bg + white cards,
    dark-navy sidebar, burnt-orange primary / steel-blue secondary, subtle engineering
    background texture, a mega-dashboard listing 20+ calculation modules most of which
    don't exist yet, a full reusable component library, engineering-icon system, etc.)
    **This is a genuinely large, multi-session redesign, not a single-pass job -- said so
    explicitly to Raahi rather than silently attempting all of it.** What Phase 1 covers
    (small, safe, high-leverage, on top of entry #47's variable system):
    - **Fixed a real contrast bug from #47:** page bg and card bg had both become pure
      white (invisible card edges) -- exactly the "white cards blending into background"
      failure this new brief calls out. Now: `--navy-950` (page bg) = soft engineering gray
      `#EEF1F6`, `--navy-900`/`--navy-850` (topbar/cards) = pure white, `--navy-800`
      (inputs) = a faint tint between the two, so cards visibly sit on the page.
    - **Secondary accent retuned to Steel Blue** (`#4682B4` family) in place of the
      generic blue used in #47, per this brief's explicit "Secondary: Steel Blue".
    - **Subtle engineering grid texture** added to `html.light body` (2.5%-opacity
      repeating-linear-gradient grid lines + soft orange/steel-blue radial tints) --
      reads as a faint drafting/graph-paper grid, per the brief's "background must never be
      plain white" requirement.
    - **Sidebar + mobile header/bottom-nav now stay a fixed Dark Navy regardless of the
      light/dark toggle** (new `.force-dark-scope` class in `index.css`, added to
      `Sidebar.tsx`'s `<aside>` and both elements in `MobileNav.tsx`) -- matches this
      brief's explicit "Sidebar: Dark Navy" against light content, the enterprise-software
      convention it's asking for. Only the navy/slate variables are reset locally, NOT
      violet/cyan, so the orange active-nav-item highlight still shows correctly inside the
      dark sidebar. The generic white-overlay re-tint rules from #47 are now scoped with
      `:not(.force-dark-scope):not(.force-dark-scope *)` so they don't fight this.
    - **Explicitly NOT done in this phase** (flagged to Raahi, waiting on scope/priority
      confirmation before attempting): the mega-dashboard-as-control-center redesign
      (listing 20+ modules, most of which -- Slope Stability, Retaining Wall, Ground
      Improvement, Stone Column, GIS, Lab Management, OCR, Batch Reporting -- don't exist
      as real features yet, so a literal implementation of that section would mean either
      fabricating fake modules or a large amount of genuinely new feature-building); the
      full reusable component library (buttons/cards/forms/inputs/dropdowns/tables/
      dialogs/badges as a formal shared system, vs. today's per-page Tailwind classes);
      engineering-icon system per module; table sorting/filtering/search; roadmap-section
      redesign with progress bars. **If Raahi wants to proceed, the sane next slice is
      probably: redesign the Dashboard page itself to surface the modules that ARE real
      (Chat, Document Library, Clause Finder, Formula Library, Batch Analysis, Liquefaction,
      Pile Capacity, Lateral Capacity, Reports, Borehole Logs) as premium cards, and put
      the not-yet-built ones under a clearly-labeled Roadmap section (which already exists
      in concept -- see `pages/planned/`) rather than a first mega-dashboard pass.**
    - Not visually verified in a browser (same sandbox limitation as #47) -- verified via
      `tsc --noEmit` (zero real syntax errors) and CSS brace-balance check only.

---

49. **Dashboard redesigned as a real control center, 2 Aug 2026** (the "sane next slice"
    proposed in #48, confirmed by Raahi). `pages/Dashboard.tsx` rewritten:
    - The old flat 11-icon "quick actions" grid is gone. Replaced with **premium module
      cards grouped into 4 categories** (AI & Knowledge Base, Site Data, Engineering
      Analysis, Reporting & Projects) -- mirrors `Sidebar.tsx`'s own `NAV_SECTIONS`
      grouping and icon choices exactly, so Dashboard and Sidebar stay visually consistent.
      Each card: icon, title, one-line description, and an arrow "open" affordance.
    - **Only real, working pages got a plain card.** The 3 pages that are genuinely
      `ComingSoon.tsx` stubs (Projects, Bookmarks, PDF Chat) got the same card treatment
      but with a small "Coming Soon" badge -- no fake/fabricated modules were added, per
      #48's note about not inventing Slope Stability/GIS/etc. cards for features that don't
      exist.
    - **Found and fixed a pre-existing dead link while doing this:** the old quick-actions
      grid had a "Universal Search" card pointing at `/search`, but that route doesn't
      exist in `App.tsx` (no `SearchPage` import/route at all, despite the file
      `pages/SearchPage.tsx` still sitting on disk) -- it was a 404 waiting to be clicked.
      Dropped it from the Dashboard rather than routing to a page nobody asked to keep;
      `pages/SearchPage.tsx` is still on disk, unused, in case it's meant to come back.
    - Stats row (Total Books/Codes/Indexed Pages/Borehole Profiles/AI status) moved above
      the module grid instead of below it, so the page reads top-to-bottom as "workspace
      status, then everything you can do" -- closer to a control center than a welcome
      screen. Hero copy changed from "Welcome back" to "RaahiGeo Workspace" for the same
      reason.
    - The 3 "Recent" panels (Documents/Conversations/Borehole Profiles) at the bottom were
      left as-is -- they already used the theme-variable-driven classes from #47, so they
      needed no changes to render correctly in the new light theme.
    - Verified with `tsc --noEmit` (zero real syntax errors) -- not yet seen in an actual
      browser (same sandbox limitation noted in #47/#48).

---

50. **Sortable + searchable results table on Batch Analysis, 2 Aug 2026** (Raahi's next
    priority pick after entry #49's Dashboard redesign). `pages/BatchAnalysis.tsx`'s results
    table -- the width×depth combination matrix, potentially the largest table in the app --
    now has:
    - A search box (top-right of the results card) that filters rows by substring match
      against width/length/depth/founding-layer/soil-type/governing/error text.
    - Click-to-sort on every numeric/text column header (B, L, D, Soil type, Shear SBC,
      Settlement SBC, Recommended net/gross, Governing) -- click again to reverse direction;
      a chevron icon shows the active sort column/direction.
    - **Row-expand state (the "Full calc" detail rows) was switched from array-index keys
      to content-based keys** (`${width_m}_${length_m}_${depth_m}`) specifically because
      sorting/filtering changes row order/positions -- index-based keys would have caused
      the wrong row's detail panel to stay expanded after a sort. This was a real
      correctness fix, not just refactoring.
    - Implemented as a plain filter+sort computed inline (not `useMemo` -- table sizes here
      are batch-combination counts, not large enough to need memoization) inside an IIFE so
      the derived `displayedCombos`/`SortTh` helper stay scoped to just this table.
    - **Scope decision:** did NOT add the same treatment to Liquefaction Analysis's or Pile
      Capacity's layer-report tables -- those are per-borehole-layer tables (typically a
      handful of rows), not combinatorial matrices, so sort/search adds much less value
      there. If Raahi wants it anyway for consistency, it's a quick follow-up using the same
      pattern.
    - Verified with `tsc --noEmit` on the touched file (only the same pre-existing
      `node_modules`-missing noise, zero real syntax errors) -- not seen in a browser yet.

---

51. **Richer "engineering atmosphere" background, 2 Aug 2026** (Raahi's next request after
    entry #50's table search/sort, a more detailed brief than #48's simple grid).
    `html.light body` in `index.css` now layers, in order: a fine 40px blueprint/survey
    grid (from #48, kept), a coarser 200px major grid (drafting-sheet minor/major-line
    convention), two off-center `repeating-radial-gradient` rings (read as topographic
    contour lines / a faint geological map, at two different focal points and pitches so
    it doesn't look like one obvious repeating stamp), and the original soft orange/
    steel-blue depth glows from #48. All layers are 1.5-5% opacity, per the brief's
    explicit ceiling. `background-attachment: fixed` was added so the pattern stays put
    (not scrolling with content) for a consistent feel across pages.
    - **Why this doesn't hurt readability (the brief's other big requirement):** it's on
      `body`, and every card/table/form in the app sits on solid opaque white/gray surfaces
      (`.glass`, `bg-navy-850`/`900`, etc. -- see #48) that fully cover the pattern
      underneath. In practice the texture is only ever visible in the page margins/gutters
      around content, never underneath text or table cells -- this was true by construction
      (result of #48's surface-vs-page-background split), not something that needed a
      separate check.
    - Verified via CSS brace/paren balance check only (comments contain parens too, which
      threw the first paren-count check off -- re-checked with comments stripped: balanced).
      Not seen in a real browser -- same standing sandbox limitation as #47-#50.

---

52. **Fixed a real, widespread text-contrast bug, 3 Aug 2026** -- Raahi reported (with a
    screenshot of the Calculators page's active nav item, "SPT N-value Correction," barely
    legible) that font color and background looked nearly identical, and confirmed on
    follow-up this was happening **everywhere in the app, not just Calculators.**
    **Root cause:** `text-violet-300` and `text-violet-400` are used ~50 times across the
    app as accent TEXT color (active nav items, highlighted labels, badges -- e.g. the
    exact `bg-violet-500/15 text-violet-300` pattern on the reported nav item). In
    Tailwind's numbering, low shade numbers are light/bright -- correct for TEXT on the
    original DARK background (#47/#48's `:root` dark theme), but #47's light-theme
    conversion mapped violet-300/400 to light PEACHY-ORANGE tints (since it preserved the
    same relative lightness, just swapping violet's hue for orange's). Light text on a
    now-near-white/pale-orange background is exactly the "same color" complaint --
    genuinely broken contrast, not a one-off.
    **Fix:** `index.css`'s `html.light` block now sets `--violet-300`/`--violet-400` to
    actually DARK, saturated "burnt orange" values (`rgb(194 65 12)` / `rgb(154 52 18)` --
    both pass WCAG AA contrast against white), instead of light tints. `--violet-500`/
    `--violet-600` were left closer to the vivid brand orange since grep confirmed those
    are mostly used for backgrounds/button-gradients/badge-fills (11x `bg-violet-500`, 8x
    `border-violet-500`, 6x `from-violet-500`, etc. -- a low-opacity fill of a vivid color
    reads as a soft tint regardless of exact lightness, so no contrast issue there). Cyan
    (`--cyan-300`/`400`) got the identical fix for the same reason, darkened toward a
    proper dark steel-blue for its 4 text-usages; `--cyan-500` (used for backgrounds/
    badges) kept closer to true steel blue.
    - **This was a one-line-per-variable CSS fix, not a per-component fix** -- exactly the
      payoff of #47's CSS-variable approach: every one of the ~50 text-violet-300/400
      usages across every page got fixed by changing 2 variables in one file, no JSX
      touched.
    - **If Raahi still sees illegible text anywhere after this, it needs a screenshot of
      that specific spot** -- there may be a second, different-colored instance of the same
      class of bug (e.g. if some component hardcodes a light color as an inline style
      rather than a `text-violet-*`/`text-cyan-*` class, this variable fix wouldn't reach
      it). Don't assume this one fix caught every instance without visual confirmation.

---

53. **Fixed the ACTUAL cause of the "invisible input text" bug, 3 Aug 2026** -- entry #52's
    fix (darkening violet/cyan text shades) was real but incomplete: Raahi sent screenshots
    of Batch Analysis showing input fields completely blank/unreadable in light mode, but
    fine in dark mode. **Root cause was different from #52, and more subtle:**
    `navy-950` was being used for TWO unrelated things in the pre-#47 codebase: (a) the
    page's base background color, and (b) as a fixed "guaranteed-dark" text color for
    things sitting on bright surfaces (e.g. an icon on a bright gradient button, `.gm-input`
    text on its white input background). #47's CSS-variable conversion made `navy-950`
    *theme-aware* for reason (a) -- correct, that's the whole point -- but every usage under
    reason (b) broke as a side effect: in light mode, `--navy-950` is now `238 241 246`
    (the light page-bg color, by design), so `text-navy-950` in light mode means "very
    light gray text," not "dark text." `html.light .gm-input { ... text-navy-950 }`
    (written in #47 itself) was exactly this mistake -- light-gray-on-white input text,
    i.e. invisible. Same bug existed in `html.light body { ... text-navy-950 }` (default/
    inherited text color for anything without an explicit text-color class -- a much wider
    blast radius than just inputs) and two component spots (`MobileNav.tsx`'s floating-
    button icon, `SoilProfile.tsx`'s "GWL" badge).
    **Fix:** grepped for every remaining `text-navy-950` usage (4 total, now 0) and replaced
    each with the right tool for what it actually meant:
    - `.gm-input` text and the two "dark text on a bright/colored surface" component spots
      → `text-brand-navy` (the STATIC brand color from `tailwind.config.js`, `#0B2A5B`,
      never theme-variable -- exactly "guaranteed dark regardless of theme").
    - `html.light body`'s text override was simply removed -- body's base rule already sets
      `text-slate-100`, and `slate-100` IS theme-variable and already flips correctly to a
      dark slate in light mode, so no override was needed there at all; the override was
      actively wrong.
    - **Lesson for future edits to this theme system:** `navy-*`/`slate-*` variables mean
      "themed surface/text, adapts with light/dark toggle." `brand-navy`/`brand-orange`
      (already existed in `tailwind.config.js` since #46, just unused until now) mean
      "fixed brand color, same in both themes." Don't reach for `navy-950` or `slate-950`
      when what's actually wanted is "always dark" -- use `brand-navy` for that. Same logic
      would apply in reverse for a hypothetical "always light" need.
    - Verified with `tsc --noEmit` + CSS brace/paren balance (both clean) -- **this is the
      second contrast bug Raahi has had to screenshot before it got caught**, so the next
      session should proactively grep for any other `text-navy-950`/`text-slate-950`-style
      "used as a fixed color, not a themed one" pattern rather than waiting for a third
      report.

---

54. **NEW MODULE: Retaining Wall (geotechnical checks only, Phase 1+2), 3 Aug 2026** --
    Raahi uploaded a real consultant-grade reference workbook
    (`retaining_wall_design.xlsx`, 13 sheets: Cover/Inputs/EarthPressure/WaterPressure/
    SeismicPressure/Stability/BearingCapacity/Settlement/StructuralLoads/RCCDesign/
    Quantities/Charts/Summary) and asked for it to be added. Given the scope (12 sheets,
    comparable to or larger than Pile Capacity), presented a 4-phase breakdown before
    starting rather than silently attempting all of it; **Raahi explicitly chose Phase 1
    (earth pressure/water/seismic/stability/bearing capacity) + Phase 2 (settlement) only
    -- Phase 3 (structural/RCC design, stem/heel/toe/shear-key reinforcement per IS 456)
    and Phase 4 (quantities/charts) were NOT requested and are NOT built.**
    - New `backend/app/services/retaining_wall_calculator.py` -- every formula transcribed
      directly from the workbook's own cell FORMULAS (via `openpyxl` with
      `data_only=False`), not just its displayed values, with the exact source cell
      reference in a comment next to each (e.g. `# [EarthPressure!C6]`) so a mismatch
      against the source can be found instantly by a future session.
    - **Verified against the workbook's own cached computed values** (`data_only=True`)
      for its worked example (H_wall=4, D_found=1.5, B_base=2.8, phi=30, delta=20,
      kh=0.08...) -- every checked output (Ka/Kp, Pa, FoS overturning/sliding, qmax/qmin,
      qu) matched within ~0.02% (rounding-cascade-only difference, not a formula error).
      This is NOT a "looks reasonable" sanity check -- it's a direct number-for-number
      comparison against Excel's own calculated cells.
    - **Two real bugs were found and fixed DURING this verification, not assumed away:**
      (1) hydrostatic force (Pw) was being computed correctly by `water_pressure()` but
      never actually added to the sliding/overturning horizontal driving force or
      overturning moment in `stability_checks()` -- fixed by threading `Pw_used_kn_m`/
      `Pw_ybar_m` through `_case_stability()`, matching the workbook's own
      `Pa_h_ref+Pw_switch` / `Pa_h_ref*ybar+Pw_switch*Pw_ybar`. Also fixed
      `bearing_capacity_is6403`'s load-inclination angle to use the combined
      Pa_h+Pw horizontal force (matching the workbook's own reference to
      `Stability!C26`/`D26`), not raw Pa_h alone.
      (2) A MUCH more subtle bug: every `g.get("field", default)` pattern for an
      Optional input (`delta`, `mu`, `kh`, `kv`, plus a few others fixed defensively)
      silently returned `None` instead of its intended default whenever called through
      the real request path -- because Pydantic's `.model_dump()` always includes every
      field, `None` for any unset Optional one, and Python's `dict.get(key, default)`
      only falls back to `default` when the KEY IS ABSENT, not when it's present with
      value `None`. A test using only the workbook's own explicit worked-example values
      (all fields supplied) would NEVER have caught this -- it only surfaced by
      separately testing the realistic all-optional-fields-omitted payload a real
      frontend submission produces. Fixed with a new `_g(d, key, default)` helper (None-
      safe get) used everywhere an Optional field has a computed fallback. **Lesson for
      future modules with optional Pydantic fields and computed defaults: always test the
      all-nulls-for-optional-fields case, not just the fully-populated worked example --
      they exercise completely different code paths.**
    - New `POST /api/calculators/retaining-wall` endpoint (`RetainingWallRequest` schema
      in `schemas.py`) -- **NOT borehole-aware**, unlike batch/liquefaction/pile/lateral --
      soil is a single backfill/foundation parameter set (~25 direct inputs), matching the
      source workbook's own Inputs sheet, not a layered borehole profile. Could be made
      borehole-aware later (auto-fill gamma/phi/c/qa from a founding layer) if wanted --
      not done here since the workbook itself isn't borehole-integrated either.
    - New `frontend/src/pages/RetainingWall.tsx` -- grouped input form (Geometry / Soil
      Properties / Surcharge & Seismic / Settlement-optional), results shown as
      static-vs-seismic side-by-side tables for Stability and Bearing Capacity (mirrors
      the workbook's own Case A/Case B column layout), plus Earth Pressure / Water
      Pressure / Seismic Pressure summary cards and a warnings panel. Added to
      `App.tsx` (`/retaining-wall`), `Sidebar.tsx`, and `Dashboard.tsx`'s Engineering
      Analysis module cards (new `Boxes` icon -- `Milestone`/`ArrowLeftRight` were
      already taken by Pile/Lateral Capacity).
    - `retaining_wall_stability` removed from `PLANNED_CALCULATORS` in
      `calculators.py` (own dedicated endpoint now, same pattern as pile/liquefaction).
    - **Separately found and fixed while working in `calculators.py` (unrelated to
      retaining walls):** `parse_pile_ai_command` (the Pile Capacity page's
      natural-language command parser, `POST /pile/parse-command`) was completely
      missing its `@router.post(...)` decorator -- meaning that endpoint has never
      actually existed as a route, and the frontend's `parsePileCommand()` calls to it
      have been silently 404ing. Fixed with one added decorator line.
    - Verified with `python3 -m py_compile` (backend) and `tsc --noEmit` (frontend) --
      zero real errors on either. **Not seen in a real browser** (same standing sandbox
      limitation as every other frontend change this session) -- the numeric engine
      itself is now solidly verified against the source workbook, but the new page's
      actual on-screen layout/usability has not been.

---

55. **Lab Sheet upload pipeline analyzed and optimized, 4 Aug 2026** -- Raahi flagged this
    as highest priority ("upload is too slow and sometimes fails"). Scope clarification
    first, since the request's wording didn't quite match this feature's actual
    architecture: **"Lab Sheet upload" = `LabReports.tsx` -> `POST /api/lab-data/upload`,
    Excel-only (.xlsx/.xlsm), parsed with openpyxl -- no PDF, no AI/embeddings involved.**
    PDF documents go through a completely separate pipeline (Document Library ->
    `routers/documents.py` -> `rag/ingest.py`, which DOES use embeddings) -- not touched
    here, since it's a different feature with different bottlenecks. If Raahi actually
    meant that pipeline is also slow, it needs its own separate look.
    - **Root cause found (the real bug, not a guess):** `parse_uploaded_workbook_auto()`'s
      3-tier fallback (own template -> office format -> universal fuzzy-match) was
      re-parsing the ENTIRE file from raw bytes with `openpyxl.load_workbook()`
      independently in EVERY tier it tried -- and tier 2 (`parse_borehole_log_workbook`)
      was called ONCE PER SHEET in a loop, each call doing its own full reload. For a
      real-world N-sheet third-party lab report that doesn't match RaahiGeo's own
      templates (the common case -- most engineers' files come from their own consultant/
      lab, not RaahiGeo's downloadable template), this meant **N+2 completely redundant
      full parses of identical bytes.**
    - **Fix:** `parse_uploaded_workbook_auto()` now calls `load_workbook()` exactly ONCE
      and passes the resulting `Workbook` object through every tier via a new
      `_preloaded_wb` parameter added to `parse_uploaded_workbook()`,
      `parse_borehole_log_workbook()`, and `universal_soil_parser.parse_workbook()` --
      each still works exactly as before when called directly/standalone (parameter
      defaults to `None` -> loads for itself), so nothing that calls these directly
      elsewhere (or the `universal_soil_parser.py` CLI entry point) broke.
    - **Measured, not assumed:** built an 8-sheet, 200-rows/sheet synthetic file
      matching neither fast-path template (forces the worst case), ran the exact
      pre-fix and post-fix code paths 3x each on identical bytes in the same process:
      **old (reload-per-tier): ~2.0s average. New (load-once): ~0.19s average. ~10.5x
      faster** on this file. Real speedup scales with sheet count -- a 20-sheet report
      would have been ~20x redundant before, now still just 1 load.
    - **Other upload-pipeline fixes**, same PR:
      - CPU-bound `parse_uploaded_workbook_auto()` call in the router now runs via
        FastAPI's `run_in_threadpool()` instead of directly in the async request
        handler -- previously blocked the single asyncio event loop (and therefore
        every OTHER concurrent request) for the full parse duration.
      - File-size limit (20MB, generous for what's structurally a small spreadsheet) --
        rejected immediately with a clear message instead of a slow parse that might
        time out or exhaust memory.
      - **Duplicate-upload prevention:** new `source_file_hash` column on
        `BoreholeProfile` (sha256 of the uploaded bytes, added via the startup
        migration in `main.py`, same pattern as the `fines_content_pct` migration).
        Re-uploading byte-identical content now returns 409 with the existing
        borehole IDs/date, instead of silently creating duplicates; a `force=true`
        form field (wired to an "Upload anyway" button in the UI) lets a genuinely
        intentional re-import through.
      - Frontend (`api/client.ts`'s `uploadLabData`, `LabReports.tsx`): switched from
        bare `fetch()` to `XMLHttpRequest` specifically to get real upload-progress
        events (fetch has no upload-progress API) -- shows a live percentage + progress
        bar during byte transfer, then switches to a distinct "Processing file..."
        state for the gap between "all bytes sent" and "server responded" (parsing
        happens after upload completes, so pretending it's done at 100% would be
        misleading). Added a 120s client timeout (generous margin for Render free-tier
        cold start on top of actual parse time) with one automatic retry on
        network-level/timeout failures only -- NOT on application errors (400/409/413),
        which are meaningful and shown to the user immediately instead.
    - **Deliberately NOT built** (would be over-engineering for this feature's real file
      sizes -- lab sheets are small structured spreadsheets, not multi-hundred-MB files):
      true chunked/resumable server-side uploads, and a background-job-with-polling
      architecture. The threadpool fix already prevents the event-loop-blocking problem
      a job queue would otherwise be solving; a full job queue would add real complexity
      (a jobs table, a polling endpoint, cleanup of stale jobs) for a file class that
      now parses in well under a second in the common case. Flagged to Raahi rather than
      silently built or silently skipped -- if a genuinely huge lab file (50+ sheets,
      tens of MB) turns out to be a real use case, revisit this.
    - Verified with `python3 -m py_compile` on every touched backend file and `tsc
      --noEmit` on every touched frontend file -- zero real errors on either. The
      benchmark above is a genuine before/after measurement (not a sanity check) run
      in this sandbox; the parse-time fix itself is proven, but the full upload flow
      (real browser, real network, real Render cold start) has not been watched
      end-to-end by a human yet.

---

56. **ENTERPRISE UI REDESIGN, re-delivered 4 Aug 2026 (frontend-only, no backend/API
    changes)** -- this is the SAME redesign work described below, just re-packaged.
    **What happened:** this was built once already, zipped, and Termux commands were
    given -- but Raahi's copy of the zip wasn't actually on the phone yet (still sitting
    in the Downloads app, not synced to Termux's `~`), so `unzip` silently failed and the
    subsequent `git add/commit/push` ran against a stale, unchanged local copy --
    `git push` correctly reported "Everything up-to-date" because, as far as git could
    see, nothing HAD changed. **Not a code bug** -- confirmed by re-reading the zip
    Raahi uploaded back afterward: it was still the pre-redesign version. This entry's
    redesign is rebased on top of #55's lab-upload-pipeline work (which WAS live on
    GitHub) so neither set of changes overwrites the other.
    - **Key leverage point:** this app's whole color system is already CSS variables
      (`--navy-*`, `--slate-*`, `--violet-*`, `--cyan-*` in `index.css`, consumed via
      `tailwind.config.js`'s `rgb(var(--x) / <alpha-value>)` pattern -- see the 2 Aug
      note in `tailwind.config.js`). That meant re-skinning ~20 page files' worth of
      `bg-navy-900`, `text-slate-400`, `from-violet-500` etc. required editing **one
      file** (`index.css`), not every page individually.
    - **New palette** (`html.light` = default theme, `:root` = dark-mode toggle): swapped
      the `violet` variable slot (was burnt-orange brand accent) to a **teal #0EA5A4**
      family per the brief's exact hex; `cyan` slot (secondary/informational accent, dark
      steel-blue) left unchanged. `navy-950`/`navy-900`/`navy-700` slots (page bg / card
      bg / borders) retuned to the brief's exact `#F6F8FA` / `#FFFFFF` / `#E2E8F0`; text
      slots retuned to `#0F172A`/`#1E293B`. Hardcoded (non-variable) accent rgba's in
      `.shadow-glow`, `::selection`, and `body`'s background-glow were updated to match
      (these don't ride the variable system since they're literal rgba, not `rgb(var(--x))`
      -- same class of gotcha as playbook #52/#53, checked for and fixed here too).
    - **Background pattern:** fine 32px CAD grid, coarse 160px major grid, a shallow-angle
      banding layer standing in for soil-strata/cross-section, two contour-ring layers,
      two soft teal/steel-blue glows -- CSS-gradient-only (no image assets, per the
      brief's performance note), capped at 1.5-4% opacity.
    - **Cards:** `.glass` in light mode changed from translucent `bg-white/80` +
      backdrop-blur to **opaque white**, `backdrop-filter: none`, plus a new theme-
      independent `.shadow-card`/`.shadow-card-hover` (also in `tailwind.config.js`).
      Border-radius already `rounded-2xl` (16px) app-wide -- in the brief's 14-16px
      range, no change needed.
    - **Typography:** `fontFamily.display` changed from `"Space Grotesk"` to `"Inter"`
      (brief: Inter for headings and body); the Space Grotesk Google Fonts import
      dropped from `index.html`.
    - **Sidebar (`Sidebar.tsx`) regrouped:** Dashboard/Projects at top, then
      **Investigation** (Borehole Logs, Lab Data, Soil Profiles), **Foundation Design**
      (Bearing Capacity & Settlement, Pile Capacity, Pile Group, Raft Foundation,
      Retaining Wall, Lateral Capacity, Liquefaction, Ground Improvement, Batch
      Analysis), **Knowledge** (IS Codes, IRC Codes, Formula Library, Clause Finder,
      Document Library), **AI** (AI Assistant, PDF Chat), then Reports/History/
      Bookmarks/Settings. Rail background retinted to the brief's exact Primary
      `#0F172A` (still `.force-dark-scope`, unchanged 3 Aug 2026 convention).
    - **Three new placeholder modules** (`pages/planned/PileGroup.tsx`,
      `RaftFoundation.tsx`, `GroundImprovement.tsx`, routed at `/pile-group`,
      `/raft-foundation`, `/ground-improvement`) -- honest "Coming Soon" placeholders
      (same `ComingSoon` component as Projects/PDF Chat/Bookmarks), **not real analysis
      engines, no backend work done.**
    - **IRC Codes given its own route** (`/irc-codes`, reuses `<Books
      fixedCategory="IRC Codes" />`, same pattern as `/is-codes`) -- fully real, since
      the `IRC Codes` document category already existed in the data model.
    - **Dashboard (`Dashboard.tsx`) restructured:** new **Quick Actions** row (New
      Borehole / Run Analysis / Batch Analysis / Generate Report / Ask AI, all real
      routes), **Project Overview** stat strip (same 5 real-data stats, restyled), module
      grids regrouped to match the new Sidebar (Investigation -> Foundation Design ->
      Knowledge -> AI, was previously AI-section-first). **Deliberately did NOT
      fabricate data** for "Active Projects" / "Pending Reports" / "Completed Reports"
      -- no backend support exists for a Projects entity or a reports-history list
      (`/api/reports` only has `generate`/`section-types`, nothing persisted/listable).
      Built a **Reporting & Projects** section instead with an honest "Engineering
      Reports" quick-launch card next to the existing Projects Coming Soon card. Recent-
      activity panels: **Recent Boreholes**, **Recent Documents**, **Latest Activity**
      (AI conversations) -- all real data, no fabrication.
    - **If a real "Recent Calculations" section is wanted later:** `CalculationLog` rows
      are already written on every calculator run (`calculators.py`) but there's no GET
      endpoint to list them and no frontend client method -- needs a small backend
      addition, out of scope here (frontend-only brief).
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx` against
      this repo's current state (i.e. re-checked AFTER merging onto #55's changes, not
      just the original branch) -- zero new errors, only the standing missing-
      `node_modules` noise every file in this repo already produces (see workflow note
      at the bottom of this doc). Confirmed `client.ts`'s `listDocuments`/
      `listConversations`/`listBoreholes` (which `Dashboard.tsx` depends on) are still
      present after #55's edits to that file. **Not seen in a real browser** -- ask
      Raahi to screenshot both light and dark mode after this actually deploys.
    - **For whoever helps Raahi verify the copy-paste this time:** before running
      `unzip`, run `ls -la <zipname>` and confirm a non-zero file size first -- the
      failure mode above (stale zip silently reused) produces no error until `git push`
      says "Everything up-to-date" on a commit that should have had real changes.

---

57. **Owner PIN helper text removed from Settings screen, 4 Aug 2026** -- Raahi flagged
    that the line under the Owner PIN field ("Set in Render's Environment tab
    (OWNER_PIN) -- separate from your login password, only you should know it.") was
    visible to anyone looking at the screen, which defeats the point of a PIN meant to
    stay private. Removed the `<div>` entirely from `SettingsPage.tsx`'s Account & Login
    form -- the input field itself (masked, `type="password"`) and its label are
    unchanged, only the explanatory hint text is gone. Nothing else on that form touched.

---

58. **Rock Bearing Capacity calculator added -- IS 12070:1987, 4 Aug 2026** -- Raahi
    flagged "rock ke saare SBC missing hai": every existing bearing-capacity module
    (calculators.py, IS:6403, IS:8009) is for SOIL; there was no ROCK module at all.
    New files: `backend/app/services/rock_bearing_capacity.py` (all formulas + full
    source-fidelity notes -- READ ITS MODULE DOCSTRING), `RockBearingCapacityRequest`
    in `schemas.py`, `POST /api/calculators/rock-sbc` in `calculators.py` (removed
    `rock_bearing_capacity` from `PLANNED_CALCULATORS` accordingly), `runRockSbc` in
    `client.ts`, `frontend/src/pages/RockBearingCapacity.tsx`, wired into
    Sidebar/Dashboard/App.tsx under Foundation Design (route `/rock-bearing-capacity`).
    **Implements all 5 methods from IS 12070**, per Raahi's explicit "sab methods +
    jo bhi minimum ho" instruction -- every method is optional input, the backend runs
    whichever ones have enough data and reports the lowest (most conservative) result
    as "governing":
    1. **Classification Table** (Cl 5.2, Table 2) -- rock-type lookup. Uses the
       **Nov 2008 BIS amendment value for Soft Shale (30 t/m2, not the original 1987
       value of 40)** -- checked for and applied, same class of gotcha as always
       cross-checking a code against its amendments, not just the base year.
    2. **RMR Table** (Cl 5.3, Table 3, amended) -- piecewise-linear interpolation
       within each of the 5 RMR classes (using the amended, tightened Class III/IV/V
       ranges). Verified interpolation hits the table's exact boundary values (RMR=100
       -> 600, RMR=81 -> 448, RMR=20 -> 45, RMR=0 -> 30) with a manual script before
       shipping.
    3. **Core Strength Formula** (Cl 6.2) -- `qa (gross) = q0 x Nj`, `Nj = (3 + S/Bf) /
       (10 x sqrt(1 + 300 x delta/S))`. Includes FS=3 already (code's own Note 1).
       Flags a warning (not a hard block) when joint spacing < 0.3m, aperture >
       10mm/15mm(filled), or footing width < 0.3m -- the formula's own stated valid
       range, per Cl 6.2's note.
    4. **Pressuremeter Formula** (Cl 7.2, Table 5) -- `qns = gamma.Df + Ka(Pl -
       gamma.Df)`, Ka interpolated from Table 5's 4 points (depth/radius ratio 0/2/4/10
       -> Ka 0.8/2.0/3.6/5.0). **SOURCE-FIDELITY CAVEAT: this clause's text was
       OCR-garbled in the 1987 scan used to build this** -- the formula was
       reconstructed from the surrounding Table 5 values and the standard
       Menard-pressuremeter pattern, and is flagged with an in-app amber warning
       telling Raahi to cross-check against a clean copy of Cl 7 before relying on it
       for a real submission. Not silently presented as equally certain as the other
       3 methods.
    5. **Plate Load Test** (Cl 8) -- **deliberately NOT a computed formula.** Cl 8 is a
       field-test procedure; the code gives no clean closed-form plate-to-footing
       settlement-extrapolation equation in a legible part of the scan, so rather than
       guess at one, this module just accepts the value Raahi already read off his own
       field pressure-settlement curve at 12mm settlement (per Cl 3.3/8.3) and passes
       it straight through into the "which is lowest" comparison.
    - **Cl 9.1 correction factor** (submerged joints / cavities / unfavourable slope --
      code gives judgement-call ranges like "1 to 1/3", not fixed numbers) is a single
      optional multiplier field, applied only to Methods 1/3/4 **not** RMR (Cl 9.1 says
      corrections don't apply to the RMR method) -- verified this exclusion works
      correctly with a manual test before shipping.
    - **Net vs gross caveat:** Table 2/3 give NET safe bearing pressure; the Cl 6.2
      formula gives GROSS. If a run mixes both kinds of result, the response includes
      a warning telling Raahi they're not directly comparable before he takes the
      "governing minimum" as a final design number -- flagged rather than silently
      compared as like-for-like.
    - Formulas hand-verified against the table before shipping (see the calculation
      log in this session) -- all Table 2/Table 3 boundary values matched exactly, and
      the orchestrator's minimum-picking logic was confirmed correct on a 3-method run.
      Verified with `python3 -m py_compile` across the whole backend tree and
      `tsc --noEmit` on every changed frontend file -- zero new errors on either.
      **Not seen in a real browser and not run against a real project's rock data** --
      same standing sandbox limitation as every other change this session. Ask Raahi
      to run at least one real rock site through this before trusting it on a live
      submission, especially the Cl 7 (pressuremeter) method given the caveat above.

---

59. **Deploy-breaking bug in entry #58 fixed, 4 Aug 2026** -- backend failed to start
    (`ImportError: cannot import name 'RetainingWallRequest' from 'app.schemas'`).
    Cause: when `RockBearingCapacityRequest` was inserted into `schemas.py` right
    before `RetainingWallRequest`, the edit accidentally deleted the line
    `class RetainingWallRequest(BaseModel):` itself while keeping its docstring and
    every field below it -- since those lines were still correctly indented, Python
    silently treated them as MORE fields of `RockBearingCapacityRequest` instead of
    raising a syntax error, so `python3 -m py_compile` (which only checks syntax, not
    whether the right classes/names exist) reported no problem. The class
    `RetainingWallRequest` effectively stopped existing, so `calculators.py`'s
    `from app.schemas import ... RetainingWallRequest` failed at import time on
    Render -- worked perfectly on the sandbox's compile check, failed for real on
    deploy. **Lesson for next time:** `py_compile`/`tsc --noEmit` catch syntax errors,
    not "did I accidentally merge two classes into one" -- for schema/model files
    specifically, grep for every expected `class X` name still existing as its own
    line is a cheap extra check worth doing before shipping. Fixed by restoring the
    missing class declaration line; `RetainingWallRequest` and
    `RockBearingCapacityRequest` are confirmed as two separate classes with their own
    distinct fields again (checked both `grep -n "^class "` and a full-tree
    `py_compile` after the fix).

---

60. **Ground Improvement calculator built out (was Coming Soon), 5 Aug 2026** -- Raahi
    pointed at the "Ground Improvement" Coming Soon card and asked for all 4 listed
    features with full detail. New files: `backend/app/services/ground_improvement.py`
    (all formulas + full source-fidelity notes per sub-tool -- READ ITS MODULE
    DOCSTRING), `GroundImprovementRequest` in `schemas.py`, `POST
    /api/calculators/ground-improvement` in `calculators.py`, `runGroundImprovement` in
    `client.ts`. `frontend/src/pages/GroundImprovement.tsx` **replaces** the old
    `pages/planned/GroundImprovement.tsx` Coming-Soon placeholder -- App.tsx's import
    now points at the real page; Sidebar.tsx/Dashboard.tsx had their `soon: true` flag
    removed for this entry. (The old placeholder file itself was left in place, just
    unreferenced -- harmless, not worth a special cleanup step.)
    **Learned from entry #59's mistake:** re-verified `grep -n "^class "` on
    `schemas.py` immediately after inserting `GroundImprovementRequest`, before moving
    on to the router -- confirmed no class declaration got silently eaten this time.
    **Unlike Rock Bearing Capacity, this is 4 INDEPENDENT sub-tools, not competing
    methods for one number** -- no "governing minimum" concept here, the endpoint just
    runs whichever sub-tool(s) have enough inputs and returns all of them together:
    1. **Stone Column spacing & improvement factor** -- IS 15284 (Part 1):2003, Cl 7.5
       (area replacement ratio `as = 0.907*(D/S)^2` triangular / `(pi/4)*(D/S)^2`
       square), Cl 7.6 (stress concentration factor n, typically 2.5-5, left as an
       engineer-supplied input with a range-check warning), Annex B Reduced Stress
       Method (`sigma_soil = sigma/(1+(n-1)*as)`, settlement improvement factor
       `mu = 1+(n-1)*as`). **HIGH CONFIDENCE** -- verified against an archive.org OCR
       copy of the actual standard, AND the 0.907 constant was independently
       cross-checked algebraically (0.907 = pi/(2*sqrt(3)), exactly the geometric
       ratio it should be) -- this is a different, more rigorous check than entry #58
       could do for the Rock SBC pressuremeter clause, and it passed.
    2. **Preloading + PVD consolidation timeline** -- Barron (1948) radial
       consolidation / Hansbo (1981) band-drain adaptation + Terzaghi vertical
       consolidation combined via Carrillo's (1942) approximation. **HIGH CONFIDENCE**
       -- this is universal, cross-checked-everywhere textbook material, not a single
       degraded scan (unlike the Rock SBC pressuremeter caveat). Deliberately does NOT
       model smear zone or well resistance (both dropped -- "ideal drain" case only) --
       flagged in every result as making the predicted timeline somewhat optimistic
       (faster) than a real, smeared installation. Supports both directions: given an
       elapsed time -> degree of consolidation, OR given a target degree of
       consolidation -> required time (binary search, since Carrillo's combination
       isn't cleanly invertible in closed form). Verified round-trip: solved for time
       to reach 90% U, then fed that time back through the forward calculation and got
       90.0% back out, before shipping.
    3. **Vibro-compaction feasibility check** -- simplified fines-content screening
       rule (<10% suitable, 10-20% marginal, >20% not suitable -- prefer stone
       columns), a widely cited rule of thumb rather than a single code clause.
       **MEDIUM CONFIDENCE**, explicitly labelled in the result as a preliminary
       screen, not a substitute for a field trial.
    4. **Recommendation linked to liquefaction/settlement results** -- rule-based
       guidance text (not a formula): flags FS_liquefaction < 1.0 (or 1.0-1.25 as
       marginal) and predicted-settlement > allowable, and suggests stone columns vs
       vibro-compaction depending on fines content. **This is NOT pulled automatically
       from a prior Liquefaction/Settlement run** -- there's still no calculation-log
       listing endpoint (see entry #56's note on this same gap) -- Raahi has to type
       the FS/settlement numbers in manually from his own earlier run.
    - Verified with a battery of manual sanity tests before shipping (not just
      py_compile): area-replacement-ratio triangular-vs-square ordering, settlement
      improvement factor increasing with n, the de=1.05S/1.13S equivalent-diameter
      formula cross-checked algebraically against its own area definition, PVD U%
      monotonically increasing with time, PVD target-time/forward-check round-trip
      matching to 0.5%, vibro-compaction verdict boundaries, and the orchestrator
      correctly running only the sub-tools that had enough input. Full-tree
      `python3 -m py_compile` and `tsc --noEmit` on every changed frontend file --
      zero new errors on either. **Not seen in a real browser and not run against a
      real project's ground-improvement data** -- same standing sandbox limitation as
      every other change this session.

---

61. **Ground Improvement — in-app "Theory / Calculation kaise hui" panels added,
    5 Aug 2026** -- Raahi asked (via a screenshot of the live Ground Improvement page)
    for the calculation theory behind every sub-tool to be visible in-app, in detail,
    with diagrams, including which IS code / source was used. Frontend-only change,
    no backend/schema changes needed (all theory content is static text + inline SVG,
    not computed).
    - New file: `frontend/src/components/TheorySection.tsx` -- reusable collapsible
      "Theory / Calculation kaise hui" block (closed by default, click to expand).
      Shows: title, source citation (IS code clause / researcher names), a
      confidence badge (High/Medium/Low, matches the confidence levels already
      documented in `ground_improvement.py`'s module docstring), an optional inline
      SVG diagram, a list of formula steps, and an extra caution note.
    - `frontend/src/pages/GroundImprovement.tsx` -- added 3 inline SVG diagram
      components (`StoneColumnDiagram` -- triangular pattern top view with D/S
      labelled; `PvdDiagram` -- band drain cross-section with de/dw/drainage-path
      and radial+vertical flow arrows; `VibroDiagram` -- fines-content suitability
      scale) and wired a `<TheorySection>` into all 4 result cards (Stone Column,
      PVD, Vibro-Compaction, Recommendation), each with the exact formulas from
      `ground_improvement.py` transcribed into the UI (area replacement ratio,
      settlement improvement factor, Barron/Hansbo/Carrillo consolidation formulas,
      fines-content screening thresholds, and the recommendation engine's rule
      logic). Diagrams are plain inline SVG (no image files, no network calls) so
      they render instantly and theme correctly in both light/dark mode via
      `currentColor`/CSS variables.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx` on
      both changed files -- zero `TS1xxx` (real syntax) errors; only the usual
      missing-`node_modules` noise (`TS2307`/`TS7xxx`) which is expected in the
      sandbox. **Not seen in a real browser** -- same standing sandbox limitation
      as every other change this session; ask Raahi to open Ground Improvement,
      run each sub-tool, and click the new "Theory" toggle under each result card
      to confirm the diagrams render and the panel expands/collapses correctly.
    - **Only `frontend/` changed this round** -- Raahi only needs to replace the
      `frontend` folder, not `backend`.

---

62. **Lateral Pile Capacity — "Theory / Calculation kaise hui" panel + live Fig.3
    graph added, 5 Aug 2026** -- Raahi asked for the same theory-panel treatment on
    the Lateral Pile Capacity page, specifically wanting a manual calculation
    explanation with a graph. Frontend-only change.
    - `frontend/src/pages/LateralCapacity.tsx` -- added a `<TheorySection>` (same
      reusable component from the Ground Improvement update) covering: nh/K
      subgrade modulus lookup, stiffness factor T/R, pile behaviour classification,
      the L1/stiffness ratio, the Fig.3 chart factor, equivalent cantilever length,
      and the safe-load formula -- all transcribed from
      `backend/app/services/pile_calculator.py`'s `run_lateral_capacity()`.
    - New `EquivalentCantileverDiagram` (inline SVG) -- schematic showing L1 (free
      length above ground), Lf (depth to virtual fixity), Leq = L1+Lf, and the
      deflected shape under load P.
    - New `Fig3Chart` -- an actual **live graph** of IS:2911's Fig.3 curve (free-head
      and fixed-head lines), redrawn in-browser from a DISPLAY-ONLY mirror of the
      same digitized/polynomial data in `pile_calculator.py`
      (`_fig3_factor_clay_ocs` / `_fig3_factor_sand`). A dot marks exactly where the
      current pile's L1/stiffness ratio lands on the curve, using the real chart
      factor values returned by the backend (not recomputed) -- so the dot position
      is always trustworthy even if the redrawn curve line itself were ever slightly
      off. Auto-switches between the clay-OCS polynomial curve (x range 0-1) and the
      sand/NCS piecewise-linear curve (x range 0-10) based on the result.
    - No new npm dependency added (no recharts/chart.js) -- kept as plain inline SVG
      to avoid any `npm install` / build-risk on Render for a mobile-only workflow.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx` --
      zero `TS1xxx` (real syntax) errors, only the usual missing-`node_modules`
      noise. **Not seen in a real browser** -- ask Raahi to run a Lateral Capacity
      calc (both a sand case and a clay case, since the graph range switches) and
      confirm the graph renders, the dot sits on the curve, and the diagram looks
      right.
    - **Only `frontend/` changed this round.**

---

63. **Rock Socket Pile Capacity -- new calculator, IRC:78 Appendix-5 Method 1 &
    Method 2, 5 Aug 2026** -- Raahi asked for "rock ka pile wala socketing
    method 1 and 2 according to IS 78" (= IRC:78, a road-bridge foundation
    code, not an IS code -- confirmed via web search). This is a genuinely NEW
    calculator, distinct from `rock_bearing_capacity.py` (IS 12070, shallow
    foundations sitting ON rock) -- this one is for a PILE SHAFT SOCKETED INTO
    rock (end bearing + side shear combined).
    - Raahi uploaded his own reference workbooks (`Method_I_sheet.xlsx`,
      `Method_II_sheet.xlsx`) -- every formula was dug out of the actual Excel
      cell formulas (openpyxl, not OCR/guessing) and cross-checked cell-by-cell
      against the workbook's own cached calculated values until they matched
      to within 0.001%. This is the highest-fidelity source this project has
      had for any calculator so far -- Confidence: **High** for both methods.
    - New `backend/app/services/rock_socket_pile.py` -- `run_rock_socket_pile()`
      dispatches to Method 1 (`qc`/UCS-based, needs rock core strength) or
      Method 2 (SPT-N / IRC:78 Table 6 based -- Cub/Cus/crushing-strength are
      MANUAL inputs, same as the workbook itself, since Table 6 correlates
      rock quality+SPT to shear strength and isn't a closed-form formula).
      Both give: safe end bearing, safe socket shear, safe pile capacity in
      compression (sum), self-weight, and safe pile capacity in uplift
      (0.7×socket shear + submerged self-weight). Also auto-suggests which
      method applies based on (CR+RQD)/2, RQD, and qc, per the workbook's own
      selection criteria (Method 1 if (CR+RQD)/2 > 30% AND RQD > 0 AND
      qc > 10 MPa, else Method 2) -- flags a warning if the user picked the
      "wrong" method per that rule, without blocking them.
    - New `RockSocketPileRequest` schema, new `/api/calculators/rock-socket-pile`
      endpoint, new `api.runRockSocketPile()` client function.
    - New page `frontend/src/pages/RockSocketPile.tsx` -- Method 1/Method 2
      toggle, geometry + method-specific inputs, result cards, and a
      `<TheorySection>` (same reusable component as Ground Improvement /
      Lateral Capacity) with a schematic cross-section diagram (rock socket
      showing end-bearing arrows at the tip, socket-shear arrows along the
      sides, the "top 0.3m ignored" zone greyed out) and the exact formula
      steps per method. Added to Sidebar nav ("Rock Socket Pile", under
      Foundation Design) and App.tsx routing (`/rock-socket-pile`).
    - **NOT implemented (deliberately, scope of this pass)**: the workbook's
      "Lateral Load / Moment Carrying Capacity of Socketed Pile" section
      (rows F56:K76 of Method_I_sheet.xlsx) -- computing required socket
      length from a TRIAL horizontal force + moment, using the rock's
      permissible compressive strength. This is a materially different
      calculation (beam-on-elastic-foundation style, not end-bearing+shear)
      and needs a trial load the engineer picks, not a clean input --
      flagged to Raahi as a possible follow-up, not silently dropped. Also
      not implemented: Method 2's "+1 diameter" what-if row (I41/K52) -- its
      end-bearing cap logic doesn't match the base-case row in the source
      workbook itself (looks like an inconsistency in the workbook, not a
      second intentional formula), so only the base-case formula was used.
    - Precision notes worth knowing: Method 1's workbook uses exact `PI()`
      (rounded 2dp) for pile circumference and a flat unit weight of 15 for
      self-weight; Method 2's workbook uses the `22/7` approximation (rounded
      3dp) for circumference and the exact `25−9.807=15.193` for self-weight
      unit weight. Both quirks were matched exactly per-method rather than
      unified, so each method's output lines up 1:1 with its own source sheet.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx`
      (frontend, zero TS1xxx errors) and `ast.parse` + a live run against the
      workbook's own numbers (backend, exact match). **Not seen in a real
      browser** -- ask Raahi to run both methods with his own project data and
      compare the output side-by-side against his Excel one more time before
      trusting it for a real submission, even though the digitization was
      unusually rigorous this time.

---

64. **Pile Compression/Uplift + Batch Analysis settlement -- theory panels added,
    5 Aug 2026** -- Raahi asked for the stress-diagram/influence-zone theory to
    be shown for the Pile Capacity (Compression + Uplift) page and for the
    settlement part of Batch Analysis, same as the earlier theory-panel work.
    Frontend-only, no backend changes.
    - `frontend/src/pages/PileCapacity.tsx` -- new `PileStressDiagram` (inline
      SVG): shows the overburden stress (σ'v) diagram along the pile shaft as
      a widening-then-flat shape, the critical-depth line (15D for IS:2911,
      20D for IRC:78) where σ'v FREEZES, skin friction arrows along the whole
      shaft, and the end-bearing arrow at the toe. A `<TheorySection>` below
      the results explains: how σ'v builds up (with the water-table effective-
      density correction), what critical depth/influence-zone means and why
      it exists (deep uniform strata don't keep gaining friction/bearing
      forever -- a real field-test-backed plateau), the skin-friction formula
      per segment (α·c + K·σ'v·tanφ), and the 3-depth end-bearing check
      (toe−2D/toe/toe+2D, lowest governs) -- all transcribed directly from
      `pile_calculator.py`'s own logic and existing warnings.
    - `frontend/src/pages/BatchAnalysis.tsx` -- new `SettlementInfluenceDiagram`
      (inline SVG): classic footing + pressure-bulb shape narrowing with
      depth, the influence-zone boundary (Df + 1.5×B) dashed, and a Δσ = Iz×q
      annotation. A `<TheorySection>` was added once at the top of the
      results (inside the "Critical combination" card, so it shows regardless
      of which row's "Full calc" is expanded) explaining: what the influence
      zone is and how it's set (Automatic Df+1.5B, or the existing manual
      override field), what the Boussinesq/Steinbrenner stress-influence
      factor Iz does (reduces surface pressure q to Δσ at depth z), how each
      real borehole layer inside the zone gets summed, the water-table Aw
      correction, and that the whole thing is solved by bisection for the
      pressure matching the allowable settlement input -- transcribed
      directly from `run_settlement_multilayer()`'s own docstring/logic in
      calculators.py.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx`
      on both changed files -- zero `TS1xxx` (real syntax) errors, only the
      usual missing-`node_modules` noise. **Not seen in a real browser** --
      ask Raahi to run a Pile Capacity calc and a Batch Analysis, and confirm
      both new "Theory / Calculation kaise hui" toggles expand correctly and
      the diagrams render.
    - **Only `frontend/` changed this round.**

---

65. **App-wide Hinglish -> English cleanup, 5 Aug 2026** -- Raahi pointed out that
    several places in the app itself (not this chat -- the actual UI text
    shown to users of RaahiGeo) were in Hinglish, mostly from earlier updates
    this session (the Theory panel button label, a couple of explanatory
    notes) plus some pre-existing error messages that had always been in
    Hinglish. All converted to English. Frontend-only, text-only change (no
    logic touched). Files changed:
    - `frontend/src/components/TheorySection.tsx` -- the "Theory / Calculation
      kaise hui" toggle button label -> "Theory / How this was calculated".
    - `frontend/src/pages/RockSocketPile.tsx` -- Method 2's Cub/crushing-
      strength/Nc manual-input note.
    - `frontend/src/pages/PileCapacity.tsx` -- "Select a borehole first" /
      "Provide both pile diameter and length" validation messages.
    - `frontend/src/pages/LateralCapacity.tsx` -- borehole-required message,
      the Fig.3 chart-factor note ("see graph below"), and the Fig.3 chart
      caption under the new graph.
    - `frontend/src/pages/LiquefactionAnalysis.tsx` -- borehole/magnitude/
      seismic-zone-or-PGA validation messages (these were pre-existing
      Hinglish, not from this session's changes).
    - `frontend/src/pages/BatchAnalysis.tsx` -- borehole-required, width/depth-
      required, and the 400-combination-limit validation messages
      (pre-existing).
    - `frontend/src/pages/RetainingWall.tsx` -- the per-field "provide a valid
      number" validation message (pre-existing).
    - Searched the WHOLE `frontend/src` tree with several rounds of
      progressively broader Hindi/Hinglish word patterns (not just the files
      touched this session) to make sure nothing was missed -- final sweep
      came back clean. If Raahi spots any more Hinglish in the live app later,
      it slipped past this search and should be flagged directly.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx`
      on all 7 changed files -- zero `TS1xxx` errors.
    - Note: this chat itself (between Raahi and Claude) stays in Hinglish as
      always -- only the app's own UI text was in scope here.

---

66. **Orphaned vector-chunk fix + cleanup endpoint, 7 Aug 2026** -- Raahi got a Chat
    answer citing a source file ("GT REPORT OF ASL-35-2025 BORE HOLE 115-116 REVISED.pdf")
    that does NOT appear in the Document Library. Root cause: `rag/retrieval.py` queried
    the vector store (Chroma/pgvector) purely by embedding similarity, with no check
    against the `documents` table -- so if a document's chunks ever end up in the vector
    store without a matching `Document` row (deleted outside the normal delete flow,
    a partial/interrupted indexing run, or a leftover from before persistent storage was
    configured), those "orphaned" chunks stay searchable and citable forever, even though
    the file shows up nowhere in the app. Two-part fix, backend-only:
    - `rag/retrieval.py` -- `retrieve()` now cross-checks every chunk's `document_id`
      against the current `documents` table (status=`indexed`) and silently skips any
      chunk whose parent document no longer exists, before scoring/returning results.
      Self-healing: takes effect on the very next question, no restart/cleanup needed.
    - New `POST /api/documents/cleanup-orphans` endpoint -- permanently purges orphaned
      chunks from the vector store itself (both Chroma and pgvector backends got a new
      `delete_orphaned_chunks()` function). The retrieval-time skip above stops them from
      being *cited*; this endpoint actually removes the dead weight from storage. Safe to
      run anytime (Swagger docs page, or any HTTP client) -- only deletes chunks with no
      matching `Document` row, returns `{"orphaned_documents_purged": N}`.
    - **Not yet root-caused**: exactly how this particular file's chunks became orphaned
      in the first place (Raahi confirmed it was never in the Library / doesn't recall
      uploading it). Candidates: deleted directly in the DB outside the app's own delete
      endpoint, or a leftover from before persistent Postgres/pgvector was set up. Not
      fully diagnosed -- if orphaned chunks keep reappearing after running cleanup-orphans,
      that's a sign something is still writing chunks without a matching Document row, and
      needs a deeper look at the upload/indexing flow.
    - Verified with `python3 -m py_compile` on all 4 changed backend files -- zero syntax
      errors.
    - `backend/` only changed this round.

---

67. **Cleanup-orphans made reachable from the UI, 7 Aug 2026** -- follow-up to #66. Raahi
    tried hitting `POST /api/documents/cleanup-orphans` directly by URL/Swagger and got
    `{"detail":"Not authenticated."}` -- the whole backend requires a Bearer session token
    (see `main.py`'s auth middleware, `PUBLIC_PATHS = {"/api/auth/login", "/api/health"}`),
    and neither a raw browser URL nor Swagger's default "Try it out" attaches that token.
    Rather than walk Raahi through manually copying a Bearer token into Swagger, added a
    real button in the app (already-logged-in session handles auth automatically):
    - `frontend/src/api/client.ts` -- new `cleanupOrphanedChunks()` calling the same
      endpoint from #66.
    - `frontend/src/pages/SettingsPage.tsx` -- new "Clean up deleted-document references"
      button (Settings page, under the existing action-buttons row). Shows a loading state,
      then either "removed leftover data for N deleted document(s)" or "nothing to clean
      up" inline -- no page reload needed.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx` on both
      changed files -- zero `TS1xxx` errors.
    - **Action needed from Raahi**: after deploying, go to Settings page and click the new
      button once to purge the existing orphaned chunks (the #66 fix already stops them
      from being cited, but they still sit in storage until this runs).
    - Both `backend/` (from #66, unchanged since) and `frontend/` changed this round --
      copy both folders over.

---

68. **Removed stale OpenAI/gpt-4o text from Settings, 7 Aug 2026** -- Raahi flagged that
    the Settings page still showed "AI Model: ...currently gpt-4o" and "Your OpenAI key
    stays in the backend's .env file" -- leftover text from before the app switched to
    Gemini early on, never updated. Removed both blocks entirely from
    `frontend/src/pages/SettingsPage.tsx` (Raahi asked to just remove them, not replace
    with correct Gemini text). Frontend-only, text removal, no logic touched.
    - Verified with `tsc --ignoreConfig --noEmit --skipLibCheck --jsx react-jsx` -- zero
      `TS1xxx` errors.
    - `frontend/` only changed this round.

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
