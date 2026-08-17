"""
Engineering calculators with real, textbook formulas -- not LLM-generated numbers.
Every function returns {result, unit, steps: [...], formula, assumptions, warnings}
so the frontend can show full working, per the "show step-by-step calculations" and
"never fabricate equations" requirements.

Only a first slice of the requested 16 calculators is implemented with full rigor here.
The remaining calculator types are registered as stubs in routers/calculators.py with a
clear "not yet implemented" response -- see README "Extending the calculators" section.
"""
import math
import types


def terzaghi_bearing_capacity(phi_deg: float, cohesion_kpa: float, gamma_kn_m3: float,
                                width_m: float, depth_m: float, shape: str = "strip") -> dict:
    """Terzaghi (1943) general bearing capacity theory (strip/square/circular footings)."""
    phi = math.radians(phi_deg)
    steps = []

    if phi_deg == 0:
        Nq = 1.0
        Nc = 5.7
        Ngamma = 0.0
        steps.append("phi = 0 (undrained/purely cohesive case): Nc = 5.7, Nq = 1.0, Nγ = 0")
    else:
        Nq = (math.e ** (2 * (3 * math.pi / 4 - phi / 2) * math.tan(phi))) / (2 * (math.cos(math.radians(45) + phi / 2)) ** 2)
        Nc = (Nq - 1) / math.tan(phi)
        Ngamma = (Nq - 1) * math.tan(1.4 * phi)
        steps.append(f"Nq computed from Terzaghi's Nq = e^(2(3π/4 - φ/2)tanφ) / (2cos²(45+φ/2)) = {Nq:.2f}")
        steps.append(f"Nc = (Nq - 1)/tanφ = {Nc:.2f}")
        steps.append(f"Nγ = (Nq - 1)tan(1.4φ) (Terzaghi approximation) = {Ngamma:.2f}")

    if shape == "strip":
        sc, sq, sgamma = 1.0, 1.0, 1.0
    elif shape == "square":
        sc, sq, sgamma = 1.3, 1.0, 0.8
    elif shape == "circular":
        sc, sq, sgamma = 1.3, 1.0, 0.6
    else:
        sc, sq, sgamma = 1.0, 1.0, 1.0

    q = gamma_kn_m3 * depth_m
    qu = sc * cohesion_kpa * Nc + sq * q * Nq + sgamma * 0.5 * gamma_kn_m3 * width_m * Ngamma
    steps.append(f"Surcharge q = γ·Df = {gamma_kn_m3} × {depth_m} = {q:.2f} kPa")
    steps.append(f"qu = {sc}×c×Nc + {sq}×q×Nq + {sgamma}×0.5×γ×B×Nγ = {qu:.2f} kPa")

    return {
        "result": round(qu, 2),
        "unit": "kPa",
        "formula": "qu = sc·c·Nc + sq·q·Nq + 0.5·sγ·γ·B·Nγ  (Terzaghi, 1943)",
        "steps": steps,
        "assumptions": [
            f"Footing shape: {shape}",
            "General shear failure assumed (dense/stiff soil)",
            "Water table below failure zone (no buoyancy correction applied)",
        ],
        "warnings": [
            "Apply a factor of safety of 2.5–3.0 on qu to get the safe bearing capacity.",
            "For loose/soft soils, check local shear failure case separately.",
        ],
    }


def immediate_settlement(q_kpa: float, width_m: float, es_kpa: float, mu: float, If: float = 0.85) -> dict:
    """Elastic (immediate) settlement, e.g. per Bowles: Se = q·B·(1-μ²)·If / Es."""
    se_m = q_kpa * width_m * (1 - mu ** 2) * If / es_kpa
    steps = [
        f"Se = q·B·(1-μ²)·If / Es",
        f"= {q_kpa} × {width_m} × (1 - {mu}^2) × {If} / {es_kpa}",
        f"= {se_m:.5f} m = {se_m*1000:.2f} mm",
    ]
    return {
        "result": round(se_m * 1000, 2),
        "unit": "mm",
        "formula": "Se = q·B·(1-μ²)·If / Es",
        "steps": steps,
        "assumptions": ["Flexible footing influence factor If ≈ 0.85 unless specified", "Homogeneous elastic half-space assumed"],
        "warnings": ["Elastic settlement alone may understate total settlement in clays — add consolidation settlement."],
    }


def consolidation_settlement(cc: float, e0: float, h_m: float, sigma0_kpa: float, delta_sigma_kpa: float, cr: float | None = None, sigma_c_kpa: float | None = None) -> dict:
    """Primary consolidation settlement (normally consolidated, or OC with Cr/σc' if given)."""
    steps = []
    if cr is not None and sigma_c_kpa is not None and sigma0_kpa < sigma_c_kpa:
        sc1 = (cr * h_m / (1 + e0)) * math.log10(sigma_c_kpa / sigma0_kpa)
        sc2 = 0.0
        if sigma0_kpa + delta_sigma_kpa > sigma_c_kpa:
            sc2 = (cc * h_m / (1 + e0)) * math.log10((sigma0_kpa + delta_sigma_kpa) / sigma_c_kpa)
        sc_m = sc1 + sc2
        steps.append("Overconsolidated soil: recompression (Cr) below σc', virgin compression (Cc) above σc'")
        steps.append(f"Sc(recompression) = Cr·H/(1+e0)·log10(σc'/σ0') = {sc1:.5f} m")
        steps.append(f"Sc(virgin) = Cc·H/(1+e0)·log10((σ0'+Δσ)/σc') = {sc2:.5f} m")
    else:
        sc_m = (cc * h_m / (1 + e0)) * math.log10((sigma0_kpa + delta_sigma_kpa) / sigma0_kpa)
        steps.append("Normally consolidated soil case")
        steps.append(f"Sc = Cc·H/(1+e0)·log10((σ0'+Δσ)/σ0') = {sc_m:.5f} m")

    return {
        "result": round(sc_m * 1000, 2),
        "unit": "mm",
        "formula": "Sc = Cc·H/(1+e0)·log10((σ0'+Δσ)/σ0')  [Terzaghi 1D consolidation theory]",
        "steps": steps,
        "assumptions": ["One-dimensional consolidation", "Cc, e0 taken from lab oedometer test data"],
        "warnings": ["Verify H is the clay layer thickness at mid-plane, and stresses are effective stresses."],
    }


def spt_correction(n_field: int, sigma_eff_kpa: float, hammer_energy_ratio: float = 0.6,
                     rod_length_m: float = 10, borehole_dia_mm: float = 100, sampler: str = "standard") -> dict:
    """N60 energy correction + Liao-Whitney overburden correction to N1(60)."""
    Ce = hammer_energy_ratio / 0.6  # normalize to 60% rod energy
    Cb = 1.0 if borehole_dia_mm <= 120 else (1.05 if borehole_dia_mm <= 150 else 1.15)
    Cr = 0.75 if rod_length_m < 4 else (0.85 if rod_length_m < 6 else (0.95 if rod_length_m < 10 else 1.0))
    Cs = 1.0 if sampler == "standard" else 1.2

    n60 = n_field * Ce * Cb * Cr * Cs
    cn = min(1.7, math.sqrt(95.76 / max(sigma_eff_kpa, 1)))  # Liao & Whitney (1986), σ'v in kPa (95.76 kPa ≈ 1 tsf)
    n160 = n60 * cn

    steps = [
        f"Ce (energy) = {hammer_energy_ratio}/0.6 = {Ce:.2f}",
        f"Cb (borehole dia) = {Cb}",
        f"Cr (rod length) = {Cr}",
        f"Cs (sampler) = {Cs}",
        f"N60 = N_field × Ce × Cb × Cr × Cs = {n60:.2f}",
        f"CN (overburden, Liao & Whitney 1986) = sqrt(95.76/σ'v) capped at 1.7 = {cn:.2f}",
        f"N1(60) = N60 × CN = {n160:.2f}",
    ]

    return {
        "result": round(n160, 1),
        "unit": "blows (N1(60))",
        "formula": "N1(60) = N_field × Ce × Cb × Cr × Cs × CN",
        "steps": steps,
        "assumptions": ["Standard split-spoon sampler unless specified", "σ'v is effective overburden stress at test depth"],
        "warnings": ["CN correction capped at 1.7 per common practice — verify against your reference standard."],
    }


def rankine_earth_pressure(gamma_kn_m3: float, height_m: float, phi_deg: float, surcharge_kpa: float = 0, condition: str = "active") -> dict:
    phi = math.radians(phi_deg)
    if condition == "active":
        k = (1 - math.sin(phi)) / (1 + math.sin(phi))
        label = "Ka"
    else:
        k = (1 + math.sin(phi)) / (1 - math.sin(phi))
        label = "Kp"

    pressure_at_base = k * (gamma_kn_m3 * height_m + surcharge_kpa)
    resultant_force = 0.5 * k * gamma_kn_m3 * height_m ** 2 + k * surcharge_kpa * height_m

    steps = [
        f"{label} = (1 {'-' if condition=='active' else '+'} sinφ)/(1 {'+' if condition=='active' else '-'} sinφ) = {k:.3f}",
        f"Pressure at base = {label}·(γH + q) = {pressure_at_base:.2f} kPa",
        f"Resultant force per metre run = 0.5·{label}·γ·H² + {label}·q·H = {resultant_force:.2f} kN/m",
    ]

    return {
        "result": round(resultant_force, 2),
        "unit": "kN/m (resultant lateral force)",
        "formula": f"Rankine {condition} earth pressure theory",
        "steps": steps,
        "assumptions": ["Vertical wall back, horizontal backfill, cohesionless soil (c=0)"],
        "warnings": ["For cohesive backfill, Rankine theory needs a tension-crack correction — not applied here."],
    }


def bearing_capacity_is6403_shear(
    length_m: float, width_m: float, depth_m: float,
    cohesion_t_m2: float, phi_deg: float,
    gamma_avg_above_t_m3: float, gamma_at_base_t_m3: float,
    specific_gravity: float, moisture_content_pct: float,
    water_table_depth_m: float,
    shape: str = "square", fos: float = 2.5, scour_correction_m: float = 0.0,
) -> dict:
    """
    Net safe bearing capacity per IS:6403-1981, matching a real project workbook
    (Terzaghi/Meyerhof factors, shape + depth factors, water-table correction,
    and interpolation between general and local shear failure based on void
    ratio). All units t/m2, t/m3 per Indian geotechnical practice convention
    -- this mirrors the source spreadsheet's units exactly rather than
    converting to kPa/kN, so results are directly comparable to it.
    """
    steps = []
    phi = math.radians(phi_deg)

    # Local-shear-failure reduced friction angle and cohesion (Terzaghi)
    phi_local_deg = math.degrees(math.atan(0.67 * math.tan(phi))) if phi_deg != 0 else 0
    phi_local = math.radians(phi_local_deg)
    steps.append(f"Local shear φ' = atan(0.67·tanφ) = {phi_local_deg:.2f}°")

    # Dry density and void ratio -> decides general vs local vs intermediate shear
    gamma_dry = gamma_at_base_t_m3 / (1 + moisture_content_pct / 100)
    void_ratio = specific_gravity / gamma_dry - 1
    steps.append(f"Dry density γd = γbulk/(1+w/100) = {gamma_dry:.3f} t/m³")
    steps.append(f"Void ratio e = G/γd - 1 = {void_ratio:.3f}")

    def bearing_factors(phi_rad, phi_deg_val, nc_at_zero):
        if phi_deg_val == 0:
            return nc_at_zero, 1.0, 0.0
        Nq = math.tan(math.radians(45) + phi_rad / 2) ** 2 * math.exp(math.pi * math.tan(phi_rad))
        Nc = (Nq - 1) / math.tan(phi_rad)
        Ngamma = 2 * (Nq + 1) * math.tan(phi_rad)
        return Nc, Nq, Ngamma

    # Reference workbook (Shear!H26 vs Shear!H29) uses a DIFFERENT Nc constant at phi=0
    # for general shear (5.14, classic Prandtl) vs local shear (5.7) -- not the same value.
    Nc, Nq, Ngamma = bearing_factors(phi, phi_deg, nc_at_zero=5.14)
    Ncl, Nql, Ngammal = bearing_factors(phi_local, phi_local_deg, nc_at_zero=5.7)
    steps.append(f"General shear: Nc={Nc:.2f}, Nq={Nq:.2f}, Nγ={Ngamma:.2f}")
    steps.append(f"Local shear: N'c={Ncl:.2f}, N'q={Nql:.2f}, N'γ={Ngammal:.2f}")

    shape = shape.lower()
    if shape == "strip":
        Sc, Sq, Sgamma = 1.0, 1.0, 1.0
    elif shape == "rectangular":
        Sc, Sq, Sgamma = 1 + 0.2 * width_m / length_m, 1 + 0.2 * width_m / length_m, 1 - 0.4 * width_m / length_m
    elif shape == "circular":
        Sc, Sq, Sgamma = 1.3, 1.2, 0.6
    else:  # square
        Sc, Sq, Sgamma = 1.3, 1.2, 0.8
    steps.append(f"Shape factors ({shape}): Sc={Sc:.2f}, Sq={Sq:.2f}, Sγ={Sgamma:.2f}")

    D_eff = depth_m - scour_correction_m
    dc = 1 + 0.2 * D_eff / width_m * math.tan(math.radians(45) + phi_deg / 2 / 180 * math.pi) if width_m else 1.0
    dq = 1.0 if phi_deg < 10 else 1 + 0.1 * D_eff / width_m * math.tan(math.radians(45) + phi_deg / 2 / 180 * math.pi)
    dgamma = dq
    steps.append(f"Depth factors: dc={dc:.3f}, dq={dgamma:.3f} (dγ=dq)")

    # Water table correction factor Rw applied to the Nγ term
    if water_table_depth_m < depth_m:
        Rw = 0.5
    elif water_table_depth_m > depth_m + width_m:
        Rw = 1.0
    else:
        Rw = (water_table_depth_m - depth_m) / width_m * 0.5 + 0.5
    steps.append(f"Water table correction Rw = {Rw:.3f}")

    def net_sbc(c_eff, Nc_, Nq_, Ngamma_):
        return (
            c_eff * Nc_ * Sc * dc
            + gamma_avg_above_t_m3 * D_eff * (Nq_ - 1) * Sq * dq
            + 0.5 * width_m * gamma_at_base_t_m3 * Ngamma_ * Sgamma * dgamma * Rw
        ) / fos

    qns_general = net_sbc(cohesion_t_m2, Nc, Nq, Ngamma)
    qns_local = net_sbc(0.67 * cohesion_t_m2, Ncl, Nql, Ngammal)
    steps.append(f"Qns (general shear) = {qns_general:.2f} t/m²")
    steps.append(f"Qns (local shear) = {qns_local:.2f} t/m²")

    if void_ratio < 0.55:
        qns_recommended = qns_general
        basis = "general shear (e < 0.55)"
    elif void_ratio > 0.75:
        qns_recommended = qns_local
        basis = "local shear (e > 0.75)"
    else:
        qns_recommended = qns_general + (qns_local - qns_general) / (0.75 - 0.55) * (void_ratio - 0.55)
        basis = f"interpolated between general/local shear (e={void_ratio:.2f})"
    steps.append(f"Recommended net SBC ({basis}) = {qns_recommended:.2f} t/m²")

    return {
        "result": round(qns_recommended, 2),
        "unit": "t/m² (net safe bearing capacity)",
        "formula": "Qns = (c·Nc·Sc·dc + γ·D·(Nq-1)·Sq·dq + 0.5·B·γ·Nγ·Sγ·dγ·Rw) / FOS  [IS:6403-1981]",
        "steps": steps,
        "assumptions": [
            f"Factor of safety = {fos}",
            "Inclination factors taken as 1 (vertical load only)",
            f"Footing shape: {shape}",
            "General/local shear interpolation uses void ratio thresholds e<0.55 (general) and e>0.75 (local), per the source workbook's convention",
        ],
        "warnings": [
            "This is net SBC (soil capacity only). For gross allowable SBC (what a structural engineer checks column loads against), add γ_avg_above × D to this value -- same convention as the reference workbook, which only does that addition once, on the final recommended (shear vs settlement, whichever governs) value, not on shear alone.",
            "This is the shear-capacity check only. Compare against the settlement-based SBC (separate calculation, IS:8009) and take the lower of the two as final.",
        ],
    }


def _fox_depth_correction_factor(length_m: float, width_m: float, depth_m: float) -> float:
    """
    Fox (1948) depth correction factor, digitized as a 4th-order polynomial
    curve-fit -- exact formula lifted from the source workbook rather than
    re-derived, since it reproduces the published Fox chart directly.
    """
    sqrt_lb = math.sqrt(length_m * width_m)
    if sqrt_lb == 0:
        return 1.0
    type_a = depth_m <= sqrt_lb
    n = (depth_m / sqrt_lb) if type_a else (sqrt_lb / depth_m)

    def curve_l_b_1(n_):
        return -0.34 * n_**4 + 0.8913 * n_**3 - 0.6881 * n_**2 - 0.1363 * n_ + 1 if type_a else \
               0.0754 * n_**4 - 0.1377 * n_**3 + 0.0313 * n_**2 + 0.2567 * n_ + 0.5

    def curve_l_b_9(n_):
        return -0.3119 * n_**4 + 0.5969 * n_**3 - 0.1889 * n_**2 - 0.3659 * n_ + 1 if type_a else \
               -0.0372 * n_**4 + 0.1257 * n_**3 - 0.2412 * n_**2 + 0.3485 * n_ + 0.5

    bp, bq = curve_l_b_1(n), curve_l_b_9(n)
    br = min(bq, (bp + bq) / 2)
    l_over_b = length_m / width_m

    if l_over_b == 1:
        return bp
    if l_over_b >= 5:
        return br
    return min(bp, bq) + abs(bp - bq) * (l_over_b - 1) / 4


def settlement_sbc_is8009_noncohesive(
    length_m: float, width_m: float, depth_m: float, n_value: float,
    allowable_settlement_mm: float, water_table_depth_m: float,
    rigidity_factor: float = 1.0, influence_depth_m: float | None = None,
) -> dict:
    """
    SBC for a specified allowable settlement, for granular (non-cohesive, SPT
    N-value characterized) soil, per IS:8009 Part-1. Matches a real project
    workbook: IS:8009 Fig-9 chart (digitized curve-fit) for settlement per
    10 t/m2, corner-point Boussinesq stress influence factor, water-table
    correction, and Fox (1948) depth correction.

    influence_depth_m: depth of influence zone below the footing. Defaults to
    1.5*B (the usual assumption) but can be overridden -- e.g. when a rock
    layer, a known stiff stratum, or site-specific data justifies a different
    zone of influence.

    Simplification vs the source workbook: treats the full depth of
    influence as ONE representative layer with a single average N-value,
    rather than true layer-by-layer stratification. This matches real
    practice for a reasonably uniform granular profile; for a strongly
    layered profile, a full multi-layer version would be needed (not yet built).
    """
    if n_value <= 3:
        raise ValueError("N-value must be greater than 3 for the IS:8009 Fig-9 settlement chart to apply.")

    steps = []
    influence_depth = influence_depth_m if influence_depth_m is not None else 1.5 * width_m
    z_below_footing = 0.5 * influence_depth  # depth below the FOOTING BASE (where the load bulb originates), not below ground surface
    steps.append(f"Depth of influence = {'manual override' if influence_depth_m is not None else '1.5·B'} = {influence_depth:.2f} m below footing")
    steps.append(f"Representative mid-depth for stress calc, below footing base, z = 0.5·(influence depth) = {z_below_footing:.2f} m")

    # Corner-point Boussinesq stress influence factor for a rectangular loaded area
    F = math.sqrt((length_m / 2) ** 2 + z_below_footing ** 2)
    G = math.sqrt((width_m / 2) ** 2 + z_below_footing ** 2)
    H = math.sqrt((length_m / 2) ** 2 + (width_m / 2) ** 2 + z_below_footing ** 2)
    P = (4 / (2 * math.pi)) * (
        math.atan((0.25 * length_m * width_m) / (z_below_footing * H))
        + (0.25 * length_m * width_m * z_below_footing / H) * (1 / F ** 2 + 1 / G ** 2)
    )
    steps.append(f"Boussinesq stress influence factor Iz = {P:.4f}")

    # Water table correction (0.5 at/above founding level, scaling to 1.0 at base of influence zone)
    if water_table_depth_m <= depth_m:
        Aw = 0.5
    elif water_table_depth_m >= depth_m + influence_depth:
        Aw = 1.0
    else:
        Aw = 0.5 + 0.5 * (water_table_depth_m - depth_m) / influence_depth
    steps.append(f"Water table correction factor = {Aw:.3f}")

    # IS:8009 Fig-9: settlement (mm) for a 10 t/m2 applied pressure
    settlement_at_10t = 10 / (0.1385 * (n_value - 3) * ((width_m + 0.3) / (2 * width_m)) ** 2)
    steps.append(f"IS:8009 Fig-9: settlement at 10 t/m² = {settlement_at_10t:.3f} mm (for N={n_value})")

    fox_factor = _fox_depth_correction_factor(length_m, width_m, depth_m)
    steps.append(f"Fox (1948) depth correction factor = {fox_factor:.3f}")

    # Settlement per unit (1 t/m²) applied pressure, after water-table and depth corrections
    unit_settlement_mm = (settlement_at_10t * P / (10 * Aw)) * fox_factor * rigidity_factor
    steps.append(f"Settlement per 1 t/m² applied pressure = {unit_settlement_mm:.4f} mm")

    if unit_settlement_mm <= 0:
        raise ValueError("Computed settlement per unit pressure is zero or negative -- check inputs.")

    sbc_settlement = allowable_settlement_mm / unit_settlement_mm
    steps.append(f"SBC for {allowable_settlement_mm} mm allowable settlement = {allowable_settlement_mm}/{unit_settlement_mm:.4f} = {sbc_settlement:.2f} t/m²")

    return {
        "result": round(sbc_settlement, 2),
        "unit": "t/m² (SBC for specified allowable settlement)",
        "formula": "IS:8009 Fig-9 (N-value chart) + Boussinesq stress influence + Fox depth correction",
        "steps": steps,
        "assumptions": [
            "Non-cohesive (granular) soil only -- N-value based method",
            "Entire depth of influence (Df + 1.5B) treated as one representative layer with a single average N-value",
            f"Rigidity factor = {rigidity_factor}",
        ],
        "warnings": [
            "For clay/cohesive soils, a different method (consolidation settlement via Cc/e0) is required -- not this calculator.",
            "Compare against the shear-based SBC (IS:6403 calculator) and take the LOWER of the two as the final recommended SBC.",
            "For a strongly stratified profile (very different N-values by depth), a full multi-layer analysis would be more accurate than this single-layer simplification.",
        ],
    }


def settlement_sbc_is8009_cohesive(
    length_m: float, width_m: float, depth_m: float,
    elastic_modulus_t_m2: float, compression_index_cc: float, initial_void_ratio_e0: float,
    gamma_avg_above_t_m3: float, allowable_settlement_mm: float,
    consolidation_type: str = "NCS", layer_thickness_m: float | None = None,
    rigidity_factor: float = 1.0,
) -> dict:
    """
    SBC for a specified allowable settlement, for cohesive (clay) soil, per
    IS:8009 Part-1 -- matches the source workbook's method: an elastic
    (immediate) settlement component via a Steinbrenner-type influence factor,
    plus a consolidation settlement component (either the simple
    over-consolidated/OCS formula using elastic modulus, or the normally-
    consolidated/NCS logarithmic Cc formula), combined for the total.

    elastic_modulus_t_m2: undrained/elastic modulus Es of the clay (t/m²) --
    e.g. from a correlation like Es = 30*(N+6) (Bowles) or from lab data.
    layer_thickness_m: clay layer thickness considered. Defaults to 1.5*B
    (matching the granular calculator's default influence zone) but can be
    overridden for a known layer boundary (e.g. a stiffer stratum below).

    Simplification vs the source workbook: single representative layer
    (not true multi-layer stratification), and Cc/e0/Es are single
    representative values for that layer rather than per-sub-layer lab data.
    """
    consolidation_type = consolidation_type.upper()
    if consolidation_type not in ("OCS", "NCS"):
        raise ValueError("consolidation_type must be 'OCS' (over-consolidated) or 'NCS' (normally consolidated).")

    steps = []
    H = layer_thickness_m if layer_thickness_m is not None else 1.5 * width_m
    z_mid_surface = depth_m + 0.5 * H  # for overburden stress, measured from ground surface
    z_below_footing = 0.5 * H  # for Boussinesq/Steinbrenner, measured from the FOOTING BASE (where the load bulb originates)
    steps.append(f"Clay layer thickness H = {'manual override' if layer_thickness_m is not None else '1.5·B'} = {H:.2f} m")
    steps.append(f"Mid-depth from surface (for overburden) z = D + 0.5·H = {z_mid_surface:.2f} m")

    # Effective overburden stress at mid-depth (P0)
    P0 = gamma_avg_above_t_m3 * z_mid_surface
    steps.append(f"Effective overburden stress P0 = γ_avg·z = {P0:.3f} t/m²")

    # Boussinesq corner-point stress influence factor (same as the granular calculator) -- depth below the FOOTING BASE
    F = math.sqrt((length_m / 2) ** 2 + z_below_footing ** 2)
    G = math.sqrt((width_m / 2) ** 2 + z_below_footing ** 2)
    Hc = math.sqrt((length_m / 2) ** 2 + (width_m / 2) ** 2 + z_below_footing ** 2)
    Iz = (4 / (2 * math.pi)) * (
        math.atan((0.25 * length_m * width_m) / (z_below_footing * Hc))
        + (0.25 * length_m * width_m * z_below_footing / Hc) * (1 / F ** 2 + 1 / G ** 2)
    )
    steps.append(f"Boussinesq stress influence factor Iz = {Iz:.4f}")

    # Elastic (immediate) settlement influence factor -- Steinbrenner-type closed form
    m = length_m / width_m
    n = H / width_m
    M = m * math.log(
        (1 + math.sqrt(1 + m ** 2)) * math.sqrt(m ** 2 + n ** 2)
        / (m * (1 + math.sqrt(1 + m ** 2 + n ** 2)))
    )
    N = math.log(
        (m + math.sqrt(1 + m ** 2)) * math.sqrt(1 + n ** 2)
        / (m + math.sqrt(1 + m ** 2 + n ** 2))
    )
    O = (4 / math.pi) * (M + N)
    steps.append(f"Elastic settlement influence factor = {O:.4f}")

    fox_factor = _fox_depth_correction_factor(length_m, width_m, depth_m)
    steps.append(f"Fox (1948) depth correction factor = {fox_factor:.3f}")

    # Per unit (1 t/m²) applied pressure:
    elastic_unit_mm = width_m * 0.75 * O / elastic_modulus_t_m2 * 1000
    steps.append(f"Elastic settlement per 1 t/m² = {elastic_unit_mm:.4f} mm")

    if consolidation_type == "OCS":
        mv = 1 / elastic_modulus_t_m2
        consolidation_unit_mm = 1000 * mv * H * Iz
        steps.append(f"OCS consolidation settlement per 1 t/m² = 1000·mv·H·Iz = {consolidation_unit_mm:.4f} mm")
    else:
        # NCS (normally consolidated): logarithmic Cc formula. Evaluated at a
        # small reference pressure increment (1 t/m²) since the log term is
        # not perfectly linear in q -- this is the standard practice
        # approximation for expressing it as a per-unit-pressure rate.
        delta_sigma_ref = 1.0 * Iz
        consolidation_unit_mm = (H / (1 + initial_void_ratio_e0)) * compression_index_cc * math.log10((P0 + delta_sigma_ref) / P0) * 1000
        steps.append(f"NCS consolidation settlement per 1 t/m² = (H/(1+e0))·Cc·log10((P0+Δσ)/P0) = {consolidation_unit_mm:.4f} mm")

    total_unit_mm = (elastic_unit_mm + consolidation_unit_mm) * fox_factor * rigidity_factor
    steps.append(f"Total settlement per 1 t/m² (after Fox + rigidity factors) = {total_unit_mm:.4f} mm")

    if total_unit_mm <= 0:
        raise ValueError("Computed settlement per unit pressure is zero or negative -- check inputs.")

    sbc_settlement = allowable_settlement_mm / total_unit_mm
    steps.append(f"SBC for {allowable_settlement_mm} mm allowable settlement = {allowable_settlement_mm}/{total_unit_mm:.4f} = {sbc_settlement:.2f} t/m²")

    return {
        "result": round(sbc_settlement, 2),
        "unit": "t/m² (SBC for specified allowable settlement)",
        "formula": f"IS:8009 elastic settlement + {consolidation_type} consolidation settlement",
        "steps": steps,
        "assumptions": [
            "Cohesive (clay) soil only",
            f"Consolidation type: {consolidation_type}",
            "Single representative layer (not full multi-layer stratification)",
            f"Rigidity factor = {rigidity_factor}",
        ],
        "warnings": [
            "For granular/non-cohesive soils, use the IS:8009 (Granular) calculator instead.",
            "Compare against the shear-based SBC (IS:6403 calculator) and take the LOWER of the two as the final recommended SBC.",
            "NCS consolidation settlement is evaluated as a rate at low reference pressure -- for very large applied pressures, the true log-curve is not perfectly linear; treat results as a good approximation, not exact at all load levels.",
        ],
    }


def _founding_layer(layers: list, depth_m: float):
    """The layer whose [from_m, to_m) contains depth_m. If depth_m falls
    outside every recorded layer, clamps to the nearest one:
    - shallower than the shallowest layer -> the shallowest layer
    - deeper than the deepest layer -> the deepest layer
    - in a GAP between two consecutive layers (common in real borehole logs,
      e.g. un-sampled intervals between SPT test depths) -> whichever of the
      two neighbouring layers has the CLOSER boundary, not blindly the
      deepest layer in the whole borehole. (This was a real bug: a depth
      landing in a shallow gap was incorrectly treated the same as "beyond
      the last layer", jumping to the deepest layer recorded anywhere in the
      borehole even when that was tens of metres away.)
    """
    ordered = sorted(layers, key=lambda l: l.from_m)
    for l in ordered:
        if l.from_m <= depth_m < l.to_m:
            return l
    if depth_m < ordered[0].from_m:
        return ordered[0]
    if depth_m >= ordered[-1].to_m:
        return ordered[-1]
    for i in range(len(ordered) - 1):
        if ordered[i].to_m <= depth_m < ordered[i + 1].from_m:
            dist_prev = depth_m - ordered[i].to_m
            dist_next = ordered[i + 1].from_m - depth_m
            return ordered[i] if dist_prev <= dist_next else ordered[i + 1]
    return ordered[-1]


def _resolve_field(layers: list, founding, field: str):
    """
    founding layer's own value if it has one; else the nearest layer above
    and/or below (by mid-depth distance) that has this field -- averaged if
    layers on both sides have it, else whichever single side does; else a
    full borehole-wide average of every layer that has the field at all.
    Returns (value, source_note); value is None only if no layer anywhere in
    the borehole has this field.
    """
    direct = getattr(founding, field, None)
    if direct is not None:
        return direct, f"{founding.from_m}-{founding.to_m}m (this layer)"

    mid = (founding.from_m + founding.to_m) / 2
    above = [l for l in layers if getattr(l, field, None) is not None and (l.from_m + l.to_m) / 2 < mid]
    below = [l for l in layers if getattr(l, field, None) is not None and (l.from_m + l.to_m) / 2 > mid]
    nearest_above = max(above, key=lambda l: (l.from_m + l.to_m) / 2) if above else None
    nearest_below = min(below, key=lambda l: (l.from_m + l.to_m) / 2) if below else None

    if nearest_above and nearest_below:
        v = (getattr(nearest_above, field) + getattr(nearest_below, field)) / 2
        return v, f"avg of {nearest_above.from_m}-{nearest_above.to_m}m & {nearest_below.from_m}-{nearest_below.to_m}m (nearest layers)"
    if nearest_above:
        return getattr(nearest_above, field), f"{nearest_above.from_m}-{nearest_above.to_m}m (nearest layer above)"
    if nearest_below:
        return getattr(nearest_below, field), f"{nearest_below.from_m}-{nearest_below.to_m}m (nearest layer below)"

    all_vals = [getattr(l, field) for l in layers if getattr(l, field, None) is not None]
    if all_vals:
        return sum(all_vals) / len(all_vals), "borehole average (no nearby layer had this)"
    return None, "missing"


def _weighted_overburden(layers: list, depth_m: float, field: str = "bulk_density_t_m3"):
    """Thickness-weighted average of `field` across every layer from ground
    level (0m) down to depth_m. This is what 'average density above the
    footing' means physically -- a genuinely borehole-wide quantity spanning
    every layer down to the founding depth, not one layer's property."""
    total_t, weighted = 0.0, 0.0
    for l in layers:
        top, bottom = max(0.0, l.from_m), min(depth_m, l.to_m)
        if bottom <= top:
            continue
        v = getattr(l, field, None)
        if v is None:
            continue
        t = bottom - top
        weighted += v * t
        total_t += t
    return (weighted / total_t) if total_t > 0 else None


# Shared cap for how many (width, depth) combinations / exact-pair cases a
# single Batch request may contain -- ONE definition, used by BOTH grid mode
# (run_batch_matrix) and exact-pairs mode (run_batch_cases), and imported by
# routers/calculators.py for both endpoints' pre-checks, so the limit can
# never drift out of sync between the two modes (Step 2, Aug 2026 -- the
# audit flagged this as two independent hardcoded "400"s; now there's one).
MAX_BATCH_CASES = 400


def _validate_positive_finite(name: str, value) -> float:
    """Software/input validation only -- NOT an engineering judgement call.
    Rejects what can never be a valid footing dimension (missing, non-numeric,
    NaN/Infinity, zero, or negative) without imposing any engineering range
    limit (e.g. this does NOT decide phi must be under some threshold -- the
    audit was explicit that no such invented limits belong here). Raises
    ValueError with a clear message; callers catch this the same way they
    already catch every other per-case ValueError (missing soil data, etc.),
    so one bad value becomes a per-case error, not a whole-batch crash."""
    if value is None:
        raise ValueError(f"{name} is required.")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{name} must be a number (got {value!r}).")
    if math.isnan(value) or math.isinf(value):
        raise ValueError(f"{name} must be a finite number (got {value}).")
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero (got {value}).")
    return float(value)


# Attributes a "layer-like" object needs so it works with every existing
# calculator function below (_founding_layer, _resolve_field,
# _weighted_overburden, _cumulative_overburden_stress,
# run_settlement_multilayer) -- all of them read layers via plain getattr,
# never a real SQLAlchemy session, so a SimpleNamespace with these fields is
# a fully valid stand-in (same technique already used by
# tests/test_batch_analysis.py's make_layer()).
_LAYER_COPY_FIELDS = [
    "id", "from_m", "to_m", "description", "classification", "sample_id",
    "sample_type", "n_value", "bulk_density_t_m3", "specific_gravity",
    "moisture_content_pct", "cohesion_t_m2", "friction_angle_deg",
    "compression_index_cc", "initial_void_ratio_e0", "fines_content_pct",
    "rock_type", "weathering_grade", "core_recovery_pct", "rqd_pct", "ucs_kg_cm2",
]

_REPLACEMENT_SOIL_ID = "__replacement__"


def _finite_or_none(name: str, value):
    """Like _validate_positive_finite but allows None (field simply wasn't
    given -- falls back to the existing nearest-layer/average resolution,
    same as any other missing SoilLayer field) and allows zero/negative
    (cohesion=0 or phi=0 are legitimate soil properties, e.g. a pure-sand
    replacement fill has c=0). Only rejects genuinely broken input: wrong
    type, NaN, or Infinity."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Replacement {name} must be a number (got {value!r}).")
    if math.isnan(value) or math.isinf(value):
        raise ValueError(f"Replacement {name} must be a finite number (got {value}).")
    return float(value)


def _validate_replacement_config(replacement: dict | None, layers: list) -> dict:
    """Step 3 (Soil Replacement) -- validates one case's replacement config.
    Pure validation, does NOT touch the original borehole `layers` and does
    NOT build the effective profile (see `_build_effective_profile` for
    that). Returns a normalized dict; raises ValueError with a clear,
    human-readable message on bad input -- callers (`_run_one_batch_case`)
    already catch ValueError into a per-case "error" field, so a bad
    replacement config becomes a per-case error, never a whole-batch crash
    (same error-isolation guarantee as every other per-case validation).

    Required when enabled: `replacement_depth_m` (must be a positive finite
    number -- reuses `_validate_positive_finite`, the same validator already
    used for width/depth) and `bulk_density_t_m3` (also required: this is
    the one property that directly drives the overburden/surcharge term the
    replacement is specifically meant to change -- letting it silently fall
    back to the very soil being replaced would defeat the point of the
    feature). At least one of `cohesion_t_m2` / `friction_angle_deg` must
    also be given (a "soil" with neither is not a valid replacement
    material). Every other property (specific_gravity, moisture_content_pct,
    classification, compression_index_cc, initial_void_ratio_e0, n_value,
    fines_content_pct) is OPTIONAL and, if omitted, is resolved the exact
    same way any other layer's missing field already is -- via
    `_resolve_field`'s nearest-layer/borehole-average fallback -- since the
    replacement layer becomes just another entry in the effective profile.
    No arbitrary engineering range limits are imposed on any value here
    (e.g. phi is not range-checked) -- only "is this usable as a number".
    """
    if not replacement or not replacement.get("enabled"):
        return {"enabled": False}

    depth = _validate_positive_finite("replacement_depth_m", replacement.get("replacement_depth_m"))
    gamma = _validate_positive_finite("replacement bulk_density_t_m3", replacement.get("bulk_density_t_m3"))
    cohesion = _finite_or_none("cohesion_t_m2", replacement.get("cohesion_t_m2"))
    phi = _finite_or_none("friction_angle_deg", replacement.get("friction_angle_deg"))
    if cohesion is None and phi is None:
        raise ValueError(
            "Replacement soil needs at least cohesion_t_m2 or friction_angle_deg specified."
        )

    if not layers:
        raise ValueError("This borehole has no soil layers recorded -- cannot apply soil replacement.")
    max_profile_depth = max(l.to_m for l in layers)
    if depth > max_profile_depth:
        raise ValueError(
            f"Replacement depth ({depth}m) is beyond the available soil profile "
            f"(recorded only down to {max_profile_depth}m) -- add deeper borehole data "
            f"or reduce the replacement depth."
        )

    optional = {
        name: _finite_or_none(name, replacement.get(name))
        for name in (
            "specific_gravity", "moisture_content_pct", "compression_index_cc",
            "initial_void_ratio_e0", "n_value", "fines_content_pct",
        )
    }
    classification = replacement.get("classification")
    if classification is not None and not isinstance(classification, str):
        raise ValueError(f"Replacement classification must be text (got {classification!r}).")

    return {
        "enabled": True,
        "replacement_depth_m": depth,
        "bulk_density_t_m3": gamma,
        "cohesion_t_m2": cohesion,
        "friction_angle_deg": phi,
        "classification": classification,
        **optional,
    }


def _build_effective_profile(layers: list, validated_replacement: dict) -> list:
    """Step 3 (Soil Replacement) -- the ONLY place that turns a validated
    replacement config into an "effective soil profile" for calculation.
    Returns a NEW list; the original `layers` list/objects are never
    mutated, reordered, or removed -- this is what keeps the borehole's
    recorded lab data immutable no matter how many replacement cases run
    against it (see tests: original data immutability).

    Transformation (ground level 0m downward):
        0m .. replacement_depth_m  -> a synthetic replacement-soil layer
        replacement_depth_m .. end -> the ORIGINAL layers, clipped so none
                                      of them start above replacement_depth_m
                                      (a layer straddling the boundary is
                                      "split" by raising its effective
                                      from_m -- a NEW copy, never the stored
                                      object itself; a layer entirely above
                                      replacement_depth_m is dropped
                                      entirely, since it's fully replaced)

    This is deliberately the exact same clip-by-top/bottom technique already
    used elsewhere in this file (see run_settlement_multilayer's sub_layers
    construction) -- not a new pattern.

    If replacement is disabled, returns `layers` completely unchanged (same
    object, same order) -- this is what guarantees "Replacement OFF" is
    byte-for-byte identical to pre-Step-3 behavior.
    """
    if not validated_replacement.get("enabled"):
        return layers

    depth = validated_replacement["replacement_depth_m"]
    replacement_layer_data = {f: None for f in _LAYER_COPY_FIELDS}
    replacement_layer_data.update({
        "id": _REPLACEMENT_SOIL_ID,
        "from_m": 0.0,
        "to_m": depth,
        "description": "Engineered replacement soil (Batch case override -- not recorded borehole data)",
        "classification": validated_replacement.get("classification"),
        "n_value": validated_replacement.get("n_value"),
        "bulk_density_t_m3": validated_replacement["bulk_density_t_m3"],
        "specific_gravity": validated_replacement.get("specific_gravity"),
        "moisture_content_pct": validated_replacement.get("moisture_content_pct"),
        "cohesion_t_m2": validated_replacement.get("cohesion_t_m2"),
        "friction_angle_deg": validated_replacement.get("friction_angle_deg"),
        "compression_index_cc": validated_replacement.get("compression_index_cc"),
        "initial_void_ratio_e0": validated_replacement.get("initial_void_ratio_e0"),
        "fines_content_pct": validated_replacement.get("fines_content_pct"),
    })
    effective = [types.SimpleNamespace(**replacement_layer_data)]

    for l in sorted(layers, key=lambda x: x.from_m):
        if l.to_m <= depth:
            continue  # fully within the replaced zone -- dropped from the effective profile
        new_from = max(l.from_m, depth)
        if new_from >= l.to_m:
            continue
        clipped_data = {f: getattr(l, f, None) for f in _LAYER_COPY_FIELDS}
        clipped_data["from_m"] = new_from
        effective.append(types.SimpleNamespace(**clipped_data))

    return effective


# ---------------------------------------------------------------------------
# Step 5 (Calculation Method Selection, Aug 2026) -- bearing-capacity method
# registry for Batch Analysis.
#
# AUDIT (done before writing this code, see PROJECT_STATUS.md Step 5 section
# for the full trace): two bearing-capacity functions exist in this file --
# `bearing_capacity_is6403_shear` and `terzaghi_bearing_capacity`. Only
# IS:6403 is wired into the borehole-layer batch architecture (founding-layer
# auto-sourcing, water-table correction, soil-replacement compatibility,
# t/m² unit convention shared with the settlement engine's min()/governing
# comparison). `terzaghi_bearing_capacity` is a genuinely different, standalone
# calculator: different unit system (kPa/kN/m³ vs t/m²/t/m³), returns GROSS
# ultimate bearing capacity with NO factor-of-safety division applied inside
# it (the caller is expected to divide by 2.5-3.0 themselves -- see its own
# "warnings"), and its own docstring/assumptions say water-table buoyancy is
# NOT corrected for. Wiring it into Batch would mean either (a) silently
# passing it a t/m² cohesion as if it were kPa, wrong by a factor of ~9.81,
# or (b) writing a NEW adapter that converts units, applies an assumed FOS
# convention, and fabricates a water-table correction it was never given --
# that's inventing engineering behavior the source function doesn't have,
# which Step 5 explicitly forbids. So Terzaghi is deliberately NOT in this
# registry; it remains available standalone via CALCULATOR_REGISTRY /
# POST /api/calculators/run, just not as a Batch method option.
#
# This means, as of Step 5, there is exactly ONE verified batch-safe bearing
# method. The registry/validation plumbing below is still worth having now
# (clear "unsupported method" errors, a `method` field on every result row,
# room for a genuinely second method later) without inventing a second
# method today.
BEARING_METHOD_REGISTRY = {
    "IS_6403": bearing_capacity_is6403_shear,
}
BEARING_METHOD_LABELS = {
    "IS_6403": "IS:6403",
}
DEFAULT_BEARING_METHOD = "IS_6403"


def _validate_bearing_method(method: str | None) -> str:
    """Resolve a requested Batch bearing-capacity method name to a supported
    registry key, or raise ValueError with a clear message (mapped to HTTP
    422 by the router -- a request-shape error, not a per-case calculation
    error, so this must be called BEFORE any case starts calculating, never
    from inside `_run_one_batch_case`'s try/except).

    `None` (method not supplied at all) -> the existing default behavior
    (IS:6403), so every batch run made before Step 5 continues to behave
    identically.
    """
    if method is None:
        return DEFAULT_BEARING_METHOD
    key = str(method).strip().upper().replace("-", "_").replace(" ", "_")
    if key not in BEARING_METHOD_REGISTRY:
        supported = ", ".join(sorted(BEARING_METHOD_REGISTRY))
        raise ValueError(
            f"Unsupported calculation method '{method}' -- supported methods: {supported}."
        )
    return key


def _run_one_batch_case(
    layers: list, water_table_depth_m: float | None,
    width_m: float, depth_m: float, length_m: float | None,
    shape: str, fos: float, allowable_settlement_mm: float,
    consolidation_type: str, rigidity_factor: float, overrides: dict,
    case_id: str | None = None, replacement: dict | None = None,
    method: str = DEFAULT_BEARING_METHOD, configuration_id: str | None = None,
) -> dict:
    """One (width, depth) case's shear + settlement calculation -- the SHARED
    per-case engine used by both run_batch_matrix (grid/cross-product mode)
    and run_batch_cases (exact-pairs mode), added in the Step 2 refactor (Aug
    2026) specifically so the two modes can never silently drift apart in
    behavior; grid mode's own regression tests (test_batch_analysis.py) lock
    in that this refactor did not change grid mode's output at all.

    Bug fix included here (Step 2): the water table used by the shear call
    and the settlement call is now resolved ONCE, consistently -- previously
    (see PROJECT_STATUS.md audit) `bearing_capacity_is6403_shear` always got
    the borehole's raw `water_table_depth_m`, while `run_settlement_multilayer`
    got the overridden value if one was given, silently disagreeing with each
    other whenever an override was in play.

    Never raises past this point -- a `ValueError`/`ZeroDivisionError` from
    anywhere inside becomes an `"error"` key on the returned row instead,
    same as this logic behaved before the refactor (grid mode) and required
    for exact-pairs mode per Step 2 (one bad case must not kill the batch).
    """
    row = {"width_m": width_m, "depth_m": depth_m}
    if case_id is not None:
        row["case_id"] = case_id
    row["replacement_enabled"] = bool(replacement and replacement.get("enabled"))
    # Step 5: `method` reaching here is ALREADY validated by the caller
    # (run_batch_matrix / run_batch_cases, via `_validate_bearing_method`) --
    # this function only ever sees a known-good registry key, so a plain
    # dict lookup below is safe and never itself raises for a bad name.
    row["method"] = method
    # Step 6 (Formula Configuration & Versioning): `configuration_id` reaching
    # here is ALREADY resolved+validated by the router (see services/
    # configurations.py's resolve_effective_params -- this file stays
    # DB-session-free, same reasoning as Step 5's `method`) -- `fos`/
    # `allowable_settlement_mm`/`rigidity_factor`/`consolidation_type` above
    # are already the EFFECTIVE values (configuration overrides already
    # merged in by the caller). This is recorded here purely so the result
    # row is traceable/reproducible -- it plays no role in the calculation
    # itself, which only ever sees the plain scalar values above, exactly as
    # every calculation did before Step 6 existed.
    row["configuration_id"] = configuration_id
    row["resolved_parameters"] = {
        "fos": fos, "allowable_settlement_mm": allowable_settlement_mm,
        "rigidity_factor": rigidity_factor, "consolidation_type": consolidation_type,
    }
    # Step 7 (Full Calculation Traceability & Reproducibility, Aug 2026):
    # the RAW overrides dict this case actually ran with (batch-wide +
    # case-level already merged by the caller -- see run_batch_cases) --
    # set unconditionally, success or error, so even a case that fails
    # before founding-layer resolution still shows exactly what inputs it
    # was given. This is intentionally the small input dict, not the (much
    # larger) soil profile -- see `original_soil_profile`/
    # `effective_soil_profile` below for that, and PROJECT_STATUS.md's
    # Step 7 section for why these stay as lightweight per-row summaries
    # rather than a duplicated full profile dump (performance -- section 20
    # of the brief).
    row["overrides_applied"] = dict(overrides) if overrides else {}
    bearing_fn = BEARING_METHOD_REGISTRY[method]
    try:
        # Step 7: the ORIGINAL soil profile this case started from, before
        # any Step 3 replacement is applied -- a lightweight summary (layer
        # ranges + classification only, not every stored property), always
        # present regardless of whether replacement is used, so a case's
        # trace can always show "original -> effective" side by side (brief
        # section 4). Never touches `layers` itself -- read-only.
        row["original_soil_profile"] = [
            {"from_m": l.from_m, "to_m": l.to_m, "classification": getattr(l, "classification", None)}
            for l in sorted(layers, key=lambda x: x.from_m)
        ]

        width_m = _validate_positive_finite("width_m", width_m)
        depth_m = _validate_positive_finite("depth_m", depth_m)
        L = _validate_positive_finite("length_m", length_m if length_m else width_m)
        row["width_m"], row["depth_m"], row["length_m"] = width_m, depth_m, L

        # Step 3 (Soil Replacement): validate the case's replacement config
        # (if any) and build the effective calculation profile from it. When
        # replacement is disabled, `calc_layers is layers` -- the exact same
        # object, so every calculation below behaves byte-for-byte as it did
        # before Step 3. The ORIGINAL `layers` list/objects are never
        # touched by this -- only `calc_layers` (used from here on) reflects
        # the replacement.
        validated_replacement = _validate_replacement_config(replacement, layers)
        calc_layers = _build_effective_profile(layers, validated_replacement)
        if validated_replacement.get("enabled"):
            row["replacement_depth_m"] = validated_replacement["replacement_depth_m"]
            row["replacement_soil_properties"] = {
                k: v for k, v in validated_replacement.items() if k != "enabled"
            }
        # Step 7: EFFECTIVE profile is now recorded for EVERY case (not just
        # replacement-enabled ones, unlike pre-Step-7) -- when replacement is
        # off this is identical in content to `original_soil_profile` above
        # (every layer's `source` is "original"), which is itself useful
        # confirmation that nothing was silently altered. Same lightweight
        # shape as `original_soil_profile` -- not the full layer objects.
        row["effective_soil_profile"] = [
            {
                "from_m": l.from_m, "to_m": l.to_m,
                "classification": getattr(l, "classification", None),
                "source": "replacement" if getattr(l, "id", None) == _REPLACEMENT_SOIL_ID else "original",
            }
            for l in sorted(calc_layers, key=lambda x: x.from_m)
        ]

        founding = _founding_layer(calc_layers, depth_m)
        row["founding_layer"] = f"{founding.from_m}-{founding.to_m}m" + (f" ({founding.classification})" if founding.classification else "")

        # Step 7: per-parameter trace -- for each geotechnical input this
        # case actually used, record WHERE it came from (an explicit
        # override, or read off the founding layer) and what value resulted.
        # There's no separate "original vs effective" split beyond this for
        # these fields (unlike Step 6's fos/etc, which have a real
        # default-vs-configuration distinction) -- an override IS the only
        # alternative to a layer-sourced value, so `source` is that
        # distinction. Populated by `field()` as it resolves each one.
        parameter_trace = {}

        def field(name):
            if overrides.get(name) is not None:
                parameter_trace[name] = {"source": "override", "value": overrides[name]}
                return overrides[name]
            val, _ = _resolve_field(calc_layers, founding, name)
            if val is None:
                raise ValueError(f"No layer in this borehole has '{name}' -- add it as a manual override to run this batch.")
            parameter_trace[name] = {"source": "founding layer", "value": val}
            return val

        cohesion = field("cohesion_t_m2")
        phi = field("friction_angle_deg")
        gamma_base = field("bulk_density_t_m3")
        sg = field("specific_gravity")
        wc = field("moisture_content_pct")

        if overrides.get("gamma_avg_above_t_m3") is not None:
            gamma_above = overrides["gamma_avg_above_t_m3"]
            parameter_trace["gamma_avg_above_t_m3"] = {"source": "override", "value": gamma_above}
        else:
            gamma_above = _weighted_overburden(calc_layers, depth_m, "bulk_density_t_m3") or gamma_base
            parameter_trace["gamma_avg_above_t_m3"] = {"source": "computed (weighted overburden above founding depth)", "value": gamma_above}

        _founding_class = (getattr(founding, "classification", None) or "").strip().upper()
        _layer_forced = (overrides.get("layer_soil_type") or {}).get(str(getattr(founding, "id", None)))
        if _layer_forced in ("cohesive", "noncohesive"):
            soil_type = _layer_forced
            row["soil_type_source"] = "per-layer override (forced on this specific layer)"
        elif overrides.get("soil_type"):
            soil_type = overrides["soil_type"]
            row["soil_type_source"] = "override"
        elif _founding_class:
            soil_type = "cohesive" if _founding_class[0] in ("C", "M") else "noncohesive"
            row["soil_type_source"] = "founding layer classification"
        else:
            soil_type = "cohesive" if founding.compression_index_cc is not None else "noncohesive"
            row["soil_type_source"] = "inferred (founding layer has a compression index -- treated as cohesive)"

        # Water-table bug fix (Step 2): resolved ONCE, used by BOTH calls below.
        if overrides.get("water_table_depth_m") is not None:
            effective_water_table_depth_m = overrides["water_table_depth_m"]
            parameter_trace["water_table_depth_m"] = {"source": "override", "value": effective_water_table_depth_m}
        else:
            effective_water_table_depth_m = water_table_depth_m
            parameter_trace["water_table_depth_m"] = {"source": "borehole", "value": effective_water_table_depth_m}

        # Step 7: assign the trace BEFORE the validity check below, so even
        # the "no water table at all" failure still leaves a useful partial
        # trace on the row (brief section 13) -- everything resolved up to
        # this point (soil, replacement, per-parameter sourcing) really did
        # happen and is worth keeping, even though the calculation itself
        # never ran.
        row["parameter_trace"] = parameter_trace

        if effective_water_table_depth_m is None:
            raise ValueError("No water table depth available -- provide one on the borehole or as an override.")

        shear = bearing_fn(
            length_m=L, width_m=width_m, depth_m=depth_m,
            cohesion_t_m2=cohesion, phi_deg=phi,
            gamma_avg_above_t_m3=gamma_above, gamma_at_base_t_m3=gamma_base,
            specific_gravity=sg, moisture_content_pct=wc,
            water_table_depth_m=effective_water_table_depth_m, shape=shape, fos=fos,
        )

        settlement = run_settlement_multilayer(
            layers=calc_layers, length_m=L, width_m=width_m, depth_m=depth_m,
            allowable_settlement_mm=allowable_settlement_mm, rigidity_factor=rigidity_factor,
            consolidation_type=consolidation_type,
            include_elastic=bool(overrides.get("include_elastic", False)),
            lambda_correction=overrides.get("lambda_correction"),
            elastic_modulus_t_m2=overrides.get("elastic_modulus_t_m2"),
            overrides=overrides,
            water_table_depth_m=effective_water_table_depth_m,
        )

        shear_val, settlement_val = shear["result"], settlement["result"]
        recommended = min(shear_val, settlement_val)
        row.update({
            "soil_type": soil_type,
            "shear_sbc": shear_val,
            "settlement_sbc": settlement_val,
            "settlement_layers": settlement.get("layers_used", []),
            "settlement_layer_report": settlement.get("layer_report", []),
            "influence_zone_mode": settlement.get("influence_zone_mode"),
            "influence_zone_note": settlement.get("influence_zone_note"),
            "water_table_correction_note": settlement.get("water_table_correction_note"),
            "recommended_sbc": round(recommended, 2),
            "gross_recommended_sbc": round(recommended + gamma_above * depth_m, 2),
            "shear_steps": shear.get("steps", []),
            "governing": f"shear ({BEARING_METHOD_LABELS.get(method, method)})" if shear_val <= settlement_val else "settlement (IS:8009)",
        })
    except (ValueError, ZeroDivisionError) as e:
        row["error"] = str(e)
    return row


def run_batch_matrix(
    layers: list, water_table_depth_m: float | None,
    widths_m: list[float], depths_m: list[float], length_m: float | None,
    shape: str = "square", fos: float = 2.5, allowable_settlement_mm: float = 25,
    consolidation_type: str = "NCS", rigidity_factor: float = 1.0,
    overrides: dict | None = None, replacement: dict | None = None,
    method: str | None = None, configuration_id: str | None = None,
) -> dict:
    """
    Batch/matrix engine (Phase 3, v2): for every (width, depth) combination,
    auto-locates the founding layer at that depth from the WHOLE borehole (no
    manual layer pick) and fills any gap in that layer's data (e.g. an
    SPT-only layer with no lab c/phi) from neighbouring layers or a borehole
    average, per `_resolve_field`. `overrides` (any SoilLayer field name, plus
    "soil_type") always wins over auto-sourcing for that field across every
    combination -- this is the manual-fill escape hatch.

    Overburden density (gamma_avg_above) is the one exception to "founding
    layer + fallback": it's computed as a thickness-weighted average across
    every layer from the surface to the founding depth (see
    `_weighted_overburden`), because that's a genuinely borehole-wide
    quantity by definition, not a single layer's property -- unlike
    cohesion/phi/N/Cc/e0, which really are properties of one stratum.

    A combination that still can't be resolved (e.g. truly no layer anywhere
    in the borehole has cohesion, and no override was given) is captured as a
    per-combination "error" instead of aborting the whole batch.

    Step 2 (Aug 2026) refactor: the actual per-combination calculation now
    lives in the shared `_run_one_batch_case()` helper (also used by the new
    `run_batch_cases()` exact-pairs mode) -- this function is now just the
    cross-product loop + validation + result aggregation around that shared
    engine. Grid mode's OWN behavior is unchanged by this refactor (locked in
    by test_batch_analysis.py's regression tests); the only real behavior
    change bundled in is the water-table-override bug fix (see
    `_run_one_batch_case`'s docstring) and per-value validation (B/D must be
    positive, finite numbers -- software validation only, no engineering
    range limits invented).

    `replacement` (Step 3, Aug 2026 -- Soil Replacement): a single BATCH-LEVEL
    config (enabled/replacement_depth_m/bulk_density_t_m3/cohesion_t_m2/
    friction_angle_deg/etc, see `_validate_replacement_config`), applied
    IDENTICALLY to every (width, depth) combination in the grid. Grid mode
    has no per-combination case concept in its existing architecture (unlike
    exact-pairs mode's per-case `cases[i]["overrides"]`), so per-combination
    replacement isn't implemented here -- this is a deliberate, documented
    scope limit, not an oversight. Use exact-pairs mode (`run_batch_cases`)
    for a batch that mixes replacement ON/OFF or different replacement
    depths across cases.

    `method` (Step 5, Aug 2026 -- Calculation Method Selection): the
    bearing-capacity method for the WHOLE grid -- `None`/omitted uses the
    existing default (IS:6403), so every request made before Step 5
    continues to behave identically. Grid mode has no per-combination case
    concept (same reasoning as batch-level-only `replacement` above), so
    there is no per-combination method override here -- use exact-pairs
    mode for that. An unsupported method name is rejected up front with a
    ValueError (-> HTTP 422 at the router), before any combination runs.

    `configuration_id` (Step 6, Aug 2026 -- Formula Configuration &
    Versioning): purely a RECORD-KEEPING passthrough -- this function never
    looks it up, validates it, or uses it in any calculation. The ROUTER
    already resolved it (via services/configurations.py, which needs a DB
    session this file deliberately never takes) into the actual `fos`/
    `allowable_settlement_mm`/`rigidity_factor`/`consolidation_type` values
    above BEFORE calling this function -- those plain scalars are the only
    thing that affects the calculation, exactly as before Step 6 existed.
    This string is only carried through onto each result row so the
    calculation stays traceable to which named configuration produced it.
    """
    overrides = overrides or {}
    if not layers:
        raise ValueError("This borehole has no soil layers recorded.")
    if not widths_m or not depths_m:
        raise ValueError("Provide at least one footing width and one depth.")
    if water_table_depth_m is None and overrides.get("water_table_depth_m") is None:
        raise ValueError("This borehole has no water table depth recorded -- required for both SBC methods.")
    if len(widths_m) * len(depths_m) > MAX_BATCH_CASES:
        raise ValueError(f"Grid too large (max {MAX_BATCH_CASES} combinations at once) -- narrow the width/depth lists.")
    resolved_method = _validate_bearing_method(method)

    layers = sorted(layers, key=lambda l: l.from_m)
    combos = [
        _run_one_batch_case(
            layers=layers, water_table_depth_m=water_table_depth_m,
            width_m=w, depth_m=d, length_m=length_m,
            shape=shape, fos=fos, allowable_settlement_mm=allowable_settlement_mm,
            consolidation_type=consolidation_type, rigidity_factor=rigidity_factor,
            overrides=overrides, replacement=replacement, method=resolved_method,
            configuration_id=configuration_id,
        )
        for w in widths_m for d in depths_m
    ]

    valid = [c for c in combos if "error" not in c]
    critical = min(valid, key=lambda c: c["recommended_sbc"]) if valid else None

    return {
        "unit": "t/m²",
        "mode": "grid",
        "combinations": combos,
        "total": len(combos),
        "successful": len(valid),
        "critical_combination": critical,
        "warnings": [
            "Each combination auto-picks its founding layer by depth from this borehole. A field "
            "missing on that layer is filled from the nearest layer(s) above/below, or a "
            "borehole-wide average as a last resort -- check 'founding_layer' per row, and use "
            "manual overrides for any value you don't want auto-sourced.",
            "Overburden density (gamma_avg_above, used in the shear surcharge term) is a "
            "thickness-weighted average across every layer from ground level to the founding "
            "depth -- a genuinely borehole-wide quantity, not one layer's property.",
            "This is the shear (IS:6403) vs settlement (IS:8009) governing check only, same rule "
            "as the single calculators -- verify structural and other checks separately.",
        ],
    }


def run_batch_cases(
    layers: list, water_table_depth_m: float | None, cases: list[dict],
    shape: str = "square", fos: float = 2.5, allowable_settlement_mm: float = 25,
    consolidation_type: str = "NCS", rigidity_factor: float = 1.0,
    overrides: dict | None = None, default_method: str | None = None,
    configuration_id: str | None = None,
) -> dict:
    """
    Exact B x D pair mode (Step 2, Aug 2026) -- runs EXACTLY the given cases,
    no cross-product. Sibling to run_batch_matrix (grid mode, unchanged),
    sharing the same per-case engine (`_run_one_batch_case`) so the two modes
    can never silently diverge in behavior or formulas.

    `cases` is a list of dicts, each with at least `case_id`, `width_m`,
    `depth_m`, and optionally `length_m` and a per-case `overrides` dict.
    A case's own `overrides` win over the batch-wide `overrides` for any
    field both specify (case-level overrides layered on top of batch-wide
    defaults) -- neither ever mutates the original borehole/lab data, same
    read-only guarantee as grid mode (nothing here calls back into a
    SoilLayer object; every property is read via getattr and returned in a
    fresh dict).

    Case IDs must be unique within one request (validated up front, before
    any calculation runs) -- this is a request-shape rule, not an engineering
    check, so it fails the whole request with a clear message rather than
    becoming a per-case error. Duplicate (width, depth) PAIRS under different
    case IDs are allowed and preserved (not deduplicated) -- that's a
    legitimate use (e.g. re-running one case with a different override).

    Each case may carry its OWN `c["replacement"]` config (Step 3, Aug 2026
    -- Soil Replacement): {enabled, replacement_depth_m, bulk_density_t_m3,
    cohesion_t_m2, friction_angle_deg, ...optional fields}, independent of
    every other case -- one case's replacement never affects another case's
    result, and never touches the original borehole `layers`. See
    `_validate_replacement_config`/`_build_effective_profile` for the
    engine; the actual bearing-capacity and settlement math is 100% reused
    (unchanged formulas) -- only the soil profile handed to them differs.

    `default_method` / per-case `c["method"]` (Step 5, Aug 2026 --
    Calculation Method Selection): `default_method` is the batch-wide
    fallback bearing-capacity method (`None` -> existing default, IS:6403,
    so pre-Step-5 requests behave identically); a case's own `method`, if
    given, overrides it for that case only -- independent of every other
    case, same pattern as per-case `replacement`. EVERY case's effective
    method name (default or override) is validated up front, before any
    case starts calculating, so an unsupported method name in ANY case
    fails the whole request with a clear error rather than silently
    skipping just that case.

    `configuration_id` / per-case `c["fos"]`, `c["allowable_settlement_mm"]`,
    `c["rigidity_factor"]`, `c["consolidation_type"]`, `c["configuration_id"]`
    (Step 6, Aug 2026 -- Formula Configuration & Versioning): same
    router-resolves/this-function-just-records pattern as `method`/Step 5.
    This function NEVER looks up a configuration -- the router already
    resolved each case's effective (fos, allowable_settlement_mm,
    rigidity_factor, consolidation_type) via services/configurations.py
    (which needs a DB session this file deliberately never takes) and, for
    any case that doesn't carry its own override, simply repeats the
    batch-wide effective value into that case dict before calling this
    function. So a case dict's own `fos` (etc.) key, when present, is used
    AS THE EFFECTIVE VALUE for that case -- falling back to this function's
    own `fos` (etc.) parameter (the batch-wide default) only if the case
    dict omits the key entirely. `configuration_id` (batch-wide default) and
    each case's own `c["configuration_id"]` are pure record-keeping strings,
    exactly like `method`/Step 5's `case_methods` -- carried onto the result
    row, never used in any calculation.
    """
    batch_overrides = overrides or {}
    if not layers:
        raise ValueError("This borehole has no soil layers recorded.")
    if not cases:
        raise ValueError("Provide at least one case.")
    if water_table_depth_m is None and batch_overrides.get("water_table_depth_m") is None:
        raise ValueError("This borehole has no water table depth recorded -- required for both SBC methods.")
    if len(cases) > MAX_BATCH_CASES:
        raise ValueError(f"Too many cases (max {MAX_BATCH_CASES} at once) -- split into smaller batches.")
    resolved_default_method = _validate_bearing_method(default_method)

    seen_ids = set()
    case_methods = {}
    for c in cases:
        cid = c.get("case_id")
        if not cid:
            raise ValueError("Every case needs a case_id.")
        if cid in seen_ids:
            raise ValueError(f"Duplicate case_id '{cid}' -- case IDs must be unique within a batch.")
        seen_ids.add(cid)
        case_method = c.get("method")
        case_methods[cid] = (
            _validate_bearing_method(case_method) if case_method is not None else resolved_default_method
        )

    layers = sorted(layers, key=lambda l: l.from_m)
    combos = []
    for c in cases:
        case_overrides = {**batch_overrides, **(c.get("overrides") or {})}
        combos.append(_run_one_batch_case(
            layers=layers, water_table_depth_m=water_table_depth_m,
            width_m=c.get("width_m"), depth_m=c.get("depth_m"), length_m=c.get("length_m"),
            shape=shape,
            fos=c.get("fos", fos),
            allowable_settlement_mm=c.get("allowable_settlement_mm", allowable_settlement_mm),
            consolidation_type=c.get("consolidation_type", consolidation_type),
            rigidity_factor=c.get("rigidity_factor", rigidity_factor),
            overrides=case_overrides, case_id=c.get("case_id"),
            replacement=c.get("replacement"), method=case_methods[c.get("case_id")],
            configuration_id=c.get("configuration_id", configuration_id),
        ))

    valid = [c for c in combos if "error" not in c]
    critical = min(valid, key=lambda c: c["recommended_sbc"]) if valid else None

    return {
        "unit": "t/m²",
        "mode": "exact_pairs",
        "combinations": combos,
        "total": len(combos),
        "successful": len(valid),
        "critical_combination": critical,
        "warnings": [
            "Each case auto-picks its founding layer by depth from this borehole, same fallback "
            "rules as grid mode -- check 'founding_layer' per row.",
            "Only the EXACT cases given were run -- no automatic combinations were generated.",
            "This is the shear (IS:6403) vs settlement (IS:8009) governing check only, same rule "
            "as grid mode and the single calculators -- verify structural and other checks separately.",
        ],
    }


def _cumulative_overburden_stress(layers: list, z: float, overrides: dict | None = None) -> float:
    """Sum of gamma_i * thickness_i for every layer between ground level (0m)
    and depth z -- true effective overburden stress at z, built from the
    borehole's actual layers rather than one averaged density.

    A layer segment missing bulk_density_t_m3 (very common for SPT-only
    layers, which typically record N-value but not lab density) borrows it
    via the same nearest-layer/borehole-average fallback used for shear's
    cohesion/phi -- silently treating a missing density as zero was
    understating overburden stress, which could drive it to zero or negative
    and abort the whole settlement calculation. If the shallowest recorded
    layer starts below ground level (a logging gap near the surface -- the
    top stratum often isn't separately sampled), that gap is filled using
    the shallowest layer's own (fallback-resolved) density too. A manual
    `overrides["bulk_density_t_m3"]` pin, if given, wins over all of that."""
    if not layers:
        return 0.0
    overrides = overrides or {}
    override_gamma = overrides.get("bulk_density_t_m3")
    ordered = sorted(layers, key=lambda l: l.from_m)
    total = 0.0
    if ordered[0].from_m > 0:
        gamma = override_gamma
        if gamma is None:
            gamma, _ = _resolve_field(layers, ordered[0], "bulk_density_t_m3")
        if gamma is not None:
            total += gamma * (min(z, ordered[0].from_m) - 0.0)
    for l in ordered:
        top, bottom = max(0.0, l.from_m), min(z, l.to_m)
        if bottom <= top:
            continue
        gamma = override_gamma
        if gamma is None:
            gamma, _ = _resolve_field(layers, l, "bulk_density_t_m3")
        if gamma is None:
            continue
        total += gamma * (bottom - top)
    return total


def run_settlement_multilayer(
    layers: list, length_m: float, width_m: float, depth_m: float,
    allowable_settlement_mm: float, rigidity_factor: float = 1.0,
    influence_multiplier: float = 1.5, consolidation_type: str = "NCS",
    include_elastic: bool = False, lambda_correction: float | None = None,
    elastic_modulus_t_m2: float | None = None, overrides: dict | None = None,
    water_table_depth_m: float | None = None,
) -> dict:
    """
    True multi-layer settlement (replaces the single-representative-layer
    settlement_sbc_is8009_* functions for batch/matrix use): the influence
    zone [depth_m, depth_m + influence_multiplier*width_m] (or a manually
    overridden zone, see overrides["influence_zone_m"]) is split into real
    sub-layers wherever the borehole's own layer boundaries cross it, each
    sub-layer gets its own settlement contribution (consolidation via NCS log
    formula or OCS mv-linear formula for cohesive/silt, or the IS:8009 Fig-9
    chart for granular -- exactly the same per-layer formulas as the
    single-layer functions, verified against them), and the contributions
    are summed, Fox- and rigidity-corrected, then numerically inverted
    (bisection) to find the pressure that produces exactly
    `allowable_settlement_mm` of settlement.

    Verified against the reference workbook (SBC_Cal_Fixed.xlsm) to 9 decimal
    places on a single-dominant-layer example (chat history has the numbers).
    Re-audited directly against the workbook's Settlement-1/2/3 sheet
    formulas: Df-split first layer, influence-zone-bounded summation, and
    COHESIVE-vs-NON-COHESIVE routing (silt -- MI/MH/ML -- is COHESIVE in the
    reference workbook, same as this engine) were already correct. Two real
    gaps found in that audit are fixed here: manual Influence Zone
    override/reporting, and the per-layer water-table correction on granular
    sub-layers (was computed in the single-layer function but never applied
    here).

    Depth convention (this was a bug in the old single-layer functions, fixed
    here and there): overburden stress (P0) is measured from GROUND SURFACE,
    but the Boussinesq/Steinbrenner stress-influence depth is measured from
    the FOOTING BASE (where the load bulb actually originates) -- using the
    wrong reference for either one throws off every downstream number.

    include_elastic: off by default, matching the reference workbook's own
    typical configuration (its "ELASTIC" toggle is off in the example this
    was verified against). When on, uses a simplified single-segment
    Steinbrenner factor per sub-layer (n = sub-layer thickness / B) rather
    than full two-depth Steinbrenner subtraction -- a reasonable approximation
    since this component is off by default anyway.

    lambda_correction: optional direct multiplier on consolidation settlement
    (IS:8009 Table 1 style pore-pressure correction) -- the reference
    workbook treats this as a simple user-entered coefficient (e.g. 0.7), not
    a derived lookup, so it's exposed the same way here.

    overrides["influence_zone_m"]: manual Influence Zone thickness (metres
    below the founding depth), overriding the automatic Df + multiplier*B
    zone. The report always states whether Automatic or Manual was used.

    water_table_depth_m (or overrides["water_table_depth_m"]): depth below
    ground of the water table. Applies a single Aw correction factor (0.5 at
    or above founding level, scaling linearly to 1.0 at the base of the
    influence zone -- same convention as the single-layer granular function)
    to every granular sub-layer's settlement.
    """
    consolidation_type = consolidation_type.upper()
    if consolidation_type not in ("OCS", "NCS"):
        raise ValueError("consolidation_type must be 'OCS' (over-consolidated) or 'NCS' (normally consolidated).")
    if not layers:
        raise ValueError("No soil layers available for settlement calculation.")
    overrides = overrides or {}
    water_table_depth_m = overrides.get("water_table_depth_m", water_table_depth_m)

    iz_override = overrides.get("influence_zone_m")
    if iz_override is not None:
        influence_depth = depth_m + iz_override
        iz_mode = "Manual"
        iz_note = f"Manual Influence Zone override = {iz_override:.2f} m below founding depth (to {influence_depth:.2f} m)"
    else:
        influence_depth = depth_m + influence_multiplier * width_m
        iz_mode = "Automatic"
        iz_note = f"Automatic Influence Zone = Df + {influence_multiplier}\u00b7B = {influence_depth:.2f} m below ground"

    iz_thickness = influence_depth - depth_m
    if water_table_depth_m is None:
        Aw = 1.0
        aw_note = "No water table depth given -- Aw = 1.0 (no correction applied to granular sub-layers)"
    elif water_table_depth_m <= depth_m:
        Aw = 0.5
        aw_note = f"Water table at/above founding depth ({water_table_depth_m}m \u2264 {depth_m}m) -- Aw = 0.5"
    elif water_table_depth_m >= influence_depth:
        Aw = 1.0
        aw_note = f"Water table below the influence zone ({water_table_depth_m}m \u2265 {influence_depth:.2f}m) -- Aw = 1.0"
    else:
        Aw = 0.5 + 0.5 * (water_table_depth_m - depth_m) / iz_thickness
        aw_note = f"Water table within the influence zone -- Aw = 0.5 + 0.5\u00b7(Dw\u2212Df)/Iz = {Aw:.3f}"

    sub_layers = []
    for l in sorted(layers, key=lambda x: x.from_m):
        top, bottom = max(l.from_m, depth_m), min(l.to_m, influence_depth)
        if bottom <= top:
            continue
        sub_layers.append({"layer": l, "top": top, "bottom": bottom, "thickness": bottom - top, "gap_filled": False})

    # Fill any gaps inside [depth_m, influence_depth] where no borehole layer
    # has data (common: un-sampled intervals between SPT test depths). Each
    # gap borrows the nearest layer's properties -- same principle as the
    # founding_layer fix above -- rather than silently shrinking the total
    # influence-zone thickness actually accounted for in the settlement sum.
    sub_layers.sort(key=lambda s: s["top"])
    gap_fills = []
    cursor = depth_m
    for sl in sub_layers:
        if sl["top"] > cursor:
            nearest = _founding_layer(layers, (cursor + sl["top"]) / 2)
            gap_fills.append({"layer": nearest, "top": cursor, "bottom": sl["top"], "thickness": sl["top"] - cursor, "gap_filled": True})
        cursor = max(cursor, sl["bottom"])
    if cursor < influence_depth:
        nearest = _founding_layer(layers, (cursor + influence_depth) / 2)
        gap_fills.append({"layer": nearest, "top": cursor, "bottom": influence_depth, "thickness": influence_depth - cursor, "gap_filled": True})
    sub_layers = sorted(sub_layers + gap_fills, key=lambda s: s["top"])

    if not sub_layers:
        raise ValueError(f"No soil layer data found within the settlement influence zone ({depth_m}m to {influence_depth:.2f}m).")

    fox = _fox_depth_correction_factor(length_m, width_m, depth_m)
    layer_info = []

    def _iz(z_below_footing: float) -> float:
        F = math.sqrt((length_m / 2) ** 2 + z_below_footing ** 2)
        G = math.sqrt((width_m / 2) ** 2 + z_below_footing ** 2)
        Hc = math.sqrt((length_m / 2) ** 2 + (width_m / 2) ** 2 + z_below_footing ** 2)
        return (4 / (2 * math.pi)) * (
            math.atan((0.25 * length_m * width_m) / (z_below_footing * Hc))
            + (0.25 * length_m * width_m * z_below_footing / Hc) * (1 / F ** 2 + 1 / G ** 2)
        )

    # Pre-compute each sub-layer's geometry-dependent factors (independent of
    # applied pressure), so the pressure-solve loop below is cheap per guess.
    layer_soil_type_overrides = overrides.get("layer_soil_type") or {}
    for sl in sub_layers:
        l, H, top, bottom = sl["layer"], sl["thickness"], sl["top"], sl["bottom"]
        z_mid_surface = top + 0.5 * H
        z_below_footing = z_mid_surface - depth_m
        forced_type = layer_soil_type_overrides.get(str(getattr(l, "id", None)))
        if forced_type in ("cohesive", "noncohesive"):
            # Manual per-layer override (Batch Analysis "Layers in this borehole"
            # panel) -- lets Raahi test "what if this layer were sand instead of
            # clay" without editing the borehole data itself. Wins over the
            # layer's own USCS classification/Cc-presence below. If the forced
            # type needs data this layer doesn't have (e.g. forced cohesive but
            # no e0 anywhere to fall back on), the existing "no X anywhere in
            # this borehole" errors further down still fire -- forcing a type
            # never fabricates missing data, it only picks which formula path
            # (and therefore which required fields) applies.
            is_cohesive = forced_type == "cohesive"
            sl["soil_type_forced"] = True
        else:
            classification = (getattr(l, "classification", None) or "").strip().upper()
            if classification:
                # USCS: C../M.. (clay/silt) behave as cohesive; S../G.. (sand/gravel) as granular.
                # This is the soil's actual type, not which lab test happened to be run on it --
                # an SPT-only clay layer is still clay, not "granular" just because it lacks Cc/e0.
                is_cohesive = classification[0] in ("C", "M")
            else:
                is_cohesive = getattr(l, "compression_index_cc", None) is not None
            sl["soil_type_forced"] = False
        sl["is_cohesive"] = is_cohesive
        sl["Iz"] = _iz(z_below_footing)
        sl["P0"] = _cumulative_overburden_stress(layers, z_mid_surface, overrides)
        if sl["P0"] <= 0:
            raise ValueError(f"Layer {l.from_m}-{l.to_m}m: overburden stress works out to zero or negative -- check bulk densities above it.")

        if is_cohesive:
            e0 = overrides.get("initial_void_ratio_e0")
            if e0 is None:
                e0, _ = _resolve_field(layers, l, "initial_void_ratio_e0")
            if e0 is None:
                raise ValueError(f"Layer {l.from_m}-{l.to_m}m: no initial_void_ratio_e0 anywhere in this borehole to fall back on.")

            cc = overrides.get("compression_index_cc")
            cc_source = "override" if cc is not None else None
            if cc is None:
                cc, cc_source = _resolve_field(layers, l, "compression_index_cc")
            if cc is None:
                # No lab-tested Cc anywhere on this borehole -- estimate from void ratio,
                # same empirical correlation as the reference workbook's Input!Z column
                # ("VOID RATIO" mode): Cc = 0.3*(e0 - 0.27). Only a fallback of last
                # resort; a real lab Cc value always wins when one exists.
                cc = 0.3 * (e0 - 0.27)
                cc_source = f"estimated from void ratio (Cc=0.3*(e0-0.27), e0={e0:.3f}) -- no lab Cc on this borehole"
            sl["cc"], sl["e0"], sl["cc_source"] = cc, e0, cc_source
            if consolidation_type == "OCS" or include_elastic:
                es = elastic_modulus_t_m2
                if es is None:
                    n_for_es = overrides.get("n_value")
                    if n_for_es is None:
                        n_for_es, _ = _resolve_field(layers, l, "n_value")
                    if n_for_es is not None:
                        es = 113.7931 * (n_for_es + 6)  # Bowles (5th ed., p.316) -- matches the reference workbook exactly
                if es is None:
                    raise ValueError(f"Layer {l.from_m}-{l.to_m}m needs an elastic modulus (for OCS or elastic settlement) -- no N-value anywhere in this borehole to estimate it from, and none given.")
                sl["es"] = es
            if include_elastic:
                n_ratio = H / width_m
                m_ratio = length_m / width_m
                M = m_ratio * math.log(
                    (1 + math.sqrt(1 + m_ratio ** 2)) * math.sqrt(m_ratio ** 2 + n_ratio ** 2)
                    / (m_ratio * (1 + math.sqrt(1 + m_ratio ** 2 + n_ratio ** 2)))
                )
                N_ = math.log(
                    (m_ratio + math.sqrt(1 + m_ratio ** 2)) * math.sqrt(1 + n_ratio ** 2)
                    / (m_ratio + math.sqrt(1 + m_ratio ** 2 + n_ratio ** 2))
                )
                sl["steinbrenner_O"] = (4 / math.pi) * (M + N_)
        else:
            n_val = overrides.get("n_value")
            n_source = "override" if n_val is not None else None
            if n_val is None:
                n_val, n_source = _resolve_field(layers, l, "n_value")
            if n_val is None:
                raise ValueError(f"Layer {l.from_m}-{l.to_m}m: no n_value anywhere in this borehole to fall back on.")
            if n_val <= 3:
                raise ValueError(f"Layer {l.from_m}-{l.to_m}m: N-value ({n_val}) must be > 3 for the IS:8009 Fig-9 chart to apply.")
            sl["n_val"], sl["n_source"] = n_val, n_source
            sl["settlement_at_10t"] = 10 / (0.1385 * (n_val - 3) * ((width_m + 0.3) / (2 * width_m)) ** 2)

        cc_note = f", Cc {sl['cc_source']}" if is_cohesive and sl.get("cc_source", "").startswith("estimated") else ""
        layer_info.append(f"{l.from_m}-{l.to_m}m ({'cohesive' if is_cohesive else 'granular'}), "
                           f"{H:.2f}m within influence zone, Iz={sl['Iz']:.3f}, P0={sl['P0']:.2f} t/m²{cc_note}")

    def _layer_contribution_mm(sl: dict, pressure: float) -> tuple[float, float]:
        """Returns (contribution_mm_before_fox_rigidity, stress_increase_dp) for one sub-layer."""
        dp = sl["Iz"] * pressure
        if sl["is_cohesive"]:
            if consolidation_type == "NCS":
                sc = (sl["thickness"] / (1 + sl["e0"])) * sl["cc"] * math.log10((sl["P0"] + dp) / sl["P0"]) * 1000
            else:
                sc = 1000 * (1 / sl["es"]) * sl["thickness"] * dp
            elastic = (pressure * width_m * 0.75 * sl["steinbrenner_O"] / sl["es"] * 1000) if include_elastic else 0.0
            contribution = sc + elastic
            if lambda_correction is not None:
                contribution *= lambda_correction
        else:
            # Water-table correction (Aw) applied here -- previously computed
            # elsewhere but never actually applied to this multi-layer path.
            contribution = sl["settlement_at_10t"] * dp / (10 * Aw)
        return contribution, dp

    def total_settlement_mm(pressure: float) -> float:
        total = sum(_layer_contribution_mm(sl, pressure)[0] for sl in sub_layers)
        return total * fox * rigidity_factor

    # Bisection: settlement is monotonically increasing with pressure, so this is safe and robust
    # even with the NCS log term mixed with linear granular/OCS terms across different sub-layers.
    lo, hi = 1e-6, 1000.0
    if total_settlement_mm(hi) < allowable_settlement_mm:
        raise ValueError("Even 1000 t/m² doesn't reach the target settlement with this soil profile -- check inputs (very stiff soil vs a very large allowable settlement).")
    for _ in range(100):
        mid = (lo + hi) / 2
        if total_settlement_mm(mid) < allowable_settlement_mm:
            lo = mid
        else:
            hi = mid
    sbc = mid

    # Build the fully transparent, per-layer breakdown at the solved pressure --
    # every field the engineer needs to verify the calculation without reading code.
    layer_report = []
    running = 0.0
    for sl in sub_layers:
        l = sl["layer"]
        raw_contribution, dp = _layer_contribution_mm(sl, sbc)
        layer_settlement_mm = raw_contribution * fox * rigidity_factor
        running += layer_settlement_mm
        if sl["is_cohesive"]:
            method = f"Clay/Silt consolidation ({consolidation_type})" + (" + elastic" if include_elastic else "")
            es_val = sl.get("es")
            es_note = f"{es_val:.1f} t/m² (from N-value correlation, Es=113.79·(N+6))" if es_val is not None else "not used"
            if consolidation_type == "NCS":
                working = (f"Sc = (H/(1+e0))·Cc·log10((P0+Δσ)/P0)·1000 = "
                           f"({sl['thickness']:.2f}/(1+{sl['e0']:.3f}))·{sl['cc']:.4f}·"
                           f"log10(({sl['P0']:.2f}+{dp:.3f})/{sl['P0']:.2f})·1000 = {raw_contribution:.2f} mm before Fox/rigidity")
            else:
                working = (f"Sc = 1000·mv·H·Δσ, mv=1/Es = 1000·(1/{sl.get('es',0):.1f})·"
                           f"{sl['thickness']:.2f}·{dp:.3f} = {raw_contribution:.2f} mm before Fox/rigidity")
            working += f" -> ×Fox({fox:.3f})×Rigidity({rigidity_factor:.2f}) = {layer_settlement_mm:.2f} mm"
        else:
            method = "Sand/Gravel -- IS:8009 Fig-9 chart"
            es_note = "not used (granular method)"
            working = (f"Sc = (Settlement-at-10t/m² × Δσ)/(10×Aw) = "
                       f"({sl['settlement_at_10t']:.3f}×{dp:.3f})/(10×{Aw:.3f}) = {raw_contribution:.2f} mm before Fox/rigidity"
                       f" -> ×Fox({fox:.3f})×Rigidity({rigidity_factor:.2f}) = {layer_settlement_mm:.2f} mm")
        layer_report.append({
            "from_m": l.from_m, "to_m": l.to_m,
            "effective_from_m": round(sl["top"], 2), "effective_to_m": round(sl["bottom"], 2),
            "effective_thickness_m": round(sl["thickness"], 2),
            "gap_filled": sl.get("gap_filled", False),
            "soil_type": ("Cohesive (incl. Silt)" if sl["is_cohesive"] else "Non-cohesive (granular)") + (" [forced]" if sl.get("soil_type_forced") else ""),
            "classification": (getattr(l, "classification", None) or "n/a"),
            "settlement_method": method,
            "spt_n_used": sl.get("n_val", "n/a (cohesive layer)"),
            "spt_n_source": sl.get("n_source", "n/a"),
            "elastic_modulus_used": es_note,
            "stress_increase_t_m2": round(dp, 3),
            "layer_settlement_mm": round(layer_settlement_mm, 3),
            "running_settlement_mm": round(running, 3),
            "working": working,
        })

    return {
        "result": round(sbc, 2),
        "unit": "t/m² (SBC for specified allowable settlement, true multi-layer)",
        "formula": "Per-sublayer IS:8009 consolidation (NCS log / OCS linear) or Fig-9 chart, summed, Fox-corrected, solved numerically for target settlement",
        "layers_used": layer_info,
        "layer_report": layer_report,
        "sub_layer_count": len(sub_layers),
        "influence_zone_mode": iz_mode,
        "influence_zone_note": iz_note,
        "influence_zone_from_m": depth_m,
        "influence_zone_to_m": round(influence_depth, 2),
        "water_table_correction_note": aw_note,
        "total_settlement_at_recommended_sbc_mm": round(running, 3),
        "warnings": [
            f"Influence zone: {depth_m}m to {influence_depth:.2f}m below ground ({iz_mode}), split across {len(sub_layers)} real borehole sub-layer(s).",
            "Elastic (immediate) settlement is " + ("included" if include_elastic else "NOT included (off by default, matching the reference workbook's typical setting)") + ".",
            "Water-table correction (Aw) is now applied to every granular sub-layer's settlement -- previously computed but not applied in this multi-layer version.",
            "Silt (MI/MH/ML) is treated as COHESIVE, same as the reference workbook -- there is no separate 'silt method' in the source Excel.",
            "Compare against the shear-based SBC (IS:6403) and take the LOWER of the two as the final recommended SBC.",
        ],
    }


# ============================================================================
# LIQUEFACTION ANALYSIS -- IRC:SP:114 / IS 1893:2016 simplified (Seed-Idriss /
# NCEER 1997 / Idriss-Boulanger 2008) procedure, matching LIQUEFACTION.xlsx
# formula-for-formula (audited 25 Jul 2026).
# ============================================================================

# Zone -> amax/g (peak ground acceleration ratio), exactly as the workbook's H-column lookup.
_ZONE_PGA = {"II": 0.10, "III": 0.16, "IV": 0.24, "V": 0.36}

# Classifications the workbook's AE-column (FOS) formula treats as automatically
# non-liquefiable (cohesive/plastic fine-grained soils) -- skipped entirely,
# no CSR/CRR/FOS math computed for these, same as the source Excel.
# The source workbook uses TWO DIFFERENT classification lists for two different
# skips -- not the same list, and not merged, even though they overlap heavily.
# Replicated exactly as written rather than harmonizing them, since a real
# (if slightly messy) inconsistency in the source-of-truth Excel isn't ours to
# silently "fix" -- flagged in the function's warnings instead.
_DR_EXEMPT_CLASSIFICATIONS = {"FILL", "CI", "CL", "ML-CL", "CH", "ML", "MI"}          # Y-column list (Dr% -> "NA")
_FOS_EXEMPT_CLASSIFICATIONS = {"CL", "CI", "CH", "CL-ML", "ML", "MI", "MH"}            # AE-column list (FOS -> ">1.0", no CSR/CRR compare)


def _rd_stress_reduction(depth_m: float) -> float:
    """Stress reduction coefficient rd, exactly the workbook's J-column piecewise formula."""
    if depth_m < 9.15:
        return 1 - depth_m * 0.00765
    if depth_m < 23:
        return 1.174 - 0.0267 * depth_m
    if depth_m < 30:
        return 0.744 - 0.008 * depth_m
    return 0.50


def _cr_rod_length(depth_m: float) -> float:
    """Rod length correction CR, exactly the workbook's R-column piecewise formula
    (bucketed on depth + 1.5m, matching the source Excel exactly)."""
    d = depth_m + 1.5
    if d >= 10:
        return 1.0
    if d >= 6:
        return 0.95
    if d >= 4:
        return 0.85
    if d > 3:
        return 0.80
    return 0.75


def _fines_alpha_beta(fines_pct: float) -> tuple[float, float]:
    """alpha, beta fines-content correction terms, exactly the workbook's U/V-column
    formulas (Idriss-Boulanger 2008 / NCEER 1997 fines correction)."""
    if fines_pct <= 5:
        alpha, beta = 0.0, 1.0
    elif fines_pct >= 35:
        alpha, beta = 5.0, 1.2
    else:
        alpha = math.exp(1.76 - (190 / fines_pct ** 2))
        beta = 0.99 + (fines_pct ** 1.5) / 1000
    return alpha, beta


def _crr_7_5(n1_60cs: float):
    """CRR at M=7.5, sigma'v=1 atm, exactly the workbook's X-column NCEER 1997
    curve-fit formula. Returns None (the workbook's "NA") above (N1)60cs=30 --
    soil dense enough that the curve-fit itself is undefined/inapplicable, not
    a real liquefaction risk."""
    if n1_60cs > 30:
        return None
    return 1 / (34 - n1_60cs) + n1_60cs / 135 + 50 / (10 * n1_60cs + 45) ** 2 - 1 / 200


def _relative_density_pct(n1_60: float):
    """Dr%, exactly the workbook's Y-column piecewise linear interpolation on (N1)60.
    Returns None ("NA") above (N1)60=100 -- caller should not reach this for real data."""
    if n1_60 <= 4:
        return 0 + (n1_60 - 0) * (10 / 4)
    if n1_60 <= 10:
        return 10 + (n1_60 - 4) * (10 / 6)
    if n1_60 <= 30:
        return 20 + (n1_60 - 10) * (45 / 20)
    if n1_60 <= 35:
        return 65 + (n1_60 - 30) * (5 / 5)
    if n1_60 <= 50:
        return 70 + (n1_60 - 35) * (15 / 15)
    if n1_60 <= 100:
        return 85 + (n1_60 - 50) * (15 / 50)
    return None


def _f_exponent(dr_pct: float):
    """f exponent (used in Ksigma), exactly the workbook's Z-column piecewise
    linear interpolation on Dr%. Returns None ("NA") above Dr=100."""
    if dr_pct <= 20:
        return 1 + (dr_pct - 0) * (-0.1 / 20)
    if dr_pct <= 40:
        return 0.9 + (dr_pct - 20) * (-0.1 / 20)
    if dr_pct <= 60:
        return 0.8 + (dr_pct - 40) * (-0.1 / 20)
    if dr_pct <= 80:
        return 0.7 + (dr_pct - 60) * (-0.1 / 20)
    if dr_pct <= 100:
        return 0.6 + (dr_pct - 80) * (-0.1 / 20)
    return None


def _stress_increment(prev_depth: float, cur_depth: float, bulk_density: float, water_table_depth_m):
    """Total and effective overburden stress increments for the slice
    [prev_depth, cur_depth], both using `bulk_density` (the workbook's single
    density-per-layer convention -- there's no separate moist/saturated input).

    DEVIATES FROM THE LITERAL EXCEL FORMULA BY RAAHI'S EXPLICIT DECISION
    (25 Jul 2026): the source workbook subtracts 1 t/m3 (submerged/buoyant
    unit weight, gamma_w=1) from every single layer unconditionally, even
    where a layer is above the actual recorded water table -- its "Water
    table assumed for Calculation" input cell is never actually referenced by
    any formula in the sheet. That's only "correct" in the source example
    because its water table happens to be at 0m (ground level), so every
    layer legitimately is submerged. Raahi confirmed (asked directly,
    flagged as the one real ambiguity in this workbook): apply full bulk
    density above the water table (no buoyancy) and submerged density
    (bulk - 1) below it -- splitting a slice that straddles the water table
    proportionally -- rather than blindly replicating the always-submerged
    formula for boreholes where the water table isn't at the surface.
    """
    total = bulk_density * (cur_depth - prev_depth)
    if water_table_depth_m is None or cur_depth <= water_table_depth_m:
        effective = bulk_density * (cur_depth - prev_depth)
    elif prev_depth >= water_table_depth_m:
        effective = (bulk_density - 1) * (cur_depth - prev_depth)
    else:
        above = water_table_depth_m - prev_depth
        below = cur_depth - water_table_depth_m
        effective = bulk_density * above + (bulk_density - 1) * below
    return total, effective


def run_liquefaction_analysis(
    layers: list, earthquake_magnitude_mw: float,
    earthquake_zone: str | None = None, pga_g: float | None = None,
    water_table_depth_m: float | None = None,
    borehole_diameter_correction: float = 1.05,   # CB -- workbook's Q-column, 150mm borehole
    hammer_energy_correction: float = 1.0,          # CE -- workbook's O-column
    hammer_type_correction: float = 1.0,            # CH -- workbook's P-column
    sampler_correction: float = 1.0,                # CS -- workbook's S-column
    static_shear_correction: float = 1.0,           # K-alpha -- workbook's AB-column, 1.0 for flat ground
    overrides: dict | None = None,
) -> dict:
    """
    Liquefaction potential (IRC:SP:114 / IS 1893:2016 simplified procedure --
    Seed-Idriss CSR, NCEER 1997 CRR curve fit, Idriss-Boulanger 2008 fines
    correction and Ksigma/MSF), audited formula-for-formula against
    LIQUEFACTION.xlsx (25 Jul 2026).

    Layers are processed in depth order using each layer's `from_m` as the
    workbook's "depth below EGL" point (the workbook is a point-per-row
    sheet, one SPT test depth per row, not a from/to range) -- this reuses
    the same borehole SoilLayer records already used for SBC/settlement, per
    Raahi's request to connect this to the existing soil profile rather than
    a separate data entry flow. Overburden stress (total and effective) is
    built cumulatively exactly as the workbook's K/L columns: each increment
    [previous depth, this depth] uses the PREVIOUS layer's bulk density --
    see `_stress_increment` for the one deliberate deviation from the
    literal Excel formula (water-table-aware effective stress, confirmed
    with Raahi).

    Per layer: SPT correction chain (N1)60 = N*CN*CE*CH*CB*CR*CS, fines
    correction to (N1)60cs, CRR7.5 (NCEER 1997 curve fit), Ksigma (via Dr% and
    the f exponent), MSF (Idriss 1999), CRR = CRR7.5*Ksigma*Kalpha*MSF, and
    FOS = CRR/CSR. Cohesive/plastic layers (CL, CI, CH, CL-ML, ML, MI, MH --
    exactly the workbook's own exemption list) are automatically
    "Non Liquefiable" with no CSR/CRR math, same as the source Excel -- this
    simplified method doesn't apply to fine-grained plastic soils.

    overrides: per-field dict, same pattern as the SBC engines. Global
    overrides: "water_table_depth_m", "earthquake_magnitude_mw", "pga_g"
    (bypasses the zone lookup entirely), "earthquake_zone". Per-layer overrides
    keyed by the SoilLayer's `id` (falls back to a plain field name applied
    to every layer if no per-layer id key exists), e.g.
    {"n_value": 20} applies N=20 to every layer, or
    {"<layer_id>": {"n_value": 20}} to just that one layer.
    """
    if not layers:
        raise ValueError("No soil layers available for liquefaction analysis.")
    overrides = overrides or {}
    water_table_depth_m = overrides.get("water_table_depth_m", water_table_depth_m)
    mw = overrides.get("earthquake_magnitude_mw", earthquake_magnitude_mw)
    earthquake_zone = overrides.get("earthquake_zone", earthquake_zone)
    pga_g = overrides.get("pga_g", pga_g)
    if pga_g is None:
        if not earthquake_zone or earthquake_zone.upper() not in _ZONE_PGA:
            raise ValueError("Provide either pga_g directly, or a valid earthquake_zone (II/III/IV/V).")
        pga_g = _ZONE_PGA[earthquake_zone.upper()]
        pga_source = f"Zone {earthquake_zone.upper()} lookup"
    else:
        pga_source = "manual override"
    if not mw:
        raise ValueError("earthquake_magnitude_mw is required.")
    msf = (10 ** 2.24) / (mw ** 2.56)

    def _get(layer, field, default=None):
        per_layer = overrides.get(getattr(layer, "id", None))
        if isinstance(per_layer, dict) and field in per_layer:
            return per_layer[field]
        if field in overrides and not isinstance(overrides[field], dict):
            return overrides[field]
        val = getattr(layer, field, None)
        return val if val is not None else default

    def _get_required(layer, field):
        """Override/direct value if present; else the nearest recorded layer
        above/below (same fallback `_resolve_field` already gives the SBC and
        settlement engines) -- e.g. a "Filled up" top layer with no lab test
        borrows from whichever tested layer is closest, instead of the whole
        liquefaction run failing on one incomplete layer. Returns
        (value, source_note); value is None only if truly no layer anywhere
        on this borehole has this field and no override was given either."""
        per_layer = overrides.get(getattr(layer, "id", None))
        if isinstance(per_layer, dict) and field in per_layer:
            return per_layer[field], "manual override (this layer)"
        if field in overrides and not isinstance(overrides[field], dict):
            return overrides[field], "manual override (all layers)"
        direct = getattr(layer, field, None)
        if direct is not None:
            return direct, f"{layer.from_m}-{layer.to_m}m (this layer)"
        return _resolve_field(ordered, layer, field)

    ordered = sorted(layers, key=lambda l: l.from_m)
    K = L = 0.0
    prev_depth = 0.0
    prev_density = None  # the workbook's K[i]=K[i-1]+D[i-1]*(A[i]-A[i-1]) uses the PREVIOUS
    # row's density for each increment -- only the very first row uses its own density,
    # for the surface-to-first-sample interval. Replicated exactly (not current row's
    # density, which would be an off-by-one relative to the source workbook).
    layer_report = []
    liquefiable_ranges, non_liquefiable_ranges = [], []
    numeric_fs = []

    for l in ordered:
        depth = l.from_m
        interval_top = prev_depth
        bulk_density, bulk_density_source = _get_required(l, "bulk_density_t_m3")
        if bulk_density is None:
            raise ValueError(f"Layer at {depth}m: no bulk_density_t_m3 anywhere on this borehole (needed for overburden stress) and no override given.")
        density_for_increment = bulk_density if prev_density is None else prev_density
        dK, dL = _stress_increment(interval_top, depth, density_for_increment, water_table_depth_m)
        K += dK
        L += dL
        overburden_step = (
            f"Overburden stress, interval {interval_top:.2f}m to {depth:.2f}m: using density "
            f"{density_for_increment:.3f} t/m³ ({'this layer' if prev_density is None else 'previous layer, per workbook convention'}"
            f"), water table at {water_table_depth_m if water_table_depth_m is not None else 'n/a'}m -> "
            f"ΔTotal={dK:.3f} t/m² (running total={K:.3f}), ΔEffective={dL:.3f} t/m² (running total={L:.3f})"
        )
        prev_depth = depth
        prev_density = bulk_density

        classification = (_get(l, "classification") or "").strip().upper()
        rd = _rd_stress_reduction(depth)
        csr = 0.65 * (K / L) * rd * pga_g if L > 0 else 0.0

        csr_step = f"CSR = 0.65 x (Total/Effective overburden) x rd x amax/g = 0.65 x ({K:.3f}/{L:.3f}) x {rd:.4f} x {pga_g} = {csr:.4f}" if L > 0 else "CSR = 0 (no effective overburden yet)"

        row = {
            "depth_m": depth, "classification": classification or "n/a",
            "total_overburden_t_m2": round(K, 3), "effective_overburden_t_m2": round(L, 3),
            "rd": round(rd, 4), "csr": round(csr, 4),
            "bulk_density_source": bulk_density_source,
            "steps": [overburden_step, f"rd (stress reduction factor) = {rd:.4f} at {depth}m depth", csr_step],
        }

        if getattr(l, "rock_type", None) and not classification:
            row.update({"note": "Rock layer -- liquefaction analysis not applicable.", "fos": "n/a", "conclusion": "n/a"})
            row["steps"].append("Rock layer -- no SPT/CRR chain applies, analysis stops here.")
            layer_report.append(row)
            continue

        n_obs, n_source = _get_required(l, "n_value")
        if n_obs is None:
            raise ValueError(f"Layer at {depth}m ({classification or 'unclassified'}): no n_value anywhere on this borehole and no override given.")
        fines_pct, fines_source = _get_required(l, "fines_content_pct")
        if fines_pct is None:
            raise ValueError(f"Layer at {depth}m: no fines_content_pct anywhere on this borehole and no override given -- "
                              f"required for the fines correction (alpha/beta), which the reference workbook applies to every layer regardless of soil type.")
        row["n_value_source"] = n_source
        row["fines_content_source"] = fines_source

        # (N1)60 / (N1)60cs / CRR7.5 are computed for EVERY layer regardless of
        # soil type -- exactly as the reference workbook's T/U/V/W/X columns
        # have no soil-type check at all. Only Dr% (its own exempt list) and
        # the final FOS (a DIFFERENT exempt list) are skipped for cohesive/
        # plastic classifications -- see the two separate lists above.
        cn = min(math.sqrt(10 / L), 1.7) if L > 0 else 1.7
        ce = _get(l, "hammer_energy_correction", hammer_energy_correction)
        ch = _get(l, "hammer_type_correction", hammer_type_correction)
        cb = _get(l, "borehole_diameter_correction", borehole_diameter_correction)
        cr = _cr_rod_length(depth)
        cs = _get(l, "sampler_correction", sampler_correction)
        n1_60 = n_obs * cn * ce * ch * cb * cr * cs

        alpha, beta = _fines_alpha_beta(fines_pct)
        n1_60cs = alpha + beta * n1_60

        crr_7_5 = _crr_7_5(n1_60cs)

        if classification in _DR_EXEMPT_CLASSIFICATIONS:
            dr_pct, f_exp = None, None
        else:
            dr_pct = _relative_density_pct(n1_60)
            f_exp = _f_exponent(dr_pct) if dr_pct is not None else None
        if f_exp is None:
            k_sigma = 1.00
        elif depth <= 15:
            k_sigma = 1.0
        else:
            k_sigma = (L / 10) ** (f_exp - 1)
        k_alpha = _get(l, "static_shear_correction", static_shear_correction)

        crr = (crr_7_5 * k_sigma * k_alpha * msf) if crr_7_5 is not None else None

        if classification in _FOS_EXEMPT_CLASSIFICATIONS:
            fos = ">1.0"  # cohesive/plastic soil -- exempt from this simplified method entirely, same as the reference workbook
        elif crr_7_5 is None or crr_7_5 > 1 or csr <= 0:
            fos = ">1.0"  # matches the workbook's own "IF(X<=1, AD/M, \">1.0\")" branch exactly
        else:
            fos = round(crr / csr, 3)

        is_liquefiable = isinstance(fos, (int, float)) and fos <= 1.0
        (liquefiable_ranges if is_liquefiable else non_liquefiable_ranges).append(depth)
        if isinstance(fos, (int, float)):
            numeric_fs.append(fos)

        row.update({
            "n_observed": n_obs, "fines_content_pct": fines_pct,
            "cn": round(cn, 3), "ce": ce, "ch": ch, "cb": cb, "cr": cr, "cs": cs,
            "n1_60": round(n1_60, 2), "alpha": round(alpha, 3), "beta": round(beta, 3),
            "n1_60cs": round(n1_60cs, 2),
            "crr_7_5": round(crr_7_5, 4) if crr_7_5 is not None else "NA (>30 -- too dense for curve fit)",
            "relative_density_pct": round(dr_pct, 1) if dr_pct is not None else "n/a",
            "f_exponent": round(f_exp, 4) if f_exp is not None else "n/a",
            "k_sigma": round(k_sigma, 4), "k_alpha": k_alpha, "msf": round(msf, 4),
            "crr": round(crr, 4) if crr is not None else "n/a",
            "fos": fos,
            "conclusion": "Liquefiable" if is_liquefiable else "Non Liquefiable",
        })
        row["steps"] += [
            f"(N1)60 = N x CN x CE x CH x CB x CR x CS = {n_obs} x {cn:.3f} x {ce} x {ch} x {cb} x {cr:.3f} x {cs} = {n1_60:.2f}",
            f"Fines correction: alpha={alpha:.3f}, beta={beta:.3f} (from fines content {fines_pct}%) -> (N1)60cs = alpha + beta x (N1)60 = {n1_60cs:.2f}",
            f"CRR7.5 (NCEER 1997 curve fit on (N1)60cs) = {row['crr_7_5']}",
            (f"Dr% = {dr_pct:.1f}%, f-exponent = {f_exp:.4f} -> Ksigma = {k_sigma:.4f}" + (" (depth<=15m, Ksigma capped at 1.0)" if depth <= 15 else "")
             if dr_pct is not None else f"Dr%/Ksigma: exempt classification ({classification or 'n/a'}) -> Ksigma = {k_sigma:.4f}"),
            f"MSF = 10^2.24 / Mw^2.56 = {msf:.4f} (Mw={mw})",
            f"Kalpha (static shear correction) = {k_alpha}",
            (f"CRR = CRR7.5 x Ksigma x Kalpha x MSF = {crr_7_5:.4f} x {k_sigma:.4f} x {k_alpha} x {msf:.4f} = {crr:.4f}"
             if crr is not None else "CRR = n/a (CRR7.5 not available -- (N1)60cs > 30)"),
            (f"FOS = CRR / CSR = {crr:.4f} / {csr:.4f} = {fos}" if isinstance(fos, (int, float))
             else f"FOS = '{fos}' ({'cohesive/plastic soil, exempt from this method' if classification in _FOS_EXEMPT_CLASSIFICATIONS else 'CRR7.5 > 1 or CSR <= 0, workbook rule applies'})"),
            f"Conclusion: {'Liquefiable' if is_liquefiable else 'Non Liquefiable'}",
        ]
        layer_report.append(row)

    liquefiable_ranges.sort()
    non_liquefiable_ranges.sort()

    def _ranges(depths):
        if not depths:
            return []
        out, start, prev = [], depths[0], depths[0]
        for d in depths[1:]:
            if d - prev > 3.0:  # gap bigger than a typical sample spacing -> new range
                out.append((start, prev))
                start = d
            prev = d
        out.append((start, prev))
        return [f"{a}m-{b}m" for a, b in out]

    return {
        "layer_report": layer_report,
        "summary": {
            "liquefiable_depth_ranges": _ranges(liquefiable_ranges),
            "non_liquefiable_depth_ranges": _ranges(non_liquefiable_ranges),
            "minimum_fos": min(numeric_fs) if numeric_fs else None,
            "overall_conclusion": "LIQUEFACTION POTENTIAL IDENTIFIED" if liquefiable_ranges else "No liquefaction potential identified in this borehole",
        },
        "inputs_used": {
            "earthquake_magnitude_mw": mw, "pga_g": pga_g, "pga_source": pga_source,
            "earthquake_zone": earthquake_zone, "water_table_depth_m": water_table_depth_m,
            "msf": round(msf, 4),
        },
        "warnings": [
            "Cohesive/plastic layers are automatically Non Liquefiable (FOS reported as '>1.0', no CSR/CRR comparison) -- "
            "this simplified SPT-based method doesn't apply to fine-grained plastic soils, same as the reference workbook.",
            "Note: the source workbook uses two DIFFERENT classification lists for two different skips -- Dr% is 'NA' for "
            "Fill/CI/CL/ML-CL/CH/ML/MI, while the FOS skip uses CL/CI/CH/CL-ML/ML/MI/MH (no 'Fill', includes 'MH', and "
            "spells the CL/ML mix the other way round). Replicated exactly as two separate lists rather than merged/fixed.",
            "Effective stress uses full bulk density above the water table and submerged (bulk-1 t/m3) density below it "
            "-- this deliberately deviates from the source Excel, which subtracts 1 t/m3 from every layer unconditionally "
            "regardless of water table position (confirmed with Raahi, 25 Jul 2026 -- see run_liquefaction_analysis docstring).",
            "Depth used per layer is each SoilLayer's from_m (its top), matching the source workbook's one-point-per-row convention.",
        ],
    }


def well_foundation(
    outer_dia_m: float, steining_thickness_m: float, founding_depth_m: float,
    max_scour_depth_m: float, steining_unit_weight_t_m3: float,
    superstructure_load_t: float, moment_at_base_tm: float = 0.0,
    bottom_plug_weight_t: float = 0.0,
    cohesion_t_m2: float = 0.0, phi_deg: float = 0.0,
    gamma_avg_above_t_m3: float = 1.8, gamma_at_base_t_m3: float = 1.8,
    specific_gravity: float = 2.67, moisture_content_pct: float = 15.0,
    water_table_depth_m: float = 0.0, fos: float = 2.5,
    check_bearing: bool = False,
) -> dict:
    """
    Well (caisson) foundation -- IS 3955:1967 + IRC:78-2014 Section VII.
    Added 7 Aug 2026 -- Raahi asked for well foundation design; no personal
    reference workbook this time (unlike rock_socket_pile.py / rock_bearing_
    capacity.py, which were digitized cell-by-cell from Raahi's own Excel
    sheets), so this uses standard code/textbook formulas instead. Raahi
    confirmed: use IS 3955 / IRC:78 directly.

    SCOPE -- Phase 1 only (deliberately, flagged rather than silently
    dropped -- same policy as rock_socket_pile.py):
      - Grip length check (IRC:78's minimum-embedment rule)
      - Self-weight + eccentric base pressure (max/min under P and M, per
        the standard circular-section kern formula p = P/A(1 +/- 8e/D))
      - Bearing capacity check at the well base, by calling the existing
        audited IS:6403 shear engine (bearing_capacity_is6403_shear) with
        the well's own outer diameter as a circular footing -- reuses
        already-verified code rather than a second bearing formula.
    NOT IMPLEMENTED (deferred, same as rock socket's lateral/moment check):
      - Lateral stability / tilt & shift during sinking (IRC:78's "elastic
        theory" method -- needs a soil modulus-of-subgrade-reaction chart
        by soil type/density and an iterative depth-of-fixity procedure;
        materially different from this axial+moment check, and risky to
        freehand without a source workbook to cross-check against).
      - Steining thickness / hoop-stress design during sinking (IS 3955's
        own semi-empirical minimum-thickness rule, kentledge, skin-friction-
        during-sinking checks) -- steining_thickness_m here is a given
        input, not designed by this function.
      - Scour depth itself (Lacey's formula / IRC:5) -- max_scour_depth_m
        is a direct input, not computed here.
      - Bottom plug design (thickness, punching shear) -- its weight is
        taken as a direct optional input, not derived from plug geometry.
    Tell me if you want any of these built next -- they're real IRC:78/IS
    3955 clauses, just deferred so this first pass stays checkable.

    Units: t / m / t-m throughout (Indian geotechnical practice convention,
    matches every other calculator in this app).
    """
    if outer_dia_m <= 0:
        raise ValueError("Outer diameter must be positive.")
    if steining_thickness_m <= 0 or steining_thickness_m >= outer_dia_m / 2:
        raise ValueError("Steining thickness must be positive and less than half the outer diameter.")
    if founding_depth_m <= 0:
        raise ValueError("Founding depth (well base below GL/bed level) must be positive.")

    inner_dia_m = round(outer_dia_m - 2 * steining_thickness_m, 3)
    area_gross_m2 = round(math.pi / 4 * outer_dia_m ** 2, 3)
    area_annulus_m2 = round(math.pi / 4 * (outer_dia_m ** 2 - inner_dia_m ** 2), 3)

    # -- Grip length (IRC:78: embedment below max scour, min 1/3 of max scour depth) --
    grip_length_m = round(founding_depth_m - max_scour_depth_m, 3)
    min_grip_required_m = round(max_scour_depth_m / 3, 3)
    grip_adequate = grip_length_m >= min_grip_required_m

    warnings = [
        "Lateral stability / tilt & shift (IRC:78 elastic theory) is NOT checked by this calculator -- "
        "this is an axial load + moment check only. Get the lateral/elastic-theory check done separately "
        "before finalising the design.",
        "Steining thickness is taken as given, not designed here -- IS 3955's own minimum-thickness and "
        "sinking-stress checks (kentledge, skin friction during sinking) still need to be done separately.",
    ]
    if not grip_adequate:
        warnings.append(
            f"Grip length ({grip_length_m}m) is less than the IRC:78 minimum of scour/3 = {min_grip_required_m}m -- "
            f"increase founding depth or re-check the scour depth."
        )

    # -- Self-weight + total vertical load --
    self_weight_t = round(area_annulus_m2 * founding_depth_m * steining_unit_weight_t_m3, 2)
    total_vertical_load_t = round(superstructure_load_t + self_weight_t + bottom_plug_weight_t, 2)

    # -- Eccentric base pressure, circular section (kern radius = D/8) --
    eccentricity_m = round(moment_at_base_tm / total_vertical_load_t, 4) if total_vertical_load_t else 0.0
    kern_limit_m = round(outer_dia_m / 8, 4)
    no_tension = eccentricity_m <= kern_limit_m
    p_avg_t_m2 = round(total_vertical_load_t / area_gross_m2, 2)
    if no_tension:
        p_max_t_m2 = round(p_avg_t_m2 * (1 + 8 * eccentricity_m / outer_dia_m), 2)
        p_min_t_m2 = round(p_avg_t_m2 * (1 - 8 * eccentricity_m / outer_dia_m), 2)
    else:
        # e > D/8: base starts lifting off on one side -- the simple p=(P/A)(1+-8e/D)
        # formula no longer applies (it would give a negative/false p_min). Flagged,
        # not silently computed -- a proper partial-contact re-analysis is needed.
        p_max_t_m2 = None
        p_min_t_m2 = None
        warnings.append(
            f"Eccentricity ({eccentricity_m}m) exceeds the circular kern limit D/8 = {kern_limit_m}m -- "
            f"part of the base would lift off (no-tension condition violated). The standard p=(P/A)(1±8e/D) "
            f"formula doesn't apply here; max/min pressure isn't computed. Reduce the moment or increase the diameter."
        )

    # -- Bearing capacity check at founding level, reusing the audited IS:6403 shear engine --
    # Gated behind check_bearing: this only runs when the caller actually supplied real
    # soil parameters (cohesion/phi/etc). Without this gate, omitted params silently fall
    # back to cohesion=0, phi=0 defaults, producing a bogus near-zero "safe bearing capacity"
    # and misleading/false "exceeds bearing capacity" warnings. Fixed 8 Aug 2026.
    bearing_check = None
    if check_bearing and p_max_t_m2 is not None:
        try:
            bearing_check = bearing_capacity_is6403_shear(
                length_m=outer_dia_m, width_m=outer_dia_m, depth_m=founding_depth_m,
                cohesion_t_m2=cohesion_t_m2, phi_deg=phi_deg,
                gamma_avg_above_t_m3=gamma_avg_above_t_m3, gamma_at_base_t_m3=gamma_at_base_t_m3,
                specific_gravity=specific_gravity, moisture_content_pct=moisture_content_pct,
                water_table_depth_m=water_table_depth_m, shape="circular", fos=fos,
            )
            safe_net = bearing_check["result"]
            safe_gross = round(safe_net + gamma_avg_above_t_m3 * founding_depth_m, 2)
            bearing_check["safe_gross_bearing_capacity_t_m2"] = safe_gross
            if p_max_t_m2 > safe_gross:
                warnings.append(
                    f"Max base pressure ({p_max_t_m2} t/m²) exceeds the gross safe bearing capacity "
                    f"({safe_gross} t/m² = net {safe_net} + overburden {round(gamma_avg_above_t_m3 * founding_depth_m, 2)}) "
                    f"at this founding depth -- increase diameter/founding depth or reduce load."
                )
        except Exception as e:
            warnings.append(f"Bearing capacity check couldn't run: {e}")

    return {
        "clause": "IS 3955:1967 + IRC:78-2014, Section VII",
        "geometry": {
            "outer_dia_m": outer_dia_m, "inner_dia_m": inner_dia_m,
            "steining_thickness_m": steining_thickness_m,
            "area_gross_m2": area_gross_m2, "area_annulus_m2": area_annulus_m2,
            "founding_depth_m": founding_depth_m,
        },
        "grip_length": {
            "grip_length_m": grip_length_m,
            "min_required_m": min_grip_required_m,
            "adequate": grip_adequate,
        },
        "loads": {
            "superstructure_load_t": superstructure_load_t,
            "self_weight_t": self_weight_t,
            "bottom_plug_weight_t": bottom_plug_weight_t,
            "total_vertical_load_t": total_vertical_load_t,
            "moment_at_base_tm": moment_at_base_tm,
        },
        "base_pressure": {
            "eccentricity_m": eccentricity_m,
            "kern_limit_m": kern_limit_m,
            "no_tension": no_tension,
            "p_avg_t_m2": p_avg_t_m2,
            "p_max_t_m2": p_max_t_m2,
            "p_min_t_m2": p_min_t_m2,
        },
        "bearing_check": bearing_check,
        "warnings": warnings,
    }


CALCULATOR_REGISTRY = {
    "bearing_capacity_terzaghi": terzaghi_bearing_capacity,
    "bearing_capacity_is6403_shear": bearing_capacity_is6403_shear,
    "settlement_sbc_is8009_noncohesive": settlement_sbc_is8009_noncohesive,
    "settlement_sbc_is8009_cohesive": settlement_sbc_is8009_cohesive,
    "immediate_settlement": immediate_settlement,
    "consolidation_settlement": consolidation_settlement,
    "spt_correction": spt_correction,
    "earth_pressure_rankine": rankine_earth_pressure,
    "liquefaction_analysis": run_liquefaction_analysis,
    "well_foundation": well_foundation,
}
