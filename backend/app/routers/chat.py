import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Conversation, Message
from app.schemas import ChatRequest, ChatResponse, Citation
from app.rag.retrieval import retrieve
from app.services.llm import answer_question, answer_question_stream
from app.config import logger

router = APIRouter(prefix="/api/chat", tags=["chat"])


def _sse(event_type: str, **data) -> str:
    return f"data: {json.dumps({'type': event_type, **data})}\n\n"


@router.post("")
def chat(req: ChatRequest, db: Session = Depends(get_db)):
    logger.info(f"[chat] Request received: question={req.question!r} engineering_mode={req.engineering_mode}")

    if req.conversation_id:
        conv = db.query(Conversation).filter(Conversation.id == req.conversation_id).first()
        if not conv:
            raise HTTPException(404, "Conversation not found")
    else:
        conv = Conversation(title=req.question[:60], engineering_mode=req.engineering_mode)
        db.add(conv)
        db.commit()
        db.refresh(conv)
    logger.info(f"[chat] Using conversation_id={conv.id}")

    history = [{"role": m.role, "content": m.content} for m in
               db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.created_at).all()]

    logger.info("[chat] Retrieving relevant chunks...")
    chunks = retrieve(req.question, category=req.category_filter)
    logger.info(f"[chat] Retrieved {len(chunks)} chunk(s).")

    citations = [
        Citation(filename=c["filename"], page_number=c["page_number"],
                  clause_number=c["clause_number"], category=c["category"], score=c["score"])
        for c in chunks
    ]

    def event_stream():
        full_answer_parts = []
        try:
            logger.info("[chat] Streaming from Gemini...")
            for piece in answer_question_stream(req.question, chunks, engineering_mode=req.engineering_mode, history=history):
                full_answer_parts.append(piece)
                yield _sse("text", content=piece)
        except HTTPException as e:
            yield _sse("error", message=e.detail)
            return
        except Exception as e:
            yield _sse("error", message=str(e))
            return

        answer = "".join(full_answer_parts)
        logger.info("[chat] Stream complete, saving to history.")
        user_msg = Message(conversation_id=conv.id, role="user", content=req.question)
        assistant_msg = Message(
            conversation_id=conv.id, role="assistant", content=answer,
            citations_json=json.dumps([c.model_dump() for c in citations]),
        )
        db.add_all([user_msg, assistant_msg])
        db.commit()

        yield _sse(
            "done",
            conversation_id=conv.id,
            citations=[c.model_dump() for c in citations],
            found_in_documents=len(chunks) > 0,
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/sync", response_model=ChatResponse)
def chat_sync(req: ChatRequest, db: Session = Depends(get_db)):
    """
    Non-streaming fallback, kept for anything that still needs a single JSON
    response (e.g. a future API integration, or if streaming ever needs to
    be diagnosed by comparing against a known-simple code path). The main
    frontend chat UI uses the streaming POST /api/chat above.
    """
    if req.conversation_id:
        conv = db.query(Conversation).filter(Conversation.id == req.conversation_id).first()
        if not conv:
            raise HTTPException(404, "Conversation not found")
    else:
        conv = Conversation(title=req.question[:60], engineering_mode=req.engineering_mode)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    history = [{"role": m.role, "content": m.content} for m in
               db.query(Message).filter(Message.conversation_id == conv.id).order_by(Message.created_at).all()]

    chunks = retrieve(req.question, category=req.category_filter)
    answer = answer_question(req.question, chunks, engineering_mode=req.engineering_mode, history=history)

    citations = [
        Citation(filename=c["filename"], page_number=c["page_number"],
                  clause_number=c["clause_number"], category=c["category"], score=c["score"])
        for c in chunks
    ]

    user_msg = Message(conversation_id=conv.id, role="user", content=req.question)
    assistant_msg = Message(
        conversation_id=conv.id, role="assistant", content=answer,
        citations_json=json.dumps([c.model_dump() for c in citations]),
    )
    db.add_all([user_msg, assistant_msg])
    db.commit()

    return ChatResponse(
        conversation_id=conv.id,
        answer=answer,
        citations=citations,
        found_in_documents=len(chunks) > 0,
    )
