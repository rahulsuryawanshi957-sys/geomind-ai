# RaahiGeo — Status Summary

## Latest fix — 21 Aug 2026: "Network error" on deployed frontend (CORS)

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
| **CORS configuration (`backend/app/config.py`)** | **ROOT CAUSE.** The default `CORS_ORIGINS` allowlist only included `https://geomind-ai-1.onrender.com` + localhost — it never included `https://raahigeo.in` / `https://www.raahigeo.in`. When the frontend is loaded from the custom domain, the browser blocks every cross-origin API call before it reaches the server, and reports that to JavaScript as a plain "network error" (not a CORS-specific error) — which is exactly the message users were seeing. |
| Lab Data upload API (`/api/lab-data/upload`) | Endpoint logic itself is fine (was already hardened for large multi-borehole files on 21 Aug 2026, see PROJECT_STATUS.md changelog #102). It was unreachable from `raahigeo.in` purely due to the CORS block above. |
| Borehole List API (`/api/lab-data`) | Same — endpoint logic is fine, was equally blocked by the same CORS gap. |

**Fix applied (backend only, 3 files, all just the CORS origin list):**
- `backend/app/config.py` — default `CORS_ORIGINS` now includes `https://raahigeo.in` and `https://www.raahigeo.in`.
- `backend/.env.example` — updated to match, so the documented default is correct.
- `render.yaml` — updated to match, so the infra-as-code definition is correct.

**Verification done in sandbox:**
- `python3 -m py_compile` clean across the whole backend tree.
- Simulated the exact origin-list parsing logic used by `cors_origins_list` — confirmed `https://raahigeo.in` and `https://www.raahigeo.in` are present in the resulting allowlist when `CORS_ORIGINS` is not set.
- Confirmed (by reading `main.py`) that CORS preflight `OPTIONS` requests already bypass the login-check middleware, so this fix is the only change needed — no auth-side change required.

**⚠️ Important — one manual step Raahi must do:**
This code change only fixes the **default** used when Render's `raahigeo-backend`
service has no `CORS_ORIGINS` environment variable set at all. If `CORS_ORIGINS`
is already set explicitly in the Render dashboard (Environment tab), that
value overrides this default and **must be edited by hand** to add
`https://raahigeo.in,https://www.raahigeo.in` — pushing this code alone will
not fix it in that case. Check `raahigeo-backend` → Environment tab on Render
to see which situation applies.

---

## Current overall status

RaahiGeo AI is a RAG-based geotechnical engineering assistant (React + FastAPI
+ Google Gemini), deployed on Render free tier, with a custom domain
(`raahigeo.in`) in front of the frontend. The Batch Analysis milestone
(lab data import → calculators → matrix engine → liquefaction/pile/lateral →
report generation → pile groups → soil replacement → comparison → method
selection → formula versioning → full traceability → performance hardening)
is complete. Most recent backend work before this fix: making multi-layer
settlement resilient to missing void-ratio (e0) data, and fixing a
multi-borehole upload timeout caused by unnecessary DB round-trips.

For full build history, architecture, known issues, and roadmap, see
`PROJECT_STATUS.md` in the repo root — that remains the single source of
truth; this file is a shorter pointer summary.
