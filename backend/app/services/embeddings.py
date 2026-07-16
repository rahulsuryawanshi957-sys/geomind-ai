from google import genai
from google.genai import types
from fastapi import HTTPException
from app.config import settings, logger

_client = genai.Client(api_key=settings.gemini_api_key or "not-configured")


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
    try:
        response = _client.models.embed_content(
            model=settings.embedding_model,
            contents=texts,
            config=types.EmbedContentConfig(task_type=task_type),
        )
    except Exception as e:
        msg = str(e)
        logger.exception("Gemini embeddings call failed.")
        if "API key" in msg or "API_KEY" in msg or "401" in msg or "403" in msg or "PERMISSION_DENIED" in msg:
            raise HTTPException(
                status_code=503,
                detail="Gemini rejected the configured API key. Double-check "
                       "GEMINI_API_KEY on Render is correct and active "
                       "(https://aistudio.google.com/apikey).",
            )
        raise HTTPException(status_code=502, detail=f"Gemini embeddings API error: {e}")

    logger.info("Embeddings received.")
    return [item.values for item in response.embeddings]
