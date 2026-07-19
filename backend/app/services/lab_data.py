"""
Lab data import: generates the standardized Excel template, and parses a
filled-in copy back into structured BoreholeProfile + SoilLayer rows.

Template columns are denormalized (Borehole ID / Project / Water Table
repeated on every row) deliberately -- it keeps the sheet flat and simple
to fill in Excel, with no merged cells or multiple tabs to fight with.
"""
import io
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font, PatternFill, Alignment
from app.config import logger

COLUMNS = [
    ("Borehole ID", "borehole_id", str),
    ("Project Name", "project_name", str),
    ("Water Table Depth (m)", "water_table_depth_m", float),
    ("From (m)", "from_m", float),
    ("To (m)", "to_m", float),
    ("Description", "description", str),
    ("Classification (USCS)", "classification", str),
    ("SPT N (field)", "n_value", float),
    ("Bulk Density (t/m3)", "bulk_density_t_m3", float),
    ("Specific Gravity", "specific_gravity", float),
    ("Moisture Content (%)", "moisture_content_pct", float),
    ("Cohesion C (t/m2)", "cohesion_t_m2", float),
    ("Friction Angle phi (deg)", "friction_angle_deg", float),
    ("Compression Index Cc", "compression_index_cc", float),
    ("Initial Void Ratio e0", "initial_void_ratio_e0", float),
]

EXAMPLE_ROWS = [
    ["BH-01", "Sample Project", 3.5, 0, 1.5, "Filled up", "", "", 1.8, "", "", "", "", "", ""],
    ["BH-01", "Sample Project", 3.5, 1.5, 4.5, "Stiff silty clay", "CI", 8, 1.9, 2.68, 22, 2.5, 0, 0.17, 0.75],
    ["BH-01", "Sample Project", 3.5, 4.5, 10, "Medium dense sand", "SM", 18, 1.85, 2.65, 15, 0, 30, "", ""],
]


def build_template() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Soil Data"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill(start_color="7C3AED", end_color="7C3AED", fill_type="solid")

    for col_idx, (label, _, _) in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=col_idx, value=label)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[cell.column_letter].width = max(14, len(label) // 1.3)

    for row_idx, row_data in enumerate(EXAMPLE_ROWS, start=2):
        for col_idx, value in enumerate(row_data, start=1):
            ws.cell(row=row_idx, column=col_idx, value=value if value != "" else None)

    notes_ws = wb.create_sheet("Instructions")
    notes = [
        "How to fill this sheet:",
        "- One row per soil layer (depth interval) for each borehole.",
        "- Repeat Borehole ID, Project Name, and Water Table Depth on every row for that borehole -- this is intentional.",
        "- Leave a cell blank if that value doesn't apply to the layer (e.g. Cohesion for a sandy layer).",
        "- Classification should be the USCS group symbol (CI, CL, SM, GW, etc.) where known.",
        "- Add as many boreholes as you like -- just continue adding rows with a new Borehole ID.",
        "- Do not rename or reorder the header columns in row 1 of the 'Soil Data' sheet.",
    ]
    for i, line in enumerate(notes, start=1):
        notes_ws.cell(row=i, column=1, value=line)
    notes_ws.column_dimensions["A"].width = 100

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.read()


def parse_uploaded_workbook(file_bytes: bytes) -> dict:
    """
    Returns {"boreholes": {borehole_id: {project_name, water_table_depth_m, layers: [...]}}, "warnings": [...]}
    Skips/warns on bad rows instead of failing the whole upload.
    """
    wb = load_workbook(io.BytesIO(file_bytes), data_only=True)
    if "Soil Data" not in wb.sheetnames:
        raise ValueError("Expected a sheet named 'Soil Data' -- did you use the downloaded template?")
    ws = wb["Soil Data"]

    header_row = [cell.value for cell in ws[1]]
    expected_headers = [c[0] for c in COLUMNS]
    if header_row[:len(expected_headers)] != expected_headers:
        raise ValueError(
            "The column headers don't match the expected template. "
            "Please use the downloaded template without renaming columns."
        )

    boreholes: dict = {}
    warnings = []

    for row_num, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if row is None or all(v is None for v in row):
            continue
        row_dict = {}
        row_ok = True
        for (label, key, cast), raw_value in zip(COLUMNS, row):
            if raw_value is None or raw_value == "":
                row_dict[key] = None
                continue
            try:
                row_dict[key] = cast(raw_value)
            except (ValueError, TypeError):
                warnings.append(f"Row {row_num}: could not read '{label}' value {raw_value!r} -- left blank.")
                row_dict[key] = None

        bh_id = row_dict.get("borehole_id")
        if not bh_id:
            warnings.append(f"Row {row_num}: skipped -- missing Borehole ID.")
            continue
        if row_dict.get("from_m") is None or row_dict.get("to_m") is None:
            warnings.append(f"Row {row_num} (borehole {bh_id}): skipped -- missing From/To depth.")
            continue

        if bh_id not in boreholes:
            boreholes[bh_id] = {
                "project_name": row_dict.get("project_name"),
                "water_table_depth_m": row_dict.get("water_table_depth_m"),
                "layers": [],
            }
        boreholes[bh_id]["layers"].append({
            "from_m": row_dict["from_m"],
            "to_m": row_dict["to_m"],
            "description": row_dict.get("description"),
            "classification": row_dict.get("classification"),
            "n_value": row_dict.get("n_value"),
            "bulk_density_t_m3": row_dict.get("bulk_density_t_m3"),
            "specific_gravity": row_dict.get("specific_gravity"),
            "moisture_content_pct": row_dict.get("moisture_content_pct"),
            "cohesion_t_m2": row_dict.get("cohesion_t_m2"),
            "friction_angle_deg": row_dict.get("friction_angle_deg"),
            "compression_index_cc": row_dict.get("compression_index_cc"),
            "initial_void_ratio_e0": row_dict.get("initial_void_ratio_e0"),
        })

    if not boreholes:
        raise ValueError("No valid rows found in the sheet.")

    logger.info(f"[lab_data] Parsed {len(boreholes)} borehole(s) from uploaded sheet, {len(warnings)} warning(s).")
    return {"boreholes": boreholes, "warnings": warnings}
