from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.models import Conversation, Message

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/conversations")
def list_conversations(q: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Conversation)
    if q:
        matching_msg_conv_ids = [m.conversation_id for m in
                                   db.query(Message).filter(Message.content.ilike(f"%{q}%")).all()]
        query = query.filter(or_(Conversation.title.ilike(f"%{q}%"), Conversation.id.in_(matching_msg_conv_ids)))
    convs = query.order_by(Conversation.created_at.desc()).all()
    return [{"id": c.id, "title": c.title, "created_at": c.created_at, "engineering_mode": c.engineering_mode} for c in convs]


@router.get("/conversations/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    messages = db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at).all()
    return {
        "id": conv.id,
        "title": conv.title,
        "messages": [{"role": m.role, "content": m.content, "citations_json": m.citations_json, "created_at": m.created_at} for m in messages],
    }


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    db.delete(conv)
    db.commit()
    return {"status": "deleted"}
