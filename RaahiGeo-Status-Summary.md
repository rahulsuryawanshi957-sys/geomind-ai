# RaahiGeo — Status Summary

## Latest work — 22 Aug 2026: Making data persistent (survive restart/redeploy)

**The situation found on inspection:** the persistence architecture was
*already fully built* in the code, in three independent, auto-switching
pieces — it just wasn't turned on yet:

| What | Where it lives today (not configured) | Where it lives once configured | Switches on |
|---|---|---|---|
| Borehole/lab data, documents metadata, chat history, calc logs, login | Local SQLite file (`backend/data/db/raahigeo.db`) | External Postgres (e.g. Supabase free tier) | `DATABASE_URL` env var |
| RAG search index (embedded chunks) | Local disk ChromaDB (`backend/data/chroma/`) | **pgvector, inside the same Postgres database** — no separate service | Automatically, the moment `DATABASE_URL` is Postgres (see `app/rag/vectorstore.py`) |
| Uploaded PDF files themselves | Local disk (`backend/data/uploads/`) | Supabase Storage (bucket `documents`) | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` env vars |

All three are wiped by Render's free tier on every restart/redeploy/15-min-idle
spin-down today, because none of those three env vars are currently set.
`app/database.py`, `app/models.py`, `app/rag/pgvector_store.py`,
`app/services/file_storage.py` needed **zero code changes** — they were
written from the start to switch backends automatically based on which env
vars are present.

**Update from Raahi (22 Aug 2026):** Render's `raahigeo-backend` service
already has `DATABASE_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_KEY` set —
this was done before this fix was written. `GET /api/health` on the live
deploy confirmed `"database":"external (persistent, check your DATABASE_URL)"`,
meaning borehole/lab data, documents metadata, chat history, and login are
already landing in Postgres. The `vector_store`/`file_storage` fields on that
same live check still showed the OLD, buggy "local disk (WIPED...)" message
purely because this code fix (below) hadn't been deployed yet — not because
pgvector/Supabase Storage weren't actually active.

**What was actually changed (small, code-review-only fix):**
- `backend/main.py`'s `/api/health` endpoint had a small bug: it only checked
  `CHROMA_API_KEY` to decide the `vector_store` status, so it would have kept
  reporting "local disk (WIPED...)" even *after* Postgres/pgvector was
  correctly active — misleading for exactly the kind of check needed here.
  Fixed to check Postgres first, and added a `file_storage` field (wasn't
  reported at all before) so `/api/health` now honestly shows the persistence
  status of all three pieces above, independently.

**Verification done in this sandbox (no live network/Postgres available here):**
- `python3 -m py_compile` clean across the whole backend tree.
- Simulated the new `/api/health` logic across all 4 realistic config
  combinations (nothing set / Postgres only / Postgres+Storage / SQLite+Chroma
  Cloud) — each reports correctly, and the "nothing set" case is byte-for-byte
  unchanged from before, so no regression.
- Reviewed `app/models.py`: every column uses plain SQLAlchemy types
  (String/Integer/Float/DateTime/Text/Boolean) with no SQLite-specific
  behavior — safe on Postgres as-is.
- Reviewed `main.py`'s startup column-migration block (adds
  `soil_layers.fines_content_pct` etc. to older DBs): already
  Postgres-compatible — it already does per-statement try/`rollback()`
  around each `ALTER TABLE`, which is exactly what Postgres needs since one
  failed statement aborts the rest of that transaction otherwise.
  `requirements.txt` already has `psycopg2-binary` for the Postgres driver.
- Live confirmation after this deploy: check `GET /api/health` again --
  `database`, `vector_store`, and `file_storage` should all read
  "persistent" once this code reaches Render.

**Next step for Raahi:** upload a test borehole, then manually restart the
`raahigeo-backend` service from the Render dashboard (Manual Deploy ->
Restart), and confirm the borehole is still listed afterwards -- that is the
real end-to-end persistence test.

---

## Previous fix — 21 Aug 2026: "Network error" on deployed frontend (CORS)

**Symptom:** Frontend deployed at the custom domain `raahigeo.in` showed
"Network error — could not reach the server" on API calls (Lab Data upload,
Borehole List, and potentially others), even though the backend itself was
healthy and reachable directly.

**What was checked:**
| Area | Finding |
|---|---|
| `VITE_API_URL` | Correct — `render.yaml` sets it to `https://geomind-ai.onrender.com` for the frontend static site build. Not the cause. |
| Frontend API config (`frontend/src/api/client.ts`) | Correct — all calls go to `${VITE_API_URL}/api/...`, including `listBoreholes()` (`/api/lab-data`) and `uploadLabData()` (`/api/lab-data/upload`). Not the cause. |
| FastAPI backend URL | Correct — `https://geomind-ai.onrender.com`, matches what the frontend calls. Not the cause. |
| **CORS configuration (`backend/app/config.py`)** | **ROOT CAUSE.** The default `CORS_ORIGINS` allowlist only included `https://geomind-ai-1.onrender.com` + localhost — it never included `https://raahigeo.in` / `https://www.raahigeo.in`. |
| Lab Data upload API (`/api/lab-data/upload`) | Endpoint logic itself is fine. Was unreachable from `raahigeo.in` purely due to the CORS block above. |
| Borehole List API (`/api/lab-data`) | Same — endpoint logic is fine, was equally blocked by the same CORS gap. |

**Fix applied (backend only, 3 files, all just the CORS origin list):**
- `backend/app/config.py` — default `CORS_ORIGINS` now includes `https://raahigeo.in` and `https://www.raahigeo.in`.
- `backend/.env.example` — updated to match.
- `render.yaml` — updated to match.

---

## Current overall status

RaahiGeo AI is a RAG-based geotechnical engineering assistant (React + FastAPI
+ Google Gemini), deployed on Render free tier, with a custom domain
(`raahigeo.in`) in front of the frontend, and Postgres/Supabase already
configured for persistence. The Batch Analysis milestone (lab data import →
calculators → matrix engine → liquefaction/pile/lateral → report generation →
pile groups → soil replacement → comparison → method selection → formula
versioning → full traceability → performance hardening) is complete.

For full build history, architecture, known issues, and roadmap, see
`PROJECT_STATUS.md` in the repo root — that remains the single source of
truth; this file is a shorter pointer summary.
