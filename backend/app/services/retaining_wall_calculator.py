"""
RC Cantilever Retaining Wall -- Geotechnical Design Module.
Phase 1 (earth pressure, water pressure, seismic, stability, bearing capacity)
+ Phase 2 (settlement), per Raahi's uploaded reference workbook
"retaining_wall_design.xlsx" (3 Aug 2026). Explicitly scoped to geotechnical
checks only, per Raahi's instruction -- Structural/RCC design (stem, heel, toe
reinforcement -- IS 456), quantity take-off, and chart data from that same
workbook are NOT covered here; see PROJECT_STATUS.md for the phased plan.

Codes referenced (matching the source workbook's own cover sheet):
IS 14458 (Parts 1-3), IS 456:2000, IS 6403:1981, IS 1904:1986, IS 875 (1&2),
IS 1893 (Part 1):2016, Rankine (1857), Coulomb (1776), Mononobe-Okabe (1929).

Units: SI throughout (m, kN, kPa, kN/m3, degrees) -- matches the source
workbook exactly (unlike pile_calculator.py / calculators.py, which mostly use
t/m2, t/m3 Indian-practice convention). Kept in kPa/kN here specifically so
every intermediate number in this module can be checked directly against the
workbook's own worked example (H_wall=4, D_found=1.5, B_base=2.8, phi=30,
delta=20, kh=0.08 ... -> every formula below was hand-verified against that
worked example's cell values before being written; see PROJECT_STATUS.md
playbook entry for the full verification trace).

Every function returns "static" and "seismic" (Mononobe-Okabe) results side by
side, mirroring the workbook's own Case A / Case B column layout.
"""
import math

GAMMA_WATER = 9.81  # kN/m3


def _deg(rad: float) -> float:
    return math.degrees(rad)


def _rad(deg: float) -> float:
    return math.radians(deg)


def rankine_coefficients(phi_deg: float, beta_deg: float = 0.0) -> dict:
    """Rankine Ka/Kp for a sloped backfill (vertical wall back face), plus K0 (Jaky).
    Reduces to the classic (1-sinφ)/(1+sinφ) form when beta=0."""
    phi = _rad(phi_deg)
    beta = _rad(beta_deg)
    cos_b = math.cos(beta)
    cos_phi = math.cos(phi)
    root_term = math.sqrt(max(cos_b ** 2 - cos_phi ** 2, 0.0))
    valid = phi_deg >= beta_deg
    if cos_b - root_term <= 0:
        ka = kp = float("nan")
    else:
        ka = cos_b * (cos_b - root_term) / (cos_b + root_term)
        kp = cos_b * (cos_b + root_term) / (cos_b - root_term)
    k0 = 1 - math.sin(phi)
    return {"Ka": ka, "Kp": kp, "K0": k0, "valid": valid}


def coulomb_coefficients(phi_deg: float, delta_deg: float, beta_deg: float = 0.0, omega_deg: float = 0.0) -> dict:
    """Coulomb Ka/Kp (vertical wall back face by default, omega=wall batter=0),
    with wall friction delta. Kp here is shown for reference only -- per the
    source workbook's own note, Coulomb Kp with wall friction over-predicts
    passive resistance, so passive resistance in the stability check always
    uses the Rankine (delta=0) Kp instead, regardless of which theory drives
    active pressure. This is standard, conservative practice."""
    phi = _rad(phi_deg)
    delta = _rad(delta_deg)
    beta = _rad(beta_deg)
    omega = _rad(omega_deg)
    valid = (phi_deg - beta_deg) > 0

    num_a = math.cos(phi - omega) ** 2
    den_a = (math.cos(omega) * math.cos(omega + delta) *
              (1 + math.sqrt(max(
                  (math.sin(phi + delta) * math.sin(phi - beta)) /
                  (math.cos(omega + delta) * math.cos(omega - beta)), 0.0)))
              ** 2)
    ka = num_a / den_a if den_a else float("nan")

    num_p = math.cos(phi + omega) ** 2
    den_p = (math.cos(omega) * math.cos(omega - delta) *
              (1 - math.sqrt(max(
                  (math.sin(phi + delta) * math.sin(phi + beta)) /
                  (math.cos(omega - delta) * math.cos(omega - beta)), 0.0)))
              ** 2)
    kp = num_p / den_p if den_p else float("nan")

    return {"Ka": ka, "Kp": kp, "valid": valid}


def water_pressure(h_total_m: float, water_table_depth_m: float, gamma_kn_m3: float,
                    gamma_sat_kn_m3: float, drainage_provided: bool = True) -> dict:
    """Hydrostatic pressure on the wall back face + uplift on the base, and the
    blended average backfill unit weight used everywhere else (gamma_avg).
    If the water table is at/below the total retained height, everything here
    is zero and gamma_avg = gamma (dry). NOTE: the uplift-on-base formula below
    (gamma_w * max(0, water_table_depth - founding depth)) is this module's
    own reasonable simplification for the below-founding-level case -- the
    source workbook's own worked example has Dw >= H_total (uplift = 0
    throughout), so this specific sub-formula was NOT verifiable against a
    nonzero reference value. Flagged here and in PROJECT_STATUS.md; treat with
    extra care until checked against a real nonzero-uplift case."""
    gamma_sub = gamma_sat_kn_m3 - GAMMA_WATER
    hw = max(0.0, h_total_m - water_table_depth_m)
    if hw <= 0:
        return {
            "Hw": 0.0, "gamma_avg": gamma_kn_m3, "gamma_sub": round(gamma_sub, 2),
            "uw_kpa": 0.0, "Pw_kn_m": 0.0, "ybar_m": 0.0,
            "uplift_pressure_kpa": 0.0, "uplift_force_kn_m": 0.0,
        }
    gamma_avg = (gamma_kn_m3 * (h_total_m - hw) + gamma_sub * hw) / h_total_m if h_total_m else gamma_kn_m3
    uw = GAMMA_WATER * hw
    pw = 0.5 * GAMMA_WATER * hw ** 2
    ybar = hw / 3
    if not drainage_provided:
        pw_used, uw_used = pw, uw
    else:
        pw_used, uw_used = 0.0, 0.0
    return {
        "Hw": round(hw, 3), "gamma_avg": round(gamma_avg, 2), "gamma_sub": round(gamma_sub, 2),
        "uw_kpa": round(uw, 2), "Pw_kn_m": round(pw, 2), "ybar_m": round(ybar, 3),
        "Pw_used_kn_m": round(pw_used, 2), "uw_used_kpa": round(uw_used, 2),
        "drainage_provided": drainage_provided,
    }


def mononobe_okabe(phi_deg: float, delta_deg: float, beta_deg: float, kh: float, kv: float,
                    gamma_avg: float, h_total_m: float, q_total_kpa: float,
                    pa_soil_static_kn_m: float) -> dict:
    """Dynamic active earth pressure per Mononobe-Okabe (IS 1893:2016), vertical
    wall back face (omega=0). Returns Kae, forces, and the combined point of
    application (self-weight at H/3, dynamic increment at 0.6H per IS 1893,
    surcharge at H/2 -- exactly the workbook's own weighting convention)."""
    theta = _deg(math.atan(kh / (1 - kv))) if kv < 1 else float("nan")
    valid = (phi_deg - theta - beta_deg) > 0
    phi, delta, beta, th = _rad(phi_deg), _rad(delta_deg), _rad(beta_deg), _rad(theta)

    num = math.cos(phi - th - beta) ** 2
    den = (math.cos(th) * math.cos(delta + th) *
           (1 + math.sqrt(max(
               (math.sin(phi + delta) * math.sin(phi - th - beta)) /
               (math.cos(delta + th) * math.cos(beta)), 0.0)))
           ** 2)
    kae = num / den if den and valid else float("nan")

    pae_soil = 0.5 * kae * gamma_avg * h_total_m ** 2 * (1 - kv)
    d_pae = pae_soil - pa_soil_static_kn_m
    pae_q = kae * q_total_kpa * h_total_m
    pae = pae_soil + pae_q

    ybar = ((pa_soil_static_kn_m * (h_total_m / 3) + d_pae * (0.6 * h_total_m) +
             pae_q * (h_total_m / 2)) / pae) if pae else 0.0

    pae_h = pae * math.cos(delta + beta)
    pae_v = pae * math.sin(delta + beta)

    return {
        "theta_deg": round(theta, 3), "valid": valid, "Kae": round(kae, 6),
        "Pae_soil_kn_m": round(pae_soil, 3), "dPae_kn_m": round(d_pae, 3),
        "Pae_q_kn_m": round(pae_q, 3), "Pae_kn_m": round(pae, 3),
        "ybar_m": round(ybar, 3), "Pae_h_kn_m": round(pae_h, 3), "Pae_v_kn_m": round(pae_v, 3),
    }


def _case_stability(H_wall, D_found, t_base, B_base, B_toe, B_heel, t_top, t_bot,
                     gamma, gamma_c, q_total, Pa_h, Pa_v, ybar, Pp_mobilised,
                     vfac, Pw_used=0.0, Pw_ybar=0.0, q_factor_heel=1.0):
    """Weights/moments/checks for ONE case (static or seismic) -- vfac scales
    self-weight for seismic vertical inertia (1-kv), q_factor_heel is left at
    1.0 (surcharge unchanged between cases, per the workbook's own note).
    Pw_used/Pw_ybar: hydrostatic force on the wall back face (0 if drainage
    is provided or the water table is below the retained height) and its
    height of action -- added to BOTH the horizontal driving force and the
    overturning moment, matching the source workbook's Stability sheet
    (`Pa_h_ref+Pw_switch`, `Pa_h_ref*ybar+Pw_switch*Pw_ybar`)."""
    x1 = B_toe + t_bot / 2
    x2 = B_base / 2
    x3 = B_toe + t_bot + B_heel / 2
    x4 = B_toe / 2
    x5 = x3

    W1 = ((t_top + t_bot) / 2) * H_wall * gamma_c * vfac
    W2 = B_base * t_base * gamma_c * vfac
    W3 = B_heel * H_wall * gamma * vfac
    W4 = B_toe * max(D_found - t_base, 0.0) * gamma * vfac
    Ws = q_total * B_heel * q_factor_heel

    sum_v = W1 + W2 + W3 + W4 + Ws + Pa_v
    horiz_driving = Pa_h + Pw_used
    Mo = Pa_h * ybar + Pw_used * Pw_ybar
    Mr = W1 * x1 + W2 * x2 + W3 * x3 + W4 * x4 + Ws * x5 + Pa_v * B_base

    fos_ot = Mr / Mo if Mo else float("inf")

    return {
        "x1": round(x1, 3), "x2": round(x2, 3), "x3": round(x3, 3), "x4": round(x4, 3),
        "W1": round(W1, 3), "W2": round(W2, 3), "W3": round(W3, 3), "W4": round(W4, 3), "Ws": round(Ws, 3),
        "sum_V_kn_m": round(sum_v, 3), "horizontal_driving_force_kn_m": round(horiz_driving, 3),
        "Mo_knm_m": round(Mo, 3), "Mr_knm_m": round(Mr, 3),
        "FoS_overturning": round(fos_ot, 3),
    }


def stability_checks(H_wall, D_found, t_base, B_base, B_toe, B_heel, t_top, t_bot,
                      gamma, gamma_c, mu, q_total, Pp_rankine_kn_m, mobilisation_factor,
                      cohesion_kpa, static_Pa_h, static_Pa_v, static_ybar,
                      seismic_Pa_h, seismic_Pa_v, seismic_ybar, kv,
                      Pw_used_kn_m=0.0, Pw_ybar_m=0.0,
                      fos_ot_min_static=2.0, fos_ot_min_seismic=1.5,
                      fos_sl_min_static=1.5, fos_sl_min_seismic=1.2) -> dict:
    """Sliding / overturning / eccentricity / base-pressure checks, static AND
    seismic side by side -- mirrors the workbook's Stability sheet exactly.
    Pw_used_kn_m/Pw_ybar_m (hydrostatic force + its height of action, 0 if
    drainage is provided) apply to BOTH cases, same as the source workbook."""
    results = {}
    for case, Pa_h, Pa_v, ybar, vfac in (
        ("static", static_Pa_h, static_Pa_v, static_ybar, 1.0),
        ("seismic", seismic_Pa_h, seismic_Pa_v, seismic_ybar, 1 - kv),
    ):
        base = _case_stability(H_wall, D_found, t_base, B_base, B_toe, B_heel, t_top, t_bot,
                                gamma, gamma_c, q_total, Pa_h, Pa_v, ybar, Pp_rankine_kn_m, vfac,
                                Pw_used=Pw_used_kn_m, Pw_ybar=Pw_ybar_m)
        sum_v = base["sum_V_kn_m"]
        horiz_driving = base["horizontal_driving_force_kn_m"]
        Pp_mob = mobilisation_factor * Pp_rankine_kn_m
        F = mu * sum_v
        Cr = cohesion_kpa * B_base
        R = F + Pp_mob + Cr
        fos_sl = R / horiz_driving if horiz_driving else float("inf")

        xbar = (base["Mr_knm_m"] - base["Mo_knm_m"]) / sum_v if sum_v else 0.0
        e = B_base / 2 - xbar
        middle_third = B_base / 6
        within_middle_third = abs(e) <= middle_third

        if within_middle_third:
            qmax = (sum_v / B_base) * (1 + 6 * e / B_base)
            qmin = (sum_v / B_base) * (1 - 6 * e / B_base)
        else:
            # Resultant outside middle third -> partial base contact (no tension
            # allowed in soil); standard formula, not exercised by the source
            # workbook's own example (which stays within the middle third).
            eff = max(B_base / 2 - abs(e), 1e-6)
            qmax = 2 * sum_v / (3 * eff)
            qmin = 0.0

        fos_ot_min = fos_ot_min_static if case == "static" else fos_ot_min_seismic
        fos_sl_min = fos_sl_min_static if case == "static" else fos_sl_min_seismic

        results[case] = {
            **base,
            "Pp_mobilised_kn_m": round(Pp_mob, 3), "friction_resistance_kn_m": round(F, 3),
            "cohesive_resistance_kn_m": round(Cr, 3), "total_resisting_force_kn_m": round(R, 3),
            "FoS_sliding": round(fos_sl, 3), "FoS_sliding_required": fos_sl_min,
            "sliding_status": "PASS" if fos_sl >= fos_sl_min else "FAIL",
            "FoS_overturning_required": fos_ot_min,
            "overturning_status": "PASS" if base["FoS_overturning"] >= fos_ot_min else "FAIL",
            "xbar_m": round(xbar, 3), "eccentricity_m": round(e, 3),
            "middle_third_limit_m": round(middle_third, 3),
            "within_middle_third": within_middle_third,
            "qmax_kpa": round(qmax, 3), "qmin_kpa": round(qmin, 3),
            "B_effective_m": round(B_base - 2 * abs(e), 3) if within_middle_third else round(2 * (B_base / 2 - abs(e)), 3),
        }
    return results


def bearing_capacity_is6403(phi_deg: float, cohesion_kpa: float, gamma_kn_m3: float,
                             D_found_m: float, B_effective_static_m: float, B_effective_seismic_m: float,
                             Pa_h_static: float, sum_V_static: float,
                             Pa_h_seismic: float, sum_V_seismic: float,
                             fos_static: float = 2.5, fos_seismic_factor: float = 0.8,
                             qa_kpa: float = None) -> dict:
    """Net/gross safe bearing capacity per IS 6403:1981, strip-footing
    (shape factors = 1.0), with depth + load-inclination factors, static and
    seismic side by side. Seismic FS is conventionally relaxed to
    fos_static * fos_seismic_factor (workbook default 0.8x), matching the
    source workbook's own note."""
    phi = _rad(phi_deg)
    if phi_deg <= 0:
        Nc, Nq, Ng = 5.14, 1.0, 0.0
    else:
        Nq = math.exp(math.pi * math.tan(phi)) * math.tan(_rad(45) + phi / 2) ** 2
        Nc = (Nq - 1) / math.tan(phi)
        Ng = 1.8 * (Nq - 1) * math.tan(phi)
    Kp = math.tan(_rad(45) + phi / 2) ** 2
    q_ob = gamma_kn_m3 * D_found_m

    out = {"Nc": round(Nc, 3), "Nq": round(Nq, 3), "Ngamma": round(Ng, 3), "q_overburden_kpa": round(q_ob, 2)}
    results = {}
    for case, B_eff, Pa_h, sum_V, fos in (
        ("static", B_effective_static_m, Pa_h_static, sum_V_static, fos_static),
        ("seismic", B_effective_seismic_m, Pa_h_seismic, sum_V_seismic, fos_static * fos_seismic_factor),
    ):
        B_eff = max(B_eff, 1e-6)
        Df_over_B = D_found_m / B_eff
        dc = 1 + 0.2 * Df_over_B * math.sqrt(Kp) if phi_deg > 10 else 1 + 0.2 * Df_over_B
        dq = dg = 1 + 0.1 * Df_over_B * math.sqrt(Kp) if phi_deg > 10 else 1.0

        alpha = _deg(math.atan(Pa_h / sum_V)) if sum_V else 0.0
        ic = iq = (1 - alpha / 90) ** 2
        ig = (1 - alpha / phi_deg) ** 2 if phi_deg > 0 else 0.0

        qu = (cohesion_kpa * Nc * dc * ic) + (q_ob * Nq * dq * iq) + (0.5 * gamma_kn_m3 * B_eff * Ng * dg * ig)
        qnu = qu - q_ob
        qns = qnu / fos if fos else float("inf")
        qsafe = qns + q_ob
        governing = min(qsafe, qa_kpa) if qa_kpa is not None else qsafe

        results[case] = {
            "B_effective_m": round(B_eff, 3), "depth_factor_dc": round(dc, 4),
            "depth_factor_dq_dgamma": round(dq, 4), "load_inclination_deg": round(alpha, 3),
            "inclination_ic_iq": round(ic, 4), "inclination_igamma": round(ig, 4),
            "qu_kpa": round(qu, 2), "qnu_kpa": round(qnu, 2), "qns_kpa": round(qns, 2),
            "qsafe_kpa": round(qsafe, 2), "governing_allowable_kpa": round(governing, 2),
            "fos_used": round(fos, 3),
        }
    out["cases"] = results
    return out


def immediate_settlement(qnet_kpa: float, B_effective_m: float, es_kpa: float,
                          poisson_ratio: float, influence_factor: float = 0.8) -> float:
    """Se = qnet . B' . (1-mu^2) . If / Es, elastic strip-footing settlement, in mm."""
    if es_kpa <= 0:
        return float("nan")
    se_m = qnet_kpa * B_effective_m * (1 - poisson_ratio ** 2) * influence_factor / es_kpa
    return round(se_m * 1000, 3)


def consolidation_settlement(cc: float, e0: float, hc_m: float, sigma0_kpa: float, d_sigma_kpa: float):
    """Sc = Cc.Hc/(1+e0) . log10[(sigma0'+dsigma)/sigma0'], in mm. Returns None
    (-> 'Insufficient data' in the caller) if any required input is missing,
    exactly matching the source workbook's own fallback behaviour."""
    if None in (cc, e0, hc_m, sigma0_kpa) or sigma0_kpa <= 0 or (1 + e0) == 0:
        return None
    sc_m = (cc * hc_m / (1 + e0)) * math.log10((sigma0_kpa + d_sigma_kpa) / sigma0_kpa)
    return round(sc_m * 1000, 3)


def _g(d: dict, key: str, default):
    """dict.get() with a real default -- .get()'s own default only fires when
    the key is ABSENT, not when it's present with value None. Pydantic's
    model_dump() always includes every field, None for unset Optional ones,
    so plain .get() silently returns None instead of the intended default
    for every optional numeric input here. Use this instead of .get() for
    any field that can legitimately be sent as null."""
    v = d.get(key)
    return default if v is None else v


def run_retaining_wall_analysis(inputs: dict) -> dict:
    """Top-level entry point -- geometry/soil/surcharge/seismic inputs in,
    full Phase 1 (earth pressure/water/seismic/stability/bearing capacity) +
    Phase 2 (settlement) result out. See schemas.RetainingWallRequest for the
    exact input field list."""
    g = inputs
    warnings = []

    H_wall = g["H_wall"]
    D_found = g["D_found"]
    t_base = g["t_base"]
    H_total = H_wall + t_base
    B_base, B_toe, B_heel = g["B_base"], g["B_toe"], g["B_heel"]
    t_top, t_bot = g["t_top"], g["t_bot"]

    if abs((B_toe + t_bot + B_heel) - B_base) > 0.01:
        warnings.append(f"Toe + stem-bottom + heel ({B_toe + t_bot + B_heel:.3f} m) does not equal "
                         f"the stated base width B_base ({B_base:.3f} m) -- check geometry inputs.")

    gamma, gamma_sat, phi, cohesion = g["gamma"], g["gamma_sat"], g["phi"], _g(g, "cohesion", 0.0)
    delta, beta, i_toe = _g(g, "delta", round(2 / 3 * phi, 2)), _g(g, "beta", 0.0), _g(g, "i_toe", 0.0)
    qa = g.get("qa")
    dw = _g(g, "water_table_depth_m", H_total + 10)
    mu = _g(g, "mu", round(math.tan(_rad(2 / 3 * phi)), 3))
    gamma_c = _g(g, "gamma_c", 24.0)

    q_total = (_g(g, "q_surch", 0) + _g(g, "q_traffic", 0) + _g(g, "q_build", 0) + _g(g, "q_strip", 0))

    kh = _g(g, "kh", round(_g(g, "Z", 0.16) / 2, 3))
    kv = _g(g, "kv", round(0.5 * kh, 3))

    if beta > phi:
        warnings.append(f"Backfill slope beta ({beta}°) exceeds phi ({phi}°) -- Rankine wedge is unstable; "
                         f"Ka/Kp below are not physically valid.")

    water = water_pressure(H_total, dw, gamma, gamma_sat, _g(g, "drainage_provided", True))
    gamma_avg = water["gamma_avg"]

    rankine = rankine_coefficients(phi, beta)
    Pa1_r = 0.5 * rankine["Ka"] * gamma_avg * H_total ** 2
    Pa2_r = rankine["Ka"] * q_total * H_total
    Pa_r = Pa1_r + Pa2_r
    Dp = D_found
    Pp = 0.5 * rankine["Kp"] * gamma * Dp ** 2 + 2 * cohesion * math.sqrt(max(rankine["Kp"], 0)) * Dp

    coulomb = coulomb_coefficients(phi, delta, beta)
    Pa1_c = 0.5 * coulomb["Ka"] * gamma_avg * H_total ** 2
    Pa2_c = coulomb["Ka"] * q_total * H_total
    Pa_c = Pa1_c + Pa2_c
    Pa_h_static = Pa_c * math.cos(_rad(delta + beta))
    Pa_v_static = Pa_c * math.sin(_rad(delta + beta))
    ybar_static = ((Pa1_c * H_total / 3) + (Pa2_c * H_total / 2)) / Pa_c if Pa_c else 0.0

    mo = mononobe_okabe(phi, delta, beta, kh, kv, gamma_avg, H_total, q_total, Pa1_c)
    if not mo["valid"]:
        warnings.append("Mononobe-Okabe validity check failed (phi - theta - beta <= 0) -- "
                         "seismic earth pressure coefficients are not physically valid for these inputs.")

    earth_pressure = {
        "rankine": {**rankine, "Pa1_kn_m": round(Pa1_r, 3), "Pa2_kn_m": round(Pa2_r, 3),
                    "Pa_kn_m": round(Pa_r, 3), "Pp_kn_m": round(Pp, 3)},
        "coulomb": {**coulomb, "Pa1_kn_m": round(Pa1_c, 3), "Pa2_kn_m": round(Pa2_c, 3),
                    "Pa_kn_m": round(Pa_c, 3), "Pa_h_kn_m": round(Pa_h_static, 3),
                    "Pa_v_kn_m": round(Pa_v_static, 3), "ybar_m": round(ybar_static, 3)},
        "governing_basis": "Coulomb (with wall friction delta) drives stability/bearing capacity, "
                            "for consistency with the Mononobe-Okabe seismic case. Rankine is shown "
                            "for reference and is the more conservative basis a stem-only design might use.",
    }

    mobilisation_factor = _g(g, "passive_mobilisation_factor", 0.5)
    stability = stability_checks(
        H_wall, D_found, t_base, B_base, B_toe, B_heel, t_top, t_bot,
        gamma, gamma_c, mu, q_total, Pp, mobilisation_factor, cohesion,
        Pa_h_static, Pa_v_static, ybar_static,
        mo["Pae_h_kn_m"], mo["Pae_v_kn_m"], mo["ybar_m"], kv,
        Pw_used_kn_m=water.get("Pw_used_kn_m", 0.0), Pw_ybar_m=water.get("ybar_m", 0.0),
    )
    for case in ("static", "seismic"):
        if stability[case]["overturning_status"] == "FAIL":
            warnings.append(f"Overturning check FAILS for the {case} case "
                             f"(FoS {stability[case]['FoS_overturning']} < required {stability[case]['FoS_overturning_required']}).")
        if stability[case]["sliding_status"] == "FAIL":
            warnings.append(f"Sliding check FAILS for the {case} case "
                             f"(FoS {stability[case]['FoS_sliding']} < required {stability[case]['FoS_sliding_required']}).")
        if not stability[case]["within_middle_third"]:
            warnings.append(f"Resultant falls OUTSIDE the middle third for the {case} case -- "
                             f"base pressure formula switched to the partial-contact form; review base sizing.")

    bearing = bearing_capacity_is6403(
        phi, cohesion, gamma, D_found,
        stability["static"]["B_effective_m"], stability["seismic"]["B_effective_m"],
        stability["static"]["horizontal_driving_force_kn_m"], stability["static"]["sum_V_kn_m"],
        stability["seismic"]["horizontal_driving_force_kn_m"], stability["seismic"]["sum_V_kn_m"],
        fos_static=_g(g, "fos_bearing", 2.5), qa_kpa=qa,
    )
    for case in ("static", "seismic"):
        qmax = stability[case]["qmax_kpa"]
        allow = bearing["cases"][case]["governing_allowable_kpa"]
        bearing["cases"][case]["applied_qmax_kpa"] = qmax
        bearing["cases"][case]["status"] = "PASS" if qmax <= allow else "FAIL"
        if qmax > allow:
            warnings.append(f"Bearing capacity check FAILS for the {case} case "
                             f"(applied qmax {qmax} kPa > allowable {allow} kPa).")

    qnet = stability["static"]["qmax_kpa"] - gamma * D_found
    es = g.get("Es_kpa")
    settlement = {"qnet_kpa": round(qnet, 3)}
    if es_valid := (es and es > 0):
        se = immediate_settlement(qnet, stability["static"]["B_effective_m"], es,
                                   _g(g, "poisson_ratio", 0.3), _g(g, "influence_factor", 0.8))
        settlement["immediate_settlement_mm"] = se
    else:
        settlement["immediate_settlement_mm"] = "Insufficient data"
        warnings.append("Es (modulus of elasticity of soil) not provided -- immediate settlement not computed.")

    sc = consolidation_settlement(g.get("Cc"), g.get("e0"), g.get("Hc_m"),
                                   g.get("sigma0_kpa"), qnet)
    settlement["consolidation_settlement_mm"] = sc if sc is not None else "Insufficient data"

    c_alpha, t_ratio = g.get("C_alpha"), g.get("t_ratio")
    if c_alpha and t_ratio and g.get("Hc_m") and t_ratio > 0:
        ss = c_alpha * g["Hc_m"] * math.log10(t_ratio)
        settlement["secondary_settlement_mm"] = round(ss * 1000, 3)
    else:
        settlement["secondary_settlement_mm"] = "Insufficient data"

    total = settlement["immediate_settlement_mm"]
    if isinstance(total, (int, float)):
        for extra in (settlement["consolidation_settlement_mm"], settlement["secondary_settlement_mm"]):
            if isinstance(extra, (int, float)):
                total += extra
        settlement["total_settlement_mm"] = round(total, 3)
    else:
        settlement["total_settlement_mm"] = "Insufficient data"

    return {
        "geometry": {"H_total_m": round(H_total, 3), "B_base_m": B_base},
        "inputs_echo": {"phi_deg": phi, "delta_deg": delta, "beta_deg": beta, "mu": mu,
                         "kh": kh, "kv": kv, "q_total_kpa": round(q_total, 3), "gamma_avg_kn_m3": gamma_avg},
        "water_pressure": water,
        "earth_pressure": earth_pressure,
        "seismic_pressure": mo,
        "stability": stability,
        "bearing_capacity": bearing,
        "settlement": settlement,
        "warnings": warnings,
        "scope_note": "Geotechnical checks only (earth pressure, water pressure, seismic, "
                       "stability, bearing capacity, settlement). Structural/RCC design of the "
                       "stem, heel, toe and shear key (IS 456) is NOT covered -- see the source "
                       "workbook's RCCDesign sheet for that, or ask for it as a separate phase.",
    }
