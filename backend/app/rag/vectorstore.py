"""
Thin wrapper around ChromaDB so the rest of the app never touches the client directly.

Two modes, chosen automatically:
  - CHROMA_API_KEY set  -> Chroma Cloud (free tier). Persists forever, survives
    Render restarts/redeploys.
  - CHROMA_API_KEY unset -> local disk. Fine for local dev, but Render's free
    web services have no persistent disk, so this gets wiped on every
    restart/redeploy (including the automatic spin-down after 15 min idle).
"""
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import settings, logger

COLLECTION_NAME = "raahigeo_chunks"

logger.info("[chroma] Initializing client...")
try:
    if settings.chroma_api_key:
        logger.info(
            f"[chroma] Using Chroma Cloud (database={settings.chroma_database}) "
            f"-- indexed documents will persist across restarts."
        )
        cloud_kwargs = {"api_key": settings.chroma_api_key, "database": settings.chroma_database}
        if settings.chroma_tenant:
            cloud_kwargs["tenant"] = settings.chroma_tenant
        _client = chromadb.CloudClient(**cloud_kwargs)
    else:
        logger.warning(
            f"[chroma] No CHROMA_API_KEY set -- using local disk at {settings.chroma_dir}. "
            f"On Render's free tier this is WIPED on every restart/redeploy, including "
            f"the automatic spin-down after 15 minutes idle. Set CHROMA_API_KEY (free "
            f"tier at https://trychroma.com) for documents to persist permanently."
        )
        _client = chromadb.PersistentClient(
            path=str(settings.chroma_dir),
            settings=ChromaSettings(anonymized_telemetry=False),
        )

    _collection = _client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    logger.info(f"[chroma] Collection '{COLLECTION_NAME}' ready ({_collection.count()} chunks currently indexed).")
except Exception:
    logger.exception(
        f"[chroma] FAILED to initialize ChromaDB. If using Chroma Cloud, double-check "
        f"CHROMA_API_KEY/CHROMA_TENANT/CHROMA_DATABASE. If using local disk, this is "
        f"usually a filesystem permissions issue."
    )
    raise


def get_collection():
    return _collection


def add_chunks(ids: list[str], embeddings: list[list[float]], documents: list[str], metadatas: list[dict]):
    logger.info(f"[chroma] Adding {len(ids)} chunk(s) to collection...")
    _collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)


def query(embedding: list[float], top_k: int, where: dict | None = None):
    return _collection.query(
        query_embeddings=[embedding],
        n_results=top_k,
        where=where or {},
    )


def delete_document(document_id: str):
    logger.info(f"[chroma] Deleting all chunks for document_id={document_id}")
    _collection.delete(where={"document_id": document_id})
