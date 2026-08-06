"""
Thin wrapper so the rest of the app never touches the vector store client
directly. Backend chosen automatically from DATABASE_URL:

  - DATABASE_URL is Postgres (e.g. Supabase)  -> pgvector, INSIDE that same
    database. Persists forever, survives Render restarts/redeploys, and
    needs no separate vector store service or API key.
  - DATABASE_URL is SQLite (the default when unset) -> ChromaDB.
      - CHROMA_API_KEY set  -> Chroma Cloud.
      - CHROMA_API_KEY unset -> local disk. Fine for local dev, but Render's
        free web services have no persistent disk, so this gets wiped on
        every restart/redeploy (including the automatic spin-down after 15
        min idle).

Every function here has the exact same name/signature/return-shape in both
backends, so callers (rag/ingest.py, rag/retrieval.py, routers/documents.py)
never need to know or care which one is active.
"""
from app.config import settings, logger

if settings.database_url.startswith("postgres"):
    logger.info("[vectorstore] DATABASE_URL is Postgres -- using pgvector (same database).")
    from app.rag.pgvector_store import get_collection, add_chunks, query, delete_document, delete_orphaned_chunks

else:
    import chromadb
    from chromadb.config import Settings as ChromaSettings

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
                f"the automatic spin-down after 15 minutes idle. Set DATABASE_URL to a "
                f"Supabase Postgres connection string instead for permanent, no-extra-service "
                f"persistence (see app/config.py)."
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

    def delete_orphaned_chunks(valid_document_ids: set[str]) -> int:
        """
        Removes any indexed chunk whose document_id isn't in valid_document_ids
        (i.e. its Document row no longer exists -- deleted outside the normal
        flow, or a leftover from before persistent storage was configured).
        Returns the number of distinct orphaned document_ids that were purged.
        """
        all_metas = _collection.get(include=["metadatas"])["metadatas"]
        seen_doc_ids = {m.get("document_id") for m in all_metas if m.get("document_id")}
        orphan_ids = seen_doc_ids - valid_document_ids
        for did in orphan_ids:
            logger.info(f"[chroma] Purging orphaned chunks for document_id={did}")
            _collection.delete(where={"document_id": did})
        return len(orphan_ids)
