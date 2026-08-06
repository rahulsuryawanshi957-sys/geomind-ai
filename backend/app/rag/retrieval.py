"""
Retrieval: turns a user question into ranked, cited chunks.
This is the "R" in RAG -- the chat/search/clause-finder routers all go through here
so retrieval behavior (thresholds, filters) stays in one place.
"""
from app.rag.vectorstore import query as chroma_query
from app.services.embeddings import embed_texts
from app.config import settings, logger


def _valid_document_ids() -> set[str]:
    """
    Guards against orphaned vector-store chunks -- chunks whose parent
    Document row no longer exists (e.g. deleted outside the normal delete
    flow, or a leftover from before persistent storage was configured).
    Without this, retrieve() can surface and cite a file that doesn't show
    up anywhere in the Document Library, which is confusing and looks like
    a hallucinated source. Cheap query (ids only), run per retrieval call
    so a delete takes effect immediately on the next question.
    """
    from app.database import SessionLocal
    from app.models import Document

    db = SessionLocal()
    try:
        rows = db.query(Document.id).filter(Document.status == "indexed").all()
        return {r[0] for r in rows}
    finally:
        db.close()


def retrieve(question: str, top_k: int | None = None, category: str | None = None, document_id: str | None = None) -> list[dict]:
    """
    Returns a list of {text, filename, page_number, clause_number, category, score}
    sorted by relevance, filtered to those above the min similarity threshold.
    An empty list means "nothing relevant found" -- callers must say so explicitly
    rather than falling back to the LLM's general knowledge.
    """
    top_k = top_k or settings.top_k_retrieval
    logger.info(f"[retrieval] Embedding query for retrieval (top_k={top_k}, category={category})...")
    [embedding] = embed_texts([question], task_type="RETRIEVAL_QUERY")

    where = {}
    if category:
        where["category"] = category
    if document_id:
        where["document_id"] = document_id

    logger.info("[retrieval] Querying ChromaDB...")
    raw = chroma_query(embedding, top_k=top_k, where=where or None)

    results = []
    if not raw or not raw.get("ids") or not raw["ids"][0]:
        logger.info("[retrieval] No chunks in ChromaDB matched (empty result set).")
        return results

    valid_ids = _valid_document_ids()
    orphans_skipped = 0

    for i in range(len(raw["ids"][0])):
        distance = raw["distances"][0][i]  # cosine distance: 0 = identical
        score = 1 - distance
        if score < settings.min_similarity_score:
            continue
        meta = raw["metadatas"][0][i]
        chunk_doc_id = meta.get("document_id")
        if chunk_doc_id not in valid_ids:
            # Orphaned chunk -- its Document row is gone (deleted outside the
            # normal flow, or a leftover from before persistent storage was
            # set up). Skip it rather than citing a file that doesn't exist
            # in the Library anymore.
            orphans_skipped += 1
            continue
        results.append({
            "text": raw["documents"][0][i],
            "filename": meta.get("filename"),
            "page_number": meta.get("page_number"),
            "clause_number": meta.get("clause_number") or None,
            "category": meta.get("category"),
            "document_id": chunk_doc_id,
            "score": round(score, 3),
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    if orphans_skipped:
        logger.warning(
            f"[retrieval] Skipped {orphans_skipped} orphaned chunk(s) (document_id not found "
            f"in the documents table). Consider POST /api/documents/cleanup-orphans to purge "
            f"them permanently from the vector store."
        )
    logger.info(f"[retrieval] {len(results)} chunk(s) above similarity threshold {settings.min_similarity_score}.")
    return results
