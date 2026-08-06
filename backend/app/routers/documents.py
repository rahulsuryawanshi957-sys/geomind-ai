import traceback
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document
from app.schemas import DocumentOut
from app.rag.ingest import ingest_pdf
from app.rag.vectorstore import delete_document as vs_delete_document, delete_orphaned_chunks
from app.services import file_storage
from app.config import settings, logger

router = APIRouter(prefix="/api/documents", tags=["documents"])

CATEGORIES = [
    "Soil Mechanics", "Foundation Engineering", "Rock Mechanics", "Bridge Foundation",
    "FHWA Manuals", "NAVFAC", "IRC Codes", "IS Codes", "Personal Notes",
]


def _run_indexing(document_id: str, file_path: str, filename: str, category: str):
    """
    Runs in a FastAPI BackgroundTask -- i.e. *after* the HTTP response has
    already been sent. Exceptions here do NOT show up as an HTTP error to the
    client; they only appear in the server logs. That's why every step is
    explicitly logged and every exception is logged with its full traceback
    (not just re-raised silently) -- otherwise "upload does nothing" is
    exactly what it looks like from the frontend even when the real cause is
    a clear, fixable error like a missing API key.
    """
    from app.database import SessionLocal
    db = SessionLocal()
    local_path = None
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        doc.status = "indexing"
        db.commit()
        logger.info(f"[ingest] Starting indexing for document_id={document_id} filename={filename}")

        # PyMuPDF needs a real local file -- if this document lives in Supabase
        # Storage, download it to a temp file first (cleaned up in `finally`).
        local_path = file_storage.get_local_copy(file_path)

        stats = ingest_pdf(
            document_id=document_id,
            file_path=local_path,
            filename=filename,
            category=category,
            chunk_size=settings.chunk_size_tokens,
            overlap=settings.chunk_overlap_tokens,
        )

        doc.total_pages = stats["total_pages"]
        doc.indexed_pages = stats["total_pages"] if stats["indexed_chunks"] > 0 else 0
        doc.status = "indexed" if stats["indexed_chunks"] > 0 else "failed"
        db.commit()
        logger.info(
            f"[ingest] Finished document_id={document_id}: "
            f"{stats['total_pages']} pages, {stats['indexed_chunks']} chunks indexed, "
            f"status={doc.status}"
        )
    except Exception:
        logger.error(f"[ingest] FAILED for document_id={document_id}:\n{traceback.format_exc()}")
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            db.commit()
    finally:
        if local_path and file_storage.is_temp_copy(file_path):
            file_storage.delete_temp_copy(local_path)
        db.close()


@router.get("/categories")
def get_categories():
    return CATEGORIES


@router.post("/upload", response_model=DocumentOut)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    category: str = Form(...),
    db: Session = Depends(get_db),
):
    logger.info(f"[upload] Received file={file.filename!r} category={category!r}")

    if category not in CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of {CATEGORIES}")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")

    doc = Document(filename=file.filename, category=category, file_path="", status="pending")
    db.add(doc)
    db.commit()
    db.refresh(doc)

    try:
        file_path_ref = file_storage.save_upload(doc.id, file.file)
    except Exception as e:
        logger.error(f"[upload] Failed to save file for document_id={doc.id}:\n{traceback.format_exc()}")
        doc.status = "failed"
        db.commit()
        raise HTTPException(500, f"Could not save uploaded file: {e}")

    doc.file_path = file_path_ref
    db.commit()
    logger.info(f"[upload] Saved (ref={file_path_ref}), queuing background indexing (document_id={doc.id}).")

    background_tasks.add_task(_run_indexing, doc.id, file_path_ref, file.filename, category)

    return doc


@router.get("", response_model=list[DocumentOut])
def list_documents(category: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Document)
    if category:
        q = q.filter(Document.category == category)
    return q.order_by(Document.upload_date.desc()).all()


@router.delete("/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    vs_delete_document(document_id)
    file_storage.delete_file(doc.file_path)
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}


@router.post("/cleanup-orphans")
def cleanup_orphans(db: Session = Depends(get_db)):
    """
    Permanently purges any vector-store chunks whose Document row no longer
    exists -- e.g. a document deleted outside the normal delete flow, or a
    leftover from before persistent storage (Postgres/pgvector) was set up.
    These orphaned chunks are already skipped at retrieval time (see
    rag/retrieval.py), but they still sit in storage until this is run.
    Safe to run anytime; only removes chunks with no matching document.
    """
    valid_ids = {d.id for d in db.query(Document.id).all()}
    purged_count = delete_orphaned_chunks(valid_ids)
    logger.info(f"[cleanup-orphans] Purged chunks for {purged_count} orphaned document_id(s).")
    return {"status": "ok", "orphaned_documents_purged": purged_count}


@router.post("/{document_id}/reindex", response_model=DocumentOut)
def reindex_document(document_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    vs_delete_document(document_id)
    doc.status = "pending"
    doc.indexed_pages = 0
    db.commit()
    background_tasks.add_task(_run_indexing, doc.id, doc.file_path, doc.filename, doc.category)
    return doc
