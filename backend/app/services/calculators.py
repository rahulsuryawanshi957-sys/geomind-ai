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


CALCULATOR_REGISTRY = {
    "bearing_capacity_terzaghi": terzaghi_bearing_capacity,
    "immediate_settlement": immediate_settlement,
    "consolidation_settlement": consolidation_settlement,
    "spt_correction": spt_correction,
    "earth_pressure_rankine": rankine_earth_pressure,
}
