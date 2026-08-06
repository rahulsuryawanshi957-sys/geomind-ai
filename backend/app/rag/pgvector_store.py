"""
pgvector-backed vector store -- used automatically instead of ChromaDB when
DATABASE_URL points at Postgres (e.g. Supabase), so indexed chunks live in
the SAME database as everything else and persist across Render restarts/
redeploys with no separate vector store service to configure.

Same public function names/shapes as vectorstore.py's Chroma path
(add_chunks/query/delete_document/get_collection) so rag/ingest.py and
rag/retrieval.py don't need to know which backend is active.
"""
import json
from sqlalchemy import text
from app.database import engine
from app.config import logger

# gemini-embedding-001's default output size (see app/services/embeddings.py --
# no output_dimensionality is passed, so it uses the full default). If that
# ever changes, this must change too AND every already-indexed document needs
# re-indexing -- pgvector rejects a dimension mismatch outright, it doesn't
# silently truncate.
EMBEDDING_DIM = 3072

TABLE = "document_chunks"


def _ensure_table():
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text(f"""
            CREATE TABLE IF NOT EXISTS {TABLE} (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                content TEXT NOT NULL,
                embedding VECTOR({EMBEDDING_DIM}) NOT NULL,
                metadata JSONB
            )
        """))
        conn.execute(text(f"CREATE INDEX IF NOT EXISTS {TABLE}_document_id_idx ON {TABLE} (document_id)"))
    logger.info(f"[pgvector] '{TABLE}' table ready.")


_ensure_table()


def _vec_literal(embedding: list[float]) -> str:
    return "[" + ",".join(repr(float(x)) for x in embedding) + "]"


def get_collection():
    # Chroma-specific concept; nothing to return here. Nothing outside this
    # module and vectorstore.py calls get_collection() as of this writing.
    return None


def add_chunks(ids: list[str], embeddings: list[list[float]], documents: list[str], metadatas: list[dict]):
    logger.info(f"[pgvector] Adding {len(ids)} chunk(s) to '{TABLE}'...")
    with engine.begin() as conn:
        for cid, emb, doc, meta in zip(ids, embeddings, documents, metadatas):
            conn.execute(
                text(f"""
                    INSERT INTO {TABLE} (id, document_id, content, embedding, metadata)
                    VALUES (:id, :document_id, :content, CAST(:embedding AS vector), CAST(:metadata AS jsonb))
                    ON CONFLICT (id) DO UPDATE SET
                        content = EXCLUDED.content, embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata
                """),
                {
                    "id": cid,
                    "document_id": meta.get("document_id", ""),
                    "content": doc,
                    "embedding": _vec_literal(emb),
                    "metadata": json.dumps(meta),
                },
            )


def query(embedding: list[float], top_k: int, where: dict | None = None):
    """Same return shape as ChromaDB's .query(): nested single-query lists,
    with 'distances' as COSINE DISTANCE (0 = identical), matching exactly
    what rag/retrieval.py already assumes ('score = 1 - distance')."""
    where = where or {}
    filters, params = [], {"embedding": _vec_literal(embedding), "top_k": top_k}
    if "document_id" in where:
        filters.append("document_id = :document_id")
        params["document_id"] = where["document_id"]
    if "category" in where:
        filters.append("metadata->>'category' = :category")
        params["category"] = where["category"]
    filter_sql = ("WHERE " + " AND ".join(filters)) if filters else ""

    with engine.begin() as conn:
        rows = conn.execute(
            text(f"""
                SELECT id, content, metadata, embedding <=> CAST(:embedding AS vector) AS distance
                FROM {TABLE}
                {filter_sql}
                ORDER BY distance ASC
                LIMIT :top_k
            """),
            params,
        ).fetchall()

    return {
        "ids": [[r.id for r in rows]],
        "documents": [[r.content for r in rows]],
        "metadatas": [[r.metadata for r in rows]],
        "distances": [[float(r.distance) for r in rows]],
    }


def delete_document(document_id: str):
    logger.info(f"[pgvector] Deleting all chunks for document_id={document_id}")
    with engine.begin() as conn:
        conn.execute(text(f"DELETE FROM {TABLE} WHERE document_id = :document_id"), {"document_id": document_id})


def delete_orphaned_chunks(valid_document_ids: set[str]) -> int:
    """
    Removes any indexed chunk whose document_id isn't in valid_document_ids
    (i.e. its Document row no longer exists -- deleted outside the normal
    flow, or a leftover from before persistent storage was configured).
    Returns the number of distinct orphaned document_ids that were purged.
    """
    with engine.begin() as conn:
        rows = conn.execute(text(f"SELECT DISTINCT document_id FROM {TABLE}")).fetchall()
        seen_doc_ids = {r[0] for r in rows}
        orphan_ids = seen_doc_ids - valid_document_ids
        for did in orphan_ids:
            logger.info(f"[pgvector] Purging orphaned chunks for document_id={did}")
            conn.execute(text(f"DELETE FROM {TABLE} WHERE document_id = :document_id"), {"document_id": did})
    return len(orphan_ids)
