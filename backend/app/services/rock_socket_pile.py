"""
Safe Axial (Compression + Uplift) Capacity of a Pile Socketed into Rock --
IRC:78, Appendix-5, Clause 9 -- Method 1 and Method 2.

Added 5 Aug 2026 -- Raahi asked for "rock ka pile wala socketing method 1 and
2 according to IRC:78". This is DIFFERENT from rock_bearing_capacity.py
(IS 12070, shallow foundations sitting ON rock) -- this module is specifically
for a PILE SHAFT SOCKETED INTO rock, combining end-bearing + side-shear
resistance from the rock, per IRC:78's own two methods for that case.

SOURCE: digitized directly from Raahi's own reference workbooks
(Method_I_sheet.xlsx -- IRC:78-2014 Appendix-5 Method-1; Method_II_sheet.xlsx
-- IRC:78-2024 Appendix-5 Method-2), formula-cell-by-formula-cell, not from a
secondary/paraphrased source. Cross-checked against publicly available
technical papers citing IRC:78 Appendix-5 Clause 9 where available (the 5MPa
end-bearing cap, the 3MPa socket-shear/concrete-shear cap, and the "ignore
top 0.3m of socket" rule all independently match published descriptions of
the clause, which increases confidence the transcription is faithful).

WHICH METHOD APPLIES (per the workbook's own selection criteria, H18:L20 on
both sheets):
    (CR+RQD)/2 > 30%  AND  RQD > 0  AND  crushing strength (qc) > 10 MPa
        -> Method 1 (needs rock core UCS -- more directly rock-strength-based)
    otherwise (poor/fragmented rock, RQD=0, or weak rock)
        -> Method 2 (needs Cub/Cus/crushing-strength read off IRC:78's own
           Table 6 -- SPT-N-correlated shear strength -- since a badly
           fractured rock's core UCS isn't representative of the rock mass)

NOT IMPLEMENTED (deliberately, scope of this first pass -- flagged rather
than silently dropped):
  - The LATERAL / moment-in-rock socket-length check (workbook rows
    F56:K76 on Method 1's sheet: "Moment Carrying Capacity of Socketed
    Pile", trial horizontal force -> required socket length via the rock's
    permissible compressive strength). This is a materially different
    calculation (rock behaving as a beam-on-elastic-foundation under lateral
    load, not end-bearing+shear under axial load) and depends on a
    *trial* horizontal load the engineer picks, not a clean input. Raahi:
    tell me if you want this built as a follow-up -- it's a real feature in
    your workbook, just deferred so this rock-socketing update didn't balloon.
  - Method 2's alternate "+1 pile diameter" what-if row (I41/K52 in the
    workbook) -- its own cap-order for the 500 t/m2 end-bearing ceiling
    doesn't match the base-case row (K51) in the source workbook, which
    looks like an inconsistency in the workbook itself rather than a second
    intentional formula. Only the base-case (K51-style) capping is
    implemented here to avoid propagating that inconsistency.

All internal calculation in tonnes / metres / MPa, matching the workbook's
own units exactly (so a Raahi cross-check against his Excel lines up 1:1).
"""
from __future__ import annotations
import math

KGF_CM2_TO_MPA = 0.0980665
KN_TO_TONNE = 9.80665       # 1 tonne-force = 9.80665 kN
FS_END_BEARING = 3.0
FS_SOCKET_SHEAR = 6.0
END_BEARING_CAP_T_M2 = 500.0   # 5 MPa, expressed in t/m^2 (IRC:78's own approx: 1 MPa ~ 100 t/m^2)
SOCKET_SHEAR_CAP_MPA = 3.0     # concrete's confined shear capacity, M35 grade (workbook default)
IGNORE_TOP_OF_SOCKET_M = 0.3
SUBMERGED_UNIT_WEIGHT_KN_M3 = 25.0 - 9.807  # RCC (25) minus buoyant water (9.807)


def _common_geometry(dia_mm: float, socket_length_x_dia: float,
                      rock_top_depth_m: float, scour_depth_m: float,
                      use_22_over_7: bool = False) -> dict:
    if dia_mm <= 0:
        raise ValueError("Pile diameter must be positive.")
    if socket_length_x_dia <= 0:
        raise ValueError("Socket length (x diameter) must be positive.")
    D_m = dia_mm / 1000.0
    Ap = round(0.7857 * D_m ** 2, 3)          # pile cross-section area, m^2
    # Method 1's workbook uses PI() rounded to 2dp; Method 2's workbook uses
    # the 22/7 approximation rounded to 3dp -- matched exactly per-sheet so
    # results line up 1:1 with each of Raahi's own workbooks.
    if use_22_over_7:
        As = round((22 / 7) * D_m, 3)
    else:
        As = round(math.pi * D_m, 2)
    COL = 0.5 + 1.5 * D_m                       # pile cut-off level below GL, m
    Ls_m = round(socket_length_x_dia * D_m, 2)  # socket length, m
    start_of_socket_m = max(scour_depth_m or 0.0, rock_top_depth_m)
    pile_tip_depth_m = start_of_socket_m + Ls_m
    pile_length_below_col_m_raw = pile_tip_depth_m - COL  # unrounded, for self-weight chaining -- matches workbook's F51 (uses live cell refs, not rounded intermediates)
    return {
        "D_m": D_m, "Ap_m2": Ap, "As_m2_per_m": As, "COL_m": round(COL, 2),
        "Ls_m": Ls_m, "start_of_socket_m": round(start_of_socket_m, 2),
        "pile_tip_depth_below_GL_m": round(pile_tip_depth_m, 2),
        "pile_length_below_COL_m": round(pile_length_below_col_m_raw, 2),
        "_pile_length_below_COL_m_raw": pile_length_below_col_m_raw,
    }


def _self_weight_and_uplift(dia_mm: float, pile_length_below_col_m: float, safe_socket_shear_t: float,
                             unit_weight_kn_m3: float = SUBMERGED_UNIT_WEIGHT_KN_M3) -> tuple[float, float]:
    D_m = dia_mm / 1000.0
    self_weight_kn = math.pi * 0.25 * D_m ** 2 * pile_length_below_col_m * unit_weight_kn_m3
    self_weight_t = self_weight_kn / KN_TO_TONNE
    safe_uplift_t = round(0.7 * safe_socket_shear_t + self_weight_t, 2)
    return round(self_weight_t, 2), safe_uplift_t


def suggest_method(cr_percent: float, rqd_percent: float, qc_mpa: float | None) -> dict:
    """Mirrors the workbook's own H18:L20 selection criteria exactly."""
    avg = (cr_percent + rqd_percent) / 2
    qc_ok = qc_mpa is None or qc_mpa > 10
    if avg > 30 and rqd_percent > 0 and qc_ok:
        suggested = "method_1"
    else:
        suggested = "method_2"
    return {
        "avg_cr_rqd_percent": round(avg, 2),
        "suggested_method": suggested,
        "criteria": "(CR+RQD)/2 > 30% AND RQD > 0 AND qc > 10 MPa -> Method 1, else Method 2",
    }


# ---------------------------------------------------------------------------
# Method 1 -- IRC:78-2014, Appendix-5, Cl 9 (Method-1)
# ---------------------------------------------------------------------------
def run_rock_socket_method1(inputs: dict) -> dict:
    geo = _common_geometry(
        dia_mm=inputs["dia_mm"],
        socket_length_x_dia=inputs["socket_length_x_dia"],
        rock_top_depth_m=inputs["rock_top_depth_m"],
        scour_depth_m=inputs.get("scour_depth_m") or 0.0,
    )
    qc_kgcm2 = inputs["qc_kgcm2"]
    cr_percent = inputs["cr_percent"]
    rqd_percent = inputs["rqd_percent"]

    qc_mpa = round(KGF_CM2_TO_MPA * qc_kgcm2, 3)
    cus_mpa = round(min(0.225 * math.sqrt(qc_mpa), 3.0), 2)
    avg_cr_rqd = (cr_percent + rqd_percent) / 2
    ksp = round(0.3 + 0.01285714286 * (avg_cr_rqd - 30), 2)
    ls_over_d = inputs["socket_length_x_dia"]
    df = round(min(1 + 0.4 * ls_over_d, 1.2), 2)

    end_bearing_stress_t_m2 = round((ksp * qc_mpa * df / FS_END_BEARING) * 100, 2)
    end_bearing_stress_t_m2 = min(end_bearing_stress_t_m2, END_BEARING_CAP_T_M2)
    safe_end_bearing_t = round(end_bearing_stress_t_m2 * geo["Ap_m2"], 2)

    warnings = []
    shear_length_m = round(geo["Ls_m"] - IGNORE_TOP_OF_SOCKET_M, 2)
    if shear_length_m <= 0:
        warnings.append(f"Socket length ({geo['Ls_m']}m) is shorter than the 0.3m ignored at the top -- socket shear resistance is zero/negative, check your inputs.")
        shear_length_m = max(shear_length_m, 0.0)
    safe_socket_shear_t = round((geo["As_m2_per_m"] * shear_length_m * cus_mpa * 100) / FS_SOCKET_SHEAR, 2)

    safe_pile_capacity_t = round(safe_end_bearing_t + safe_socket_shear_t, 2)
    self_weight_t, safe_uplift_t = _self_weight_and_uplift(inputs["dia_mm"], geo["_pile_length_below_COL_m_raw"], safe_socket_shear_t, unit_weight_kn_m3=15.0)
    geo.pop("_pile_length_below_COL_m_raw", None)

    if qc_mpa <= 10:
        warnings.append(f"qc = {qc_mpa} MPa is <= 10 MPa -- per the workbook's own selection rule, Method 2 may be more appropriate for this rock.")
    if rqd_percent <= 0:
        warnings.append("RQD = 0 -- per the workbook's own selection rule, Method 2 applies when RQD = 0.")
    if avg_cr_rqd <= 30:
        warnings.append(f"(CR+RQD)/2 = {round(avg_cr_rqd,1)}% is <= 30% -- per the workbook's own selection rule, Method 2 applies here.")

    return {
        "method": "Method 1",
        "clause": "IRC:78-2014, Appendix-5, Cl 9 (Method-1)",
        "geometry": geo,
        "qc_mpa": qc_mpa,
        "cus_mpa": cus_mpa,
        "avg_cr_rqd_percent": round(avg_cr_rqd, 2),
        "ksp": ksp,
        "depth_factor_df": df,
        "safe_end_bearing_t": safe_end_bearing_t,
        "safe_socket_shear_t": safe_socket_shear_t,
        "safe_pile_capacity_compression_t": safe_pile_capacity_t,
        "self_weight_t": self_weight_t,
        "safe_pile_capacity_uplift_t": safe_uplift_t,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Method 2 -- IRC:78-2024, Appendix-5, Cl 9 (Method-2)
# Cub/Cus/crushing-strength are manual inputs (read off IRC:78's own Table 6,
# by rock type + SPT-N) -- same as Raahi's own workbook, not computed here.
# ---------------------------------------------------------------------------
def run_rock_socket_method2(inputs: dict) -> dict:
    geo = _common_geometry(
        dia_mm=inputs["dia_mm"],
        socket_length_x_dia=inputs["socket_length_x_dia"],
        rock_top_depth_m=inputs["rock_top_depth_m"],
        scour_depth_m=inputs.get("scour_depth_m") or 0.0,
        use_22_over_7=True,
    )
    cub_mpa = inputs["cub_mpa"]
    crushing_strength_mpa = inputs["crushing_strength_mpa"]
    nc = inputs.get("nc", 9.0)
    cr_percent = inputs["cr_percent"]
    rqd_percent = inputs["rqd_percent"]

    crushing_strength_eff_mpa = round(min(crushing_strength_mpa, SOCKET_SHEAR_CAP_MPA), 2)

    end_bearing_stress_t_m2 = round((cub_mpa * nc / FS_END_BEARING) * 100, 2)
    end_bearing_stress_t_m2 = min(end_bearing_stress_t_m2, END_BEARING_CAP_T_M2)
    safe_end_bearing_t = round(end_bearing_stress_t_m2 * geo["Ap_m2"], 2)

    warnings = []
    shear_length_m = round(geo["Ls_m"] - IGNORE_TOP_OF_SOCKET_M, 2)
    if shear_length_m <= 0:
        warnings.append(f"Socket length ({geo['Ls_m']}m) is shorter than the 0.3m ignored at the top -- socket shear resistance is zero/negative, check your inputs.")
        shear_length_m = max(shear_length_m, 0.0)
    safe_socket_shear_t = round((geo["As_m2_per_m"] * shear_length_m * crushing_strength_eff_mpa * 100) / FS_SOCKET_SHEAR, 3)

    safe_pile_capacity_t = round(safe_end_bearing_t + safe_socket_shear_t, 2)
    self_weight_t, safe_uplift_t = _self_weight_and_uplift(inputs["dia_mm"], geo["_pile_length_below_COL_m_raw"], safe_socket_shear_t)
    geo.pop("_pile_length_below_COL_m_raw", None)

    avg_cr_rqd = (cr_percent + rqd_percent) / 2
    if avg_cr_rqd > 30 and rqd_percent > 0:
        warnings.append(f"(CR+RQD)/2 = {round(avg_cr_rqd,1)}% and RQD = {rqd_percent}% -- per the workbook's own selection rule, Method 1 may apply if you also have a core UCS (qc) > 10 MPa for this rock.")
    if crushing_strength_mpa > SOCKET_SHEAR_CAP_MPA:
        warnings.append(f"Entered crushing strength ({crushing_strength_mpa} MPa) exceeds the {SOCKET_SHEAR_CAP_MPA} MPa concrete-shear cap (M35 grade) -- capped to {SOCKET_SHEAR_CAP_MPA} MPa for the socket-shear calculation.")

    return {
        "method": "Method 2",
        "clause": "IRC:78-2024, Appendix-5, Cl 9 (Method-2)",
        "geometry": geo,
        "cub_mpa": cub_mpa,
        "crushing_strength_input_mpa": crushing_strength_mpa,
        "crushing_strength_effective_mpa": crushing_strength_eff_mpa,
        "nc": nc,
        "avg_cr_rqd_percent": round(avg_cr_rqd, 2),
        "safe_end_bearing_t": safe_end_bearing_t,
        "safe_socket_shear_t": safe_socket_shear_t,
        "safe_pile_capacity_compression_t": safe_pile_capacity_t,
        "self_weight_t": self_weight_t,
        "safe_pile_capacity_uplift_t": safe_uplift_t,
        "warnings": warnings,
    }


def run_rock_socket_pile(inputs: dict) -> dict:
    method = inputs.get("method")
    if method not in ("method_1", "method_2"):
        raise ValueError("'method' must be 'method_1' or 'method_2'.")

    required_common = ["dia_mm", "socket_length_x_dia", "rock_top_depth_m", "cr_percent", "rqd_percent"]
    missing = [k for k in required_common if inputs.get(k) is None]
    if missing:
        raise ValueError(f"Missing required input(s): {', '.join(missing)}")

    if method == "method_1":
        for k in ("qc_kgcm2",):
            if inputs.get(k) is None:
                raise ValueError(f"Method 1 needs '{k}' (average UCS of rock core, kg/cm2).")
        result = run_rock_socket_method1(inputs)
    else:
        for k in ("cub_mpa", "crushing_strength_mpa"):
            if inputs.get(k) is None:
                raise ValueError(f"Method 2 needs '{k}' (read off IRC:78 Table 6 by rock type + SPT-N).")
        result = run_rock_socket_method2(inputs)

    suggestion = suggest_method(
        cr_percent=inputs["cr_percent"],
        rqd_percent=inputs["rqd_percent"],
        qc_mpa=result.get("qc_mpa"),
    )
    result["method_suggestion"] = suggestion
    if suggestion["suggested_method"] != method:
        result["warnings"].append(
            f"Heads up: based on your CR/RQD (and qc, if given), the workbook's own criteria suggest "
            f"{'Method 1' if suggestion['suggested_method']=='method_1' else 'Method 2'} instead of {result['method']} for this rock."
        )
    return result
