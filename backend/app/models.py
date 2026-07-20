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


class BoreholeProfile(Base):
    """
    A parsed borehole from an uploaded lab-data spreadsheet. This is the
    'spine' that calculators (shear SBC, settlement SBC, and future
    liquefaction/pile/batch features) read their soil parameters from,
    instead of the person re-typing the same numbers into every calculator.
    """
    __tablename__ = "borehole_profiles"

    id = Column(String, primary_key=True, default=gen_id)
    borehole_id = Column(String, nullable=False)     # e.g. "BH-01" as given in the sheet
    project_name = Column(String, nullable=True)
    water_table_depth_m = Column(Float, nullable=True)
    source_filename = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    layers = relationship("SoilLayer", back_populates="borehole", cascade="all, delete-orphan", order_by="SoilLayer.from_m")


class SoilLayer(Base):
    """One depth interval of lab/field data within a BoreholeProfile."""
    __tablename__ = "soil_layers"

    id = Column(String, primary_key=True, default=gen_id)
    borehole_id_fk = Column(String, ForeignKey("borehole_profiles.id"))

    from_m = Column(Float, nullable=False)
    to_m = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    classification = Column(String, nullable=True)   # USCS group symbol, e.g. CI, SM

    n_value = Column(Float, nullable=True)            # field SPT N
    bulk_density_t_m3 = Column(Float, nullable=True)
    specific_gravity = Column(Float, nullable=True)
    moisture_content_pct = Column(Float, nullable=True)
    cohesion_t_m2 = Column(Float, nullable=True)
    friction_angle_deg = Column(Float, nullable=True)
    compression_index_cc = Column(Float, nullable=True)
    initial_void_ratio_e0 = Column(Float, nullable=True)

    # Rock parameters (for rock strata within a borehole -- weathering
    # grade, core-based recovery/RQD, and strength)
    rock_type = Column(String, nullable=True)             # e.g. "Fine-grained Basalt"
    weathering_grade = Column(String, nullable=True)       # e.g. "Grade II", "Fresh"
    core_recovery_pct = Column(Float, nullable=True)
    rqd_pct = Column(Float, nullable=True)
    ucs_kg_cm2 = Column(Float, nullable=True)              # Unconfined Compressive Strength

    borehole = relationship("BoreholeProfile", back_populates="layers")
