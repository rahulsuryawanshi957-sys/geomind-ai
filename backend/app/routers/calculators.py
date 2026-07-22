import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import CalculationLog, BoreholeProfile
from app.schemas import CalculatorRequest, BatchRunRequest
from app.services.calculators import CALCULATOR_REGISTRY, run_batch_matrix

router = APIRouter(prefix="/api/calculators", tags=["calculators"])

# Calculators requested in the spec that aren't fully implemented with formulas yet.
# Listed explicitly (rather than silently 404ing) so the frontend can show
# "coming soon" instead of pretending the feature exists.
PLANNED_CALCULATORS = [
    "raft_foundation", "isolated_footing", "pile_capacity", "group_efficiency",
    "lateral_pile", "retaining_wall_stability", "liquefaction", "plate_load_test",
    "safe_bearing_capacity", "modulus_subgrade_reaction", "rock_bearing_capacity",
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
    layer = next((l for l in profile.layers if l.id == req.layer_id), None)
    if not layer:
        raise HTTPException(404, "Soil layer not found in this borehole.")
    if len(req.widths_m) * len(req.depths_m) > 400:
        raise HTTPException(422, "Grid too large (max 400 combinations at once) -- narrow the width/depth lists.")

    try:
        result = run_batch_matrix(
            layer=layer, water_table_depth_m=profile.water_table_depth_m,
            soil_type=req.soil_type, widths_m=req.widths_m, depths_m=req.depths_m,
            length_m=req.length_m, shape=req.shape, fos=req.fos,
            allowable_settlement_mm=req.allowable_settlement_mm,
            consolidation_type=req.consolidation_type,
            elastic_modulus_t_m2=req.elastic_modulus_t_m2,
            rigidity_factor=req.rigidity_factor,
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
    result["layer_label"] = f"{layer.from_m}-{layer.to_m}m" + (f" ({layer.classification})" if layer.classification else "")
    return result
