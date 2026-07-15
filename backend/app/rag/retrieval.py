"""
Retrieval: turns a user question into ranked, cited chunks.
This is the "R" in RAG -- the chat/search/clause-finder routers all go through here
so retrieval behavior (thresholds, filters) stays in one place.
"""
from app.rag.vectorstore import query as chroma_query
from app.services.embeddings import embed_texts
from app.config import settings


def retrieve(question: str, top_k: int | None = None, category: str | None = None, document_id: str | None = None) -> list[dict]:
    """
    Returns a list of {text, filename, page_number, clause_number, category, score}
    sorted by relevance, filtered to those above the min similarity threshold.
    An empty list means "nothing relevant found" -- callers must say so explicitly
    rather than falling back to the LLM's general knowledge.
    """
    top_k = top_k or settings.top_k_retrieval
    [embedding] = embed_texts([question])

    where = {}
    if category:
        where["category"] = category
    if document_id:
        where["document_id"] = document_id

    raw = chroma_query(embedding, top_k=top_k, where=where or None)

    results = []
    if not raw or not raw.get("ids") or not raw["ids"][0]:
        return results

    for i in range(len(raw["ids"][0])):
        distance = raw["distances"][0][i]  # cosine distance: 0 = identical
        score = 1 - distance
        if score < settings.min_similarity_score:
            continue
        meta = raw["metadatas"][0][i]
        results.append({
            "text": raw["documents"][0][i],
            "filename": meta.get("filename"),
            "page_number": meta.get("page_number"),
            "clause_number": meta.get("clause_number") or None,
            "category": meta.get("category"),
            "document_id": meta.get("document_id"),
            "score": round(score, 3),
        })

    results.sort(key=lambda r: r["score"], reverse=True)
    return results
