import shutil
from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Document
from app.schemas import DocumentOut
from app.rag.ingest import ingest_pdf
from app.rag.vectorstore import delete_document as vs_delete_document
from app.config import settings

router = APIRouter(prefix="/api/documents", tags=["documents"])

CATEGORIES = [
    "Soil Mechanics", "Foundation Engineering", "Rock Mechanics", "Bridge Foundation",
    "FHWA Manuals", "NAVFAC", "IRC Codes", "IS Codes", "Personal Notes",
]


def _run_indexing(document_id: str, file_path: str, filename: str, category: str):
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        doc.status = "indexing"
        db.commit()
        stats = ingest_pdf(
            document_id=document_id,
            file_path=file_path,
            filename=filename,
            category=category,
            chunk_size=settings.chunk_size_tokens,
            overlap=settings.chunk_overlap_tokens,
        )
        doc.total_pages = stats["total_pages"]
        doc.indexed_pages = stats["total_pages"] if stats["indexed_chunks"] > 0 else 0
        doc.status = "indexed" if stats["indexed_chunks"] > 0 else "failed"
        db.commit()
    except Exception:
        doc = db.query(Document).filter(Document.id == document_id).first()
        if doc:
            doc.status = "failed"
            db.commit()
        raise
    finally:
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
    if category not in CATEGORIES:
        raise HTTPException(400, f"Invalid category. Must be one of {CATEGORIES}")
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported.")

    doc = Document(filename=file.filename, category=category, file_path="", status="pending")
    db.add(doc)
    db.commit()
    db.refresh(doc)

    dest_path = settings.uploads_dir / f"{doc.id}.pdf"
    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    doc.file_path = str(dest_path)
    db.commit()

    background_tasks.add_task(_run_indexing, doc.id, str(dest_path), file.filename, category)

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
    db.delete(doc)
    db.commit()
    return {"status": "deleted"}


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
