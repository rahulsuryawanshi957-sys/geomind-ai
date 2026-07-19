from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import io
from app.database import get_db
from app.models import BoreholeProfile, SoilLayer
from app.schemas import BoreholeProfileOut
from app.services.lab_data import build_template, parse_uploaded_workbook
from app.config import logger

router = APIRouter(prefix="/api/lab-data", tags=["lab-data"])


@router.get("/template")
def download_template():
    logger.info("[lab_data] Serving Excel template download.")
    content = build_template()
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=raahigeo_lab_data_template.xlsx"},
    )


@router.post("/upload")
async def upload_lab_data(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Please upload an .xlsx file (use the downloaded template).")

    file_bytes = await file.read()
    logger.info(f"[lab_data] Parsing uploaded file: {file.filename}")

    try:
        parsed = parse_uploaded_workbook(file_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("[lab_data] Failed to parse uploaded workbook.")
        raise HTTPException(500, f"Could not read the Excel file: {e}")

    created_profiles = []
    for bh_id, data in parsed["boreholes"].items():
        profile = BoreholeProfile(
            borehole_id=bh_id,
            project_name=data.get("project_name"),
            water_table_depth_m=data.get("water_table_depth_m"),
            source_filename=file.filename,
        )
        db.add(profile)
        db.flush()  # get profile.id before adding layers

        for layer_data in data["layers"]:
            db.add(SoilLayer(borehole_id_fk=profile.id, **layer_data))

        created_profiles.append(profile)

    db.commit()
    for p in created_profiles:
        db.refresh(p)

    logger.info(f"[lab_data] Created {len(created_profiles)} borehole profile(s).")
    return {
        "created": [BoreholeProfileOut.model_validate(p).model_dump() for p in created_profiles],
        "warnings": parsed["warnings"],
    }


@router.get("", response_model=list[BoreholeProfileOut])
def list_boreholes(db: Session = Depends(get_db)):
    return db.query(BoreholeProfile).order_by(BoreholeProfile.created_at.desc()).all()


@router.get("/{profile_id}", response_model=BoreholeProfileOut)
def get_borehole(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found")
    return profile


@router.delete("/{profile_id}")
def delete_borehole(profile_id: str, db: Session = Depends(get_db)):
    profile = db.query(BoreholeProfile).filter(BoreholeProfile.id == profile_id).first()
    if not profile:
        raise HTTPException(404, "Borehole profile not found")
    db.delete(profile)
    db.commit()
    return {"status": "deleted"}
