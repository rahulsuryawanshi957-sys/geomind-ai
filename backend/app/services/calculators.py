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

    def bearing_factors(phi_rad, phi_deg_val):
        if phi_deg_val == 0:
            return 5.14, 1.0, 0.0
        Nq = math.tan(math.radians(45) + phi_rad / 2) ** 2 * math.exp(math.pi * math.tan(phi_rad))
        Nc = (Nq - 1) / math.tan(phi_rad)
        Ngamma = 2 * (Nq + 1) * math.tan(phi_rad)
        return Nc, Nq, Ngamma

    Nc, Nq, Ngamma = bearing_factors(phi, phi_deg)
    Ncl, Nql, Ngammal = bearing_factors(phi_local, phi_local_deg)
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

    gross_sbc = qns_recommended + gamma_avg_above_t_m3 * D_eff
    steps.append(f"Gross allowable SBC = net SBC + γ_avg·D = {gross_sbc:.2f} t/m²")

    return {
        "result": round(gross_sbc, 2),
        "unit": "t/m² (gross allowable SBC)",
        "formula": "Qns = (c·Nc·Sc·dc + γ·D·(Nq-1)·Sq·dq + 0.5·B·γ·Nγ·Sγ·dγ·Rw) / FOS  [IS:6403-1981]",
        "steps": steps,
        "assumptions": [
            f"Factor of safety = {fos}",
            "Inclination factors taken as 1 (vertical load only)",
            f"Footing shape: {shape}",
            "General/local shear interpolation uses void ratio thresholds e<0.55 (general) and e>0.75 (local), per the source workbook's convention",
        ],
        "warnings": [
            "Net SBC (before adding overburden) = " + f"{qns_recommended:.2f} t/m² — use this for structural net pressure checks.",
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
    z_mid = depth_m + 0.5 * influence_depth  # representative mid-depth of the influence layer
    steps.append(f"Depth of influence = {'manual override' if influence_depth_m is not None else '1.5·B'} = {influence_depth:.2f} m below footing")
    steps.append(f"Representative mid-depth for stress calc z = D + 0.5·(influence depth) = {z_mid:.2f} m")

    # Corner-point Boussinesq stress influence factor for a rectangular loaded area
    F = math.sqrt((length_m / 2) ** 2 + z_mid ** 2)
    G = math.sqrt((width_m / 2) ** 2 + z_mid ** 2)
    H = math.sqrt((length_m / 2) ** 2 + (width_m / 2) ** 2 + z_mid ** 2)
    P = (4 / (2 * math.pi)) * (
        math.atan((0.25 * length_m * width_m) / (z_mid * H))
        + (0.25 * length_m * width_m * z_mid / H) * (1 / F ** 2 + 1 / G ** 2)
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
    z_mid = depth_m + 0.5 * H
    steps.append(f"Clay layer thickness H = {'manual override' if layer_thickness_m is not None else '1.5·B'} = {H:.2f} m")
    steps.append(f"Representative mid-depth z = D + 0.5·H = {z_mid:.2f} m")

    # Effective overburden stress at mid-depth (P0)
    P0 = gamma_avg_above_t_m3 * z_mid
    steps.append(f"Effective overburden stress P0 = γ_avg·z = {P0:.3f} t/m²")

    # Boussinesq corner-point stress influence factor (same as the granular calculator)
    F = math.sqrt((length_m / 2) ** 2 + z_mid ** 2)
    G = math.sqrt((width_m / 2) ** 2 + z_mid ** 2)
    Hc = math.sqrt((length_m / 2) ** 2 + (width_m / 2) ** 2 + z_mid ** 2)
    Iz = (4 / (2 * math.pi)) * (
        math.atan((0.25 * length_m * width_m) / (z_mid * Hc))
        + (0.25 * length_m * width_m * z_mid / Hc) * (1 / F ** 2 + 1 / G ** 2)
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
    outside every recorded layer (shallower than the shallowest, or deeper
    than the deepest), clamps to whichever of those is nearest."""
    for l in layers:
        if l.from_m <= depth_m < l.to_m:
            return l
    ordered = sorted(layers, key=lambda l: l.from_m)
    return ordered[0] if depth_m < ordered[0].from_m else ordered[-1]


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


def run_batch_matrix(
    layers: list, water_table_depth_m: float | None,
    widths_m: list[float], depths_m: list[float], length_m: float | None,
    shape: str = "square", fos: float = 2.5, allowable_settlement_mm: float = 25,
    consolidation_type: str = "NCS", rigidity_factor: float = 1.0,
    overrides: dict | None = None,
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
    """
    overrides = overrides or {}
    if not layers:
        raise ValueError("This borehole has no soil layers recorded.")
    if not widths_m or not depths_m:
        raise ValueError("Provide at least one footing width and one depth.")
    if water_table_depth_m is None:
        raise ValueError("This borehole has no water table depth recorded -- required for both SBC methods.")

    layers = sorted(layers, key=lambda l: l.from_m)
    combos = []

    for w in widths_m:
        for d in depths_m:
            L = length_m if length_m else w
            row = {"width_m": w, "depth_m": d, "length_m": L}
            try:
                founding = _founding_layer(layers, d)
                row["founding_layer"] = f"{founding.from_m}-{founding.to_m}m" + (f" ({founding.classification})" if founding.classification else "")

                def field(name):
                    if overrides.get(name) is not None:
                        return overrides[name]
                    val, _ = _resolve_field(layers, founding, name)
                    if val is None:
                        raise ValueError(f"No layer in this borehole has '{name}' -- add it as a manual override to run this batch.")
                    return val

                cohesion = field("cohesion_t_m2")
                phi = field("friction_angle_deg")
                gamma_base = field("bulk_density_t_m3")
                sg = field("specific_gravity")
                wc = field("moisture_content_pct")

                if overrides.get("gamma_avg_above_t_m3") is not None:
                    gamma_above = overrides["gamma_avg_above_t_m3"]
                else:
                    gamma_above = _weighted_overburden(layers, d, "bulk_density_t_m3") or gamma_base

                soil_type = overrides.get("soil_type") or ("cohesive" if founding.compression_index_cc is not None else "noncohesive")

                shear = bearing_capacity_is6403_shear(
                    length_m=L, width_m=w, depth_m=d,
                    cohesion_t_m2=cohesion, phi_deg=phi,
                    gamma_avg_above_t_m3=gamma_above, gamma_at_base_t_m3=gamma_base,
                    specific_gravity=sg, moisture_content_pct=wc,
                    water_table_depth_m=water_table_depth_m, shape=shape, fos=fos,
                )

                if soil_type == "noncohesive":
                    n_value = field("n_value")
                    settlement = settlement_sbc_is8009_noncohesive(
                        length_m=L, width_m=w, depth_m=d, n_value=n_value,
                        allowable_settlement_mm=allowable_settlement_mm,
                        water_table_depth_m=water_table_depth_m, rigidity_factor=rigidity_factor,
                    )
                else:
                    cc = field("compression_index_cc")
                    e0 = field("initial_void_ratio_e0")
                    if overrides.get("elastic_modulus_t_m2") is not None:
                        es = overrides["elastic_modulus_t_m2"]
                    else:
                        n_for_es, _ = _resolve_field(layers, founding, "n_value")
                        if n_for_es is None:
                            raise ValueError("No N-value anywhere in this borehole to estimate elastic modulus -- add 'elastic_modulus_t_m2' as a manual override.")
                        es = 30 * (n_for_es + 6)  # Bowles correlation, same fallback the single-calculator UI uses
                    settlement = settlement_sbc_is8009_cohesive(
                        length_m=L, width_m=w, depth_m=d,
                        elastic_modulus_t_m2=es, compression_index_cc=cc, initial_void_ratio_e0=e0,
                        gamma_avg_above_t_m3=gamma_above, allowable_settlement_mm=allowable_settlement_mm,
                        consolidation_type=consolidation_type, rigidity_factor=rigidity_factor,
                    )

                shear_val, settlement_val = shear["result"], settlement["result"]
                recommended = min(shear_val, settlement_val)
                row.update({
                    "soil_type": soil_type,
                    "shear_sbc": shear_val,
                    "settlement_sbc": settlement_val,
                    "recommended_sbc": round(recommended, 2),
                    "governing": "shear (IS:6403)" if shear_val <= settlement_val else "settlement (IS:8009)",
                })
            except (ValueError, ZeroDivisionError) as e:
                row["error"] = str(e)
            combos.append(row)

    valid = [c for c in combos if "error" not in c]
    critical = min(valid, key=lambda c: c["recommended_sbc"]) if valid else None

    return {
        "unit": "t/m²",
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


CALCULATOR_REGISTRY = {
    "bearing_capacity_terzaghi": terzaghi_bearing_capacity,
    "bearing_capacity_is6403_shear": bearing_capacity_is6403_shear,
    "settlement_sbc_is8009_noncohesive": settlement_sbc_is8009_noncohesive,
    "settlement_sbc_is8009_cohesive": settlement_sbc_is8009_cohesive,
    "immediate_settlement": immediate_settlement,
    "consolidation_settlement": consolidation_settlement,
    "spt_correction": spt_correction,
    "earth_pressure_rankine": rankine_earth_pressure,
}
