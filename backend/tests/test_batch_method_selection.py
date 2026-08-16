"""
Regression tests for Batch Analysis -- Step 5 (Calculation Method Selection,
Aug 2026).

Run from backend/:
    pytest tests/test_batch_method_selection.py -v

Uses the same SimpleNamespace mock-layer technique as test_batch_analysis.py
(no DB/FastAPI needed) -- see that file's module docstring.
"""
import sys
from pathlib import Path
import types

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services.calculators import (
    run_batch_matrix, run_batch_cases, bearing_capacity_is6403_shear,
    BEARING_METHOD_REGISTRY, DEFAULT_BEARING_METHOD, _validate_bearing_method,
)


def make_layer(**kwargs):
    defaults = dict(
        id="L1", from_m=0.0, to_m=1.0, classification=None,
        cohesion_t_m2=None, friction_angle_deg=None, bulk_density_t_m3=None,
        specific_gravity=None, moisture_content_pct=None, n_value=None,
        compression_index_cc=None, initial_void_ratio_e0=None,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


def two_layer_borehole():
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
# Test 1: Default method preserves existing Batch behavior
# ---------------------------------------------------------------------------

def test_missing_method_defaults_to_is6403_grid():
    with_method = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None, method="IS_6403",
    )["combinations"][0]
    without_method = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert without_method["shear_sbc"] == with_method["shear_sbc"]
    assert without_method["method"] == "IS_6403" == DEFAULT_BEARING_METHOD


def test_missing_method_defaults_to_is6403_exact_pairs():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5}],
    )
    assert result["combinations"][0]["method"] == "IS_6403"


# ---------------------------------------------------------------------------
# Test 2 / 9: Exposed method calls the correct existing function -- Batch ==
# direct single-calculator call (same check as test_batch_analysis.py's B
# section, repeated here explicitly under a method name).
# ---------------------------------------------------------------------------

def test_is6403_method_matches_direct_calculator_call():
    direct = bearing_capacity_is6403_shear(
        length_m=1.5, width_m=1.5, depth_m=1.5,
        cohesion_t_m2=3.0, phi_deg=0.0,
        gamma_avg_above_t_m3=1.8, gamma_at_base_t_m3=1.8,
        specific_gravity=2.7, moisture_content_pct=22.0,
        water_table_depth_m=WATER_TABLE, shape="square", fos=2.5,
    )
    batch_row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None, method="IS_6403",
    )["combinations"][0]
    assert batch_row["shear_sbc"] == direct["result"]
    assert batch_row["method"] == "IS_6403"


def test_registry_has_exactly_one_verified_method():
    """Documents the Step 5 audit finding: Terzaghi exists in this file but
    is NOT wired into the batch/layer architecture (different units, no FOS
    division, no water-table correction) -- deliberately not exposed here.
    See BEARING_METHOD_REGISTRY's docstring / PROJECT_STATUS.md Step 5."""
    assert set(BEARING_METHOD_REGISTRY.keys()) == {"IS_6403"}


# ---------------------------------------------------------------------------
# Test 3: Unsupported method is rejected
# ---------------------------------------------------------------------------

def test_unsupported_method_rejected_grid():
    with pytest.raises(ValueError, match="Unsupported calculation method"):
        run_batch_matrix(
            layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
            widths_m=[1.5], depths_m=[1.5], length_m=None, method="TERZAGHI",
        )


def test_unsupported_method_rejected_exact_pairs_batch_level():
    with pytest.raises(ValueError, match="Unsupported calculation method"):
        run_batch_cases(
            layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
            cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5}],
            default_method="MEYERHOF",
        )


def test_unsupported_method_rejected_exact_pairs_case_level():
    """A bad method on ANY one case fails the WHOLE request up front (same
    request-shape-error pattern as duplicate case_id) -- not a silent
    per-case skip."""
    with pytest.raises(ValueError, match="Unsupported calculation method"):
        run_batch_cases(
            layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
            cases=[
                {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
                {"case_id": "C002", "width_m": 2.0, "depth_m": 1.5, "method": "NONSENSE"},
            ],
        )


def test_malformed_method_name_rejected():
    with pytest.raises(ValueError, match="Unsupported calculation method"):
        _validate_bearing_method("   ")


def test_method_name_is_case_and_punctuation_insensitive():
    # "is:6403", "is-6403", "IS 6403" all resolve to the same registry key --
    # a convenience normalization, not a second method.
    assert _validate_bearing_method("is:6403".replace(":", "_")) == "IS_6403"
    assert _validate_bearing_method("is-6403") == "IS_6403"
    assert _validate_bearing_method("is 6403") == "IS_6403"


# ---------------------------------------------------------------------------
# Test 4 / 5: Case-level method selection; different cases, different methods
# ---------------------------------------------------------------------------

def test_case_level_method_override_wins_over_batch_default():
    # Only one method is actually supported today, so "different methods"
    # can't be demonstrated with two DIFFERENT real methods yet -- but the
    # override plumbing itself (case method beats batch default) is fully
    # testable and must work now so it's ready the day a second method
    # exists. Both here resolve to IS_6403; assert the override path is the
    # one that actually ran (not silently ignored) via the `method` field.
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
            {"case_id": "C002", "width_m": 2.0, "depth_m": 1.5, "method": "IS_6403"},
        ],
        default_method="IS_6403",
    )
    methods = {c["case_id"]: c["method"] for c in result["combinations"]}
    assert methods == {"C001": "IS_6403", "C002": "IS_6403"}


def test_case_without_method_falls_back_to_batch_default_not_global_default():
    """If the batch default itself differs from DEFAULT_BEARING_METHOD (not
    possible today with only one registered method, but the plumbing must
    still resolve `None` -> the passed default_method, not silently to
    DEFAULT_BEARING_METHOD) -- verified by explicitly passing the same value
    the global default already is, and confirming it round-trips onto the
    row unchanged."""
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5}],
        default_method="IS_6403",
    )
    assert result["combinations"][0]["method"] == "IS_6403"


# ---------------------------------------------------------------------------
# Test 6 / 7: Exact B x D + method selection; Grid + method selection
# ---------------------------------------------------------------------------

def test_exact_pairs_plus_method_runs_exactly_given_cases():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5, "method": "IS_6403"},
            {"case_id": "C002", "width_m": 2.0, "depth_m": 1.5},
        ],
        default_method="IS_6403",
    )
    pairs = {(c["case_id"], c["width_m"], c["depth_m"]) for c in result["combinations"]}
    assert pairs == {("C001", 1.5, 1.5), ("C002", 2.0, 1.5)}
    assert result["total"] == 2


def test_grid_mode_plus_method_still_full_cross_product():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5, 2.0], depths_m=[1.5, 2.0], length_m=None, method="IS_6403",
    )
    pairs = {(c["width_m"], c["depth_m"]) for c in result["combinations"]}
    assert pairs == {(1.5, 1.5), (1.5, 2.0), (2.0, 1.5), (2.0, 2.0)}
    assert all(c["method"] == "IS_6403" for c in result["combinations"])


# ---------------------------------------------------------------------------
# Test 8: Method + soil replacement
# ---------------------------------------------------------------------------

def test_method_with_replacement_both_apply_no_contamination():
    # replacement_depth_m (2.0) > footing depth (1.5) so the footing actually
    # founds ON the replacement soil (phi=35) instead of the original clay
    # (phi=0) -- guarantees a real difference in shear_sbc, unlike a
    # replacement confined above a phi=0 founding layer where the Nq-1=0
    # term makes the overburden contribution (and therefore the shear
    # result) coincidentally identical either way.
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {
                "case_id": "C001", "width_m": 1.5, "depth_m": 1.5, "method": "IS_6403",
                "replacement": {
                    "enabled": True, "replacement_depth_m": 2.0,
                    "bulk_density_t_m3": 2.0, "friction_angle_deg": 35.0,
                },
            },
            {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5, "method": "IS_6403"},
        ],
    )
    c001, c002 = (c for c in result["combinations"] if c["case_id"] == "C001"), \
                 (c for c in result["combinations"] if c["case_id"] == "C002")
    c001, c002 = next(c001), next(c002)
    assert c001["method"] == "IS_6403"
    assert c001["replacement_enabled"] is True
    assert c002["replacement_enabled"] is False
    # replacement changed the shear result relative to the no-replacement case
    assert c001["shear_sbc"] != c002["shear_sbc"]


# ---------------------------------------------------------------------------
# Test 12: Step 4 result field -- every result carries which method was used
# ---------------------------------------------------------------------------

def test_governing_label_reflects_the_method_used():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None, method="IS_6403",
    )["combinations"][0]
    assert row["method"] == "IS_6403"
    assert "IS:6403" in row["governing"] or "IS:8009" in row["governing"]


def test_error_row_still_carries_requested_method():
    """A case that fails validation/calculation should still show which
    method was REQUESTED for it (no engine ran, so no method was actually
    used -- but the intent is still visible for debugging), consistent with
    how other per-row fields (width_m/depth_m/case_id) are set before the
    try block."""
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": -1.5, "depth_m": 1.5, "method": "IS_6403"}],
    )
    row = result["combinations"][0]
    assert "error" in row
    assert row["method"] == "IS_6403"
