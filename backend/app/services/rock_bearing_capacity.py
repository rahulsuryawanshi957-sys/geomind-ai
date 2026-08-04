"""
Safe Bearing Capacity on ROCK -- IS 12070:1987 (Reaffirmed 2010),
"Code of Practice for Design and Construction of Shallow Foundations on Rocks".

Added 4 Aug 2026 -- Raahi flagged "rock ke saare SBC missing hai" (all rock SBC
methods missing). Every other bearing-capacity module in this app (calculators.py,
IS:6403, IS:8009) is for SOIL; this is the first ROCK module.

IS 12070 gives FOUR distinct methods (its own Table 1 -- Clause 4 -- says which
applies to which rock quality). This module implements all four, per Raahi's
explicit "sab methods + jo bhi minimum ho" instruction:

  1. Classification table   (Cl 5.2, Table 2)  -- good rock, wide joint spacing
  2. RMR table               (Cl 5.3, Table 3)  -- rock mass rating known
  3. Core-strength formula   (Cl 6.2)           -- UCS + joint geometry known
  4. Pressuremeter formula   (Cl 7.2, Table 5)  -- weak/fragmented rock, PMT data
  5. Plate load test         (Cl 8)             -- NOT a closed-form formula in
     the code itself (see note on run_rock_sbc_plate_load_test below) -- this
     module accepts the value the engineer already read off their own
     pressure-settlement curve, it does not compute one.

SOURCE-FIDELITY NOTE (read before trusting Clause 7 in a real design):
The source used to build this was a 1987 scanned/OCR'd copy of the standard
(archive.org's public RTI-disclosure copy). Table 2, Table 3 (with its Nov 2008
amendment), and the Clause 6.2 formula were legible and are implemented with
high confidence. The Clause 7 (pressuremeter) formula text was OCR-garbled;
it has been reconstructed here based on the surrounding Table 5 values and the
standard Menard-pressuremeter bearing-formula pattern (net pressure = overburden
+ Ka x net limit pressure), which is very likely correct, but has NOT been
cross-checked against a clean copy of the standard. If Raahi's practice
actually uses pressuremeter data for rock, get a clean PDF of IS 12070 Clause 7
and verify `_ka_from_depth_ratio` / `rock_sbc_pressuremeter` against it before
relying on it for a real submission.

All internal calculation is in t/m^2 (the code's own units) with a kPa mirror
on each result (1 t/m^2 = 9.80665 kPa) so the frontend can display either.
"""
from __future__ import annotations
import math

KPA_PER_T_M2 = 9.80665


# ---------------------------------------------------------------------------
# Method 1: Classification table (Cl 5.2, Table 2)
# qns values include the Nov 2008 amendment (Soft Shale: 40 -> 30 t/m^2).
# ---------------------------------------------------------------------------
ROCK_TYPE_TABLE = {
    "massive_crystalline": (1000.0, "Massive crystalline bedrock (granite, diorite, gneiss, trap rock)"),
    "foliated_sound": (400.0, "Foliated rock (schist or slate), sound condition"),
    "limestone_sound": (400.0, "Bedded limestone, sound condition"),
    "sedimentary_hard": (250.0, "Sedimentary rock, including hard shales and sandstones"),
    "soft_broken": (100.0, "Soft or broken bedrock (excluding shale), and soft limestone"),
    "soft_shale": (30.0, "Soft shale (amended value, Nov 2008 -- original 1987 text said 40)"),
}


def rock_sbc_classification_table(rock_type: str) -> dict:
    if rock_type not in ROCK_TYPE_TABLE:
        raise ValueError(f"Unknown rock_type '{rock_type}'. Options: {list(ROCK_TYPE_TABLE)}")
    qns_t_m2, description = ROCK_TYPE_TABLE[rock_type]
    return {
        "method": "Classification Table",
        "clause": "IS 12070 Cl 5.2, Table 2",
        "description": description,
        "qns_t_m2": qns_t_m2,
        "qns_kpa": round(qns_t_m2 * KPA_PER_T_M2, 1),
        "basis": "net",
        "correction_applicable": True,
    }


# ---------------------------------------------------------------------------
# Method 2: RMR table (Cl 5.3, Table 3) -- Nov 2008 amendment values used
# (Class III/IV/V ranges were tightened by the amendment; using the amended,
# current-standard numbers, not the original 1987 ones).
# Each row: (RMR_high, RMR_low, qns_at_high, qns_at_low, class, description)
# ---------------------------------------------------------------------------
RMR_BANDS = [
    (100, 81, 600.0, 448.0, "I", "Very good rock"),
    (80, 61, 440.0, 288.0, "II", "Good rock"),
    (60, 41, 280.0, 141.0, "III", "Fair rock"),
    (40, 21, 135.0, 48.0, "IV", "Poor rock"),
    (20, 0, 45.0, 30.0, "V", "Very poor rock"),
]


def rock_sbc_rmr(rmr: float) -> dict:
    if not (0 <= rmr <= 100):
        raise ValueError("RMR must be between 0 and 100.")
    for hi, lo, q_hi, q_lo, cls, desc in RMR_BANDS:
        if lo <= rmr <= hi:
            frac = 0.0 if hi == lo else (rmr - lo) / (hi - lo)
            qns_t_m2 = q_lo + frac * (q_hi - q_lo)
            return {
                "method": "RMR Table",
                "clause": "IS 12070 Cl 5.3, Table 3 (as amended Nov 2008)",
                "description": f"Class {cls} -- {desc} (RMR {rmr})",
                "qns_t_m2": round(qns_t_m2, 1),
                "qns_kpa": round(qns_t_m2 * KPA_PER_T_M2, 1),
                "basis": "net",
                "correction_applicable": False,  # Cl 9.1: corrections don't apply to the RMR method
                "note": "Settlement of a raft up to 6m thick is expected to stay under 12mm at this pressure (Cl 5.3).",
            }
    raise ValueError("RMR out of range.")  # unreachable, defensive


# ---------------------------------------------------------------------------
# Method 3: Core-strength formula (Cl 6.2)
# qa (gross) = q0 * Nj ,  Nj = (3 + S/Bf) / (10 * sqrt(1 + 300*(delta/S)))
# S, delta, Bf all in cm. Includes FS=3 already (code's own Note 1).
# Valid for: S > 30cm, aperture < 10mm (15mm if filled), Bf > 30cm.
# ---------------------------------------------------------------------------
def rock_sbc_core_strength(ucs_t_m2: float, spacing_cm: float, aperture_mm: float,
                            footing_width_cm: float, aperture_filled: bool = False) -> dict:
    if spacing_cm <= 0 or footing_width_cm <= 0:
        raise ValueError("Joint spacing and footing width must be positive.")
    aperture_cm = aperture_mm / 10.0
    Nj = (3 + spacing_cm / footing_width_cm) / (10 * math.sqrt(1 + 300 * (aperture_cm / spacing_cm)))
    qa_t_m2 = ucs_t_m2 * Nj

    warnings = []
    if spacing_cm < 30:
        warnings.append("Joint spacing < 0.3 m -- outside this formula's stated valid range (Cl 6.2 note).")
    max_aperture_mm = 15 if aperture_filled else 10
    if aperture_mm > max_aperture_mm:
        warnings.append(f"Joint aperture > {max_aperture_mm}mm -- outside this formula's stated valid range.")
    if footing_width_cm < 30:
        warnings.append("Footing width < 0.3 m -- outside this formula's stated valid range.")

    return {
        "method": "Core Strength Formula",
        "clause": "IS 12070 Cl 6.2",
        "description": f"Nj = {round(Nj, 3)} (from UCS = {ucs_t_m2} t/m2, joint spacing {spacing_cm}cm, aperture {aperture_mm}mm)",
        "qns_t_m2": round(qa_t_m2, 1),
        "qns_kpa": round(qa_t_m2 * KPA_PER_T_M2, 1),
        "basis": "gross (includes FS=3 already, per Cl 6.2 Note 1)",
        "correction_applicable": True,
        "warnings": warnings,
    }


# ---------------------------------------------------------------------------
# Method 4a: Pressuremeter formula (Cl 7.2, Table 5) -- SEE SOURCE-FIDELITY
# NOTE at top of file. qns = gamma*Df + Ka*(Pl - gamma*Df)
# Ka interpolated from Table 5 (depth/radius ratio -> Ka).
# ---------------------------------------------------------------------------
KA_TABLE = [(0.0, 0.8), (2.0, 2.0), (4.0, 3.6), (10.0, 5.0)]  # (Df/radius, Ka)


def _ka_from_depth_ratio(ratio: float) -> float:
    if ratio <= KA_TABLE[0][0]:
        return KA_TABLE[0][1]
    if ratio >= KA_TABLE[-1][0]:
        return KA_TABLE[-1][1]
    for (x0, y0), (x1, y1) in zip(KA_TABLE, KA_TABLE[1:]):
        if x0 <= ratio <= x1:
            frac = (ratio - x0) / (x1 - x0)
            return y0 + frac * (y1 - y0)
    return KA_TABLE[-1][1]  # unreachable, defensive


def rock_sbc_pressuremeter(limit_pressure_t_m2: float, gamma_t_m3: float,
                            depth_m: float, footing_radius_m: float) -> dict:
    if footing_radius_m <= 0:
        raise ValueError("Footing radius must be positive.")
    ratio = depth_m / footing_radius_m
    Ka = _ka_from_depth_ratio(ratio)
    overburden_t_m2 = gamma_t_m3 * depth_m
    qns_t_m2 = overburden_t_m2 + Ka * (limit_pressure_t_m2 - overburden_t_m2)
    return {
        "method": "Pressuremeter Formula",
        "clause": "IS 12070 Cl 7.2, Table 5",
        "description": f"Ka = {round(Ka, 2)} (depth/radius ratio = {round(ratio, 2)})",
        "qns_t_m2": round(qns_t_m2, 1),
        "qns_kpa": round(qns_t_m2 * KPA_PER_T_M2, 1),
        "basis": "net (approx FS=3, per Cl 7.2)",
        "correction_applicable": True,
        "warnings": ["This formula was reconstructed from a degraded OCR scan of the 1987 code -- "
                     "cross-check against a clean copy of Cl 7 before relying on it for a real submission."],
    }


# ---------------------------------------------------------------------------
# Method 4b: Plate load test (Cl 8) -- NOT a closed-form formula in the code.
# Cl 3.3/8.3: the code specifies the TEST PROCEDURE and says the safe bearing
# pressure is read directly off the field pressure-settlement curve at 12mm
# settlement (or a scaled value from a smaller test plate -- Cl 8.3's own
# plate-to-footing settlement-extrapolation formula was too badly OCR-garbled
# in the source scan to reconstruct reliably, so it is deliberately NOT
# implemented here rather than guessed at). This function is a labelled
# pass-through for the value the engineer already determined from their own
# field test.
# ---------------------------------------------------------------------------
def rock_sbc_plate_load_test(field_value_t_m2: float) -> dict:
    return {
        "method": "Plate Load Test",
        "clause": "IS 12070 Cl 8 (field procedure, not a formula)",
        "description": "Value as read directly off your field pressure-settlement curve at 12mm settlement (Cl 3.3/8.3).",
        "qns_t_m2": round(field_value_t_m2, 1),
        "qns_kpa": round(field_value_t_m2 * KPA_PER_T_M2, 1),
        "basis": "as measured",
        "correction_applicable": False,
        "note": "This module does not compute this value -- Cl 8 is a field-test procedure, not a design formula. "
                "Enter the value you already read off your own plate-load curve.",
    }


# ---------------------------------------------------------------------------
# Orchestrator: run whichever methods have inputs, apply the Cl 9.1 correction
# factor to the methods it's applicable to, and report the governing
# (minimum) value -- per Raahi's explicit instruction.
# ---------------------------------------------------------------------------
def run_rock_bearing_capacity(inputs: dict) -> dict:
    results = []
    errors = []

    if inputs.get("rock_type"):
        try:
            results.append(rock_sbc_classification_table(inputs["rock_type"]))
        except ValueError as e:
            errors.append(str(e))

    if inputs.get("rmr") is not None:
        try:
            results.append(rock_sbc_rmr(inputs["rmr"]))
        except ValueError as e:
            errors.append(str(e))

    if all(inputs.get(k) is not None for k in ("ucs_t_m2", "joint_spacing_cm", "joint_aperture_mm", "footing_width_cm")):
        try:
            results.append(rock_sbc_core_strength(
                ucs_t_m2=inputs["ucs_t_m2"],
                spacing_cm=inputs["joint_spacing_cm"],
                aperture_mm=inputs["joint_aperture_mm"],
                footing_width_cm=inputs["footing_width_cm"],
                aperture_filled=bool(inputs.get("joint_filled_with_soil", False)),
            ))
        except (ValueError, ZeroDivisionError) as e:
            errors.append(str(e))

    if all(inputs.get(k) is not None for k in ("limit_pressure_t_m2", "gamma_t_m3", "depth_m", "footing_radius_m")):
        try:
            results.append(rock_sbc_pressuremeter(
                limit_pressure_t_m2=inputs["limit_pressure_t_m2"],
                gamma_t_m3=inputs["gamma_t_m3"],
                depth_m=inputs["depth_m"],
                footing_radius_m=inputs["footing_radius_m"],
            ))
        except (ValueError, ZeroDivisionError) as e:
            errors.append(str(e))

    if inputs.get("plate_load_field_value_t_m2") is not None:
        results.append(rock_sbc_plate_load_test(inputs["plate_load_field_value_t_m2"]))

    if not results:
        raise ValueError("No method had enough inputs to run. Provide at least one of: rock type, RMR, "
                          "core-strength parameters, pressuremeter parameters, or a plate-load-test value.")

    correction_factor = inputs.get("correction_factor", 1.0)
    for r in results:
        if r["correction_applicable"] and correction_factor != 1.0:
            r["qns_t_m2_before_correction"] = r["qns_t_m2"]
            r["qns_kpa_before_correction"] = r["qns_kpa"]
            r["qns_t_m2"] = round(r["qns_t_m2"] * correction_factor, 1)
            r["qns_kpa"] = round(r["qns_kpa"] * correction_factor, 1)

    governing = min(results, key=lambda r: r["qns_t_m2"])

    warnings = []
    for r in results:
        warnings.extend(r.get("warnings", []))
    if len({r["basis"].split(" ")[0] for r in results}) > 1:
        warnings.append("Results mix 'net' and 'gross' bearing pressure conventions (see each method's \"basis\" "
                         "field) -- these are not directly comparable. Confirm you're comparing like-for-like "
                         "before taking the minimum as your final design value.")

    return {
        "results": results,
        "governing": governing,
        "correction_factor_applied": correction_factor,
        "warnings": warnings,
        "errors": errors,
    }
