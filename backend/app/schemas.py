from pydantic import BaseModel
from datetime import datetime


class DocumentOut(BaseModel):
    id: str
    filename: str
    category: str
    upload_date: datetime
    indexed_pages: int
    total_pages: int
    status: str

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    conversation_id: str | None = None
    question: str
    engineering_mode: bool = True
    category_filter: str | None = None


class Citation(BaseModel):
    filename: str
    page_number: int | None = None
    clause_number: str | None = None
    category: str | None = None
    score: float


class ChatResponse(BaseModel):
    conversation_id: str
    answer: str
    citations: list[Citation]
    found_in_documents: bool


class SearchRequest(BaseModel):
    query: str
    category_filter: str | None = None
    top_k: int = 15


class ClauseFinderRequest(BaseModel):
    code_name: str  # e.g. "IS 2911"
    topic: str      # e.g. "negative skin friction"


class CalculatorRequest(BaseModel):
    calculator_type: str
    inputs: dict


class BatchRunRequest(BaseModel):
    """
    Batch/matrix engine request (v2): runs shear (IS:6403) + settlement
    (IS:8009) SBC for every width x depth combination in the grid
    (cross-product of widths_m x depths_m). No manual layer pick -- for each
    depth, the founding layer is auto-located from the borehole's own layers,
    and any field that layer is missing is filled from neighbouring layers or
    a borehole-wide average (see run_batch_matrix in services/calculators.py).
    `overrides` lets Raahi manually pin any field (e.g. {"cohesion_t_m2": 3.5})
    to skip auto-sourcing for that field across the whole batch.
    """
    borehole_id: str
    widths_m: list[float]
    depths_m: list[float]
    length_m: float | None = None  # None => square footing (length = width) per combination
    shape: str = "square"
    fos: float = 2.5
    allowable_settlement_mm: float = 25
    consolidation_type: str = "NCS"  # only used for layers auto/override-detected as cohesive
    rigidity_factor: float = 1.0
    overrides: dict = {}  # optional manual pins: cohesion_t_m2, friction_angle_deg,
    # bulk_density_t_m3, gamma_avg_above_t_m3, specific_gravity, moisture_content_pct,
    # n_value, compression_index_cc, initial_void_ratio_e0, elastic_modulus_t_m2, soil_type


class ReportSectionRequest(BaseModel):
    section_type: str
    project_inputs: dict
    reference_query: str | None = None


class SoilLayerOut(BaseModel):
    id: str
    from_m: float
    to_m: float
    description: str | None = None
    classification: str | None = None
    n_value: float | None = None
    bulk_density_t_m3: float | None = None
    specific_gravity: float | None = None
    moisture_content_pct: float | None = None
    cohesion_t_m2: float | None = None
    friction_angle_deg: float | None = None
    compression_index_cc: float | None = None
    initial_void_ratio_e0: float | None = None
    rock_type: str | None = None
    weathering_grade: str | None = None
    core_recovery_pct: float | None = None
    rqd_pct: float | None = None
    ucs_kg_cm2: float | None = None
    sample_id: str | None = None
    sample_type: str | None = None

    class Config:
        from_attributes = True


class BoreholeProfileOut(BaseModel):
    id: str
    borehole_id: str
    project_name: str | None = None
    water_table_depth_m: float | None = None
    easting: float | None = None
    northing: float | None = None
    rl_m: float | None = None
    date_of_boring: str | None = None
    project_number: str | None = None
    source_filename: str | None = None
    created_at: datetime
    layers: list[SoilLayerOut] = []

    class Config:
        from_attributes = True
