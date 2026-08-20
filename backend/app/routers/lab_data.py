from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
import io
import hashlib
from app.database import get_db
from app.models import BoreholeProfile, SoilLayer
from app.schemas import BoreholeProfileOut
from app.services.lab_data import build_template, parse_uploaded_workbook_auto
from app.config import logger

router = APIRouter(prefix="/api/lab-data", tags=["lab-data"])

# Lab sheets are small structured spreadsheets (a few hundred KB to a few MB
# even for a large multi-borehole report) -- 20MB is generous headroom, not
# a tight limit. Rejecting oversized files immediately with a clear message
# beats a slow parse that eventually times out or exhausts memory. Genuine
# streaming/chunked upload (resumable, progress mid-transfer on the SERVER
# side) isn't warranted at this file size -- see this feature's playbook
# entry for why that was scoped out.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024


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
async def upload_lab_data(
    file: UploadFile = File(...),
    force: bool = Form(False),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Please upload an .xlsx file (use the downloaded template).")

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(400, "The uploaded file is empty.")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        mb = len(file_bytes) / (1024 * 1024)
        raise HTTPException(413, f"File is {mb:.1f} MB -- the limit is {MAX_UPLOAD_BYTES // (1024*1024)} MB. "
                                  f"Split it into smaller sheets, or contact support if a genuinely larger file is needed.")

    file_hash = hashlib.sha256(file_bytes).hexdigest()
    if not force:
        existing = db.query(BoreholeProfile).filter(BoreholeProfile.source_file_hash == file_hash).all()
        if existing:
            names = ", ".join(sorted({p.borehole_id for p in existing}))
            raise HTTPException(
                409,
                f"This exact file was already uploaded (borehole(s): {names}, on "
                f"{existing[0].created_at:%d %b %Y}). Re-upload with force=true if this is "
                f"intentional (e.g. a legitimate re-import).",
            )

    logger.info(f"[lab_data] Parsing uploaded file: {file.filename} ({len(file_bytes)/1024:.0f} KB)")

    try:
        # openpyxl parsing is CPU-bound and synchronous -- run it in FastAPI's
        # threadpool so it doesn't block the single asyncio event loop (and
        # therefore every OTHER concurrent request) for its duration. Real
        # impact depends on file size; see the playbook entry's benchmark for
        # how much the tier-reparse fix (below) already cut this down.
        parsed = await run_in_threadpool(parse_uploaded_workbook_auto, file_bytes)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("[lab_data] Failed to parse uploaded workbook.")
        raise HTTPException(500, f"Could not read the Excel file: {e}")

    # PERFORMANCE / CRASH-SAFETY FIX (21 Aug 2026, see PROJECT_STATUS.md):
    # a real-world multi-borehole file (4 boreholes x ~52 layers = 208 rows)
    # was failing with a plain client-side "network error" -- while a
    # smaller single-borehole file uploaded fine every time. Root cause:
    # this endpoint used to (1) db.commit() everything, then (2) call
    # db.refresh() once per profile, then (3) let Pydantic's
    # BoreholeProfileOut.model_validate(p) walk the ORM `p.layers`
    # relationship -- which lazy-loads with a FRESH query per profile
    # because SQLAlchemy expires all attributes after commit() by default.
    # For 4 boreholes that's 1 commit + 4 refreshes + 4 lazy-load queries
    # AFTER the slow part (the actual writes) was already done -- extra
    # round-trips that scale with borehole count, on Render free tier's
    # already-slow first-request disk I/O. Rare with 1 borehole, real with 4.
    # Fix: build the ENTIRE response from plain Python data we already have
    # (input dicts + IDs captured right after flush, before anything
    # expires) and commit only ONCE at the very end -- zero refreshes, zero
    # lazy loads, response-building needs no extra DB round-trips at all.
    created_profiles_out = []
    extra_warnings = []
    for bh_id, data in parsed["boreholes"].items():
        profile = BoreholeProfile(
            borehole_id=bh_id,
            project_name=data.get("project_name"),
            water_table_depth_m=data.get("water_table_depth_m"),
            easting=data.get("easting"),
            northing=data.get("northing"),
            rl_m=data.get("rl_m"),
            date_of_boring=data.get("date_of_boring"),
            project_number=data.get("project_number"),
            source_filename=file.filename,
            source_file_hash=file_hash,
        )
        db.add(profile)
        db.flush()  # populates profile.id / profile.created_at (Python-side defaults) -- captured below before commit() can expire them
        profile_id, profile_created_at = profile.id, profile.created_at

        # from_m/to_m are required (NOT NULL) columns -- any of the three
        # parser tiers (template / office-format / universal fuzzy-match) can
        # in principle mis-detect a sheet and hand back a layer missing one
        # of these, which used to crash the ENTIRE upload with a raw DB
        # IntegrityError (500) instead of failing gracefully. Skip just the
        # bad row and tell the engineer exactly which one, rather than losing
        # the whole borehole over one bad line.
        good_layers_out = []
        for i, layer_data in enumerate(data["layers"]):
            from_m, to_m = layer_data.get("from_m"), layer_data.get("to_m")
            if not isinstance(from_m, (int, float)) or not isinstance(to_m, (int, float)):
                extra_warnings.append(
                    f"{bh_id}: row {i + 1} skipped -- couldn't read a valid From/To depth "
                    f"(got From={from_m!r}, To={to_m!r}). Check this row in the source file."
                )
                continue
            if from_m >= to_m:
                extra_warnings.append(
                    f"{bh_id}: row {i + 1} skipped -- From depth ({from_m}m) is not less than "
                    f"To depth ({to_m}m)."
                )
                continue
            layer = SoilLayer(borehole_id_fk=profile_id, **layer_data)
            db.add(layer)
            db.flush()  # populates layer.id before commit() can expire it
            good_layers_out.append({"id": layer.id, **layer_data})

        if not good_layers_out:
            extra_warnings.append(
                f"{bh_id}: NO usable layers found in this file -- borehole profile created empty. "
                f"This usually means the auto-detect parser mis-read the sheet layout; try "
                f"RaahiGeo's downloadable template for this file instead."
            )

        created_profiles_out.append({
            "id": profile_id,
            "borehole_id": bh_id,
            "project_name": data.get("project_name"),
            "water_table_depth_m": data.get("water_table_depth_m"),
            "easting": data.get("easting"),
            "northing": data.get("northing"),
            "rl_m": data.get("rl_m"),
            "date_of_boring": data.get("date_of_boring"),
            "project_number": data.get("project_number"),
            "source_filename": file.filename,
            "created_at": profile_created_at,
            "layers": good_layers_out,
        })

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(f"[lab_data] DB commit failed for upload: {file.filename}")
        raise HTTPException(500, "Could not save the parsed data to the database. Nothing was saved -- please try again.")

    logger.info(f"[lab_data] Created {len(created_profiles_out)} borehole profile(s).")
    # Built entirely from plain dicts captured above -- no ORM attribute
    # access here, so this can never trigger a surprise lazy-load query.
    return {
        "created": [BoreholeProfileOut.model_validate(p).model_dump() for p in created_profiles_out],
        "warnings": parsed["warnings"] + extra_warnings,
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
