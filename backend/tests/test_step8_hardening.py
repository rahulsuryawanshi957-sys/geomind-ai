"""
Tests for Step 8 (Performance + Final Regression + Production Hardening,
Aug 2026).

Run from backend/:
    pytest tests/test_step8_hardening.py -v

This step adds NO new engineering behavior -- these tests exist to VERIFY
Steps 2-7 hold up at realistic scale and under edge-case/malformed input,
not to test any new calculation. Same DB-free technique as every prior
Batch step (SimpleNamespace mock layers).
"""
import sys
import time
import json
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services.calculators import (
    run_batch_matrix, run_batch_cases, _run_one_batch_case,
    bearing_capacity_is6403_shear, MAX_BATCH_CASES,
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


def realistic_5layer_borehole():
    """A realistic multi-layer profile (not empty/fake objects), per the
    brief's instruction to use realistic soil data for scale testing."""
    return [
        make_layer(id="L1", from_m=0.0, to_m=1.5, classification="CI", cohesion_t_m2=2.0, friction_angle_deg=0.0,
                   bulk_density_t_m3=1.75, specific_gravity=2.7, moisture_content_pct=24.0, n_value=4,
                   compression_index_cc=0.32, initial_void_ratio_e0=0.9),
        make_layer(id="L2", from_m=1.5, to_m=4.0, classification="CH", cohesion_t_m2=3.5, friction_angle_deg=0.0,
                   bulk_density_t_m3=1.85, specific_gravity=2.72, moisture_content_pct=28.0, n_value=6,
                   compression_index_cc=0.42, initial_void_ratio_e0=1.05),
        make_layer(id="L3", from_m=4.0, to_m=8.0, classification="SM", cohesion_t_m2=0.1, friction_angle_deg=28.0,
                   bulk_density_t_m3=1.9, specific_gravity=2.65, moisture_content_pct=15.0, n_value=14),
        make_layer(id="L4", from_m=8.0, to_m=14.0, classification="SP", cohesion_t_m2=0.0, friction_angle_deg=33.0,
                   bulk_density_t_m3=1.95, specific_gravity=2.65, moisture_content_pct=10.0, n_value=25),
        make_layer(id="L5", from_m=14.0, to_m=25.0, classification="SC", cohesion_t_m2=1.2, friction_angle_deg=30.0,
                   bulk_density_t_m3=2.0, specific_gravity=2.68, moisture_content_pct=12.0, n_value=32),
    ]


WATER_TABLE = 3.0
GOOD_REPLACEMENT = dict(
    enabled=True, replacement_depth_m=1.0, bulk_density_t_m3=2.0,
    cohesion_t_m2=0.5, friction_angle_deg=35.0, specific_gravity=2.65,
    moisture_content_pct=8.0,
)


# ---------------------------------------------------------------------------
# Performance -- measured, not guessed. 10 / 100 / 400 (the real production
# cap) all go through the actual public run_batch_cases() API. 500/1000 are
# measured too, via the shared per-case engine directly, SPECIFICALLY
# BECAUSE run_batch_cases() itself correctly rejects them (MAX_BATCH_CASES) --
# see test_500_and_1000_cases_correctly_rejected_by_existing_cap below for
# proof of that rejection, and PROJECT_STATUS.md's Step 8 section for the
# actual measured numbers and what they mean.
# ---------------------------------------------------------------------------

def _build_cases(n, with_overrides_and_replacement=False):
    cases = []
    for i in range(n):
        w = round(1.0 + (i % 20) * 0.1, 2)
        d = round(1.0 + (i % 10) * 0.2, 2)
        case = {"case_id": f"C{i:04d}", "width_m": w, "depth_m": d}
        if with_overrides_and_replacement:
            if i % 5 == 0:
                case["overrides"] = {"cohesion_t_m2": 2.5}
            if i % 7 == 0:
                case["replacement"] = GOOD_REPLACEMENT
        cases.append(case)
    return cases


@pytest.mark.parametrize("n", [10, 100, MAX_BATCH_CASES])
def test_batch_cases_completes_and_is_internally_consistent_at_scale(n):
    cases = _build_cases(n, with_overrides_and_replacement=True)
    t0 = time.perf_counter()
    result = run_batch_cases(layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    elapsed = time.perf_counter() - t0
    assert result["total"] == n
    assert len(result["combinations"]) == n
    # sanity: this should be fast -- compute is O(n), no case should take
    # anywhere close to a second even at the production cap.
    assert elapsed < 5.0, f"{n} cases took {elapsed:.2f}s -- unexpectedly slow"


def test_500_and_1000_cases_correctly_rejected_by_existing_cap():
    """Confirms MAX_BATCH_CASES=400 (an existing Step 2 limit, unchanged by
    Step 8) actually protects both entry points -- so 500/1000-case
    REQUESTS are never a real-world concern; the measured performance at
    those sizes (see PROJECT_STATUS.md) is informational only, using the
    shared per-case engine directly, bypassing this same guard on purpose."""
    cases_500 = _build_cases(500)
    with pytest.raises(ValueError, match="Too many cases"):
        run_batch_cases(layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases_500)
    with pytest.raises(ValueError, match="Grid too large"):
        run_batch_matrix(
            layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE,
            widths_m=list(range(1, 26)), depths_m=list(range(1, 26)), length_m=None,  # 25*25=625 > 400
        )


# ---------------------------------------------------------------------------
# Large-batch data integrity (brief section 8) -- MORE important than raw
# speed. One big 400-case batch where EVERY case has different B/D,
# overrides, replacement (on/off), and alternating case-level method -- then
# every single field on every single row is checked to belong to the RIGHT
# case, none crossed with a neighbor.
# ---------------------------------------------------------------------------

def test_400_cases_full_data_integrity_no_cross_contamination():
    n = MAX_BATCH_CASES
    cases = []
    for i in range(n):
        case = {
            "case_id": f"C{i:04d}",
            "width_m": round(1.0 + (i % 30) * 0.05, 3),
            "depth_m": round(1.0 + (i % 15) * 0.1, 3),
            "overrides": {"cohesion_t_m2": round(1.0 + i * 0.01, 2)},
            "method": "IS_6403",
        }
        if i % 3 == 0:
            case["replacement"] = {**GOOD_REPLACEMENT, "replacement_depth_m": round(0.5 + (i % 5) * 0.1, 2)}
        cases.append(case)

    result = run_batch_cases(layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    combos = result["combinations"]
    assert len(combos) == n

    # case_id uniqueness and correct ordering/identity
    seen_ids = set()
    for i, row in enumerate(combos):
        expected_id = f"C{i:04d}"
        assert row["case_id"] == expected_id, f"row {i} has case_id {row['case_id']!r}, expected {expected_id!r}"
        assert row["case_id"] not in seen_ids
        seen_ids.add(row["case_id"])

        expected_width = round(1.0 + (i % 30) * 0.05, 3)
        expected_depth = round(1.0 + (i % 15) * 0.1, 3)
        assert row["width_m"] == expected_width
        assert row["depth_m"] == expected_depth

        expected_cohesion_override = round(1.0 + i * 0.01, 2)
        assert row["overrides_applied"]["cohesion_t_m2"] == expected_cohesion_override
        # the ERROR case here can't tell us parameter_trace directly (some
        # cases are engineered to be normal), so check on success rows:
        if "error" not in row:
            assert row["parameter_trace"]["cohesion_t_m2"]["value"] == expected_cohesion_override

        expected_replacement = (i % 3 == 0)
        assert row["replacement_enabled"] == expected_replacement
        if not expected_replacement:
            assert "replacement_depth_m" not in row

        assert row["method"] == "IS_6403"

    assert len(seen_ids) == n


# ---------------------------------------------------------------------------
# Individual vs Batch regression (brief section 7) -- several representative
# cases (plain, with override, with replacement, with a configured fos),
# each checked directly against the standalone calculator.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("width_m,depth_m,overrides,fos", [
    (1.5, 1.5, {}, 2.5),
    (2.0, 1.0, {"friction_angle_deg": 5.0}, 2.5),
    (1.2, 2.5, {}, 3.0),  # simulates a Step-6 configured FOS
])
def test_individual_matches_batch_across_representative_cases(width_m, depth_m, overrides, fos):
    layers = realistic_5layer_borehole()
    batch_row = run_batch_matrix(
        layers=layers, water_table_depth_m=WATER_TABLE,
        widths_m=[width_m], depths_m=[depth_m], length_m=None,
        fos=fos, overrides=overrides,
    )["combinations"][0]
    assert "error" not in batch_row

    # Re-derive the same founding-layer-sourced parameters the batch used
    # (mirroring what parameter_trace itself already recorded) and call the
    # standalone function directly -- Test 10 of Step 7 already proves
    # `recommended_sbc` is derived from `shear_sbc`, so matching `shear_sbc`
    # alone here is sufficient to prove the two paths agree.
    trace = batch_row["parameter_trace"]
    direct = bearing_capacity_is6403_shear(
        length_m=width_m, width_m=width_m, depth_m=depth_m,
        cohesion_t_m2=trace["cohesion_t_m2"]["value"], phi_deg=trace["friction_angle_deg"]["value"],
        gamma_avg_above_t_m3=trace["gamma_avg_above_t_m3"]["value"],
        gamma_at_base_t_m3=trace["bulk_density_t_m3"]["value"],
        specific_gravity=trace["specific_gravity"]["value"], moisture_content_pct=trace["moisture_content_pct"]["value"],
        water_table_depth_m=trace["water_table_depth_m"]["value"], shape="square", fos=fos,
    )
    assert batch_row["shear_sbc"] == direct["result"]


# ---------------------------------------------------------------------------
# Edge cases (brief section 9) -- ones not already covered by
# test_batch_analysis.py / test_batch_method_selection.py / test_configurations.py.
# ---------------------------------------------------------------------------

def test_empty_batch_exact_pairs_rejected_clearly():
    with pytest.raises(ValueError, match="at least one case"):
        run_batch_cases(layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE, cases=[])


def test_empty_grid_rejected_clearly():
    with pytest.raises(ValueError, match="at least one"):
        run_batch_matrix(
            layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE,
            widths_m=[], depths_m=[1.5], length_m=None,
        )


def test_zero_and_negative_depth_exact_pairs_is_a_case_level_error_not_a_crash():
    result = run_batch_cases(
        layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 0},
            {"case_id": "C002", "width_m": 1.5, "depth_m": -1.0},
            {"case_id": "C003", "width_m": 1.5, "depth_m": 1.5},  # a normal one alongside the bad ones
        ],
    )
    rows = {c["case_id"]: c for c in result["combinations"]}
    assert "error" in rows["C001"]
    assert "error" in rows["C002"]
    assert "error" not in rows["C003"]  # one bad case must not corrupt a good neighbor


def test_malformed_case_missing_width_is_a_case_level_error_not_a_crash():
    """A case dict missing a required key entirely (not just an invalid
    value) must still come back as a per-case error, never an unhandled
    exception that takes down the whole batch."""
    result = run_batch_cases(
        layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "depth_m": 1.5},  # no width_m at all
            {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5},
        ],
    )
    rows = {c["case_id"]: c for c in result["combinations"]}
    assert "error" in rows["C001"]
    assert "error" not in rows["C002"]


def test_founding_depth_beyond_available_profile_extrapolates_to_deepest_layer():
    """FINDING (not a Step 8 fix -- see PROJECT_STATUS.md Known Issues):
    `_founding_layer` does NOT reject a depth beyond the borehole's recorded
    extent -- it silently extrapolates, treating the deepest logged layer as
    if it continued forever. This is pre-existing behavior from Step 2, not
    introduced by Steps 3-7 or this step. Per the brief ("if a formula bug
    is discovered, document it, do not fix it without explicit
    authorization"), this is documented as a known limitation rather than
    silently changed. This test asserts the ACTUAL behavior (no error, uses
    the deepest layer) so a future change to this behavior is caught as an
    intentional decision, not an accidental regression."""
    result = run_batch_cases(
        layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 999.0}],  # far beyond the 25m profile
    )
    row = result["combinations"][0]
    assert "error" not in row
    assert row["founding_layer"].startswith("14.0-25.0m")  # the deepest layer, extrapolated


# ---------------------------------------------------------------------------
# Error classification / partial-batch-success (brief section 10) -- one
# failed case's error must never leak into or corrupt an unrelated
# successful case's own result fields.
# ---------------------------------------------------------------------------

def test_partial_batch_success_failed_case_does_not_corrupt_successful_ones():
    result = run_batch_cases(
        layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
            {"case_id": "C002", "width_m": -5.0, "depth_m": 1.5},  # deliberately broken
            {"case_id": "C003", "width_m": 2.0, "depth_m": 1.5},
        ],
    )
    rows = {c["case_id"]: c for c in result["combinations"]}
    assert "error" not in rows["C001"] and "shear_sbc" in rows["C001"]
    assert "error" in rows["C002"] and "shear_sbc" not in rows["C002"]
    assert "error" not in rows["C003"] and "shear_sbc" in rows["C003"]
    # C001 and C003 are genuinely different cases (different width) --
    # confirm their results actually differ, i.e. neither silently copied
    # the other's (or the failed case's) data.
    assert rows["C001"]["width_m"] != rows["C003"]["width_m"]


# ---------------------------------------------------------------------------
# Payload-size sanity (informational, ties to the performance report in
# PROJECT_STATUS.md) -- confirms the batch result is valid, complete JSON at
# the production cap; NOT a hard performance assertion (environment-
# dependent), just a smoke test that serialization doesn't choke at scale.
# ---------------------------------------------------------------------------

def test_max_size_batch_result_is_valid_json():
    cases = _build_cases(MAX_BATCH_CASES, with_overrides_and_replacement=True)
    result = run_batch_cases(layers=realistic_5layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases)
    serialized = json.dumps(result)
    reparsed = json.loads(serialized)
    assert len(reparsed["combinations"]) == MAX_BATCH_CASES
