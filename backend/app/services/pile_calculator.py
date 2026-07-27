"""
Pile Foundation Design Module -- Phase 1 (bored cast-in-situ pile, compression
+ uplift capacity, static formula method), per Raahi's spec doc + a real
project reference workbook (New Delhi Railway Station redevelopment,
IS-2911 Part-1 Sec-2:2010 / IRC:78:2014).

Reuses the SAME BoreholeProfile/SoilLayer data and missing-data fallback
helpers (_founding_layer, _resolve_field) already used by the batch SBC and
liquefaction calculators -- no separate Excel import needed, Raahi's existing
lab-data upload already feeds this.

Units: cohesion in t/m2, density in t/m3, angles in degrees, depths in m --
same convention as the rest of calculators.py. The reference workbook uses
kg/cm2 -- converted where the formula is quoted (1 kg/cm2 = 10 t/m2).

WHAT THIS COVERS (Phase 1):
- Bored cast-in-situ pile, single pile, compression + uplift capacity
- IS 2911 (Part 1 / Sec 2, 2010) and IRC:78 (2014) skin friction methods
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

from app.services.calculators import _founding_layer, _resolve_field


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
        "code": "IS 2911 Part-1 Sec-2:2010" if code == "IS_2911" else "IRC:78:2014",
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
