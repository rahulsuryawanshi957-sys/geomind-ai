"""
Central configuration for RaahiGeo backend.
All secrets are read from environment variables (.env). Never hard-code keys.
"""
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # --- OpenAI ---
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-large"
    chat_model: str = "gpt-4o"

    # --- Storage paths ---
    base_dir: Path = Path(__file__).resolve().parent.parent.parent
    data_dir: Path = base_dir / "data"
    uploads_dir: Path = data_dir / "uploads"
    chroma_dir: Path = data_dir / "chroma"
    sqlite_path: Path = data_dir / "db" / "geomind.db"

    # --- Database ---
    database_url: str = ""

    # --- RAG tuning ---
    chunk_size_tokens: int = 500
    chunk_overlap_tokens: int = 75
    top_k_retrieval: int = 8
    min_similarity_score: float = 0.20  # below this, we tell the user nothing relevant was found

    # --- App ---
    cors_origins: List[str] = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://geomind-ai.onrender.com",
]

    class Config:
        env_file = ".env"

    def model_post_init(self, __context) -> None:
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.database_url:
            self.database_url = f"sqlite:///{self.sqlite_path}"

settings = Settings()
