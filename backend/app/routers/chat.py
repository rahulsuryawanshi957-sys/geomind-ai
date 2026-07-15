import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Conversation, Message
from app.schemas import ChatRequest, ChatResponse, Citation
from app.rag.retrieval import retrieve
from app.services.llm import answer_question

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("", response_model=ChatResponse)
def chat(req: ChatRequest, db: Session = Depends(get_db)):
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
