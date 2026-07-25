from fastapi import APIRouter
from app.schemas import ClauseFinderRequest
from app.rag.retrieval import retrieve
from app.services.llm import answer_question

router = APIRouter(prefix="/api/clause-finder", tags=["clause-finder"])


@router.post("")
def find_clause(req: ClauseFinderRequest):
    question = f"Find the clause in {req.code_name} that addresses: {req.topic}. State the exact clause number as written in the document, and quote the relevant text."
    chunks = retrieve(question, category="IS Codes") or retrieve(question, category="IRC Codes") or retrieve(question)

    if not chunks:
        return {
            "found": False,
            "message": f"No clause matching '{req.topic}' was found in your uploaded copy of {req.code_name}. "
                       f"Upload the relevant IS/IRC code PDF to enable this lookup.",
        }

    explanation = answer_question(question, chunks, engineering_mode=True)
    return {
        "found": True,
        "explanation": explanation,
        "sources": [
            {"filename": c["filename"], "page_number": c["page_number"], "clause_number": c["clause_number"], "score": c["score"]}
            for c in chunks
        ],
    }
