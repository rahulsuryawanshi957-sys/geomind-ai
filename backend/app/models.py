import datetime
import uuid
from sqlalchemy import Column, String, Integer, DateTime, Text, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


def gen_id() -> str:
    return str(uuid.uuid4())


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=gen_id)
    filename = Column(String, nullable=False)
    category = Column(String, nullable=False)  # Soil Mechanics, IS Codes, etc.
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)
    indexed_pages = Column(Integer, default=0)
    total_pages = Column(Integer, default=0)
    status = Column(String, default="pending")  # pending | indexing | indexed | failed
    file_path = Column(String, nullable=False)

    chunks = relationship("Chunk", back_populates="document", cascade="all, delete-orphan")


class Chunk(Base):
    """Metadata mirror of what's embedded in ChromaDB (source of truth for text is Chroma)."""
    __tablename__ = "chunks"

    id = Column(String, primary_key=True, default=gen_id)
    document_id = Column(String, ForeignKey("documents.id"))
    page_number = Column(Integer, nullable=True)
    clause_number = Column(String, nullable=True)
    preview = Column(Text, nullable=True)

    document = relationship("Document", back_populates="chunks")


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(String, primary_key=True, default=gen_id)
    title = Column(String, default="New conversation")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    engineering_mode = Column(Boolean, default=True)

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=gen_id)
    conversation_id = Column(String, ForeignKey("conversations.id"))
    role = Column(String)  # user | assistant
    content = Column(Text)
    citations_json = Column(Text, nullable=True)  # JSON string of citation objects
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class CalculationLog(Base):
    __tablename__ = "calculation_logs"

    id = Column(String, primary_key=True, default=gen_id)
    calculator_type = Column(String)
    inputs_json = Column(Text)
    result_json = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
