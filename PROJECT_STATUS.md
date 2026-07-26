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
- No liquefaction calculator yet.
- No pile capacity calculator yet.
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
4. **✅ BACKEND DONE (25 Jul 2026), NO FRONTEND YET — Liquefaction.** IRC:SP:114 / IS
   1893:2016 simplified procedure (Seed-Idriss CSR, NCEER 1997 CRR curve fit,
   Idriss-Boulanger fines correction/Ksigma/MSF), `run_liquefaction_analysis()` in
   `calculators.py` + `POST /api/calculators/liquefaction` -- reads the SAME borehole/
   SoilLayer records already used for SBC batch analysis (Raahi's request: "isko bhi
   soil sheet se connect karna"). See debugging playbook #21 for the full build/audit
   notes and the one deliberate deviation from the source Excel (water-table-aware
   effective stress). **Pile Capacity (IS 2911) is next, not started.**
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
