"""
Thin wrapper around ChromaDB so the rest of the app never touches the client directly.
Swap this file alone if you later move to FAISS/Pinecone/pgvector.
"""
import chromadb
from chromadb.config import Settings as ChromaSettings
from app.config import settings

_client = chromadb.PersistentClient(
    path=str(settings.chroma_dir),
    settings=ChromaSettings(anonymized_telemetry=False),
)

COLLECTION_NAME = "geomind_chunks"

_collection = _client.get_or_create_collection(
    name=COLLECTION_NAME,
    metadata={"hnsw:space": "cosine"},
)


def get_collection():
    return _collection


def add_chunks(ids: list[str], embeddings: list[list[float]], documents: list[str], metadatas: list[dict]):
    _collection.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)


def query(embedding: list[float], top_k: int, where: dict | None = None):
    return _collection.query(
        query_embeddings=[embedding],
        n_results=top_k,
        where=where or {},
    )


def delete_document(document_id: str):
    _collection.delete(where={"document_id": document_id})
