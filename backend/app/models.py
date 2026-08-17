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
    source_file_hash = Column(String, nullable=True, index=True)  # sha256 of the uploaded bytes -- duplicate-upload detection, added 4 Aug 2026
    easting = Column(Float, nullable=True)
    northing = Column(Float, nullable=True)
    rl_m = Column(Float, nullable=True)
    date_of_boring = Column(String, nullable=True)
    project_number = Column(String, nullable=True)
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
    sample_id = Column(String, nullable=True)          # e.g. "UDS-1", "SPT-3", "DS-2"
    sample_type = Column(String, nullable=True)        # e.g. "UDS", "SPT", "DS"

    n_value = Column(Float, nullable=True)            # field SPT N
    bulk_density_t_m3 = Column(Float, nullable=True)
    specific_gravity = Column(Float, nullable=True)
    moisture_content_pct = Column(Float, nullable=True)
    cohesion_t_m2 = Column(Float, nullable=True)
    friction_angle_deg = Column(Float, nullable=True)
    compression_index_cc = Column(Float, nullable=True)
    initial_void_ratio_e0 = Column(Float, nullable=True)
    fines_content_pct = Column(Float, nullable=True)  # % passing 75-micron sieve -- used by the liquefaction fines correction (alpha/beta)

    # Rock parameters (for rock strata within a borehole -- weathering
    # grade, core-based recovery/RQD, and strength)
    rock_type = Column(String, nullable=True)             # e.g. "Fine-grained Basalt"
    weathering_grade = Column(String, nullable=True)       # e.g. "Grade II", "Fresh"
    core_recovery_pct = Column(Float, nullable=True)
    rqd_pct = Column(Float, nullable=True)
    ucs_kg_cm2 = Column(Float, nullable=True)              # Unconfined Compressive Strength

    borehole = relationship("BoreholeProfile", back_populates="layers")


class AppCredential(Base):
    """
    Single shared login for the whole app (not per-user accounts -- one
    username/password Raahi uses, changeable from Settings). Singleton row
    (id=1). Password is never stored in plain text -- see app/auth.py.
    """
    __tablename__ = "app_credentials"

    id = Column(Integer, primary_key=True, default=1)
    username = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    password_salt = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class AuthSession(Base):
    """
    An opaque, server-side session token (not a JWT -- simpler to revoke,
    and this app has exactly one credential to protect, so there's no need
    for JWT's stateless-verification benefit). Frontend sends this back as
    `Authorization: Bearer <token>` on every request; main.py's auth
    middleware checks it against this table.
    """
    __tablename__ = "auth_sessions"

    token = Column(String, primary_key=True, default=gen_id)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)


class CalcConfiguration(Base):
    """
    Step 6 (Formula Configuration & Versioning, Aug 2026) -- a named,
    versioned, IMMUTABLE bundle of parameter overrides for one calculation
    method (e.g. "Project A v2" for IS:6403 -> FOS=3.0). Every row here is a
    single frozen version: creating "the next version" of a configuration
    always INSERTs a new row, never UPDATEs an existing one -- see
    app/services/configurations.py for why, and why only a small whitelisted
    set of already-request-level parameters (fos, allowable_settlement_mm,
    rigidity_factor, consolidation_type) can ever appear in parameters_json.
    No internal formula coefficient or IS-code constant is ever stored here.

    `configuration_id` is the stable, human-readable identifier for THIS
    version specifically (e.g. "IS_6403-PROJECT_A-V2") -- this is what a
    Batch case, an individual calculation, or a saved result references, so
    a calculation result stays reproducible even if later versions are
    created or this row is archived. `config_group_id` links every version
    of the "same" named configuration together (for listing/UI purposes
    only -- resolution always goes through `configuration_id`, never the
    group id, so archiving or adding v3 can never change what v1/v2 meant).

    No FK to a "Project" table -- there isn't one in this app (see
    BoreholeProfile.project_name, same free-text convention).
    """
    __tablename__ = "calc_configurations"

    configuration_id = Column(String, primary_key=True)   # e.g. "IS_6403-PROJECT_A-V2"
    method = Column(String, nullable=False, index=True)    # e.g. "IS_6403" -- must match BEARING_METHOD_REGISTRY
    config_group_id = Column(String, nullable=False, index=True)  # e.g. "PROJECT_A" -- groups versions for listing
    config_name = Column(String, nullable=False)            # e.g. "Project A" (as typed, unslugged)
    project_name = Column(String, nullable=True)            # optional free-text link to a borehole's project_name
    version = Column(Integer, nullable=False)                # 1, 2, 3... within (method, config_group_id)
    parameters_json = Column(Text, nullable=False)           # JSON dict, e.g. {"fos": 3.0} -- fully resolved for
    # THIS version already (base version's overrides merged in at creation time), so resolving a
    # configuration_id later never needs to walk a parent chain -- see services/configurations.py.
    source_configuration_id = Column(String, nullable=True)  # which configuration_id (or null = DEFAULT) this
    # version was created FROM -- audit lineage only, never read during resolution.
    is_active = Column(Boolean, default=True)                 # archived (soft-deleted) configs are never offered
    # for NEW calculations, but past results that already reference this configuration_id are
    # completely unaffected -- see resolve_configuration()'s docstring on why archiving is always safe.
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
