import io
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from docx import Document as DocxDocument
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from app.schemas import ReportSectionRequest
from app.rag.retrieval import retrieve
from app.services.llm import generate_report_section

router = APIRouter(prefix="/api/reports", tags=["reports"])

SECTION_TYPES = [
    "SBC Recommendation", "Foundation Recommendation", "Pile Recommendation",
    "Liquefaction Summary", "Settlement Summary", "Design Notes", "Engineering Conclusion",
]


@router.get("/section-types")
def section_types():
    return SECTION_TYPES


@router.post("/generate")
def generate_section(req: ReportSectionRequest):
    query = req.reference_query or req.section_type
    chunks = retrieve(query)
    content = generate_report_section(req.section_type, req.project_inputs, chunks)
    return {"section_type": req.section_type, "content": content, "sources_used": len(chunks)}


@router.post("/export/docx")
def export_docx(sections: dict):
    """sections: {"Project Title": "...", "sections": [{"title": "...", "content": "..."}]}"""
    doc = DocxDocument()
    doc.add_heading(sections.get("title", "Geotechnical Report"), level=0)
    for sec in sections.get("sections", []):
        doc.add_heading(sec["title"], level=1)
        for para in sec["content"].split("\n"):
            if para.strip():
                doc.add_paragraph(para)
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=raahigeo_report.docx"},
    )


@router.post("/export/pdf")
def export_pdf(sections: dict):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [Paragraph(sections.get("title", "Geotechnical Report"), styles["Title"]), Spacer(1, 12)]
    for sec in sections.get("sections", []):
        story.append(Paragraph(sec["title"], styles["Heading2"]))
        for para in sec["content"].split("\n"):
            if para.strip():
                story.append(Paragraph(para, styles["BodyText"]))
        story.append(Spacer(1, 10))
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=raahigeo_report.pdf"},
    )
