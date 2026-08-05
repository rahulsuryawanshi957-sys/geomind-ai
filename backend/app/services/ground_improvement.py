"""
Ground Improvement -- IS 15284 (Part 1):2003 (Stone Columns) for the
densification/reinforcement design, classical radial + vertical consolidation
theory (Barron 1948 / Hansbo 1981 / Carrillo 1942) for Preloading + PVD, and a
simplified suitability screen for Vibro-Compaction.

Added 5 Aug 2026 -- the "Ground Improvement" Coming Soon card (added 4 Aug
2026, see PROJECT_STATUS #56) listed 4 planned features; this implements all 4:
  1. Stone column spacing & improvement factor
  2. Preloading + PVD consolidation timeline
  3. Vibro-compaction feasibility check
  4. Recommendation linked to liquefaction/settlement results

FORMULA SOURCES & CONFIDENCE (read this before trusting a result on a real job):
1. Stone columns -- IS 15284 (Part 1):2003, Cl 7.5 (area replacement ratio),
   Cl 7.6 (stress concentration factor n), Annex B (Reduced Stress settlement
   method). Verified against an archive.org OCR copy of the actual standard,
   AND the 0.907 triangular-pattern constant was independently cross-checked
   algebraically (0.907 = pi / (2*sqrt(3)), the exact ratio of a stone-column
   circle's area to its triangular-pattern tributary area) -- HIGH CONFIDENCE.
2. Preloading + PVD -- Barron (1948) radial consolidation / Hansbo (1981)
   band-drain adaptation, combined with Terzaghi vertical consolidation via
   Carrillo's (1942) approximation. This is universal, cross-checked textbook
   material (unlike the Rock SBC module's Cl 7, this was NOT reconstructed
   from a single degraded scan) -- HIGH CONFIDENCE for the IDEAL-drain case
   implemented here. Smear zone and well resistance are DELIBERATELY NOT
   modelled (both terms are dropped, i.e. "ideal drain, no smear, no well
   resistance") -- this makes the consolidation timeline predicted here
   slightly OPTIMISTIC (faster) than reality, since smear always slows things
   down. Flagged in every result, not silently ignored.
3. Vibro-compaction feasibility -- a simplified fines-content screening rule
   (widely cited rule of thumb, not a single code clause) -- MEDIUM
   CONFIDENCE, explicitly labelled a preliminary screen, not a substitute for
   a site trial.
4. Recommendation engine -- rule-based guidance text, not a formula. Every
   input is optional; it only flags what it has enough data to flag.
"""
from __future__ import annotations
import math


# ---------------------------------------------------------------------------
# 1. Stone Columns -- IS 15284 (Part 1):2003
# ---------------------------------------------------------------------------
def stone_column_design(column_dia_m: float, spacing_m: float, pattern: str,
                         stress_ratio_n: float, applied_stress_kpa: float,
                         mv_m2_per_kn: float | None = None, treated_depth_m: float | None = None,
                         untreated_settlement_mm: float | None = None) -> dict:
    if pattern not in ("triangular", "square"):
        raise ValueError("pattern must be 'triangular' or 'square'.")
    if column_dia_m <= 0 or spacing_m <= 0:
        raise ValueError("Column diameter and spacing must be positive.")

    # Cl 7.5.2: as = 0.907*(D/S)^2 (triangular). Square pattern: as = (pi/4)*(D/S)^2
    # -- both are simply (column circle area) / (tributary cell area).
    k = 0.907 if pattern == "triangular" else math.pi / 4
    as_ratio = k * (column_dia_m / spacing_m) ** 2
    if as_ratio >= 1:
        raise ValueError("Area replacement ratio >= 1 -- spacing is too tight for this column diameter.")

    # Annex B Reduced Stress Method
    mu = 1 + (stress_ratio_n - 1) * as_ratio  # settlement improvement (reduction) factor
    sigma_soil_kpa = applied_stress_kpa / (1 + (stress_ratio_n - 1) * as_ratio)
    sigma_column_kpa = stress_ratio_n * sigma_soil_kpa

    result: dict = {
        "area_replacement_ratio": round(as_ratio, 4),
        "settlement_improvement_factor": round(mu, 3),
        "stress_in_soil_kpa": round(sigma_soil_kpa, 1),
        "stress_in_column_kpa": round(sigma_column_kpa, 1),
        "clause": "IS 15284 (Part 1):2003 Cl 7.5, 7.6, Annex B",
    }
    if mv_m2_per_kn is not None and treated_depth_m is not None:
        Sc_treated_m = mv_m2_per_kn * sigma_soil_kpa * treated_depth_m
        result["settlement_treated_mm"] = round(Sc_treated_m * 1000, 1)
    if untreated_settlement_mm is not None:
        result["settlement_treated_from_untreated_mm"] = round(untreated_settlement_mm / mu, 1)

    warnings = []
    if not (2.5 <= stress_ratio_n <= 5):
        warnings.append("Stress concentration factor n is typically 2.5-5 at the ground surface "
                         "(IS 15284 Cl 7.6) and decreases with depth -- double check this value for your site.")
    result["warnings"] = warnings
    return result


# ---------------------------------------------------------------------------
# 2. Preloading + PVD -- Barron/Hansbo radial + Terzaghi vertical consolidation
# ---------------------------------------------------------------------------
def _Uv_from_Tv(Tv: float) -> float:
    """Terzaghi vertical degree-of-consolidation (%) from time factor Tv -- standard textbook fit."""
    if Tv <= 0:
        return 0.0
    if Tv <= 0.2827:  # = Tv at U=60%
        return 100 * math.sqrt(4 * Tv / math.pi)
    U = 100 - 10 ** ((1.781 - Tv) / 0.933)
    return max(0.0, min(100.0, U))


def _Uh_from_Th(Th: float, mu: float) -> float:
    """Barron/Hansbo radial degree-of-consolidation (%) -- ideal drain (no smear/well resistance)."""
    if mu <= 0:
        return 0.0
    return 100 * (1 - math.exp(-8 * Th / mu))


def pvd_consolidation_timeline(spacing_m: float, pattern: str, drain_width_mm: float,
                                drain_thickness_mm: float, ch_m2_per_year: float,
                                cv_m2_per_year: float, drainage_path_m: float,
                                target_U_percent: float | None = None,
                                elapsed_time_years: float | None = None) -> dict:
    if pattern not in ("triangular", "square"):
        raise ValueError("pattern must be 'triangular' or 'square'.")
    de = (1.05 if pattern == "triangular" else 1.13) * spacing_m
    dw = (drain_width_mm + drain_thickness_mm) / 2 / 1000.0  # Rixner et al (1986) approximation, in m
    if dw <= 0:
        raise ValueError("Drain width/thickness must be positive.")
    n_ratio = de / dw
    mu = math.log(n_ratio) - 0.75

    def u_avg_at_time(t_years: float):
        Tv = cv_m2_per_year * t_years / (drainage_path_m ** 2)
        Th = ch_m2_per_year * t_years / (de ** 2)
        Uv = _Uv_from_Tv(Tv)
        Uh = _Uh_from_Th(Th, mu)
        return 100 * (1 - (1 - Uv / 100) * (1 - Uh / 100)), Uv, Uh  # Carrillo (1942)

    result: dict = {
        "equivalent_soil_cylinder_diameter_de_m": round(de, 3),
        "drain_equivalent_diameter_dw_m": round(dw, 4),
        "spacing_ratio_n": round(n_ratio, 2),
        "mu": round(mu, 3),
        "clause": "Barron (1948) / Hansbo (1981) radial consolidation + Carrillo (1942) combination "
                  "-- ideal drain, no smear zone or well resistance modelled (this makes the timeline "
                  "predicted here somewhat optimistic/faster vs a real, smeared installation).",
    }

    warnings = []
    if mu <= 0:
        warnings.append("n = de/dw came out too small (drains too closely spaced relative to drain size) "
                         "-- check spacing/drain dimensions, result is not meaningful.")

    if elapsed_time_years is not None:
        U_avg, Uv, Uh = u_avg_at_time(elapsed_time_years)
        result["at_time_years"] = elapsed_time_years
        result["degree_of_consolidation_percent"] = round(U_avg, 1)
        result["vertical_component_percent"] = round(Uv, 1)
        result["radial_component_percent"] = round(Uh, 1)

    if target_U_percent is not None and mu > 0:
        if not (0 < target_U_percent < 100):
            raise ValueError("Target degree of consolidation must be between 0 and 100%.")
        lo, hi = 1e-4, 50.0  # years, binary-search bounds
        for _ in range(60):
            mid = (lo + hi) / 2
            U_mid, _, _ = u_avg_at_time(mid)
            if U_mid < target_U_percent:
                lo = mid
            else:
                hi = mid
        result["target_U_percent"] = target_U_percent
        result["time_required_years"] = round(hi, 3)
        result["time_required_months"] = round(hi * 12, 1)

    result["warnings"] = warnings
    return result


# ---------------------------------------------------------------------------
# 3. Vibro-Compaction feasibility -- simplified fines-content screening rule
# ---------------------------------------------------------------------------
def vibro_compaction_feasibility(fines_content_percent: float, d50_mm: float | None = None) -> dict:
    if fines_content_percent < 0 or fines_content_percent > 100:
        raise ValueError("Fines content must be between 0 and 100%.")

    if fines_content_percent < 10:
        verdict = "Suitable"
        note = "Fines content < 10% -- generally well suited to vibro-compaction."
    elif fines_content_percent < 20:
        verdict = "Marginal"
        note = ("Fines content 10-20% -- vibro-compaction effectiveness reduces; "
                "a field trial is recommended before committing.")
    else:
        verdict = "Not suitable -- consider vibro-replacement (stone columns) instead"
        note = ("Fines content > 20% -- vibro-compaction alone is generally not effective; "
                "ground reinforcement (stone columns) is the more usual choice at this fines content.")

    result = {
        "verdict": verdict,
        "note": note,
        "basis": "Simplified fines-content screening rule (a widely cited rule of thumb, not a single "
                 "code clause) -- a preliminary screen only, not a substitute for a site trial.",
    }
    if d50_mm is not None:
        if d50_mm < 0.06:
            result["grain_size_note"] = ("D50 < 0.06mm (very fine/silty) -- vibro-compaction is unlikely "
                                          "to be effective regardless of fines content.")
        elif d50_mm > 10:
            result["grain_size_note"] = ("D50 > 10mm (gravelly) -- vibro-compaction may struggle to "
                                          "penetrate; verify with a trial.")
    return result


# ---------------------------------------------------------------------------
# 4. Recommendation linked to liquefaction/settlement results -- rule-based,
#    not a formula. Every input optional.
# ---------------------------------------------------------------------------
def ground_improvement_recommendation(fs_liquefaction: float | None = None,
                                       predicted_settlement_mm: float | None = None,
                                       allowable_settlement_mm: float | None = None,
                                       fines_content_percent: float | None = None) -> dict:
    flags: list[str] = []
    suggestions: list[str] = []

    if fs_liquefaction is not None:
        if fs_liquefaction < 1.0:
            flags.append(f"Liquefaction FS = {fs_liquefaction} < 1.0 -- liquefaction is predicted.")
            if fines_content_percent is not None and fines_content_percent < 20:
                suggestions.append("Vibro-compaction or stone columns (densification) -- fines content "
                                    "is low enough for either to be considered.")
            else:
                suggestions.append("Stone columns (vibro-replacement) -- densification alone "
                                    "(vibro-compaction) is less reliable at this fines content.")
        elif fs_liquefaction < 1.25:
            flags.append(f"Liquefaction FS = {fs_liquefaction} is marginal (1.0-1.25).")
            suggestions.append("Ground improvement is a reasonable precaution here, but the case is less "
                                "urgent than FS < 1.0 -- weigh against structure importance/consequence.")

    if predicted_settlement_mm is not None and allowable_settlement_mm is not None:
        if predicted_settlement_mm > allowable_settlement_mm:
            flags.append(f"Predicted settlement ({predicted_settlement_mm}mm) exceeds "
                         f"allowable ({allowable_settlement_mm}mm).")
            suggestions.append("Preloading + PVD (if programme time allows before construction) or "
                                "stone columns (if not) to bring settlement within limits.")

    if not flags:
        flags.append("No red flags from the inputs given -- ground improvement may not be warranted on "
                      "this basis alone.")

    return {
        "flags": flags,
        "suggestions": suggestions,
        "note": "Rule-based guidance only, not a design output -- a qualified geotechnical engineer "
                "should make the final call considering the full site picture.",
    }


# ---------------------------------------------------------------------------
# Orchestrator -- runs whichever of the 4 tools have enough inputs. Unlike
# Rock SBC these are 4 independent tools, not competing methods for the same
# number, so there's no "governing minimum" here -- just "run what's filled in".
# ---------------------------------------------------------------------------
def run_ground_improvement(inputs: dict) -> dict:
    out: dict = {}
    errors: list[str] = []

    if all(inputs.get(k) is not None for k in ("column_dia_m", "sc_spacing_m", "sc_pattern",
                                                 "stress_ratio_n", "applied_stress_kpa")):
        try:
            out["stone_column"] = stone_column_design(
                column_dia_m=inputs["column_dia_m"], spacing_m=inputs["sc_spacing_m"],
                pattern=inputs["sc_pattern"], stress_ratio_n=inputs["stress_ratio_n"],
                applied_stress_kpa=inputs["applied_stress_kpa"],
                mv_m2_per_kn=inputs.get("mv_m2_per_kn"), treated_depth_m=inputs.get("treated_depth_m"),
                untreated_settlement_mm=inputs.get("untreated_settlement_mm"),
            )
        except (ValueError, ZeroDivisionError) as e:
            errors.append(f"Stone column: {e}")

    if all(inputs.get(k) is not None for k in ("pvd_spacing_m", "pvd_pattern", "drain_width_mm",
                                                 "drain_thickness_mm", "ch_m2_per_year", "cv_m2_per_year",
                                                 "drainage_path_m")):
        try:
            out["pvd"] = pvd_consolidation_timeline(
                spacing_m=inputs["pvd_spacing_m"], pattern=inputs["pvd_pattern"],
                drain_width_mm=inputs["drain_width_mm"], drain_thickness_mm=inputs["drain_thickness_mm"],
                ch_m2_per_year=inputs["ch_m2_per_year"], cv_m2_per_year=inputs["cv_m2_per_year"],
                drainage_path_m=inputs["drainage_path_m"],
                target_U_percent=inputs.get("target_U_percent"),
                elapsed_time_years=inputs.get("elapsed_time_years"),
            )
        except (ValueError, ZeroDivisionError) as e:
            errors.append(f"PVD: {e}")

    if inputs.get("fines_content_percent") is not None:
        try:
            out["vibro_compaction"] = vibro_compaction_feasibility(
                fines_content_percent=inputs["fines_content_percent"], d50_mm=inputs.get("d50_mm"),
            )
        except ValueError as e:
            errors.append(f"Vibro-compaction: {e}")

    if any(inputs.get(k) is not None for k in ("fs_liquefaction", "predicted_settlement_mm")):
        out["recommendation"] = ground_improvement_recommendation(
            fs_liquefaction=inputs.get("fs_liquefaction"),
            predicted_settlement_mm=inputs.get("predicted_settlement_mm"),
            allowable_settlement_mm=inputs.get("allowable_settlement_mm"),
            fines_content_percent=inputs.get("fines_content_percent"),
        )

    if not out and not errors:
        raise ValueError("No section had enough inputs to run. Fill in at least one of: stone column, "
                          "PVD, vibro-compaction, or recommendation inputs.")

    out["errors"] = errors
    return out
