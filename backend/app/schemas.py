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


class LiquefactionRequest(BaseModel):
    """
    Liquefaction analysis request -- reads the borehole's own soil layers
    (same BoreholeProfile used for SBC batch analysis, per Raahi's request to
    connect this to the existing soil sheet rather than separate data entry).
    `overrides` follows the same pattern as batch: global keys
    (water_table_depth_m, earthquake_magnitude_mw, earthquake_zone, pga_g)
    apply borehole-wide; a layer's own `id` as a dict key
    ({"<layer_id>": {"n_value": 20}}) overrides just that one layer.
    """
    borehole_id: str
    earthquake_magnitude_mw: float
    earthquake_zone: str | None = None  # "II"/"III"/"IV"/"V" -- IS 1893 zone lookup for PGA, unless pga_g given directly
    pga_g: float | None = None  # manual PGA override (amax/g), bypasses the zone lookup entirely
    overrides: dict = {}


class PileCapacityRequest(BaseModel):
    """
    Pile Foundation Design Module (Phase 1) request -- bored cast-in-situ
    pile, compression + uplift capacity. Reads the same BoreholeProfile used
    by batch/liquefaction (no separate Excel import). `overrides` is a flat
    dict of SoilLayer field names (e.g. {"cohesion_t_m2": 3.5}) applied
    borehole-wide wherever a layer is missing that field, same convention as
    BatchRunRequest.
    """
    borehole_id: str
    diameter_m: float
    pile_length_m: float
    cutoff_depth_m: float = 0.0
    code: str = "IS_2911"  # "IS_2911" or "IRC_78"
    water_table_depth_m: float | None = None  # override -- blank = use the borehole's own recorded value
    scour_depth_m: float | None = None
    liquefaction_depth_m: float | None = None  # depth to which soil is treated as liquefied/ineffective for skin friction (max of this and scour_depth_m governs, same as a deeper scour level)
    critical_depth_factor: float | None = None  # override for the code's default critical-depth multiplier (15D for IS 2911, 20D for IRC:78) -- xD below the ineffective (scour/liquefaction) level
    fos_compression: float = 2.5
    fos_uplift: float = 2.5
    overrides: dict = {}


class LateralCapacityRequest(BaseModel):
    """
    Lateral Pile Capacity (IS:2911 Part 1/Sec 1:2010, Annex C, 1%-diameter
    deflection criterion) request. Borehole-aware like the other calculators:
    cohesion/N-value/classification are auto-sourced from the founding layer
    at ground level (where free_length_above_ground_m ends) unless
    overridden. `soil_type`/`consolidation_type` can be forced via overrides
    ("soil_type": "cohesive"|"cohesionless", "consolidation_type": "OCS"|"NCS")
    or left blank for auto-detection from the layer's own classification.
    """
    borehole_id: str
    width_m: float
    embedded_length_m: float
    free_length_above_ground_m: float = 0.0
    pile_material_modulus_t_m2: float = 3000000.0  # M25 concrete default (~3e6 t/m2 = 30000 MPa-ish per IS:456 Ec correlation)
    allowable_deflection_pct_dia: float = 1.0
    overrides: dict = {}


class PileCommandRequest(BaseModel):
    """Free-text AI command (e.g. 'Design a 1000mm pile using IRC:78') to be
    parsed into structured PileCapacityRequest fields -- Step 6 of the spec.
    Fields not mentioned in the text are left as None; the frontend merges
    them with whatever the person already had filled in the form."""
    text: str
    borehole_id: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangeCredentialsRequest(BaseModel):
    current_password: str
    owner_pin: str
    new_username: str
    new_password: str


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
    fines_content_pct: float | None = None
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


class GroundImprovementRequest(BaseModel):
    """
    Ground Improvement -- 4 independent sub-tools (stone columns, PVD,
    vibro-compaction, recommendation). See ground_improvement.py's module
    docstring for formula sources/confidence. Every field is optional; the
    service runs whichever sub-tool(s) have enough inputs.
    """
    # Stone column (IS 15284 Part 1) -- all 5 required together to run
    column_dia_m: float | None = None
    sc_spacing_m: float | None = None
    sc_pattern: str | None = None  # 'triangular' | 'square'
    stress_ratio_n: float | None = None
    applied_stress_kpa: float | None = None
    mv_m2_per_kn: float | None = None
    treated_depth_m: float | None = None
    untreated_settlement_mm: float | None = None

    # PVD consolidation -- all 7 required together to run
    pvd_spacing_m: float | None = None
    pvd_pattern: str | None = None  # 'triangular' | 'square'
    drain_width_mm: float | None = None
    drain_thickness_mm: float | None = None
    ch_m2_per_year: float | None = None
    cv_m2_per_year: float | None = None
    drainage_path_m: float | None = None
    target_U_percent: float | None = None
    elapsed_time_years: float | None = None

    # Vibro-compaction feasibility
    fines_content_percent: float | None = None
    d50_mm: float | None = None

    # Recommendation engine
    fs_liquefaction: float | None = None
    predicted_settlement_mm: float | None = None
    allowable_settlement_mm: float | None = None


class RockBearingCapacityRequest(BaseModel):
    """
    Safe Bearing Capacity on ROCK -- IS 12070:1987. NOT borehole-aware (same as
    RetainingWallRequest) -- rock properties are a single input set, not a
    layered soil borehole profile. Every field is optional; the service runs
    whichever method(s) have enough inputs and reports the minimum (governing)
    value, per Raahi's explicit instruction (4 Aug 2026). See
    rock_bearing_capacity.py's module docstring for the source-fidelity note
    on Clause 7 (pressuremeter).
    """
    # Method 1: Classification table (Cl 5.2)
    rock_type: str | None = None  # one of ROCK_TYPE_TABLE's keys

    # Method 2: RMR table (Cl 5.3)
    rmr: float | None = None  # 0-100

    # Method 3: Core strength formula (Cl 6.2) -- all 4 required together
    ucs_t_m2: float | None = None
    joint_spacing_cm: float | None = None
    joint_aperture_mm: float | None = None
    joint_filled_with_soil: bool = False
    footing_width_cm: float | None = None

    # Method 4a: Pressuremeter formula (Cl 7.2) -- all 4 required together
    limit_pressure_t_m2: float | None = None
    gamma_t_m3: float | None = None
    depth_m: float | None = None
    footing_radius_m: float | None = None

    # Method 4b: Plate load test (Cl 8) -- field-read value, not computed
    plate_load_field_value_t_m2: float | None = None

    # Cl 9.1 correction factor (submerged/cavities/slopes) -- judgment call,
    # left to the engineer; 1.0 = no reduction applied.
    correction_factor: float = 1.0


class RetainingWallRequest(BaseModel):
    """
    RC Cantilever Retaining Wall -- geotechnical checks only (earth pressure,
    water pressure, seismic (Mononobe-Okabe), stability, bearing capacity,
    settlement), per Raahi's uploaded reference workbook (3 Aug 2026).
    NOT borehole-aware (unlike batch/liquefaction/pile) -- soil is a single
    set of backfill/foundation parameters here, matching the source
    workbook's own Inputs sheet, not a layered borehole profile. Structural/
    RCC design (stem/heel/toe reinforcement) is a separate, not-yet-built
    phase -- see retaining_wall_calculator.py's module docstring.
    """
    # Geometry (m)
    H_wall: float
    D_found: float
    t_base: float
    B_base: float
    B_toe: float
    B_heel: float
    t_top: float
    t_bot: float

    # Soil properties
    gamma: float          # kN/m3, moist/bulk unit weight of backfill
    gamma_sat: float       # kN/m3
    phi: float             # degrees
    cohesion: float = 0.0  # kPa
    qa: float | None = None  # kPa, allowable bearing capacity from soil report
    water_table_depth_m: float = 100.0  # below EGL; large default = "not encountered"
    delta: float | None = None  # wall-backfill friction angle, deg; default (2/3)*phi if omitted
    beta: float = 0.0      # backfill slope angle, deg
    i_toe: float = 0.0     # ground slope in front of toe, deg (not yet used in checks)
    gamma_c: float = 24.0  # kN/m3, unit weight of concrete
    mu: float | None = None  # base-soil interface friction coefficient; default tan(2/3 phi) if omitted
    drainage_provided: bool = True

    # Surcharge / external loads (kPa, on backfill/heel side)
    q_surch: float = 0.0
    q_traffic: float = 0.0
    q_build: float = 0.0
    q_strip: float = 0.0

    # Seismic (IS 1893:2016)
    Z: float = 0.16         # zone factor; used only to suggest kh=Z/2 if kh omitted
    kh: float | None = None
    kv: float | None = None

    # Stability parameters
    passive_mobilisation_factor: float = 0.5
    fos_bearing: float = 2.5  # FS_br

    # Settlement (Phase 2) -- all optional, "Insufficient data" if omitted
    Es_kpa: float | None = None
    poisson_ratio: float = 0.3
    influence_factor: float = 0.8
    Cc: float | None = None
    e0: float | None = None
    Hc_m: float | None = None
    sigma0_kpa: float | None = None
    C_alpha: float | None = None
    t_ratio: float | None = None
