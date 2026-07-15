"""
Ingestion pipeline: PDF -> page text -> token-aware chunks -> embeddings -> ChromaDB.

Design notes:
- We keep page numbers attached to every chunk so citations can say "Page 42".
- We run a lightweight regex pass to spot IS-code-style clause numbers (e.g. "7.3.2",
  "Clause 8.1.2.3") so the Clause Finder and citations can reference them without an LLM
  guessing -- guessed clause numbers are exactly what "never invent clause numbers" forbids.
"""
import re
import fitz  # PyMuPDF
import tiktoken
from app.rag.vectorstore import add_chunks
from app.services.embeddings import embed_texts

CLAUSE_PATTERN = re.compile(r"\b(\d{1,2}(?:\.\d{1,3}){1,4})\b")
_enc = tiktoken.get_encoding("cl100k_base")


def extract_pages(file_path: str) -> list[dict]:
    """Returns [{page_number, text}] using PyMuPDF."""
    doc = fitz.open(file_path)
    pages = []
    for i, page in enumerate(doc):
        text = page.get_text("text")
        pages.append({"page_number": i + 1, "text": text})
    doc.close()
    return pages


def _chunk_page_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Token-aware sliding window chunking so we don't split mid-sentence too aggressively."""
    tokens = _enc.encode(text)
    if not tokens:
        return []
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(_enc.decode(chunk_tokens))
        if end == len(tokens):
            break
        start = end - overlap
    return chunks


def _guess_clause(text: str) -> str | None:
    """Best-effort clause number extraction. Returns None rather than a fabricated guess."""
    matches = CLAUSE_PATTERN.findall(text)
    return matches[0] if matches else None


def ingest_pdf(
    document_id: str,
    file_path: str,
    filename: str,
    category: str,
    chunk_size: int,
    overlap: int,
) -> dict:
    """
    Runs the full ingestion pipeline for one PDF.
    Returns summary stats: {total_pages, indexed_chunks}.
    """
    pages = extract_pages(file_path)

    all_chunk_texts = []
    all_metadatas = []
    all_ids = []

    for page in pages:
        page_chunks = _chunk_page_text(page["text"], chunk_size, overlap)
        for idx, chunk_text in enumerate(page_chunks):
            if not chunk_text.strip():
                continue
            chunk_id = f"{document_id}_p{page['page_number']}_c{idx}"
            clause = _guess_clause(chunk_text) if category in ("IS Codes", "IRC Codes") else None
            all_ids.append(chunk_id)
            all_chunk_texts.append(chunk_text)
            all_metadatas.append({
                "document_id": document_id,
                "filename": filename,
                "category": category,
                "page_number": page["page_number"],
                "clause_number": clause or "",
            })

    if not all_chunk_texts:
        return {"total_pages": len(pages), "indexed_chunks": 0}

    # Embed in batches to respect API limits
    BATCH = 96
    for i in range(0, len(all_chunk_texts), BATCH):
        batch_texts = all_chunk_texts[i:i + BATCH]
        batch_ids = all_ids[i:i + BATCH]
        batch_meta = all_metadatas[i:i + BATCH]
        embeddings = embed_texts(batch_texts)
        add_chunks(ids=batch_ids, embeddings=embeddings, documents=batch_texts, metadatas=batch_meta)

    return {"total_pages": len(pages), "indexed_chunks": len(all_chunk_texts)}
