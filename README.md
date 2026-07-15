# RaahiGeo

A RAG-based geotechnical engineering assistant with a premium, ChatGPT/Linear/Perplexity-style
workspace UI (dark navy/slate/violet/cyan theme, glassmorphism, Framer Motion animation,
collapsible sidebar, markdown-rendered chat with copy/export/regenerate/pin/bookmark, a live
sources panel, and a mobile bottom nav + floating AI button). It answers questions using **your uploaded
engineering books and IS/IRC codes first**, cites book/page/clause, and only falls back to
general knowledge when clearly labeled as such.

## What's fully implemented

- **RAG pipeline**: PDF upload → PyMuPDF text extraction (per-page) → token-aware chunking →
  OpenAI embeddings → ChromaDB → similarity-thresholded retrieval → GPT-4o answer with a
  forced citation format (Source / Page / Clause / Confidence).
- **Chat** with Engineering Mode (never guesses inputs, always shows units/equations/assumptions).
- **Document Library**: upload, category tagging, background indexing with live status, delete, re-index.
- **Intelligent Search** across all documents with page/clause-level results.
- **Clause Finder**: retrieval-grounded, refuses to invent a clause number if it isn't in your documents.
- **Formula Library**: pulls formulas out of your own documents (not a hard-coded list) so it
  never drifts from what you've actually uploaded.
- **5 engineering calculators with real formulas and full step-by-step working**:
  Terzaghi bearing capacity, immediate (elastic) settlement, consolidation settlement,
  SPT N-value correction (N60 / N1(60)), Rankine active/passive earth pressure.
- **Report Generator**: builds report sections grounded in retrieved context, exports to
  Word (.docx) and PDF.
- **History**: full conversation persistence and search.
- Dark/light mode, responsive dashboard UI, Docker support.

## What's scaffolded but not fully built (by design, not by accident)

The brief asked for 16 calculators and a long list of "future ready" integrations
(OCR, borehole logs, PLAXIS, AutoCAD, GIS, CPT interpretation, etc). Building all of that with
real engineering rigor is a multi-month effort on its own — shipping stubs that *look* done
would be worse than being upfront. Instead:

- `backend/app/routers/calculators.py` lists the remaining 10 calculators
  (raft/isolated footing, pile capacity, group efficiency, lateral pile, retaining wall
  stability, liquefaction, plate load test, safe bearing capacity, modulus of subgrade
  reaction) as `PLANNED_CALCULATORS` — calling them returns a clear "not implemented yet"
  rather than a silent wrong answer or a fabricated formula.
- The "Future Ready" integrations (OCR, PLAXIS, AutoCAD, GIS, etc.) aren't started. The
  architecture supports them (e.g. `app/rag/ingest.py` is where OCR would slot in for
  scanned PDFs; `app/routers/` is where a `borehole_logs.py` router would live), but no
  code exists for them yet.

### UI sections that are real vs. "Coming soon"
Every sidebar item works and goes somewhere real. Dashboard, AI Chat, Document Library, IS
Codes, Formula Library, Clause Finder, Calculators, Reports, and History are fully functional
against the backend. Projects, PDF Chat, Borehole Logs, Laboratory Reports, Soil Profile
Viewer, and Bookmarks are honest "Coming soon" pages — each describes exactly what's planned
(see `frontend/src/pages/planned/`) rather than pretending to work. Building those properly
(borehole visualization, lab-report parsing, project data model) is substantial additional
scope; ping me if you want any one of them built out next and I'll scope it properly rather
than rushing a half-working version.

### Extending the calculators
Add a function to `backend/app/services/calculators.py` following the existing pattern
(return `{result, unit, formula, steps, assumptions, warnings}`), register it in
`CALCULATOR_REGISTRY`, remove its id from `PLANNED_CALCULATORS`, and add a `CalcDef` entry
in `frontend/src/pages/Calculators.tsx`.

## Setup

### 1. Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your OPENAI_API_KEY
uvicorn main:app --reload --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

### 3. Or with Docker
```bash
cp backend/.env.example backend/.env   # add your OPENAI_API_KEY
docker compose up --build
```

## Migrating from SQLite to Postgres
Set `DATABASE_URL=postgresql://user:pass@host:5432/geomind` in `backend/.env` — the ORM
layer (`app/database.py`, `app/models.py`) needs no other changes.

## Architecture

```
frontend (React + TS + Tailwind)
   │  fetch() → JSON
   ▼
backend (FastAPI)
   ├── routers/        chat, documents, search, calculators, reports, clause_finder, history
   ├── rag/
   │     ingest.py      PDF → pages → chunks → embeddings → ChromaDB
   │     retrieval.py   question → embedding → similarity search → thresholded results
   │     vectorstore.py ChromaDB wrapper (swap this file to move to FAISS/pgvector)
   ├── services/
   │     embeddings.py  OpenAI embeddings
   │     llm.py         OpenAI chat completions + the citation-forcing system prompt
   │     calculators.py real engineering formulas (Terzaghi, Bowles, Liao & Whitney, Rankine)
   ├── models.py         SQLAlchemy ORM (documents, chunks, conversations, messages, calc logs)
   └── database.py       SQLite by default, one-line swap to Postgres
```

## Key safety rules baked into the system prompt (`app/services/llm.py`)
1. Answer from retrieved context first; general knowledge is only used when clearly labeled.
2. If nothing relevant is retrieved, say so explicitly — never silently guess.
3. Never invent a clause number, page number, or code number.
4. Never fabricate an equation or coefficient.
5. In Engineering Mode: always ask for missing inputs, always show units, equations, and assumptions.
