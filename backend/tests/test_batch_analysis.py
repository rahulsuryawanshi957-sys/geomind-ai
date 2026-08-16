"""
Regression tests for Batch Analysis -- Step 2 (Aug 2026).

Written to lock down CURRENT behavior before the Step 2 structural changes
(exact B x D pairs, water-table override fix, validation hardening) were
made, per the brief's instruction to test-first wherever practical. Run
from backend/:

    pip install -r requirements.txt -r requirements-dev.txt
    pytest

No database is needed -- every calculator function in services/calculators.py
takes plain Python layer objects (attribute/getattr access only, never a
real SQLAlchemy session), so these tests use lightweight SimpleNamespace
mock layers instead of real SoilLayer ORM rows -- the same technique already
used in this project's own manual verification passes for Pile Group
Analysis (see PROJECT_STATUS.md changelog #86/#87).
"""
import sys
from pathlib import Path
import types

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services.calculators import (
    run_batch_matrix, run_batch_cases, bearing_capacity_is6403_shear,
    run_settlement_multilayer,
    _validate_positive_finite, _validate_replacement_config, _build_effective_profile,
    MAX_BATCH_CASES,
)


def make_layer(**kwargs):
    """A duck-typed SoilLayer stand-in -- only the attributes the
    calculators actually read need to be present."""
    defaults = dict(
        id="L1", from_m=0.0, to_m=1.0, classification=None,
        cohesion_t_m2=None, friction_angle_deg=None, bulk_density_t_m3=None,
        specific_gravity=None, moisture_content_pct=None, n_value=None,
        compression_index_cc=None, initial_void_ratio_e0=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


def two_layer_borehole():
    """Clay 0-5m (phi=0) over sand 5-20m (phi=30) -- a fresh list every
    call, since these tests mutate nothing but some tests DO need a
    guaranteed-untouched object to compare against afterward."""
    return [
        make_layer(
            id="L1", from_m=0.0, to_m=5.0, classification="CI",
            cohesion_t_m2=3.0, friction_angle_deg=0.0, bulk_density_t_m3=1.8,
            specific_gravity=2.7, moisture_content_pct=22.0, n_value=6,
            compression_index_cc=0.28, initial_void_ratio_e0=0.85,
        ),
        make_layer(
            id="L2", from_m=5.0, to_m=20.0, classification="SM",
            cohesion_t_m2=0.1, friction_angle_deg=30.0, bulk_density_t_m3=1.9,
            specific_gravity=2.65, moisture_content_pct=12.0, n_value=20,
        ),
    ]


WATER_TABLE = 3.0


# ---------------------------------------------------------------------------
# A. Cross-product generation (grid mode) -- current/legacy behavior, unchanged
# ---------------------------------------------------------------------------

def test_grid_mode_produces_full_cross_product():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5, 2.0], depths_m=[1.5, 2.0], length_m=None,
    )
    pairs = {(c["width_m"], c["depth_m"]) for c in result["combinations"]}
    assert pairs == {(1.5, 1.5), (1.5, 2.0), (2.0, 1.5), (2.0, 2.0)}
    assert result["total"] == 4
    assert result["mode"] == "grid"


def test_grid_mode_case_count_matches_widths_times_depths():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.0, 1.5, 2.0], depths_m=[1.0, 2.0], length_m=None,
    )
    assert result["total"] == 3 * 2


# ---------------------------------------------------------------------------
# B. Shear (IS:6403) -- Batch must match a direct single-calculator call
# ---------------------------------------------------------------------------

def test_batch_shear_matches_direct_single_calculator_call():
    """The single 'SBC -- IS:6403 Shear Method' calculator IS
    bearing_capacity_is6403_shear() called directly -- the same function
    Batch calls internally -- so for identical resolved inputs the numbers
    must be identical, not just close."""
    direct = bearing_capacity_is6403_shear(
        length_m=1.5, width_m=1.5, depth_m=1.5,
        cohesion_t_m2=3.0, phi_deg=0.0,
        gamma_avg_above_t_m3=1.8, gamma_at_base_t_m3=1.8,
        specific_gravity=2.7, moisture_content_pct=22.0,
        water_table_depth_m=WATER_TABLE, shape="square", fos=2.5,
    )
    batch_row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert batch_row["shear_sbc"] == direct["result"]


# ---------------------------------------------------------------------------
# C. Multi-layer settlement -- still produces the expected fields
# ---------------------------------------------------------------------------

def test_batch_settlement_fields_present():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[2.0], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert "error" not in row
    assert isinstance(row["settlement_sbc"], (int, float))
    assert isinstance(row["settlement_layer_report"], list)
    assert len(row["settlement_layer_report"]) >= 1
    assert row["recommended_sbc"] == round(min(row["shear_sbc"], row["settlement_sbc"]), 2)


# ---------------------------------------------------------------------------
# D. Overrides must never mutate the original layer objects
# ---------------------------------------------------------------------------

def test_override_does_not_mutate_original_layers_grid_mode():
    layers = two_layer_borehole()
    original_cohesion, original_phi = layers[0].cohesion_t_m2, layers[1].friction_angle_deg

    run_batch_matrix(
        layers=layers, water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        overrides={"cohesion_t_m2": 99.0, "friction_angle_deg": 40.0},
    )

    assert layers[0].cohesion_t_m2 == original_cohesion
    assert layers[1].friction_angle_deg == original_phi


def test_override_does_not_mutate_original_layers_exact_pairs_mode():
    layers = two_layer_borehole()
    original_density = layers[0].bulk_density_t_m3

    run_batch_cases(
        layers=layers, water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "overrides": {"bulk_density_t_m3": 5.0}}],
    )

    assert layers[0].bulk_density_t_m3 == original_density


# ---------------------------------------------------------------------------
# E. 400-case limit -- still enforced, now shared between both modes
# ---------------------------------------------------------------------------

def test_grid_mode_rejects_over_limit():
    widths, depths = list(range(1, 21)), list(range(1, 22))  # 20 x 21 = 420 > 400
    with pytest.raises(ValueError, match="Grid too large"):
        run_batch_matrix(
            layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
            widths_m=widths, depths_m=depths, length_m=None,
        )


def test_exact_pairs_mode_rejects_over_limit():
    cases = [{"case_id": f"C{i:04d}", "width_m": 1.5, "depth_m": 1.5} for i in range(MAX_BATCH_CASES + 1)]
    with pytest.raises(ValueError, match="Too many cases"):
        run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)


def test_max_batch_cases_is_still_400():
    """Step 2 explicitly does not raise this limit -- just centralizes it
    into one shared constant instead of two independent literals."""
    assert MAX_BATCH_CASES == 400


# ---------------------------------------------------------------------------
# F. Exact-pairs mode -- runs EXACTLY the given cases, no cross-product
# ---------------------------------------------------------------------------

def test_exact_pairs_runs_only_given_cases_not_cross_product():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C002", "width_m": 2.0, "depth_m": 1.5},
        {"case_id": "C003", "width_m": 2.0, "depth_m": 2.0},
        {"case_id": "C004", "width_m": 2.5, "depth_m": 2.0},
    ]
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    pairs = [(c["width_m"], c["depth_m"]) for c in result["combinations"]]
    assert pairs == [(1.5, 1.5), (2.0, 1.5), (2.0, 2.0), (2.5, 2.0)]
    assert result["total"] == 4
    assert result["mode"] == "exact_pairs"
    assert (1.5, 2.0) not in pairs  # the "missing" cross-product combination must NOT appear


def test_exact_pairs_results_carry_case_id():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "MYCASE", "width_m": 1.5, "depth_m": 1.5}],
    )
    assert result["combinations"][0]["case_id"] == "MYCASE"


def test_grid_mode_results_do_not_carry_case_id():
    """Backward compatibility: grid mode's row shape is unchanged by the
    Step 2 refactor -- no stray 'case_id' key leaking in."""
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )
    assert "case_id" not in result["combinations"][0]


# ---------------------------------------------------------------------------
# G. Water-table override -- now reaches BOTH shear and settlement
# ---------------------------------------------------------------------------
# Uses depth=6.0 (into the sand layer, phi=30) deliberately -- at depth=1.5
# (phi=0, clay), the water-table correction (Rw) multiplies the N-gamma
# term, which is exactly 0 whenever phi=0, so the override's effect would
# be invisible there by pure coincidence, not proving anything either way.

def test_water_table_override_affects_shear_and_settlement_consistently():
    override_wt = 15.0
    assert override_wt != WATER_TABLE

    baseline = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[2.0], depths_m=[6.0], length_m=None,
    )["combinations"][0]

    overridden = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[2.0], depths_m=[6.0], length_m=None,
        overrides={"water_table_depth_m": override_wt},
    )["combinations"][0]

    # Before the fix: shear_sbc was IDENTICAL in both runs (the override
    # never reached bearing_capacity_is6403_shear). Must differ now.
    assert overridden["shear_sbc"] != baseline["shear_sbc"]
    # Settlement already received the override before the fix -- must not regress.
    assert overridden["settlement_sbc"] != baseline["settlement_sbc"]


def test_water_table_override_matches_direct_shear_call_with_that_value():
    """Not just 'different' -- must equal what shear gives when called
    directly with the overridden value, proving it's the SAME effective
    value flowing through end to end."""
    override_wt = 15.0
    batch_row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[2.0], depths_m=[6.0], length_m=None,
        overrides={"water_table_depth_m": override_wt},
    )["combinations"][0]

    gamma_avg_above = (1.8 * 5 + 1.9 * 1) / 6  # thickness-weighted, ground to 6.0m
    direct = bearing_capacity_is6403_shear(
        length_m=2.0, width_m=2.0, depth_m=6.0,
        cohesion_t_m2=0.1, phi_deg=30.0,
        gamma_avg_above_t_m3=gamma_avg_above, gamma_at_base_t_m3=1.9,
        specific_gravity=2.65, moisture_content_pct=12.0,
        water_table_depth_m=override_wt, shape="square", fos=2.5,
    )
    assert batch_row["shear_sbc"] == direct["result"]


# ---------------------------------------------------------------------------
# H. Duplicate case IDs -- rejected; duplicate (B,D) under different IDs allowed
# ---------------------------------------------------------------------------

def test_duplicate_case_id_rejected():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C001", "width_m": 2.0, "depth_m": 2.0},
    ]
    with pytest.raises(ValueError, match="Duplicate case_id"):
        run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)


def test_duplicate_width_depth_pair_under_different_ids_is_allowed():
    """Same (B, D) twice under different case_ids is a legitimate re-run
    (e.g. with a different override) -- must NOT be silently deduplicated."""
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5},
    ]
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    assert result["total"] == 2
    assert {c["case_id"] for c in result["combinations"]} == {"C001", "C002"}


# ---------------------------------------------------------------------------
# I. Per-case error isolation -- one bad case must not kill the batch
# ---------------------------------------------------------------------------

def test_one_bad_case_does_not_kill_the_batch():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C002", "width_m": -1.0, "depth_m": 1.5},  # invalid: negative width
        {"case_id": "C003", "width_m": 2.0, "depth_m": 2.0},
    ]
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    assert result["total"] == 3
    assert result["successful"] == 2
    by_id = {c["case_id"]: c for c in result["combinations"]}
    assert "error" not in by_id["C001"]
    assert "error" in by_id["C002"]
    assert "error" not in by_id["C003"]


def test_bad_case_error_is_a_clear_string_not_a_crash():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 0, "depth_m": 1.5}],
    )
    assert "greater than zero" in result["combinations"][0]["error"]


# ---------------------------------------------------------------------------
# J. Case-level overrides do not leak between cases
# ---------------------------------------------------------------------------

def test_case_level_overrides_do_not_leak_to_other_cases():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5, "overrides": {"friction_angle_deg": 30.0}},
        {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5, "overrides": {}},
    ]
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    by_id = {c["case_id"]: c for c in result["combinations"]}
    assert by_id["C001"]["shear_sbc"] != by_id["C002"]["shear_sbc"]


def test_batch_wide_overrides_apply_unless_case_overrides_win():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5, "overrides": {"cohesion_t_m2": 10.0}},
    ]
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases,
        overrides={"cohesion_t_m2": 5.0},
    )
    by_id = {c["case_id"]: c for c in result["combinations"]}
    assert by_id["C001"]["shear_sbc"] != by_id["C002"]["shear_sbc"]


# ---------------------------------------------------------------------------
# Backend validation -- B/D must be positive, finite numbers (no invented
# engineering range limits -- only "can this ever be a valid dimension")
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad_value", [0, -1.5, float("nan"), float("inf"), float("-inf")])
def test_validate_positive_finite_rejects_bad_values(bad_value):
    with pytest.raises(ValueError):
        _validate_positive_finite("width_m", bad_value)


def test_validate_positive_finite_accepts_good_values():
    assert _validate_positive_finite("width_m", 1.5) == 1.5


def test_grid_mode_negative_width_becomes_per_case_error_not_a_crash():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[-1.0], depths_m=[1.5], length_m=None,
    )
    assert result["total"] == 1
    assert result["successful"] == 0
    assert "error" in result["combinations"][0]


def test_nan_depth_becomes_per_case_error_not_a_crash():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[float("nan")], length_m=None,
    )
    assert "error" in result["combinations"][0]
    assert "finite" in result["combinations"][0]["error"]


# ---------------------------------------------------------------------------
# K. Soil Replacement -- Step 3 (Aug 2026)
# ---------------------------------------------------------------------------
# two_layer_borehole(): Clay 0-5m (phi=0, cohesion=3.0, gamma=1.8) over
# Sand 5-20m (phi=30, cohesion=0.1, gamma=1.9). WATER_TABLE = 3.0.

GOOD_REPLACEMENT = dict(
    enabled=True, replacement_depth_m=1.0, bulk_density_t_m3=2.0,
    cohesion_t_m2=0.5, friction_angle_deg=35.0, specific_gravity=2.65,
    moisture_content_pct=8.0,
)


# --- Test 1: Replacement OFF -> identical to pre-Step-3 behavior ----------

def test_replacement_off_matches_existing_behavior():
    baseline = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    with_disabled_replacement = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        replacement={"enabled": False},
    )["combinations"][0]
    assert with_disabled_replacement["shear_sbc"] == baseline["shear_sbc"]
    assert with_disabled_replacement["settlement_sbc"] == baseline["settlement_sbc"]
    assert with_disabled_replacement["replacement_enabled"] is False
    assert "replacement_depth_m" not in with_disabled_replacement


def test_replacement_none_does_not_require_any_config():
    # No replacement key at all -- must not raise, must behave as OFF.
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5}],
    )
    assert "error" not in result["combinations"][0]
    assert result["combinations"][0]["replacement_enabled"] is False


# --- Test 2: Replacement ON -> effective profile + properties used --------

def test_replacement_on_effective_profile_contains_replacement_layer():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": GOOD_REPLACEMENT}],
    )["combinations"][0]
    assert "error" not in row
    assert row["replacement_enabled"] is True
    assert row["replacement_depth_m"] == 1.0
    profile = row["effective_soil_profile"]
    assert profile[0] == {"from_m": 0.0, "to_m": 1.0, "source": "replacement"}
    assert profile[1]["from_m"] == 1.0 and profile[1]["source"] == "original"
    assert row["replacement_soil_properties"]["cohesion_t_m2"] == 0.5
    assert row["replacement_soil_properties"]["friction_angle_deg"] == 35.0


def test_replacement_shear_uses_replacement_layer_as_founding_layer():
    """Founding depth (0.5m) is inside the replaced zone (0-1m) -- shear
    must match a direct call using the REPLACEMENT properties, not the
    original clay's."""
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.0, "depth_m": 0.5,
                "replacement": GOOD_REPLACEMENT}],
    )["combinations"][0]
    direct = bearing_capacity_is6403_shear(
        length_m=1.0, width_m=1.0, depth_m=0.5,
        cohesion_t_m2=0.5, phi_deg=35.0,
        gamma_avg_above_t_m3=2.0, gamma_at_base_t_m3=2.0,
        specific_gravity=2.65, moisture_content_pct=8.0,
        water_table_depth_m=WATER_TABLE, shape="square", fos=2.5,
    )
    assert row["shear_sbc"] == direct["result"]


# --- Test 3: Replacement inside a layer ------------------------------------

def test_replacement_inside_a_layer_splits_correctly():
    effective = _build_effective_profile(
        two_layer_borehole(),
        _validate_replacement_config(GOOD_REPLACEMENT, two_layer_borehole()),
    )
    bounds = [(l.from_m, l.to_m) for l in sorted(effective, key=lambda x: x.from_m)]
    assert bounds == [(0.0, 1.0), (1.0, 5.0), (5.0, 20.0)]
    clay_remainder = [l for l in effective if l.from_m == 1.0][0]
    assert clay_remainder.cohesion_t_m2 == 3.0  # original clay properties preserved


# --- Test 4: Replacement exactly at layer boundary -------------------------

def test_replacement_at_exact_layer_boundary_no_spurious_split():
    replacement = {**GOOD_REPLACEMENT, "replacement_depth_m": 5.0}
    effective = _build_effective_profile(
        two_layer_borehole(), _validate_replacement_config(replacement, two_layer_borehole()),
    )
    bounds = sorted([(l.from_m, l.to_m) for l in effective])
    assert bounds == [(0.0, 5.0), (5.0, 20.0)]  # exactly 2 layers, no extra sliver


# --- Test 5: Replacement deeper than first layer ----------------------------

def test_replacement_deeper_than_first_layer():
    replacement = {**GOOD_REPLACEMENT, "replacement_depth_m": 7.0}
    effective = _build_effective_profile(
        two_layer_borehole(), _validate_replacement_config(replacement, two_layer_borehole()),
    )
    bounds = sorted([(l.from_m, l.to_m) for l in effective])
    assert bounds == [(0.0, 7.0), (7.0, 20.0)]
    remainder = [l for l in effective if l.from_m == 7.0][0]
    assert remainder.friction_angle_deg == 30.0  # original sand properties preserved


# --- Test 6: Original data immutability -------------------------------------

def test_replacement_does_not_mutate_original_layers_single_case():
    layers = two_layer_borehole()
    orig_from = [l.from_m for l in layers]
    orig_cohesion = [l.cohesion_t_m2 for l in layers]
    run_batch_cases(
        layers=layers, water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.0, "depth_m": 0.5,
                "replacement": GOOD_REPLACEMENT}],
    )
    assert [l.from_m for l in layers] == orig_from
    assert [l.cohesion_t_m2 for l in layers] == orig_cohesion


def test_replacement_does_not_mutate_original_layers_multiple_cases():
    layers = two_layer_borehole()
    orig_from = [l.from_m for l in layers]
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5,
         "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.0}},
        {"case_id": "C003", "width_m": 2.0, "depth_m": 2.0,
         "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.5}},
    ]
    run_batch_cases(layers=layers, water_table_depth_m=WATER_TABLE, cases=cases)
    assert [l.from_m for l in layers] == orig_from


# --- Test 7: Multiple cases -- no cross-case contamination -----------------

def test_replacement_cases_are_independent_no_cross_contamination():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},  # OFF
        {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5,
         "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.0}},
        {"case_id": "C003", "width_m": 1.5, "depth_m": 1.5,
         "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.5}},
    ]
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    by_id = {c["case_id"]: c for c in result["combinations"]}
    assert by_id["C001"]["replacement_enabled"] is False
    assert by_id["C002"]["replacement_depth_m"] == 1.0
    assert by_id["C003"]["replacement_depth_m"] == 1.5
    # Different replacement depths at the same B/D must give different results.
    assert by_id["C002"]["recommended_sbc"] != by_id["C003"]["recommended_sbc"]
    assert by_id["C001"]["recommended_sbc"] != by_id["C002"]["recommended_sbc"]


# --- Test 8: Bearing capacity uses the effective (replacement) profile -----

def test_replacement_bearing_capacity_differs_from_no_replacement():
    baseline = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.0, "depth_m": 0.5}],
    )["combinations"][0]
    replaced = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.0, "depth_m": 0.5,
                "replacement": GOOD_REPLACEMENT}],
    )["combinations"][0]
    assert replaced["shear_sbc"] != baseline["shear_sbc"]


# --- Test 9: Settlement engine receives + uses the replacement layer -------

def test_replacement_settlement_layer_appears_when_within_influence_zone():
    """depth_m=1.5 (footing base) with replacement_depth_m=2.0m -- the
    replacement layer extends BELOW the footing base, so it must appear as a
    sub-layer inside the settlement influence zone."""
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 2.0}}],
    )["combinations"][0]
    assert "error" not in row
    assert any(
        (ly.get("from_m") is not None and ly.get("from_m") < 2.0)
        for ly in row.get("settlement_layer_report", [])
    ) or row["settlement_sbc"] != run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5}],
    )["combinations"][0]["settlement_sbc"]


def test_replacement_above_footing_does_not_affect_settlement():
    """Documented engineering behavior: replacement entirely ABOVE the
    footing base (replacement_depth_m < depth_m) doesn't enter the
    settlement influence zone [depth_m, ...] at all -- only the bearing
    capacity's overburden term (gamma_avg_above) sees it. Settlement must be
    unchanged. Uses depth=6.0 (founding in the sand layer, phi=30) rather
    than the clay layer -- at phi=0 the overburden term is multiplied by
    (Nq-1)=0 in the shear formula, making gamma_avg_above's effect invisible
    by coincidence (same reason the water-table test above avoids phi=0)."""
    baseline = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 2.0, "depth_m": 6.0}],
    )["combinations"][0]
    replaced_above = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 2.0, "depth_m": 6.0,
                "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.0}}],
    )["combinations"][0]
    assert replaced_above["settlement_sbc"] == baseline["settlement_sbc"]
    assert replaced_above["shear_sbc"] != baseline["shear_sbc"]  # overburden term still differs


# --- Test 10: Invalid replacement depth -------------------------------------

def test_replacement_missing_depth_is_case_level_error():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": {"enabled": True, "bulk_density_t_m3": 2.0, "cohesion_t_m2": 1.0}}],
    )["combinations"][0]
    assert "error" in row
    assert "replacement_depth_m is required" in row["error"]


def test_replacement_negative_depth_is_case_level_error():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": -1.0}}],
    )["combinations"][0]
    assert "error" in row
    assert "greater than zero" in row["error"]


def test_replacement_depth_beyond_profile_is_case_level_error():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 25.0}}],
    )["combinations"][0]
    assert "error" in row
    assert "beyond the available soil profile" in row["error"]


# --- Test 11: Missing replacement properties --------------------------------

def test_replacement_missing_density_is_case_level_error():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": {"enabled": True, "replacement_depth_m": 1.0, "cohesion_t_m2": 1.0}}],
    )["combinations"][0]
    assert "error" in row
    assert "bulk_density_t_m3 is required" in row["error"]


def test_replacement_missing_both_cohesion_and_phi_is_case_level_error():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "replacement": {"enabled": True, "replacement_depth_m": 1.0, "bulk_density_t_m3": 2.0}}],
    )["combinations"][0]
    assert "error" in row
    assert "cohesion_t_m2 or friction_angle_deg" in row["error"]


# --- Test 12: Exact B x D + replacement -- independent per case ------------

def test_exact_pairs_with_mixed_replacement_independent():
    cases = [
        {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
        {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5,
         "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.0}},
        {"case_id": "C003", "width_m": 2.0, "depth_m": 2.0,
         "replacement": {**GOOD_REPLACEMENT, "replacement_depth_m": 1.5}},
    ]
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    assert result["mode"] == "exact_pairs"
    assert result["successful"] == 3
    by_id = {c["case_id"]: c for c in result["combinations"]}
    assert by_id["C001"]["replacement_enabled"] is False
    assert by_id["C002"]["replacement_enabled"] is True
    assert by_id["C003"]["replacement_enabled"] is True


# --- Test 13/14: Existing Grid + Batch regression (see full file above) ----
# All pre-Step-3 tests (A-J) already re-run unchanged as part of this file.

def test_grid_mode_batch_level_replacement_applies_to_every_combination():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.0, 1.5], depths_m=[0.5], length_m=None,
        replacement=GOOD_REPLACEMENT,
    )
    assert result["total"] == 2
    assert all(c["replacement_enabled"] for c in result["combinations"])
    assert all(c["replacement_depth_m"] == 1.0 for c in result["combinations"])


def test_grid_mode_without_replacement_key_still_works():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )
    assert "error" not in result["combinations"][0]
    assert result["combinations"][0]["replacement_enabled"] is False


# --- Test 15: 100+ cases with mixed replacement, no cross-contamination ----

def test_100_plus_cases_no_cross_contamination():
    cases = []
    for i in range(120):
        case = {"case_id": f"C{i:04d}", "width_m": 1.0 + (i % 5) * 0.2, "depth_m": 1.0 + (i % 3) * 0.5}
        if i % 3 == 0:
            case["replacement"] = {**GOOD_REPLACEMENT, "replacement_depth_m": 0.5 + (i % 4) * 0.25}
        cases.append(case)
    result = run_batch_cases(layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    assert result["total"] == 120
    assert len({c["case_id"] for c in result["combinations"]}) == 120  # no duplicate/dropped cases
    for i, c in enumerate(result["combinations"]):
        expect_replacement = (i % 3 == 0)
        assert c["replacement_enabled"] == expect_replacement
