import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings, logger
from app.database import Base, engine
from app.routers import chat, documents, search, calculators, reports, clause_finder, history, lab_data

logger.info("Booting RaahiGeo backend...")

try:
    Base.metadata.create_all(bind=engine)
    logger.info(f"SQLite ready at {settings.sqlite_path}")
except Exception:
    logger.exception("Failed to initialize SQLite database")
    raise

app = FastAPI(
    title="RaahiGeo",
    description="RAG-based geotechnical engineering assistant",
    version="0.2.0",
)

logger.info(f"CORS allowed origins: {settings.cors_origins_list}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_and_catch_exceptions(request: Request, call_next):
    """
    Belt-and-braces exception handler. FastAPI already turns uncaught
    exceptions into a 500, but by default it swallows the traceback from
    Render's log viewer in some configurations and always hides the real
    error from the client. This logs the full traceback server-side (visible
    in Render -> Logs) and returns the exception message in the JSON body so
    it's debuggable from Swagger/curl without needing log access at all.
    """
    logger.info(f"--> {request.method} {request.url.path}")
    try:
        response = await call_next(request)
        logger.info(f"<-- {request.method} {request.url.path} {response.status_code}")
        return response
    except Exception as exc:
        tb = traceback.format_exc()
        logger.error(f"UNHANDLED EXCEPTION on {request.method} {request.url.path}:\n{tb}")
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"{type(exc).__name__}: {exc}",
                "path": request.url.path,
            },
        )


app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(search.router)
app.include_router(calculators.router)
app.include_router(reports.router)
app.include_router(clause_finder.router)
app.include_router(history.router)
app.include_router(lab_data.router)


@app.get("/api/health")
def health():
    """
    Reports enough state to diagnose a broken deploy without needing log
    access: whether the Gemini key is configured, where data is stored, and
    which origins CORS will accept.
    """
    return {
        "status": "ok",
        "service": "RaahiGeo",
        "gemini_key_configured": bool(settings.gemini_api_key),
        "chat_model": settings.chat_model,
        "embedding_model": settings.embedding_model,
        "data_dir": str(settings.data_dir),
        "cors_origins": settings.cors_origins_list,
        "vector_store": "Chroma Cloud (persistent)" if settings.chroma_api_key else "local disk (WIPED on restart/redeploy)",
        "database": "external (persistent, check your DATABASE_URL)" if not settings.database_url.startswith("sqlite") else "local SQLite (WIPED on restart/redeploy)",
    }


logger.info("RaahiGeo backend startup complete.")
