import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CalculationLog, BoreholeProfile
from app.schemas import CalculatorRequest, BatchRunRequest, BatchCasesRequest, LiquefactionRequest, PileCapacityRequest, PileCommandRequest, LateralCapacityRequest, RetainingWallRequest, RockBearingCapacityRequest, GroundImprovementRequest, RockSocketPileRequest, PileGroupRequest
from app.services.calculators import CALCULATOR_REGISTRY, run_batch_matrix, run_batch_cases, run_liquefaction_analysis, MAX_BATCH_CASES
from app.services.pile_calculator import run_pile_capacity, parse_pile_command, run_lateral_capacity, run_pile_group_analysis
from app.services.retaining_wall_calculator import run_retaining_wall_analysis
from app.services.rock_bearing_capacity import run_rock_bearing_capacity
from app.services.ground_improvement import run_ground_improvement
from app.services.rock_socket_pile import run_rock_socket_pile
from app.services.calculators import _founding_layer, _resolve_field
from app.services.combined_report_builder import _headline as _history_headline, CALC_TYPE_TITLES

router = APIRouter(prefix="/api/calculators", tags=["calculators"])


@router.get("/history")
def calculation_history(calculator_type: str | None = None, limit: int = 100, db: Session = Depends(get_db)):
    """Every past calculator run (batch matrix, pile, rock, wall, etc), most
    recent first -- the read side of the CalculationLog every /run-style
    endpoint below already writes to. Added 14 Aug 2026 so runs can be
    picked for a Combined Project Report (see /api/reports/combined-generate)
    without re-running anything. `borehole_id` is pulled from the request
    inputs when that calculator type is borehole-aware (pile/batch/
    liquefaction/lateral/pile-group); calculators that take standalone soil
    inputs (rock bearing, retaining wall) simply won't have one."""
    query = db.query(CalculationLog).order_by(CalculationLog.created_at.desc())
    if calculator_type:
        query = query.filter(CalculationLog.calculator_type == calculator_type)
    logs = query.limit(min(limit, 200)).all()
    out = []
    for log in logs:
        try:
            inputs = json.loads(log.inputs_json) if log.inputs_json else {}
        except Exception:
            inputs = {}
        try:
            result = json.loads(log.result_json) if log.result_json else {}
        except Exception:
            result = {}
        out.append({
            "id": log.id,
            "calculator_type": log.calculator_type,
            "calculator_title": CALC_TYPE_TITLES.get(log.calculator_type, log.calculator_type),
            "created_at": log.created_at,
            "borehole_id": inputs.get("borehole_id"),
            "headline": _history_headline(log.calculator_type, result),
        })
    return out


@router.delete("/history/{log_id}")
def delete_calculation(log_id: str, db: Session = Depends(get_db)):
    """Delete a single saved calculation. Added 14 Aug 2026, per Raahi's
    request for a place to see every saved calculation and clear out ones
    no longer needed."""
    log = db.query(CalculationLog).filter(CalculationLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "That calculation was not found -- it may already be deleted.")
    db.delete(log)
    db.commit()
    return {"deleted": 1}


@router.post("/history/delete-bulk")
def delete_calculations_bulk(body: dict, db: Session = Depends(get_db)):
    """Delete several saved calculations at once. Body: {"log_ids": ["...", "..."]}."""
    log_ids = body.get("log_ids") or []
    if not log_ids:
        raise HTTPException(422, "Provide at least one log_id to delete.")
    deleted = db.query(CalculationLog).filter(CalculationLog.id.in_(log_ids)).delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.delete("/history")
def delete_calculations_all(confirm: bool = False, calculator_type: str | None = None, db: Session = Depends(get_db)):
    """Delete ALL saved calculations (optionally scoped to one calculator_type).
    Requires ?confirm=true -- this is a destructive, irreversible action, so it
    deliberately doesn't fire on a bare call with no query params."""
    if not confirm:
        raise HTTPException(422, "Pass ?confirm=true to delete all saved calculations -- this cannot be undone.")
    query = db.query(CalculationLog)
    if calculator_type:
        query = query.filter(CalculationLog.calculator_type == calculator_type)
    deleted = query.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}

# Calculators requested in the spec that aren't fully implemented with formulas yet.
# Listed explicitly (rather than silently 404ing) so the frontend can show
# "coming soon" instead of pretending the feature exists.
# NOTE: pile_capacity moved OUT of this list (27 Jul 2026) -- it now has its
# own dedicated /pile endpoint below, same pattern as /batch and /liquefaction.
# retaining_wall_stability moved OUT (3 Aug 2026) -- own /retaining-wall
# endpoint below, geotechnical checks only (Phase 1+2), see
# retaining_wall_calculator.py's module docstring for exact scope.
# rock_bearing_capacity moved OUT (4 Aug 2026) -- own /rock-sbc endpoint
# below, see rock_bearing_capacity.py's module docstring.
# Driven piles and rock sockets are still not implemented -- see
# pile_calculator.py's module docstring for exactly what Phase 1 covers.
# pile group analysis (group_efficiency + block failure + cap load distribution +
# settlement) moved OUT of this list (14 Aug 2026) -- own dedicated /pile-group
# endpoint below, same pattern as /pile and /lateral.
PLANNED_CALCULATORS = [
    "raft_foundation", "isolated_footing",
    "lateral_pile", "plate_load_test",
    "safe_bearing_capacity", "modulus_subgrade_reaction",
]


@router.get("/available")
def available_calculators():
    return {
        "implemented": list(CALCULATOR_REGISTRY.keys()),
        "planned": PLANNED_CALCULATORS,
    }


@router.post("/run")
def run_calculator(req: CalculatorRequest, db: Session = Depends(get_db)):
    if req.calculator_type in PLANNED_CALCULATORS:
        raise HTTPException(501, f"'{req.calculator_type}' is on the roadmap but not implemented yet. "
                                  f"See README > Extending the calculators.")
    fn = CALCULATOR_REGISTRY.get(req.calculator_type)
    if not fn:
        raise HTTPException(404, f"Unknown calculator '{req.calculator_type}'.")

    try:
        result = fn(**req.inputs)
    except TypeError as e:
        raise HTTPException(422, f"Invalid inputs for {req.calculator_type}: {e}")
    except ValueError as e:
        # Fixed 8 Aug 2026 -- several calculators (settlement_sbc_is8009_*,
        # well_foundation, etc.) raise ValueError for bad/out-of-range inputs
        # (e.g. N-value <= 3, negative founding depth). Without this, that
        # ValueError went uncaught here and FastAPI returned a raw 500 with
        # no readable message instead of a clean validation error. Same
        # pattern already used by the dedicated /liquefaction endpoint below.
        raise HTTPException(422, f"Invalid inputs for {req.calculator_type}: {e}")

    log = CalculationLog(
        calculator_type=req.calculator_type,
        inputs_json=json.dumps(req.inputs),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    return result


@router.post("/batch")
def run_batch(req: BatchRunRequest, db: Session = Depends(get_db)):
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == req.borehole_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found.")
    if not profile.layers:
        raise HTTPException(422, "This borehole has no soil layers recorded.")
    if len(req.widths_m) * len(req.depths_m) > MAX_BATCH_CASES:
        raise HTTPException(422, f"Grid too large (max {MAX_BATCH_CASES} combinations at once) -- narrow the width/depth lists.")

    try:
        result = run_batch_matrix(
            layers=list(profile.layers), water_table_depth_m=profile.water_table_depth_m,
            widths_m=req.widths_m, depths_m=req.depths_m,
            length_m=req.length_m, shape=req.shape, fos=req.fos,
            allowable_settlement_mm=req.allowable_settlement_mm,
            consolidation_type=req.consolidation_type,
            rigidity_factor=req.rigidity_factor,
            overrides=req.overrides,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="batch_matrix",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    result["borehole_id"] = profile.borehole_id
    return result


@router.post("/batch-cases")
def run_batch_cases_endpoint(req: BatchCasesRequest, db: Session = Depends(get_db)):
    """Exact B x D pair mode (Step 2, Aug 2026) -- sibling to /batch (grid
    mode, unchanged above). Logs under the SAME calculator_type="batch_matrix"
    as grid mode, deliberately -- both report_builder.py's build_batch_report_docx
    and combined_report_builder.py's _add_batch_matrix_section only read
    result fields via .get(), so they already handle this result shape
    (extra `case_id` per row, extra top-level `mode` field) with no changes
    needed there; keeping the same calculator_type is what makes that work
    automatically rather than needing a second set of report sections."""
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == req.borehole_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found.")
    if not profile.layers:
        raise HTTPException(422, "This borehole has no soil layers recorded.")
    if len(req.cases) > MAX_BATCH_CASES:
        raise HTTPException(422, f"Too many cases (max {MAX_BATCH_CASES} at once) -- split into smaller batches.")

    try:
        result = run_batch_cases(
            layers=list(profile.layers), water_table_depth_m=profile.water_table_depth_m,
            cases=[c.model_dump() for c in req.cases],
            shape=req.shape, fos=req.fos,
            allowable_settlement_mm=req.allowable_settlement_mm,
            consolidation_type=req.consolidation_type,
            rigidity_factor=req.rigidity_factor,
            overrides=req.overrides,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="batch_matrix",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    result["borehole_id"] = profile.borehole_id
    return result


@router.post("/liquefaction")
def run_liquefaction(req: LiquefactionRequest, db: Session = Depends(get_db)):
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == req.borehole_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found.")
    if not profile.layers:
        raise HTTPException(422, "This borehole has no soil layers recorded.")

    try:
        result = run_liquefaction_analysis(
            layers=list(profile.layers),
            earthquake_magnitude_mw=req.earthquake_magnitude_mw,
            earthquake_zone=req.earthquake_zone,
            pga_g=req.pga_g,
            water_table_depth_m=profile.water_table_depth_m,
            overrides=req.overrides,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="liquefaction_analysis",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    result["borehole_id"] = profile.borehole_id
    return result


@router.post("/pile")
def run_pile(req: PileCapacityRequest, db: Session = Depends(get_db)):
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == req.borehole_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found.")
    if not profile.layers:
        raise HTTPException(422, "This borehole has no soil layers recorded.")

    try:
        result = run_pile_capacity(
            layers=list(profile.layers),
            water_table_depth_m=req.water_table_depth_m if req.water_table_depth_m is not None else profile.water_table_depth_m,
            diameter_m=req.diameter_m,
            pile_length_m=req.pile_length_m,
            cutoff_depth_m=req.cutoff_depth_m,
            code=req.code,
            scour_depth_m=req.scour_depth_m,
            liquefaction_depth_m=req.liquefaction_depth_m,
            critical_depth_factor=req.critical_depth_factor,
            fos_compression=req.fos_compression,
            fos_uplift=req.fos_uplift,
            overrides=req.overrides,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="pile_capacity",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    result["borehole_id"] = profile.borehole_id
    return result


@router.post("/pile-group")
def run_pile_group(req: PileGroupRequest, db: Session = Depends(get_db)):
    """Pile Group Analysis -- group efficiency (Converse-Labarre), block failure
    (equivalent pier), pile cap load distribution, and optional equivalent-raft
    settlement. Reuses the same BoreholeProfile as /pile. See
    run_pile_group_analysis()'s module section in pile_calculator.py for scope."""
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == req.borehole_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found.")
    if not profile.layers:
        raise HTTPException(422, "This borehole has no soil layers recorded.")

    try:
        result = run_pile_group_analysis(
            layers=list(profile.layers),
            water_table_depth_m=req.water_table_depth_m if req.water_table_depth_m is not None else profile.water_table_depth_m,
            diameter_m=req.diameter_m,
            pile_length_m=req.pile_length_m,
            cutoff_depth_m=req.cutoff_depth_m,
            code=req.code,
            num_rows=req.num_rows,
            num_cols=req.num_cols,
            spacing_m=req.spacing_m,
            cap_load_t=req.cap_load_t,
            moment_x_t_m=req.moment_x_t_m,
            moment_y_t_m=req.moment_y_t_m,
            pile_behaviour=req.pile_behaviour,
            scour_depth_m=req.scour_depth_m,
            liquefaction_depth_m=req.liquefaction_depth_m,
            critical_depth_factor=req.critical_depth_factor,
            fos_compression=req.fos_compression,
            fos_uplift=req.fos_uplift,
            overrides=req.overrides,
            run_settlement=req.run_settlement,
            settlement_influence_multiplier=req.settlement_influence_multiplier,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="pile_group_analysis",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    result["borehole_id"] = profile.borehole_id
    return result


@router.post("/lateral")
def run_lateral(req: LateralCapacityRequest, db: Session = Depends(get_db)):
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == req.borehole_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found.")
    if not profile.layers:
        raise HTTPException(422, "This borehole has no soil layers recorded.")

    layers = list(profile.layers)
    founding = _founding_layer(layers, req.free_length_above_ground_m)
    overrides = req.overrides or {}

    classification = (getattr(founding, "classification", None) or "").strip().upper()
    if overrides.get("soil_type"):
        soil_type = overrides["soil_type"]
    elif classification:
        soil_type = "cohesive" if classification[0] in ("C", "M") else "cohesionless"
    else:
        soil_type = "cohesive" if founding.compression_index_cc is not None else "cohesionless"

    consolidation_type = overrides.get("consolidation_type", "NCS")

    cohesion_t_m2 = overrides.get("cohesion_t_m2")
    if cohesion_t_m2 is None and soil_type == "cohesive":
        cohesion_t_m2, _ = _resolve_field(layers, founding, "cohesion_t_m2")

    n_value = overrides.get("n_value")
    if n_value is None:
        n_value, _ = _resolve_field(layers, founding, "n_value")

    try:
        result = run_lateral_capacity(
            length_m=None, width_m=req.width_m,
            pile_material_modulus_t_m2=req.pile_material_modulus_t_m2,
            embedded_length_m=req.embedded_length_m,
            free_length_above_ground_m=req.free_length_above_ground_m,
            soil_type=soil_type, consolidation_type=consolidation_type,
            cohesion_t_m2=cohesion_t_m2, n_value=n_value,
            allowable_deflection_pct_dia=req.allowable_deflection_pct_dia,
        )
    except ValueError as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="lateral_capacity",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    result["borehole_id"] = profile.borehole_id
    result["founding_layer"] = f"{founding.from_m}-{founding.to_m}m" + (f" ({founding.classification})" if founding.classification else "")
    return result


@router.post("/retaining-wall")
def run_retaining_wall(req: RetainingWallRequest, db: Session = Depends(get_db)):
    """Not borehole-aware (unlike the other calculators here) -- retaining
    wall soil properties are a single backfill/foundation parameter set, per
    the source reference workbook's own Inputs sheet, not a layered borehole
    profile. Geotechnical checks only (Phase 1+2) -- see
    retaining_wall_calculator.py's module docstring for exact scope."""
    try:
        result = run_retaining_wall_analysis(req.model_dump())
    except (ValueError, ZeroDivisionError) as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="retaining_wall_stability",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    return result


@router.post("/rock-sbc")
def run_rock_sbc(req: RockBearingCapacityRequest, db: Session = Depends(get_db)):
    """Not borehole-aware (same reasoning as /retaining-wall) -- rock inputs are
    a single parameter set per IS 12070's own methods, not a layered soil
    borehole profile. See rock_bearing_capacity.py's module docstring, in
    particular the source-fidelity note on the Clause 7 (pressuremeter) formula."""
    try:
        result = run_rock_bearing_capacity(req.model_dump())
    except (ValueError, ZeroDivisionError) as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="rock_bearing_capacity",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    return result


@router.post("/ground-improvement")
def run_ground_improvement_endpoint(req: GroundImprovementRequest, db: Session = Depends(get_db)):
    """Runs whichever of the 4 sub-tools (stone column / PVD / vibro-compaction /
    recommendation) have enough inputs -- see ground_improvement.py's module
    docstring for formula sources/confidence per sub-tool."""
    try:
        result = run_ground_improvement(req.model_dump())
    except (ValueError, ZeroDivisionError) as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="ground_improvement",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    return result


@router.post("/rock-socket-pile")
def run_rock_socket_pile_endpoint(req: RockSocketPileRequest, db: Session = Depends(get_db)):
    """Safe axial (compression + uplift) capacity of a pile socketed into rock,
    IRC:78 Appendix-5 Cl 9, Method 1 or Method 2 (caller picks via req.method).
    Not borehole-aware (same reasoning as /rock-sbc, /retaining-wall) -- rock
    socket inputs are a single parameter set per borehole, not a layered soil
    profile. See rock_socket_pile.py's module docstring for exactly what's
    implemented and what's deliberately deferred."""
    try:
        result = run_rock_socket_pile(req.model_dump())
    except (ValueError, ZeroDivisionError) as e:
        raise HTTPException(422, str(e))

    log = CalculationLog(
        calculator_type="rock_socket_pile",
        inputs_json=json.dumps(req.model_dump()),
        result_json=json.dumps(result),
    )
    db.add(log)
    db.commit()

    return result


@router.post("/pile/parse-command")
def parse_pile_ai_command(req: PileCommandRequest):
    """Step 6 of the spec: turn a typed command ('Design a 1000mm pile',
    'Use IRC:78') into structured fields the frontend can merge into the
    pile capacity form. Deterministic regex parser, not an LLM call --
    see parse_pile_command's docstring for why."""
    return {"parsed": parse_pile_command(req.text), "borehole_id": req.borehole_id}
