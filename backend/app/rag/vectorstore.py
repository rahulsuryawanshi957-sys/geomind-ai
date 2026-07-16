"""
Thin wrapper around ChromaDB so the rest of the app never touches the client directly.
Swap this file alone if you later move to FAISS/Pinecone/pgvector.
"""
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import settings, logger

COLLECTION_NAME = "geomind_chunks"

logger.info(f"[chroma] Initializing PersistentClient at {settings.chroma_dir}...")
try:
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
        f"[chroma] FAILED to initialize ChromaDB at {settings.chroma_dir}. "
        f"On Render this is usually a filesystem permissions/disk issue -- "
        f"check that the service has write access to its own working directory."
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
