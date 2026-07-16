from openai import OpenAI, AuthenticationError, APIError
from fastapi import HTTPException
from app.config import settings, logger

_client = OpenAI(api_key=settings.openai_api_key or "not-configured")


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    if not settings.openai_api_key:
        # This is the #1 cause of a mystery 500 on /api/chat, /api/search, and
        # document indexing: the key was never set in the deploy environment.
        # Fail loudly and specifically instead of letting OpenAI's generic
        # auth error surface as an unexplained 500.
        logger.error("embed_texts called but OPENAI_API_KEY is not configured.")
        raise HTTPException(
            status_code=503,
            detail="OPENAI_API_KEY is not configured on the server. "
                   "Set it in Render -> your backend service -> Environment -> "
                   "Add Environment Variable (Key=OPENAI_API_KEY), then redeploy.",
        )

    logger.info(f"Requesting {len(texts)} embedding(s) from {settings.embedding_model}...")
    try:
        response = _client.embeddings.create(model=settings.embedding_model, input=texts)
    except AuthenticationError:
        logger.exception("OpenAI rejected the API key (authentication error).")
        raise HTTPException(
            status_code=503,
            detail="OpenAI rejected the configured API key. Double-check "
                   "OPENAI_API_KEY on Render is correct, active, and has billing enabled.",
        )
    except APIError as e:
        logger.exception("OpenAI API error during embeddings call.")
        raise HTTPException(status_code=502, detail=f"OpenAI embeddings API error: {e}")

    logger.info("Embeddings received.")
    return [item.embedding for item in response.data]
