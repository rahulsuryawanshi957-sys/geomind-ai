"""
Central configuration for RaahiGeo AI backend.
All secrets are read from environment variables (.env locally, or Render's
Environment tab in production). Never hard-code keys.
"""
import os
import logging
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Configured here (not in main.py) because this module is imported first by
# every other module, so logging is guaranteed to be set up before anything
# else runs -- including the settings validation below.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("raahigeo")


class Settings(BaseSettings):
    # --- Gemini (Google AI) ---
    # Genuinely free within rate limits, no credit card required.
    # Get a key at https://aistudio.google.com/apikey
    gemini_api_key: str = ""
    embedding_model: str = "gemini-embedding-001"
    chat_model: str = "gemini-3.5-flash"

    # --- Vector store (ChromaDB) ---
    # Leave empty to use local-disk Chroma (fine for local dev, but WIPED on
    # every Render free-tier restart/redeploy since there's no persistent
    # disk on the free plan). Set these to use Chroma Cloud's free tier
    # (https://trychroma.com) so indexed documents survive restarts.
    chroma_api_key: str = ""
    chroma_tenant: str = ""
    chroma_database: str = "raahigeo"

    # --- Storage paths ---
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    data_dir: Path = base_dir / "data"
    uploads_dir: Path = data_dir / "uploads"
    chroma_dir: Path = data_dir / "chroma"
    sqlite_path: Path = data_dir / "db" / "raahigeo.db"

    # --- Database ---
    database_url: str = ""

    # --- RAG tuning ---
    chunk_size_tokens: int = 500
    chunk_overlap_tokens: int = 75
    top_k_retrieval: int = 8
    min_similarity_score: float = 0.20  # below this, we tell the user nothing relevant was found

    # --- App / CORS ---
    # Comma-separated list via env var, e.g.
    #   CORS_ORIGINS=https://geomind-ai-1.onrender.com,http://localhost:5173
    # Deliberately typed as `str` (not list[str]) because pydantic-settings
    # parses list-typed env vars as JSON by default -- a plain comma-separated
    # value like the one above would raise a validation error at import time
    # and crash the whole app before Uvicorn even binds a port. We parse it
    # ourselves instead, in `cors_origins_list` below.
    cors_origins_raw: str = os.environ.get(
        "CORS_ORIGINS",
        "https://geomind-ai-1.onrender.com,http://localhost:5173,http://localhost:3000",
    )

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

    def model_post_init(self, __context) -> None:
        # Directory creation must never crash startup -- log and continue so
        # Swagger/health still come up and the real problem is visible in
        # Render's log stream instead of a silent boot failure.
        try:
            self.uploads_dir.mkdir(parents=True, exist_ok=True)
            self.chroma_dir.mkdir(parents=True, exist_ok=True)
            self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
            logger.info(f"Data directories ready: {self.data_dir}")
        except Exception:
            logger.exception(f"Failed to create data directories under {self.data_dir}")

        if not self.database_url:
            self.database_url = f"sqlite:///{self.sqlite_path}"

        if not self.gemini_api_key:
            logger.warning(
                "GEMINI_API_KEY is not set. /api/chat, document indexing, and search "
                "will return a clear 503 error until this is set in the environment "
                "(Render: Environment tab on the backend service -> Add Environment "
                "Variable -> Key=GEMINI_API_KEY). Get a free key at "
                "https://aistudio.google.com/apikey (no credit card required)."
            )
        else:
            logger.info(f"Gemini key detected (starts with '{self.gemini_api_key[:7]}...').")


settings = Settings()
