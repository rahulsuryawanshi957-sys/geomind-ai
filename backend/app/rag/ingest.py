"""
Ingestion pipeline: PDF -> page text -> token-aware chunks -> embeddings -> ChromaDB.

Design notes:
- We keep page numbers attached to every chunk so citations can say "Page 42".
- We run a lightweight regex pass to spot IS-code-style clause numbers (e.g. "7.3.2",
  "Clause 8.1.2.3") so the Clause Finder and citations can reference them without an LLM
  guessing -- guessed clause numbers are exactly what "never invent clause numbers" forbids.
- Pages with no extractable text (scanned/photocopied PDFs -- common for older IS codes)
  fall back to Gemini vision OCR instead of failing silently with 0 indexed chunks. This
  reuses the same Gemini client already configured for chat/embeddings rather than adding
  a Tesseract system dependency, which Render's standard Python buildpack doesn't have.
"""
import re
import time
import fitz  # PyMuPDF
import tiktoken
from google import genai
from google.genai import types
from app.rag.vectorstore import add_chunks
from app.services.embeddings import embed_texts
from app.config import settings, logger

CLAUSE_PATTERN = re.compile(r"\b(\d{1,2}(?:\.\d{1,3}){1,4})\b")
_enc = tiktoken.get_encoding("cl100k_base")
_client = genai.Client(api_key=settings.gemini_api_key or "not-configured")

OCR_MIN_TEXT_CHARS = 20  # below this, a page is treated as "no text layer" and OCR'd
OCR_MAX_RETRIES = 3
OCR_PACING_SECONDS = 2  # between OCR calls, so a big scanned PDF doesn't blow the per-minute quota


def _ocr_page_via_gemini(page) -> str:
    """Fallback for a page with no (or almost no) extractable text: renders it
    as an image and asks Gemini to transcribe it. Only reached for pages
    where normal text extraction came back empty, so a normal text-based PDF
    isn't slowed down by this at all."""
    pix = page.get_pixmap(dpi=200)
    img_bytes = pix.tobytes("png")

    for attempt in range(1, OCR_MAX_RETRIES + 1):
        try:
            response = _client.models.generate_content(
                model=settings.chat_model,
                contents=[
                    types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
                    "Transcribe ALL text visible on this page exactly as it appears -- "
                    "preserve paragraph breaks, tables, headings, and clause/section numbers. "
                    "Do not add commentary or describe any images/diagrams, only transcribe "
                    "actual text. If the page genuinely has no text at all, respond with "
                    "exactly: [BLANK PAGE]",
                ],
            )
            text = (response.text or "").strip()
            return "" if text == "[BLANK PAGE]" else text
        except Exception as e:
            msg = str(e)
            is_retryable = "RESOURCE_EXHAUSTED" in msg or "429" in msg or "UNAVAILABLE" in msg or "503" in msg
            if is_retryable and attempt < OCR_MAX_RETRIES:
                logger.warning(f"[ingest] OCR call hit a transient error (attempt {attempt}/{OCR_MAX_RETRIES}), retrying: {e}")
                time.sleep(10)
                continue
            logger.warning(f"[ingest] OCR fallback failed for this page, leaving it as no-text: {e}")
            return ""
    return ""


def extract_pages(file_path: str) -> list[dict]:
    """Returns [{page_number, text, ocr_used}] using PyMuPDF. A page with
    fewer than OCR_MIN_TEXT_CHARS extracted characters is assumed to be a
    scanned/image-only page and is retried via Gemini OCR."""
    doc = fitz.open(file_path)
    pages = []
    ocr_count = 0
    for i, page in enumerate(doc):
        text = page.get_text("text")
        ocr_used = False
        if len(text.strip()) < OCR_MIN_TEXT_CHARS:
            logger.info(f"[ingest] Page {i + 1}/{doc.page_count} has no extractable text -- trying Gemini OCR fallback...")
            ocr_text = _ocr_page_via_gemini(page)
            if len(ocr_text.strip()) > len(text.strip()):
                text = ocr_text
                ocr_used = True
                ocr_count += 1
            time.sleep(OCR_PACING_SECONDS)
        pages.append({"page_number": i + 1, "text": text, "ocr_used": ocr_used})
    doc.close()
    if ocr_count:
        logger.info(f"[ingest] OCR fallback used for {ocr_count}/{len(pages)} page(s) of this document.")
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
        logger.error(
            f"[ingest] No text extracted from any of {len(pages)} page(s) even after OCR fallback -- "
            f"the PDF may be corrupted, password-protected, or the OCR calls failed (check earlier "
            f"warnings above in this log for the specific reason)."
        )
        return {"total_pages": len(pages), "indexed_chunks": 0}

    # Embed in batches to respect API limits. Gemini's free tier has a low
    # requests-per-minute ceiling (roughly 5-15 RPM depending on the model),
    # so for large books (hundreds of chunks -> many batches) we deliberately
    # pace requests a few seconds apart instead of firing them back-to-back --
    # otherwise a single big PDF burns the whole per-minute quota in seconds
    # and every remaining batch fails with a 429.
    BATCH = 50
    PACING_SECONDS = 5
    total_batches = (len(all_chunk_texts) + BATCH - 1) // BATCH

    for batch_num, i in enumerate(range(0, len(all_chunk_texts), BATCH), start=1):
        batch_texts = all_chunk_texts[i:i + BATCH]
        batch_ids = all_ids[i:i + BATCH]
        batch_meta = all_metadatas[i:i + BATCH]
        logger.info(f"[ingest] Embedding batch {batch_num}/{total_batches} ({len(batch_texts)} chunks)...")
        embeddings = embed_texts(batch_texts)
        add_chunks(ids=batch_ids, embeddings=embeddings, documents=batch_texts, metadatas=batch_meta)
        if batch_num < total_batches:
            time.sleep(PACING_SECONDS)

    return {"total_pages": len(pages), "indexed_chunks": len(all_chunk_texts)}
