import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.config import settings, logger
from app.database import Base, engine, SessionLocal
from app.routers import chat, documents, search, calculators, reports, clause_finder, history, lab_data, auth as auth_router
from app import auth as auth_service

logger.info("Booting RaahiGeo backend...")

try:
    Base.metadata.create_all(bind=engine)
    logger.info(f"SQLite ready at {settings.sqlite_path}")
    # create_all only creates missing TABLES, not missing COLUMNS on tables
    # that already existed (relevant if persistent storage is configured --
    # see /api/health -- so the DB file survives a redeploy). This adds any
    # column a newer version of a model expects but an older persisted DB
    # doesn't have yet, one at a time, ignoring "already exists" errors.
    from sqlalchemy import text
    NEW_COLUMNS = [
        ("soil_layers", "fines_content_pct", "FLOAT"),
        ("borehole_profiles", "source_file_hash", "VARCHAR"),
    ]
    with engine.connect() as conn:
        for table, column, coltype in NEW_COLUMNS:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
                conn.commit()
                logger.info(f"Migration: added {table}.{column}")
            except Exception:
                conn.rollback()  # column already exists (or table is brand new from create_all) -- fine

    # Seed the single shared login credential if this is a fresh database --
    # no-op if one already exists. See app/auth.py for the default/env vars.
    _seed_db = SessionLocal()
    try:
        auth_service.ensure_default_credential(_seed_db)
    finally:
        _seed_db.close()
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


# Paths that work WITHOUT a login -- everything else under /api/ requires a
# valid session token. Kept to the smallest possible list on purpose (Raahi
# asked for the WHOLE site locked, not just some pages) -- login itself and
# the health check (which Render/uptime tools may hit) are the only two
# genuine exceptions; CORS preflight (OPTIONS) is not a real request and
# must always pass through or the browser can't even attempt the real one.
PUBLIC_PATHS = {"/api/auth/login", "/api/health"}


@app.middleware("http")
async def log_and_catch_exceptions(request: Request, call_next):
    """
    Belt-and-braces exception handler. FastAPI already turns uncaught
    exceptions into a 500, but by default it swallows the traceback from
    Render's log viewer in some configurations and always hides the real
    error from the client. This logs the full traceback server-side (visible
    in Render -> Logs) and returns the exception message in the JSON body so
    it's debuggable from Swagger/curl without needing log access at all.

    Also enforces the single shared login for every request under /api/
    except PUBLIC_PATHS -- see auth.py/routers/auth.py. Checking it here
    (one place, every request already passes through this) is simpler than
    adding a Depends() to every individual router.
    """
    logger.info(f"--> {request.method} {request.url.path}")

    if (
        request.method != "OPTIONS"
        and request.url.path not in PUBLIC_PATHS
        and (request.url.path.startswith("/api/") or request.url.path in ("/docs", "/redoc", "/openapi.json"))
    ):
        authorization = request.headers.get("authorization")
        token = authorization[len("Bearer "):].strip() if authorization and authorization.startswith("Bearer ") else None
        db = SessionLocal()
        try:
            authed = auth_service.validate_session(db, token)
        finally:
            db.close()
        if not authed:
            logger.info(f"<-- {request.method} {request.url.path} 401 (no/invalid session)")
            return JSONResponse(status_code=401, content={"detail": "Not authenticated."})

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


app.include_router(auth_router.router)
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
