from google import genai
from google.genai import types
from fastapi import HTTPException
import time
from app.config import settings, logger

_client = genai.Client(api_key=settings.gemini_api_key or "not-configured")

MAX_RETRIES = 4
OVERLOAD_RETRY_DELAY_SECONDS = 3   # 503 UNAVAILABLE: transient, retry quickly
QUOTA_RETRY_DELAY_SECONDS = 25     # 429 RESOURCE_EXHAUSTED: per-minute quota, needs a real wait


def embed_texts(texts: list[str], task_type: str = "RETRIEVAL_DOCUMENT") -> list[list[float]]:
    """
    task_type differs for indexed chunks ("RETRIEVAL_DOCUMENT") vs a live search
    query ("RETRIEVAL_QUERY") -- Gemini's embedding model uses this to bias the
    vector for better retrieval quality. Callers pass the right one; defaulting
    to RETRIEVAL_DOCUMENT keeps ingest.py's call sites unchanged.
    """
    if not texts:
        return []

    if not settings.gemini_api_key:
        logger.error("embed_texts called but GEMINI_API_KEY is not configured.")
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not configured on the server. Get a free key at "
                   "https://aistudio.google.com/apikey, then set it in Render -> your "
                   "backend service -> Environment -> Add Environment Variable "
                   "(Key=GEMINI_API_KEY), then redeploy.",
        )

    logger.info(f"Requesting {len(texts)} embedding(s) from {settings.embedding_model} (task_type={task_type})...")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = _client.models.embed_content(
                model=settings.embedding_model,
                contents=texts,
                config=types.EmbedContentConfig(task_type=task_type),
            )
            logger.info("Embeddings received.")
            return [item.values for item in response.embeddings]
        except Exception as e:
            msg = str(e)
            is_quota = "RESOURCE_EXHAUSTED" in msg or "429" in msg
            is_overloaded = "UNAVAILABLE" in msg or "503" in msg

            if is_quota and attempt < MAX_RETRIES:
                logger.warning(f"Gemini quota hit (attempt {attempt}/{MAX_RETRIES}), waiting {QUOTA_RETRY_DELAY_SECONDS}s before retrying...")
                time.sleep(QUOTA_RETRY_DELAY_SECONDS)
                continue
            if is_overloaded and attempt < MAX_RETRIES:
                logger.warning(f"Gemini embeddings overloaded (attempt {attempt}/{MAX_RETRIES}), retrying in {OVERLOAD_RETRY_DELAY_SECONDS}s...")
                time.sleep(OVERLOAD_RETRY_DELAY_SECONDS)
                continue

            logger.exception("Gemini embeddings call failed.")
            if "API key" in msg or "API_KEY" in msg or "401" in msg or "403" in msg or "PERMISSION_DENIED" in msg:
                raise HTTPException(
                    status_code=503,
                    detail="Gemini rejected the configured API key. Double-check "
                           "GEMINI_API_KEY on Render is correct and active "
                           "(https://aistudio.google.com/apikey).",
                )
            if is_overloaded:
                raise HTTPException(
                    status_code=503,
                    detail="Gemini's servers are temporarily overloaded (this is on Google's "
                           "side, not a bug here). Please try again in a few seconds.",
                )
            if is_quota:
                raise HTTPException(
                    status_code=429,
                    detail="Gemini's free-tier quota is exhausted for now (this is Google's "
                           "limit, not a bug here). If this keeps happening, it may be the "
                           "daily quota -- wait a while, or space out large uploads.",
                )
            raise HTTPException(status_code=502, detail=f"Gemini embeddings API error: {e}")
