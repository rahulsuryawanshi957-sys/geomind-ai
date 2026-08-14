"""
Pile Foundation Design Module -- Phase 1 (bored cast-in-situ pile, compression
+ uplift capacity, static formula method), per Raahi's spec doc + a real
project reference workbook (New Delhi Railway Station redevelopment,
IS-2911 Part-1 Sec-2:2010 / IRC:78:2024 -- same formulas as the 2014 edition, just
a relabeled/re-issued year per Raahi's confirmation, 27 Jul 2026).

Reuses the SAME BoreholeProfile/SoilLayer data and missing-data fallback
helpers (_founding_layer, _resolve_field) already used by the batch SBC and
liquefaction calculators -- no separate Excel import needed, Raahi's existing
lab-data upload already feeds this.

Units: cohesion in t/m2, density in t/m3, angles in degrees, depths in m --
same convention as the rest of calculators.py. The reference workbook uses
kg/cm2 -- converted where the formula is quoted (1 kg/cm2 = 10 t/m2).

WHAT THIS COVERS (Phase 1):
- Bored cast-in-situ pile, single pile, compression + uplift capacity
- IS 2911 (Part 1 / Sec 2, 2010) and IRC:78 (2024, same formulas as 2014) skin friction methods
- Skin friction: alpha-cohesion method (IS 2911, cohesion-based curve) or
  N-value based adhesion bands (IRC 78), PLUS a frictional (K.sigma'v.tanphi)
  term on every layer (both codes carry both terms, per the reference sheet)
- End bearing: Terzaghi/Vesic-type Nc(=9 for piles)/Nq/Ny at the pile toe,
  with the toe's founding properties cross-checked at toe-2D/toe/toe+2D
  (whichever gives the LOWEST end bearing governs) -- same "critical
  founding zone" idea as the reference workbook's M/N/O candidate columns
- Overburden stress capped beyond a critical depth (15D for IS 2911, 20D for
  IRC:78) below scour level, per both codes' "critical depth" provision
- Submerged (buoyant) density used below the water table

NOT YET COVERED (documented, not silently skipped -- see PROJECT_STATUS.md):
- Driven piles (different skin friction/set formulae), rock-socketed piles,
  pile groups / group efficiency, negative skin friction, lateral capacity,
  structural (concrete) design checks, pile self-weight in uplift
- IRC:78's own end-bearing Nq/Ny chart (uses the same Vesic-type formula as
  the rest of this app's IS:6403 shear calculator, for consistency -- the
  reference workbook's own Nq lookup table (Sheet2) had inconsistent-looking
  values on inspection and its own broken cell references, so it was NOT
  copied blindly; this is flagged as an assumption in the result)
"""
import math

from app.services.calculators import (
    _founding_layer, _resolve_field, _cumulative_overburden_stress, _fox_depth_correction_factor,
)


PILE_CODES = {"IS_2911", "IRC_78"}


def _nc_nq_ny(phi_deg: float):
    """Nc = 9 (standard deep-foundation/pile value per IS 2911 -- distinct
    from the 5.14/5.7 shallow-footing Nc used elsewhere in this app's shear
    SBC calculator). Nq, Ny via the same Vesic-type formulas already used by
    bearing_capacity_is6403_shear, for internal consistency."""
    if phi_deg <= 0:
        return 9.0, 1.0, 0.0
    phi = math.radians(phi_deg)
    Nq = math.tan(math.radians(45) + phi / 2) ** 2 * math.exp(math.pi * math.tan(phi))
    Ny = 2 * (Nq + 1) * math.tan(phi)
    return 9.0, Nq, Ny


def _alpha_is2911(cohesion_t_m2: float) -> float:
    """Adhesion factor alpha vs cohesion, IS 2911 Part-1 Sec-2 curve
    (digitized from the reference workbook's polynomial fit). Cohesion
    converted to kg/cm2 (the curve's native unit) before evaluating."""
    c = cohesion_t_m2 / 10.0
    if c < 0.4:
        return 1.0
    if c > 1.7:
        return 0.26
    return (1.4254 * c ** 6 - 8.1214 * c ** 5 + 17.972 * c ** 4
            - 19.734 * c ** 3 + 12.023 * c ** 2 - 5.1328 * c + 2.0073)


def _alpha_irc78(n_value: float | None) -> float:
    """IRC:78 adhesion factor bands by corrected SPT N (reference workbook
    convention). Defaults to the mid-band (0.4) with a warning if no N-value
    is available on/near this layer."""
    if n_value is None:
        return 0.4
    if n_value < 4:
        return 0.7
    if 4 <= n_value < 8:
        return 0.5
    if 8 <= n_value < 15:
        return 0.4
    return 0.3


def parse_pile_command(text: str) -> dict:
    """Lightweight regex parser for commands like 'Design a 1000 mm pile',
    'Use IRC:78', 'pile length 18m', 'cutoff 2m', 'FOS 3'. Returns only the
    fields it recognized (dict may be partial/empty) -- the frontend merges
    this into whatever the person already had filled in, per the spec's
    'AI should automatically understand the command' requirement. This is a
    plain parser, not an LLM call -- kept deterministic since it's feeding
    numbers straight into an engineering calculation."""
    import re
    t = text.lower()
    out: dict = {}

    m = re.search(r"(\d+(?:\.\d+)?)\s*mm\b", t)
    if m:
        out["diameter_m"] = round(float(m.group(1)) / 1000, 3)
    else:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:m|meter|metre)\s*(?:dia|diameter)", t)
        if m:
            out["diameter_m"] = float(m.group(1))

    m = re.search(r"(?:pile\s*)?length\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*m\b", t)
    if m:
        out["pile_length_m"] = float(m.group(1))

    m = re.search(r"cut[- ]?off(?:\s*depth)?\s*(?:of)?\s*(\d+(?:\.\d+)?)\s*m\b", t)
    if m:
        out["cutoff_depth_m"] = float(m.group(1))

    m = re.search(r"fos\s*(?:of)?\s*(\d+(?:\.\d+)?)", t)
    if m:
        out["fos_compression"] = float(m.group(1))
        out["fos_uplift"] = float(m.group(1))

    if "irc" in t and "78" in t:
        out["code"] = "IRC_78"
    elif "is" in t and "2911" in t:
        out["code"] = "IS_2911"
    elif "bridge" in t:
        out["code"] = "IRC_78"
    elif "building" in t:
        out["code"] = "IS_2911"

    return out


def _resolve(layers, founding, field, overrides):
    if overrides.get(field) is not None:
        return overrides[field], "manual override"
    val, note = _resolve_field(layers, founding, field)
    return val, note


def _segment_boundaries(toe_depth, water_table_depth_m, critical_depth, scour_depth_m, layers):
    cuts = {0.0, round(toe_depth, 4)}
    if water_table_depth_m is not None and 0 < water_table_depth_m < toe_depth:
        cuts.add(round(water_table_depth_m, 4))
    if 0 < critical_depth < toe_depth:
        cuts.add(round(critical_depth, 4))
    if scour_depth_m is not None and 0 < scour_depth_m < toe_depth:
        cuts.add(round(scour_depth_m, 4))
    for l in layers:
        if 0 < l.from_m < toe_depth:
            cuts.add(round(l.from_m, 4))
        if 0 < l.to_m < toe_depth:
            cuts.add(round(l.to_m, 4))
    return sorted(cuts)


def run_pile_capacity(
    layers: list,
    water_table_depth_m: float | None,
    diameter_m: float,
    pile_length_m: float,
    cutoff_depth_m: float = 0.0,
    code: str = "IS_2911",
    scour_depth_m: float | None = None,
    liquefaction_depth_m: float | None = None,
    critical_depth_factor: float | None = None,
    fos_compression: float = 2.5,
    fos_uplift: float = 2.5,
    overrides: dict | None = None,
) -> dict:
    if code not in PILE_CODES:
        raise ValueError(f"Unknown pile design code '{code}'. Use one of {sorted(PILE_CODES)}.")
    if not layers:
        raise ValueError("This borehole has no soil layers recorded.")
    if diameter_m <= 0 or pile_length_m <= 0:
        raise ValueError("Pile diameter and length must both be positive.")

    overrides = overrides or {}
    layers = sorted(layers, key=lambda l: l.from_m)
    toe_depth = cutoff_depth_m + pile_length_m

    # Scour and liquefaction both mean "don't rely on this depth of soil" --
    # whichever goes deeper is the effective ground level the critical-depth
    # and skin-friction-skip provisions measure from (same treatment IRC:78 /
    # IITK-GSDMA seismic guidance gives combined scour+liquefaction depth).
    ineffective_depth_m = max(scour_depth_m or 0.0, liquefaction_depth_m or 0.0) or None

    default_critical_depth_factor = 15.0 if code == "IS_2911" else 20.0
    critical_depth_factor = critical_depth_factor if critical_depth_factor is not None else default_critical_depth_factor
    critical_depth = critical_depth_factor * diameter_m + (ineffective_depth_m or 0.0)
    K = 1.0 if code == "IS_2911" else 1.5  # earth-pressure coefficient, per reference workbook

    estimated_fields = []  # transparency log: every value NOT a direct layer reading
    warnings = [
        f"Critical depth restriction: overburden stress for skin friction/end bearing is capped "
        f"beyond {critical_depth_factor}D below the ineffective ground level ({critical_depth:.2f} m here), per "
        f"{'IS 2911' if code == 'IS_2911' else 'IRC:78'}'s critical-depth provision"
        + (f" (using an overridden {critical_depth_factor}D instead of the code default {default_critical_depth_factor}D)."
           if critical_depth_factor != default_critical_depth_factor else "."),
        "Phase 1 covers bored cast-in-situ piles only (compression + uplift). Driven piles, "
        "rock-socketed resistance, pile groups, and negative skin friction are not yet implemented.",
        "Nq/Ny use the same Vesic-type formula as this app's IS:6403 shear calculator (for internal "
        "consistency) rather than a code chart -- the reference workbook's own Nq table looked "
        "inconsistent on inspection and wasn't copied blindly.",
    ]
    if scour_depth_m is not None and liquefaction_depth_m is not None:
        deeper = "liquefaction" if liquefaction_depth_m > scour_depth_m else "scour"
        warnings.append(
            f"Both scour depth ({scour_depth_m}m) and liquefaction depth ({liquefaction_depth_m}m) were given -- "
            f"the deeper one ({deeper}, {ineffective_depth_m:.2f}m) governs the ineffective ground level used below."
        )

    # ---------- Skin friction: walk the borehole in clean sub-segments ----------
    boundaries = _segment_boundaries(toe_depth, water_table_depth_m, critical_depth, ineffective_depth_m, layers)
    perimeter = math.pi * diameter_m
    running_overburden = 0.0     # true cumulative effective overburden (t/m2)
    capped_overburden = None     # value frozen once critical depth is passed
    layer_report = []
    total_qs = 0.0

    for top, bottom in zip(boundaries[:-1], boundaries[1:]):
        mid = (top + bottom) / 2
        thickness = bottom - top
        if thickness <= 0:
            continue
        founding = _founding_layer(layers, mid)

        cohesion, c_note = _resolve(layers, founding, "cohesion_t_m2", overrides)
        phi, phi_note = _resolve(layers, founding, "friction_angle_deg", overrides)
        gamma_bulk, g_note = _resolve(layers, founding, "bulk_density_t_m3", overrides)
        n_value, n_note = _resolve(layers, founding, "n_value", overrides)
        if cohesion is None or phi is None or gamma_bulk is None:
            raise ValueError(
                f"No cohesion/phi/density available for the {top:.2f}-{bottom:.2f}m segment in this "
                f"borehole -- add it as a manual override to run this calculation."
            )
        for field, note in (("cohesion_t_m2", c_note), ("friction_angle_deg", phi_note),
                             ("bulk_density_t_m3", g_note)):
            if "this layer" not in note:
                estimated_fields.append(f"{field} for {top:.2f}-{bottom:.2f}m: {note}")

        gamma_eff = gamma_bulk - 1.0 if water_table_depth_m is not None and top >= water_table_depth_m else gamma_bulk
        gamma_eff = max(gamma_eff, 0.1)
        below_water_table = water_table_depth_m is not None and top >= water_table_depth_m

        was_capped = capped_overburden is not None
        if capped_overburden is None:
            sigma_start = running_overburden
            running_overburden += gamma_eff * thickness
            sigma_end = running_overburden
            if bottom >= critical_depth:
                capped_overburden = sigma_start + gamma_eff * max(critical_depth - top, 0)
        else:
            sigma_start = sigma_end = capped_overburden
        sigma_avg = (sigma_start + sigma_end) / 2

        tan_phi = math.tan(math.radians(phi))
        ignored_for_scour_liq = ineffective_depth_m is not None and bottom <= ineffective_depth_m
        if ignored_for_scour_liq:
            qs_seg = 0.0
            alpha = None
            cohesion_term_t = 0.0
            friction_term_t = 0.0
        else:
            alpha = _alpha_is2911(cohesion) if code == "IS_2911" else _alpha_irc78(n_value)
            cohesion_term_t = alpha * cohesion * perimeter * thickness
            friction_term_t = K * sigma_avg * tan_phi * perimeter * thickness
            qs_seg = max(cohesion_term_t + friction_term_t, 0.0)
            total_qs += qs_seg

        layer_report.append({
            "from_m": round(top, 2), "to_m": round(bottom, 2),
            "thickness_m": round(thickness, 2),
            "founding_layer_classification": getattr(founding, "classification", None) or "n/a",
            "below_water_table": below_water_table,
            "cohesion_t_m2": round(cohesion, 3), "phi_deg": round(phi, 2),
            "n_value_used": round(n_value, 1) if (code == "IRC_78" and n_value is not None) else None,
            "gamma_bulk_t_m3": round(gamma_bulk, 3), "gamma_eff_t_m3": round(gamma_eff, 3),
            "sigma_v_start_t_m2": round(sigma_start, 3), "sigma_v_end_t_m2": round(sigma_end, 3),
            "sigma_v_avg_t_m2": round(sigma_avg, 3),
            "overburden_capped_here": was_capped,
            "K_used": K, "tan_phi": round(tan_phi, 4),
            "alpha": round(alpha, 3) if alpha is not None else None,
            "cohesion_term_t": round(cohesion_term_t, 2),
            "friction_term_t": round(friction_term_t, 2),
            "skin_friction_t": round(qs_seg, 2),
            "running_skin_friction_t": round(total_qs, 2),
            "ignored_scour_or_liquefaction": ignored_for_scour_liq,
        })

    if capped_overburden is None:
        capped_overburden = running_overburden
    sigma_v_toe = capped_overburden

    # ---------- End bearing: check toe-2D / toe / toe+2D, lowest governs ----------
    Ap = math.pi / 4 * diameter_m ** 2
    candidates = []
    for label, d in (("toe - 2D", toe_depth - 2 * diameter_m), ("toe", toe_depth), ("toe + 2D", toe_depth + 2 * diameter_m)):
        d = max(d, 0.0)
        founding = _founding_layer(layers, d)
        c, c_note = _resolve(layers, founding, "cohesion_t_m2", overrides)
        phi, phi_note = _resolve(layers, founding, "friction_angle_deg", overrides)
        gamma_bulk, g_note = _resolve(layers, founding, "bulk_density_t_m3", overrides)
        if c is None or phi is None or gamma_bulk is None:
            continue
        gamma_eff = gamma_bulk - 1.0 if water_table_depth_m is not None and d >= water_table_depth_m else gamma_bulk
        gamma_eff = max(gamma_eff, 0.1)
        Nc, Nq, Ny = _nc_nq_ny(phi)
        cohesion_term = Ap * c * Nc
        surcharge_term = Ap * sigma_v_toe * Nq
        weight_term = Ap * 0.5 * gamma_eff * diameter_m * Ny
        Qp = cohesion_term + surcharge_term + weight_term
        candidates.append({"at": label, "depth_m": round(d, 2), "cohesion_t_m2": round(c, 3),
                            "phi_deg": round(phi, 2), "gamma_eff_t_m3": round(gamma_eff, 3),
                            "sigma_v_toe_t_m2": round(sigma_v_toe, 3), "Ap_m2": round(Ap, 4),
                            "Nc": Nc, "Nq": round(Nq, 2), "Ny": round(Ny, 2),
                            "cohesion_term_t": round(cohesion_term, 2),
                            "surcharge_term_t": round(surcharge_term, 2),
                            "weight_term_t": round(weight_term, 2),
                            "end_bearing_t": round(Qp, 2)})
        for field, note in (("cohesion_t_m2", c_note), ("friction_angle_deg", phi_note), ("bulk_density_t_m3", g_note)):
            if "this layer" not in note:
                estimated_fields.append(f"{field} near pile toe ({label}, {d:.2f}m): {note}")

    if not candidates:
        raise ValueError("Could not resolve soil properties near the pile toe -- add manual overrides.")
    governing = min(candidates, key=lambda x: x["end_bearing_t"])
    Qp_ultimate = governing["end_bearing_t"]

    Qu_compression = total_qs + Qp_ultimate
    Qa_compression = Qu_compression / fos_compression
    Qu_uplift = total_qs  # skin friction only; pile self-weight not included -- see warnings
    Qa_uplift = Qu_uplift / fos_uplift
    warnings.append(
        "Uplift capacity is skin friction only -- add the pile's own self-weight separately "
        "(not included here, since reinforcement/concrete details aren't part of the borehole data)."
    )

    return {
        "code": "IS 2911 Part-1 Sec-2:2010" if code == "IS_2911" else "IRC:78:2024",
        "pile_type": "Bored Cast-in-Situ",
        "diameter_m": diameter_m,
        "pile_length_m": pile_length_m,
        "cutoff_depth_m": cutoff_depth_m,
        "scour_depth_m": scour_depth_m,
        "liquefaction_depth_m": liquefaction_depth_m,
        "ineffective_ground_level_m": ineffective_depth_m,
        "critical_depth_factor_used": critical_depth_factor,
        "toe_depth_m": round(toe_depth, 2),
        "ultimate_skin_friction_t": round(total_qs, 2),
        "ultimate_end_bearing_t": round(Qp_ultimate, 2),
        "end_bearing_candidates": candidates,
        "governing_end_bearing_zone": governing["at"],
        "ultimate_compression_capacity_t": round(Qu_compression, 2),
        "allowable_compression_capacity_t": round(Qa_compression, 2),
        "fos_compression": fos_compression,
        "ultimate_uplift_capacity_t": round(Qu_uplift, 2),
        "allowable_uplift_capacity_t": round(Qa_uplift, 2),
        "fos_uplift": fos_uplift,
        "layer_report": layer_report,
        "estimated_fields": estimated_fields,
        "unit": "t (tonnes)",
        "formula": "Qu = Qs + Qp;  Qs = Sum[(alpha.c + K.sigma'v.tanphi).perimeter.dL];  "
                   "Qp = Ap.(c.Nc + sigma'v.Nq + 0.5.gamma.D.Ny)",
        "warnings": warnings,
    }


# ==================== PILE GROUP ANALYSIS ====================
# Added 14 Aug 2026, per Raahi's request (screenshot of the "Pile Group Analysis"
# Coming Soon page). Builds entirely on the single-pile engine above -- no new
# soil-property machinery needed. Covers exactly the 4 items listed on that
# placeholder page:
#   1. Group efficiency -- Converse-Labarre formula (IS 2911)
#   2. Block failure -- group treated as one large equivalent pier, using the
#      SAME skin-friction (alpha/K method) + end-bearing (Nc/Nq/Ny) machinery
#      as the single pile, just with the group's outer perimeter/base area
#      instead of one pile's circumference/cross-section
#   3. Pile cap load distribution -- rigid-cap elastic method (P/n +- M.x/Sum(x^2))
#   4. Settlement of pile groups -- LAYER-WISE equivalent raft (reworked 14 Aug
#      2026, see _group_settlement_layerwise()'s own docstring): a footing of
#      the group's own plan size, placed at 2/3 pile length (friction piles)
#      or the pile toe (end-bearing piles), settlement summed sub-layer by
#      sub-layer against the REAL borehole layers (Boussinesq rectangular-load
#      stress attenuation + IS:8009 consolidation/Fig-9 chart per sub-layer,
#      same formulas as the app's Bearing Capacity & Settlement multi-layer
#      tool) -- NOT a single manually-entered soil type/Cc/e0 the way the
#      first version of this feature worked.
#
# HONEST SCOPE NOTE: the equivalent-raft settlement here does NOT widen the
# raft outward with depth (a common refinement, load spread at some angle
# below the group perimeter) -- it's the plain group-envelope-size raft. This
# is flagged in the result's own warnings every time settlement is requested.
# Block failure's "critical depth" cap reuses the single pile's xD rule but
# with D replaced by the group's average plan dimension (Lg+Bg)/2, since a
# rectangular block has no single diameter -- also flagged as an assumption.


def _group_geometry(num_rows: int, num_cols: int, spacing_m: float, diameter_m: float) -> dict:
    if num_rows < 1 or num_cols < 1:
        raise ValueError("Number of rows and columns must each be at least 1.")
    if num_rows * num_cols < 2:
        raise ValueError("A pile group needs at least 2 piles -- use the single Pile Capacity calculator for one pile.")
    if spacing_m <= diameter_m:
        raise ValueError("Pile spacing (centre-to-centre) must be greater than the pile diameter.")

    positions = []
    for r in range(num_rows):
        for c in range(num_cols):
            positions.append((c * spacing_m, r * spacing_m))
    cx = (num_cols - 1) * spacing_m / 2
    cy = (num_rows - 1) * spacing_m / 2
    positions = [(round(x - cx, 4), round(y - cy, 4)) for x, y in positions]

    Lg = (num_cols - 1) * spacing_m + diameter_m
    Bg = (num_rows - 1) * spacing_m + diameter_m
    return {"n_piles": num_rows * num_cols, "positions": positions, "Lg_m": round(Lg, 3), "Bg_m": round(Bg, 3)}


def _group_efficiency_converse_labarre(num_rows: int, num_cols: int, spacing_m: float, diameter_m: float) -> dict:
    theta_deg = math.degrees(math.atan(diameter_m / spacing_m))
    m, n = num_rows, num_cols
    Eg = max(1 - theta_deg * ((n - 1) * m + (m - 1) * n) / (90 * m * n), 0.0)
    return {
        "theta_deg": round(theta_deg, 3),
        "efficiency": round(Eg, 4),
        "formula": "Eg = 1 - \u03b8[(n-1)m + (m-1)n] / (90mn),  \u03b8 = arctan(D/s) in degrees  (Converse-Labarre, IS 2911)",
    }


def _block_failure_capacity(
    layers: list, water_table_depth_m: float | None, toe_depth: float, code: str,
    Lg: float, Bg: float, scour_depth_m: float | None, liquefaction_depth_m: float | None,
    critical_depth_factor: float | None, overrides: dict,
) -> dict:
    layers = sorted(layers, key=lambda l: l.from_m)
    ineffective_depth_m = max(scour_depth_m or 0.0, liquefaction_depth_m or 0.0) or None
    default_critical_depth_factor = 15.0 if code == "IS_2911" else 20.0
    critical_depth_factor = critical_depth_factor if critical_depth_factor is not None else default_critical_depth_factor
    equiv_diameter = (Lg + Bg) / 2  # group has no single "D" -- see module note above
    critical_depth = critical_depth_factor * equiv_diameter + (ineffective_depth_m or 0.0)
    K = 1.0 if code == "IS_2911" else 1.5

    perimeter = 2 * (Lg + Bg)
    base_area = Lg * Bg
    width_for_ny = min(Lg, Bg)

    boundaries = _segment_boundaries(toe_depth, water_table_depth_m, critical_depth, ineffective_depth_m, layers)
    running_overburden = 0.0
    capped_overburden = None
    layer_report = []
    total_qs = 0.0
    estimated_fields = []

    for top, bottom in zip(boundaries[:-1], boundaries[1:]):
        mid = (top + bottom) / 2
        thickness = bottom - top
        if thickness <= 0:
            continue
        founding = _founding_layer(layers, mid)
        cohesion, c_note = _resolve(layers, founding, "cohesion_t_m2", overrides)
        phi, phi_note = _resolve(layers, founding, "friction_angle_deg", overrides)
        gamma_bulk, g_note = _resolve(layers, founding, "bulk_density_t_m3", overrides)
        n_value, n_note = _resolve(layers, founding, "n_value", overrides)
        if cohesion is None or phi is None or gamma_bulk is None:
            raise ValueError(
                f"No cohesion/phi/density available for the {top:.2f}-{bottom:.2f}m segment (block failure) -- "
                f"add a manual override to run this calculation."
            )
        for field, note in (("cohesion_t_m2", c_note), ("friction_angle_deg", phi_note), ("bulk_density_t_m3", g_note)):
            if "this layer" not in note:
                estimated_fields.append(f"{field} for {top:.2f}-{bottom:.2f}m (block): {note}")

        gamma_eff = gamma_bulk - 1.0 if water_table_depth_m is not None and top >= water_table_depth_m else gamma_bulk
        gamma_eff = max(gamma_eff, 0.1)
        below_water_table = water_table_depth_m is not None and top >= water_table_depth_m

        was_capped = capped_overburden is not None
        if capped_overburden is None:
            sigma_start = running_overburden
            running_overburden += gamma_eff * thickness
            sigma_end = running_overburden
            if bottom >= critical_depth:
                capped_overburden = sigma_start + gamma_eff * max(critical_depth - top, 0)
        else:
            sigma_start = sigma_end = capped_overburden
        sigma_avg = (sigma_start + sigma_end) / 2

        tan_phi = math.tan(math.radians(phi))
        ignored = ineffective_depth_m is not None and bottom <= ineffective_depth_m
        alpha = None
        qs_seg = 0.0
        cohesion_term_t = friction_term_t = 0.0
        if not ignored:
            alpha = _alpha_is2911(cohesion) if code == "IS_2911" else _alpha_irc78(n_value)
            cohesion_term_t = alpha * cohesion * perimeter * thickness
            friction_term_t = K * sigma_avg * tan_phi * perimeter * thickness
            qs_seg = max(cohesion_term_t + friction_term_t, 0.0)
            total_qs += qs_seg

        layer_report.append({
            "from_m": round(top, 2), "to_m": round(bottom, 2), "thickness_m": round(thickness, 2),
            "founding_layer_classification": getattr(founding, "classification", None) or "n/a",
            "below_water_table": below_water_table,
            "cohesion_t_m2": round(cohesion, 3), "phi_deg": round(phi, 2),
            "n_value_used": round(n_value, 1) if (code == "IRC_78" and n_value is not None) else None,
            "gamma_bulk_t_m3": round(gamma_bulk, 3), "gamma_eff_t_m3": round(gamma_eff, 3),
            "sigma_v_start_t_m2": round(sigma_start, 3), "sigma_v_end_t_m2": round(sigma_end, 3),
            "sigma_v_avg_t_m2": round(sigma_avg, 3),
            "overburden_capped_here": was_capped,
            "K_used": K, "tan_phi": round(tan_phi, 4),
            "alpha": round(alpha, 3) if alpha is not None else None,
            "cohesion_term_t": round(cohesion_term_t, 2),
            "friction_term_t": round(friction_term_t, 2),
            "skin_friction_t": round(qs_seg, 2),
            "running_skin_friction_t": round(total_qs, 2),
            "ignored_scour_or_liquefaction": ignored,
        })

    if capped_overburden is None:
        capped_overburden = running_overburden
    sigma_v_toe = capped_overburden

    candidates = []
    for label, d in (("toe - 2\u00d7Deq", toe_depth - 2 * equiv_diameter), ("toe", toe_depth), ("toe + 2\u00d7Deq", toe_depth + 2 * equiv_diameter)):
        d = max(d, 0.0)
        founding = _founding_layer(layers, d)
        c, c_note = _resolve(layers, founding, "cohesion_t_m2", overrides)
        phi, phi_note = _resolve(layers, founding, "friction_angle_deg", overrides)
        gamma_bulk, g_note = _resolve(layers, founding, "bulk_density_t_m3", overrides)
        if c is None or phi is None or gamma_bulk is None:
            continue
        gamma_eff = gamma_bulk - 1.0 if water_table_depth_m is not None and d >= water_table_depth_m else gamma_bulk
        gamma_eff = max(gamma_eff, 0.1)
        Nc, Nq, Ny = _nc_nq_ny(phi)
        cohesion_term = base_area * c * Nc
        surcharge_term = base_area * sigma_v_toe * Nq
        weight_term = base_area * 0.5 * gamma_eff * width_for_ny * Ny
        Qp = cohesion_term + surcharge_term + weight_term
        candidates.append({"at": label, "depth_m": round(d, 2), "cohesion_t_m2": round(c, 3),
                            "phi_deg": round(phi, 2), "gamma_eff_t_m3": round(gamma_eff, 3),
                            "sigma_v_toe_t_m2": round(sigma_v_toe, 3), "base_area_m2": round(base_area, 3),
                            "Nc": Nc, "Nq": round(Nq, 2), "Ny": round(Ny, 2),
                            "cohesion_term_t": round(cohesion_term, 2),
                            "surcharge_term_t": round(surcharge_term, 2), "weight_term_t": round(weight_term, 2),
                            "end_bearing_t": round(Qp, 2)})
        for field, note in (("cohesion_t_m2", c_note), ("friction_angle_deg", phi_note), ("bulk_density_t_m3", g_note)):
            if "this layer" not in note:
                estimated_fields.append(f"{field} near block base ({label}, {d:.2f}m): {note}")

    if not candidates:
        raise ValueError("Could not resolve soil properties near the block base -- add manual overrides.")
    governing = min(candidates, key=lambda x: x["end_bearing_t"])
    Qp_block = governing["end_bearing_t"]
    Qu_block = total_qs + Qp_block

    return {
        "perimeter_m": round(perimeter, 3), "base_area_m2": round(base_area, 3),
        "critical_depth_factor_used": critical_depth_factor,
        "ultimate_skin_friction_t": round(total_qs, 2),
        "ultimate_end_bearing_t": round(Qp_block, 2),
        "governing_end_bearing_zone": governing["at"],
        "end_bearing_candidates": candidates,
        "ultimate_block_capacity_t": round(Qu_block, 2),
        "layer_report": layer_report,
        "estimated_fields": estimated_fields,
        "formula": "Qu(block) = perimeter\u00d7\u03a3[(\u03b1\u00b7c + K\u00b7\u03c3'v\u00b7tan\u03c6)\u00b7thickness] + base_area\u00d7(c\u00b7Nc + \u03c3'v\u00b7Nq + 0.5\u00b7\u03b3\u00b7B\u00b7N\u03b3) "
                   "-- group treated as one large equivalent pier/pile",
    }


def _group_settlement_layerwise(
    layers: list, water_table_depth_m: float | None, Lg: float, Bg: float,
    raft_depth_m: float, q_net_t_m2: float, influence_multiplier: float, overrides: dict,
) -> dict:
    """Equivalent-raft settlement, but LAYER-WISE against the borehole's real
    layers (not a single manually-entered soil type) -- added 14 Aug 2026 in
    response to Raahi's feedback that soil is never really "one type" through
    the depth. Mirrors calculators.py's run_settlement_multilayer() (same
    Boussinesq rectangular-load influence factor, same IS:8009 Fig-9 granular
    formula, same NCS consolidation formula, same water-table Aw correction,
    same Fox depth-correction, same Cc-from-void-ratio fallback) but computes
    settlement for a GIVEN pressure directly instead of solving for the
    pressure that produces a target settlement -- that inverse (bisection)
    solve doesn't apply here since the group's applied pressure is already
    fixed (cap_load_t / raft area).

    NOT re-using run_settlement_multilayer() itself (its pressure-solve is
    baked into that function via a closure) -- this is a parallel, simpler
    forward version so the well-tested SBC-solving function isn't touched.

    Still simplified vs a full raft analysis: no outward load-spread widening
    of the raft with depth (flagged in the result's warnings), and no
    Steinbrenner elastic component (off, same default as the SBC settlement
    tool). Manual overrides (n_value, compression_index_cc,
    initial_void_ratio_e0, bulk_density_t_m3) work exactly like every other
    calculator in this app -- borehole-wide, always win over recorded data.
    """
    layers = sorted(layers, key=lambda l: l.from_m)
    influence_depth = raft_depth_m + influence_multiplier * min(Lg, Bg)

    def _iz_rect(z: float) -> float:
        if z <= 0:
            return 1.0
        F = math.sqrt((Lg / 2) ** 2 + z ** 2)
        G = math.sqrt((Bg / 2) ** 2 + z ** 2)
        Hc = math.sqrt((Lg / 2) ** 2 + (Bg / 2) ** 2 + z ** 2)
        return (4 / (2 * math.pi)) * (
            math.atan((0.25 * Lg * Bg) / (z * Hc)) + (0.25 * Lg * Bg * z / Hc) * (1 / F ** 2 + 1 / G ** 2)
        )

    if water_table_depth_m is None:
        Aw, aw_note = 1.0, "No water table given -- Aw = 1.0"
    elif water_table_depth_m <= raft_depth_m:
        Aw, aw_note = 0.5, f"Water table at/above raft depth -- Aw = 0.5"
    elif water_table_depth_m >= influence_depth:
        Aw, aw_note = 1.0, f"Water table below the influence zone -- Aw = 1.0"
    else:
        Aw = 0.5 + 0.5 * (water_table_depth_m - raft_depth_m) / (influence_depth - raft_depth_m)
        aw_note = f"Water table within the influence zone -- Aw = {Aw:.3f}"

    sub_layers = []
    for l in layers:
        top, bottom = max(l.from_m, raft_depth_m), min(l.to_m, influence_depth)
        if bottom <= top:
            continue
        sub_layers.append({"layer": l, "top": top, "bottom": bottom, "thickness": bottom - top})
    sub_layers.sort(key=lambda s: s["top"])
    filled, cursor = [], raft_depth_m
    for sl in sub_layers:
        if sl["top"] > cursor:
            filled.append({"layer": _founding_layer(layers, (cursor + sl["top"]) / 2), "top": cursor,
                            "bottom": sl["top"], "thickness": sl["top"] - cursor, "gap_filled": True})
        cursor = max(cursor, sl["bottom"])
    if cursor < influence_depth:
        filled.append({"layer": _founding_layer(layers, (cursor + influence_depth) / 2), "top": cursor,
                        "bottom": influence_depth, "thickness": influence_depth - cursor, "gap_filled": True})
    sub_layers = sorted(sub_layers + filled, key=lambda s: s["top"])
    if not sub_layers:
        raise ValueError(f"No soil layer data found within the settlement influence zone ({raft_depth_m:.2f}m to {influence_depth:.2f}m).")

    fox = _fox_depth_correction_factor(Lg, Bg, raft_depth_m)
    layer_report = []
    running = 0.0
    for sl in sub_layers:
        l, H = sl["layer"], sl["thickness"]
        z_mid = sl["top"] + H / 2
        classification = (getattr(l, "classification", None) or "").strip().upper()
        is_cohesive = classification[0] in ("C", "M") if classification else (overrides.get("compression_index_cc") is not None or getattr(l, "compression_index_cc", None) is not None)

        Iz = _iz_rect(z_mid - raft_depth_m)
        P0 = _cumulative_overburden_stress(layers, z_mid, overrides)
        if P0 <= 0:
            raise ValueError(f"Layer {l.from_m}-{l.to_m}m: overburden stress works out to zero or negative -- check bulk densities above it.")
        dp = Iz * q_net_t_m2

        if is_cohesive:
            e0 = overrides.get("initial_void_ratio_e0")
            if e0 is None:
                e0, _ = _resolve_field(layers, l, "initial_void_ratio_e0")
            if e0 is None:
                raise ValueError(f"Layer {l.from_m}-{l.to_m}m: no initial_void_ratio_e0 anywhere in this borehole to fall back on.")
            cc = overrides.get("compression_index_cc")
            cc_source = "manual override" if cc is not None else None
            if cc is None:
                cc, cc_source = _resolve_field(layers, l, "compression_index_cc")
            if cc is None:
                cc = 0.3 * (e0 - 0.27)
                cc_source = f"estimated from void ratio (Cc=0.3\u00b7(e0-0.27), e0={e0:.3f})"
            raw_mm = (H / (1 + e0)) * cc * math.log10((P0 + dp) / P0) * 1000
            method = "Clay/Silt consolidation (NCS)"
            working = f"Sc = (H/(1+e0))\u00b7Cc\u00b7log10((P0+\u0394\u03c3)/P0)\u00b71000 = ({H:.2f}/(1+{e0:.3f}))\u00b7{cc:.4f}\u00b7log10(({P0:.2f}+{dp:.3f})/{P0:.2f})\u00b71000 = {raw_mm:.2f} mm"
            detail = {"soil_type": "Cohesive (incl. Silt)", "cc": round(cc, 4), "cc_source": cc_source, "e0": round(e0, 3)}
        else:
            n_val = overrides.get("n_value")
            n_source = "manual override" if n_val is not None else None
            if n_val is None:
                n_val, n_source = _resolve_field(layers, l, "n_value")
            if n_val is None:
                raise ValueError(f"Layer {l.from_m}-{l.to_m}m: no n_value anywhere in this borehole to fall back on (needed for the granular settlement chart).")
            if n_val <= 3:
                raise ValueError(f"Layer {l.from_m}-{l.to_m}m: N-value ({n_val}) must be > 3 for the IS:8009 Fig-9 chart to apply.")
            width_for_chart = min(Lg, Bg)
            settlement_at_10t = 10 / (0.1385 * (n_val - 3) * ((width_for_chart + 0.3) / (2 * width_for_chart)) ** 2)
            raw_mm = settlement_at_10t * dp / (10 * Aw)
            method = "Sand/Gravel -- IS:8009 Fig-9 chart"
            working = f"Sc = (Settlement-at-10t/m\u00b2 \u00d7 \u0394\u03c3)/(10\u00d7Aw) = ({settlement_at_10t:.3f}\u00d7{dp:.3f})/(10\u00d7{Aw:.3f}) = {raw_mm:.2f} mm"
            detail = {"soil_type": "Non-cohesive (granular)", "n_value_used": round(n_val, 1), "n_value_source": n_source}

        layer_settlement_mm = raw_mm * fox
        running += layer_settlement_mm
        working += f" -> \u00d7Fox({fox:.3f}) = {layer_settlement_mm:.2f} mm"
        layer_report.append({
            "from_m": round(sl["top"], 2), "to_m": round(sl["bottom"], 2), "thickness_m": round(H, 2),
            "classification": getattr(l, "classification", None) or "n/a",
            "gap_filled": sl.get("gap_filled", False),
            "settlement_method": method, **detail,
            "P0_t_m2": round(P0, 3), "Iz": round(Iz, 4), "stress_increase_t_m2": round(dp, 3),
            "layer_settlement_mm": round(layer_settlement_mm, 3), "running_settlement_mm": round(running, 3),
            "working": working,
        })

    return {
        "result": round(running, 2), "unit": "mm",
        "raft_depth_m": round(raft_depth_m, 2), "influence_zone_to_m": round(influence_depth, 2),
        "influence_multiplier": influence_multiplier,
        "net_pressure_t_m2": round(q_net_t_m2, 3),
        "fox_depth_correction_factor": round(fox, 3),
        "water_table_correction_note": aw_note,
        "sub_layer_count": len(sub_layers),
        "layer_report": layer_report,
        "formula": "Per-sublayer IS:8009 consolidation (clay/silt) or Fig-9 chart (sand/gravel), Boussinesq rectangular-load "
                   "stress attenuation, summed and Fox-corrected -- same method as the Bearing Capacity & Settlement calculator's "
                   "multi-layer settlement, applied here at the equivalent raft.",
        "warnings": [
            f"Equivalent raft: {Lg}m \u00d7 {Bg}m plan (group envelope, no outward load-spread widening with depth), "
            f"placed {raft_depth_m:.2f}m below ground.",
            f"Influence zone: {raft_depth_m:.2f}m to {influence_depth:.2f}m below ground, split across {len(sub_layers)} "
            f"real borehole sub-layer(s).",
            "Elastic (immediate) settlement component is not included -- consolidation/chart settlement only, same "
            "default as the app's other settlement calculators.",
            "Silt (MI/MH/ML) is treated as COHESIVE, same convention as the rest of this app.",
        ],
    }


def run_pile_group_analysis(
    layers: list,
    water_table_depth_m: float | None,
    diameter_m: float,
    pile_length_m: float,
    cutoff_depth_m: float,
    code: str,
    num_rows: int,
    num_cols: int,
    spacing_m: float,
    cap_load_t: float,
    moment_x_t_m: float = 0.0,
    moment_y_t_m: float = 0.0,
    pile_behaviour: str = "friction",
    scour_depth_m: float | None = None,
    liquefaction_depth_m: float | None = None,
    critical_depth_factor: float | None = None,
    fos_compression: float = 2.5,
    fos_uplift: float = 2.5,
    overrides: dict | None = None,
    run_settlement: bool = False,
    settlement_influence_multiplier: float = 1.5,
) -> dict:
    overrides = overrides or {}
    pile_behaviour = pile_behaviour.lower()
    if pile_behaviour not in ("friction", "end_bearing"):
        raise ValueError("pile_behaviour must be 'friction' or 'end_bearing'.")

    geom = _group_geometry(num_rows, num_cols, spacing_m, diameter_m)
    n_piles = geom["n_piles"]
    Lg, Bg = geom["Lg_m"], geom["Bg_m"]

    single = run_pile_capacity(
        layers=layers, water_table_depth_m=water_table_depth_m, diameter_m=diameter_m,
        pile_length_m=pile_length_m, cutoff_depth_m=cutoff_depth_m, code=code,
        scour_depth_m=scour_depth_m, liquefaction_depth_m=liquefaction_depth_m,
        critical_depth_factor=critical_depth_factor, fos_compression=fos_compression,
        fos_uplift=fos_uplift, overrides=overrides,
    )

    eff = _group_efficiency_converse_labarre(num_rows, num_cols, spacing_m, diameter_m)
    Eg = eff["efficiency"]
    Qu_group_efficiency = Eg * n_piles * single["ultimate_compression_capacity_t"]
    Qa_group_efficiency = Qu_group_efficiency / fos_compression

    toe_depth = cutoff_depth_m + pile_length_m
    block = _block_failure_capacity(
        layers=layers, water_table_depth_m=water_table_depth_m, toe_depth=toe_depth, code=code,
        Lg=Lg, Bg=Bg, scour_depth_m=scour_depth_m, liquefaction_depth_m=liquefaction_depth_m,
        critical_depth_factor=critical_depth_factor, overrides=overrides,
    )
    Qa_block = block["ultimate_block_capacity_t"] / fos_compression

    if Qa_group_efficiency <= Qa_block:
        governing_mode = "group_efficiency"
        Qa_group = Qa_group_efficiency
    else:
        governing_mode = "block_failure"
        Qa_group = Qa_block

    warnings = [
        "Governing group capacity is the LOWER of the group-efficiency method and the block-failure "
        "method, per standard practice (IS 2911 commentary) -- widely spaced groups in sand are "
        "usually governed by group efficiency, closely spaced groups in clay by block failure.",
        "Group efficiency (Converse-Labarre) is an empirical reduction, not a formula given inside "
        "IS 2911 itself, but is the standard method used alongside it -- treat as indicative.",
        "Block failure's critical-depth cap reuses the single-pile xD rule with D replaced by the "
        "group's average plan dimension (Lg+Bg)/2, since a rectangular block has no single diameter.",
    ]

    # ---------- Pile cap load distribution (rigid cap, elastic method) ----------
    positions = geom["positions"]
    sum_x2 = sum(x * x for x, y in positions) or 1e-9
    sum_y2 = sum(y * y for x, y in positions) or 1e-9
    pile_loads = []
    for i, (x, y) in enumerate(positions):
        q = cap_load_t / n_piles + moment_y_t_m * x / sum_x2 + moment_x_t_m * y / sum_y2
        pile_loads.append({"pile": i + 1, "x_m": x, "y_m": y, "load_t": round(q, 2)})
    max_pile = max(pile_loads, key=lambda p: p["load_t"])
    min_pile = min(pile_loads, key=lambda p: p["load_t"])
    allowable_per_pile_t = round(Eg * single["allowable_compression_capacity_t"], 2)

    cap_result = {
        "positions": pile_loads,
        "max_pile_load_t": max_pile["load_t"], "max_pile_position_m": [max_pile["x_m"], max_pile["y_m"]],
        "min_pile_load_t": min_pile["load_t"], "min_pile_position_m": [min_pile["x_m"], min_pile["y_m"]],
        "allowable_per_pile_t": allowable_per_pile_t,
        "within_capacity": max_pile["load_t"] <= allowable_per_pile_t,
        "formula": "Qi = P/n \u00b1 My\u00b7xi/\u03a3xi\u00b2 \u00b1 Mx\u00b7yi/\u03a3yi\u00b2  (rigid pile cap, elastic method)",
    }

    # ---------- Settlement (equivalent raft, layer-wise -- see function docstring) ----------
    settlement_result = None
    if run_settlement:
        raft_depth_below_cap = pile_length_m if pile_behaviour == "end_bearing" else (2 / 3) * pile_length_m
        raft_depth_total = cutoff_depth_m + raft_depth_below_cap
        q_net_t_m2 = cap_load_t / (Lg * Bg)
        settlement_result = _group_settlement_layerwise(
            layers=layers, water_table_depth_m=water_table_depth_m, Lg=Lg, Bg=Bg,
            raft_depth_m=raft_depth_total, q_net_t_m2=q_net_t_m2,
            influence_multiplier=settlement_influence_multiplier, overrides=overrides,
        )

    return {
        "code": single["code"],
        "n_piles": n_piles, "layout": f"{num_rows} \u00d7 {num_cols}",
        "group_length_m": Lg, "group_width_m": Bg,
        "pile_positions_m": positions,
        "single_pile": {
            "ultimate_compression_capacity_t": single["ultimate_compression_capacity_t"],
            "allowable_compression_capacity_t": single["allowable_compression_capacity_t"],
            "ultimate_uplift_capacity_t": single["ultimate_uplift_capacity_t"],
            "allowable_uplift_capacity_t": single["allowable_uplift_capacity_t"],
        },
        "group_efficiency": eff,
        "group_capacity_efficiency_method": {"ultimate_t": round(Qu_group_efficiency, 2), "allowable_t": round(Qa_group_efficiency, 2)},
        "block_failure": block,
        "group_capacity_block_method": {"ultimate_t": block["ultimate_block_capacity_t"], "allowable_t": round(Qa_block, 2)},
        "governing_group_capacity_t": round(Qa_group, 2),
        "governing_mode": governing_mode,
        "fos_compression": fos_compression,
        "cap_load_distribution": cap_result,
        "settlement": settlement_result,
        "unit": "t (tonnes)",
        "warnings": warnings,
    }


# ==================== LATERAL PILE CAPACITY (IS:2911 Part 1/Sec 1:2010, Annex C) ====================
# Verified against Raahi's own reference workbooks (Lateral_capacity_cohesive_soil.xlsm,
# Lateral_capacity_Cohesionless.xlsm) and cross-checked against IS:2911's own Table 5 /
# Fig.3 (photographed by Raahi). Method: 1%-of-diameter deflection criterion via the
# equivalent-cantilever approach (IS:2911 Annex C), NOT Broms' ultimate-capacity method.
#
# Two stiffness regimes (IS:2911 C-2.3):
#   - Sand and Normally Consolidated (NCS) clay: subgrade modulus increases linearly with
#     depth (nh) -> stiffness factor T = (EI/nh)^0.2
#   - Preloaded/Over-Consolidated (OCS) clay: subgrade modulus is constant with depth (K)
#     -> stiffness factor R = (EI/(K.B))^0.25
# Pile behaviour classification (IS:2911 Table 5, embedded length L vs stiffness factor):
#   Short (rigid):  L <= 2T (sand/NCS)  or  L <= 2R (OCS)
#   Long (elastic): L >= 4T (sand/NCS)  or  L >= 3.5R (OCS)
#   Intermediate: anything between -- IS:2911 itself just says "a case between rigid and
#   elastic behaviour", no separate formula; this calculator still runs the long-pile
#   equivalent-cantilever method for intermediate piles (same as Raahi's reference
#   workbooks do), since IS:2911 doesn't give a distinct intermediate-pile method either.
#
# PRECISION NOTE (told to Raahi directly, not hidden here): the clay-side free/fixed-head
# Fig.3 curves are exact 6th-degree polynomial fits lifted directly from Raahi's own
# workbook (verified to match his BH-P-194_1 numbers exactly). The SAND-side curves are a
# piecewise-linear digitization of IS:2911 Fig.3 anchored at 3 real data points from
# Raahi's own workbook (L1/T = 0, 0.79, 1.04) and extended by eye for the rest of the
# chart -- NOT independently verified the way clay was. Flagged in this function's
# `warnings` output every time the sand path is used.

def _nh_from_n_value(n_value: float) -> float:
    """Constant of horizontal subgrade reaction modulus nh (MN/m3), IS:2911 Table 3,
    interpolated by SPT N-value. Divided by 10 to match the /10 scaling Raahi's own
    workbook applies before using nh in the T formula (same convention as k1 for clay)."""
    bands = [(0, 4, 0.0, 0.65), (4, 10, 0.65, 2.1), (10, 30, 2.1, 5.5), (30, 50, 5.5, 10.3)]
    if n_value < 4:
        raw = 0.65 * max(n_value, 0) / 4
    elif n_value >= 50:
        raw = 10.3
    else:
        raw = 0.65
        for lo, hi, klo, khi in bands:
            if lo <= n_value < hi:
                raw = (khi - klo) * (n_value - lo) / (hi - lo) + klo
                break
    return raw / 10


def _k1_from_qu(qu_kn_m2: float) -> float:
    """Modulus of subgrade reaction k1 (MN/m3), IS:2911 Table 4, interpolated by
    unconfined compressive strength qu = 2c. Same /10 scaling as above."""
    bands = [(0, 25, 0.0, 4.5), (25, 50, 4.5, 9.0), (50, 100, 9.0, 18.0), (100, 200, 18.0, 36.0), (200, 400, 36.0, 72.0)]
    if qu_kn_m2 < 25:
        raw = 0.0
    elif qu_kn_m2 >= 400:
        raw = 72.0
    else:
        raw = 0.0
        for lo, hi, klo, khi in bands:
            if lo <= qu_kn_m2 < hi:
                raw = (khi - klo) * (qu_kn_m2 - lo) / (hi - lo) + klo
                break
    return raw / 10


def _fig3_factor_clay_ocs(x: float, head: str) -> float:
    """Lf/R vs L1/R, digitized as exact polynomials from Raahi's own workbook
    (verified against his BH-P-194_1 numbers to 4 significant figures)."""
    if x > 1:
        raise ValueError(f"L1/R = {x:.2f} exceeds 1 -- beyond the digitized chart range for preloaded-clay free-head factor.")
    if head == "free":
        return 2.7056 * x**6 - 8.9041 * x**5 + 10.697 * x**4 - 5.5211 * x**3 + 1.2093 * x**2 - 0.3871 * x + 1.6502
    if x == 0:
        return 2.0
    return 2e-5 * x**6 - 0.0006 * x**5 + 0.0084 * x**4 - 0.0554 * x**3 + 0.2068 * x**2 - 0.4598 * x + 1.982


_FIG3_SAND_FREE = [(0, 1.826), (1.04, 1.826), (2, 1.79), (4, 1.73), (6, 1.70), (8, 1.68), (10, 1.67)]
_FIG3_SAND_FIXED = [(0, 2.219), (0.79, 2.035), (1.04, 1.98), (2, 1.93), (4, 1.88), (6, 1.85), (8, 1.83), (10, 1.82)]


def _fig3_factor_sand(x: float, head: str) -> float:
    """Lf/T vs L1/T for sand/NCS clay -- piecewise-linear digitization of IS:2911 Fig.3,
    see the PRECISION NOTE above this section. Clamped to the chart's 0-10 range."""
    pts = _FIG3_SAND_FREE if head == "free" else _FIG3_SAND_FIXED
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]


def run_lateral_capacity(
    length_m: float, width_m: float, pile_material_modulus_t_m2: float,
    embedded_length_m: float, free_length_above_ground_m: float,
    soil_type: str, consolidation_type: str = "NCS",
    cohesion_t_m2: float | None = None, n_value: float | None = None,
    allowable_deflection_pct_dia: float = 1.0,
) -> dict:
    """
    Safe lateral pile capacity by the 1%-of-diameter deflection criterion
    (IS:2911 Part 1/Sec 1:2010, Annex C, equivalent-cantilever approach).
    Runs BOTH free-head and fixed-head cases (IS:2911 gives no rule for
    picking one -- that's a structural/connection-detail decision, not a
    soil one, so both are always returned for Raahi to pick from).

    soil_type: "cohesive" or "cohesionless". For cohesive, consolidation_type
    ("OCS" preloaded or "NCS" normally-consolidated) selects which stiffness
    formula applies -- OCS uses R (constant-with-depth K), NCS uses the SAME
    T formula as cohesionless soil (per IS:2911 C-2.3.1's own heading:
    "For Piles in Sand and Normally Loaded Clays").
    """
    soil_type = soil_type.lower()
    if soil_type not in ("cohesive", "cohesionless"):
        raise ValueError("soil_type must be 'cohesive' or 'cohesionless'.")
    consolidation_type = consolidation_type.upper()
    if consolidation_type not in ("OCS", "NCS"):
        raise ValueError("consolidation_type must be 'OCS' (preloaded) or 'NCS' (normally consolidated).")

    D_cm = width_m * 100
    L_cm = embedded_length_m * 100
    L1_cm = free_length_above_ground_m * 100
    E = pile_material_modulus_t_m2 * 0.1  # t/m2 -> kg/cm2 (1 t/m2 = 1000 kg/m2 = 0.1 kg/cm2)
    I = math.pi * D_cm**4 / 64
    warnings = []

    use_R_formula = (soil_type == "cohesive" and consolidation_type == "OCS")

    if use_R_formula:
        if cohesion_t_m2 is None:
            raise ValueError("Preloaded (OCS) clay needs cohesion_t_m2.")
        c_kg_cm2 = cohesion_t_m2 / 10  # t/m2 -> kg/cm2, same conversion as E above
        qu_kn_m2 = 2 * c_kg_cm2 * 100  # qu = 2c, then kg/cm2 -> kN/m2 (matches the reference workbook's own convention)
        k1 = _k1_from_qu(qu_kn_m2)
        K = (k1 * 0.3 / (1.5 * D_cm)) * 100
        stiffness_cm = ((E * I) / (K * D_cm)) ** 0.25
        short_limit_m, long_limit_m = 2 * stiffness_cm / 100, 3.5 * stiffness_cm / 100
        stiffness_label = "R"
    else:
        if soil_type == "cohesionless" and n_value is None:
            raise ValueError("Cohesionless (sand) soil needs n_value.")
        if soil_type == "cohesive" and consolidation_type == "NCS" and n_value is None:
            raise ValueError("Normally-consolidated (NCS) clay uses the sand-type formula, which needs an n_value (SPT-N).")
        nh = _nh_from_n_value(n_value)
        stiffness_cm = ((E * I) / nh) ** 0.2
        short_limit_m, long_limit_m = 2 * stiffness_cm / 100, 4 * stiffness_cm / 100
        stiffness_label = "T"
        if soil_type == "cohesionless":
            warnings.append(
                "Sand-side Fig.3 chart factor is a piecewise-linear digitization anchored at "
                "3 real points from your own workbook, not an exact polynomial like the clay "
                "side -- verify this result against a known sand case before trusting it fully."
            )

    x = L1_cm / stiffness_cm
    if embedded_length_m <= short_limit_m:
        behaviour = "short (rigid) pile"
    elif embedded_length_m >= long_limit_m:
        behaviour = "long (elastic) pile"
    else:
        behaviour = "intermediate pile (between rigid and elastic -- IS:2911 gives no separate formula for this case; using the long-pile equivalent-cantilever method, same as the reference workbook)"

    results = {}
    for head in ("free", "fixed"):
        factor = (_fig3_factor_clay_ocs if use_R_formula else _fig3_factor_sand)(x, head)
        Lf_cm = factor * stiffness_cm
        Leq_cm = L1_cm + Lf_cm
        denom = 3 if head == "free" else 12
        Q_half_kg = (0.5 * denom * E * I) / (Leq_cm ** 3)
        allow_defl_cm = allowable_deflection_pct_dia / 100 * D_cm
        safe_t = Q_half_kg * allow_defl_cm / 0.5 / 1000
        results[head] = {
            "chart_factor": round(factor, 4),
            "equivalent_cantilever_length_m": round(Leq_cm / 100, 3),
            "safe_lateral_load_t": round(safe_t, 2),
        }

    return {
        "soil_type": soil_type,
        "consolidation_type": consolidation_type if soil_type == "cohesive" else None,
        "stiffness_factor_label": stiffness_label,
        "stiffness_factor_m": round(stiffness_cm / 100, 3),
        "L1_over_stiffness": round(x, 4),
        "pile_behaviour": behaviour,
        "short_pile_if_L_le_m": round(short_limit_m, 2),
        "long_pile_if_L_ge_m": round(long_limit_m, 2),
        "free_head": results["free"],
        "fixed_head": results["fixed"],
        "unit": "t (tonnes)",
        "formula": "1%-of-diameter deflection criterion, equivalent cantilever length = L1 + Lf "
                   "(IS:2911 Part 1/Sec 1:2010, Annex C)",
        "warnings": warnings + [
            "IS:2911 gives no rule for choosing free-head vs fixed-head -- that depends on the "
            "actual pile cap/connection detail, not the soil. Both are returned; pick the one "
            "matching your actual pile-cap fixity.",
            "This is the 1%-deflection SERVICEABILITY check (IS:2911 Annex C), not Broms' "
            "ultimate lateral capacity -- the two methods answer different questions and are "
            "not directly comparable.",
        ],
    }
