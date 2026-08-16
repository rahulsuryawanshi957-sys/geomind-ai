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


class SoilReplacementInput(BaseModel):
    """
    Step 3 (Soil Replacement, Aug 2026): replaces the top `replacement_depth_m`
    of the soil profile (measured from ground level) with an engineered
    material for calculation purposes ONLY -- the recorded borehole/lab data
    is never modified. See `_validate_replacement_config` /
    `_build_effective_profile` in services/calculators.py for the engine.

    `enabled=False` (the default) means no replacement -- every other field
    is then ignored/optional, and the case behaves exactly as it did before
    Step 3.

    When `enabled=True`:
    - `replacement_depth_m` and `bulk_density_t_m3` are REQUIRED.
    - at least one of `cohesion_t_m2` / `friction_angle_deg` is REQUIRED.
    - every other field is OPTIONAL -- if omitted, it's auto-sourced from
      the nearest original layer(s)/borehole average, same fallback rule as
      any other missing SoilLayer field.
    """
    enabled: bool = False
    replacement_depth_m: float | None = None
    bulk_density_t_m3: float | None = None
    cohesion_t_m2: float | None = None
    friction_angle_deg: float | None = None
    classification: str | None = None  # e.g. "SM", "GW" -- optional, drives cohesive/noncohesive routing
    specific_gravity: float | None = None
    moisture_content_pct: float | None = None
    compression_index_cc: float | None = None
    initial_void_ratio_e0: float | None = None
    n_value: float | None = None
    fines_content_pct: float | None = None


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
    replacement: SoilReplacementInput | None = None  # Step 3 -- applied to EVERY combination in the grid (batch-level; grid mode has no per-combination case concept)
    method: str | None = None  # Step 5 -- bearing-capacity method for the WHOLE grid. None -> existing
    # default (IS:6403), so pre-Step-5 requests behave identically. See
    # services/calculators.py BEARING_METHOD_REGISTRY for the currently supported method(s)
    # and PROJECT_STATUS.md's Step 5 section for why only IS:6403 is exposed to Batch today.


class BatchCaseInput(BaseModel):
    """One exact case for Batch's exact-pairs mode (Step 2, Aug 2026)."""
    case_id: str
    width_m: float
    depth_m: float
    length_m: float | None = None
    overrides: dict = {}  # case-level -- wins over the request's batch-wide `overrides`
    # for any field both specify; same allowed field names as BatchRunRequest.overrides.
    replacement: SoilReplacementInput | None = None  # Step 3 -- case-specific, independent of every other case
    method: str | None = None  # Step 5 -- case-level bearing-capacity method override. None ->
    # falls back to the request's batch-wide `method` (see BatchCasesRequest.method below).


class BatchCasesRequest(BaseModel):
    """
    Batch exact-pairs mode (Step 2, Aug 2026) -- runs EXACTLY the given
    (case_id, width_m, depth_m) cases, no cross-product. Sibling to
    BatchRunRequest (grid/cross-product mode, unchanged) -- see
    run_batch_cases() in services/calculators.py for the engine, which
    shares its actual per-case calculation with run_batch_matrix so the two
    modes can never silently diverge. A case's own `overrides` win over this
    request's batch-wide `overrides` for any field both specify.
    """
    borehole_id: str
    cases: list[BatchCaseInput]
    shape: str = "square"
    fos: float = 2.5
    allowable_settlement_mm: float = 25
    consolidation_type: str = "NCS"
    rigidity_factor: float = 1.0
    overrides: dict = {}  # batch-wide defaults, same field names as BatchRunRequest.overrides
    method: str | None = None  # Step 5 -- batch-wide default bearing-capacity method (None -> IS:6403).
    # A case's own `method` (BatchCaseInput.method) overrides this for that case only.


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


class PileGroupRequest(BaseModel):
    """
    Pile Group Analysis (added 14 Aug 2026) -- group efficiency (Converse-Labarre),
    block failure (equivalent pier), pile cap load distribution (rigid cap elastic
    method), and equivalent-raft settlement. Builds on the single-pile engine
    (run_pile_capacity) -- reads the same BoreholeProfile. See
    pile_calculator.py's "PILE GROUP ANALYSIS" section docstring for exact scope.
    """
    borehole_id: str
    diameter_m: float
    pile_length_m: float
    cutoff_depth_m: float = 0.0
    code: str = "IS_2911"
    num_rows: int
    num_cols: int
    spacing_m: float  # centre-to-centre, same in both directions
    cap_load_t: float  # total vertical load on the pile cap
    moment_x_t_m: float = 0.0  # moment about X (varies pile load along Y)
    moment_y_t_m: float = 0.0  # moment about Y (varies pile load along X)
    pile_behaviour: str = "friction"  # "friction" or "end_bearing" -- affects equivalent-raft depth for settlement
    water_table_depth_m: float | None = None
    scour_depth_m: float | None = None
    liquefaction_depth_m: float | None = None
    critical_depth_factor: float | None = None
    fos_compression: float = 2.5
    fos_uplift: float = 2.5
    overrides: dict = {}
    # Settlement -- optional; leave run_settlement False to skip. When on, computed
    # LAYER-WISE against the borehole's real layers (like the Bearing Capacity &
    # Settlement multi-layer tool), not a single manually-entered soil type.
    run_settlement: bool = False
    settlement_influence_multiplier: float = 1.5  # influence zone = raft_depth + multiplier * min(Lg, Bg)


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


class AutoReportRequest(BaseModel):
    borehole_id: str
    batch_result: dict


class CombinedReportRequest(BaseModel):
    """Combined Project Report -- picks any set of past calculation runs
    (by CalculationLog id, from GET /api/calculators/history) and assembles
    them into one DOCX. See combined_report_builder.py's module docstring."""
    title: str = "Combined Geotechnical Engineering Report"
    project_name: str | None = None
    site_location: str | None = None
    log_ids: list[str]
    write_ai_summary: bool = True


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


class RockSocketPileRequest(BaseModel):
    """
    Safe Axial (Compression + Uplift) Capacity of a Pile Socketed into Rock --
    IRC:78, Appendix-5, Cl 9, Method 1 or Method 2. Added 5 Aug 2026, digitized
    directly from Raahi's own Method_I_sheet.xlsx / Method_II_sheet.xlsx --
    see rock_socket_pile.py's module docstring for exactly what's implemented
    and what's deliberately deferred (the lateral/moment-in-rock check).
    """
    method: str  # 'method_1' | 'method_2'

    # Common geometry -- required for both methods
    dia_mm: float | None = None
    socket_length_x_dia: float | None = None   # socket length as a multiple of D, e.g. 2 = 2xD
    rock_top_depth_m: float | None = None       # depth of rock strata below GL
    scour_depth_m: float | None = None          # optional, default 0
    cr_percent: float | None = None             # core recovery %
    rqd_percent: float | None = None            # RQD %

    # Method 1 only -- core UCS
    qc_kgcm2: float | None = None

    # Method 2 only -- read off IRC:78 Table 6 by rock type + SPT-N
    cub_mpa: float | None = None
    crushing_strength_mpa: float | None = None
    nc: float | None = None  # bearing capacity factor, default 9


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
