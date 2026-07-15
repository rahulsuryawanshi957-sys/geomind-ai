from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import Base, engine
from app.routers import chat, documents, search, calculators, reports, clause_finder, history

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="GeoMind AI",
    description="RAG-based geotechnical engineering assistant",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(calculators.router)
app.include_router(reports.router)
app.include_router(clause_finder.router)
app.include_router(history.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "GeoMind AI"}
