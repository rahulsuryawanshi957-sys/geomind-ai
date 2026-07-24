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
  Elastic (immediate) settlement is off by default in the multi-layer engine, water-table
  correction isn't yet applied per sub-layer there either -- see the engine's own
  `warnings` output for what a given run actually included.
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
