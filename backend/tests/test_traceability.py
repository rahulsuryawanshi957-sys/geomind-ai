"""
Tests for Step 7 (Full Calculation Traceability & Reproducibility, Aug 2026).

Run from backend/:
    pytest tests/test_traceability.py -v

Same DB-free technique as every prior Batch step (see test_batch_analysis.py's
module docstring): SimpleNamespace mock layers, no sqlalchemy needed. Step 7
added no new DB model or router endpoint -- it only enriches the row dicts
`_run_one_batch_case`/`run_batch_matrix`/`run_batch_cases` already returned,
so everything here is testable exactly the way Steps 2-6 already were.
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.calculators import run_batch_matrix, run_batch_cases


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


GOOD_REPLACEMENT = dict(
    enabled=True, replacement_depth_m=1.0, bulk_density_t_m3=2.0,
    cohesion_t_m2=0.5, friction_angle_deg=35.0, specific_gravity=2.65,
    moisture_content_pct=8.0,
)

WATER_TABLE = 3.0


# ---------------------------------------------------------------------------
# Test 1: Basic trace -- every successful case has a trace.
# ---------------------------------------------------------------------------

def test_successful_case_has_full_trace():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert "error" not in row
    for key in (
        "overrides_applied", "original_soil_profile", "effective_soil_profile",
        "parameter_trace", "founding_layer", "soil_type_source", "method",
        "configuration_id", "resolved_parameters", "governing",
    ):
        assert key in row, f"missing trace field: {key}"


# ---------------------------------------------------------------------------
# Test 2: Input snapshot -- B/D and relevant inputs retained.
# ---------------------------------------------------------------------------

def test_input_snapshot_retains_bd_and_overrides():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "overrides": {"cohesion_t_m2": 2.2}}],
    )["combinations"][0]
    assert row["width_m"] == 1.5 and row["depth_m"] == 1.5
    assert row["overrides_applied"] == {"cohesion_t_m2": 2.2}
    assert row["parameter_trace"]["cohesion_t_m2"] == {"source": "override", "value": 2.2}


# ---------------------------------------------------------------------------
# Test 3: Original soil -- identifiable, distinct object from effective.
# ---------------------------------------------------------------------------

def test_original_soil_profile_present_and_matches_borehole():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    original = row["original_soil_profile"]
    assert len(original) == 2
    assert original[0] == {"from_m": 0.0, "to_m": 5.0, "classification": "CI"}
    assert original[1] == {"from_m": 5.0, "to_m": 20.0, "classification": "SM"}


def test_original_profile_present_even_without_replacement():
    """Original profile is recorded for EVERY case, not only replacement
    ones -- distinct from effective_soil_profile which, pre-Step-7, only
    appeared when replacement was enabled."""
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert "original_soil_profile" in row
    assert "effective_soil_profile" in row
    assert row["replacement_enabled"] is False
    # with no replacement, effective profile's soil ranges match original,
    # every entry sourced "original"
    assert all(e["source"] == "original" for e in row["effective_soil_profile"])
    assert [{"from_m": e["from_m"], "to_m": e["to_m"]} for e in row["effective_soil_profile"]] == \
           [{"from_m": o["from_m"], "to_m": o["to_m"]} for o in row["original_soil_profile"]]


# ---------------------------------------------------------------------------
# Test 4: Replacement -- effective profile traceable, original untouched.
# ---------------------------------------------------------------------------

def test_replacement_effective_profile_differs_from_original():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5, "replacement": GOOD_REPLACEMENT}],
    )["combinations"][0]
    assert "error" not in row
    assert row["replacement_enabled"] is True
    original = row["original_soil_profile"]
    effective = row["effective_soil_profile"]
    # original still shows the UNMODIFIED borehole -- replacement never
    # rewrites original_soil_profile, only effective_soil_profile
    assert original[0] == {"from_m": 0.0, "to_m": 5.0, "classification": "CI"}
    assert effective[0]["from_m"] == 0.0 and effective[0]["to_m"] == 1.0 and effective[0]["source"] == "replacement"
    assert effective[1]["source"] == "original"


# ---------------------------------------------------------------------------
# Test 5: Override -- original (layer-sourced) vs override distinguishable.
# ---------------------------------------------------------------------------

def test_override_vs_layer_sourced_distinguishable_in_parameter_trace():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
                "overrides": {"friction_angle_deg": 33.0}}],
    )["combinations"][0]
    trace = row["parameter_trace"]
    assert trace["friction_angle_deg"] == {"source": "override", "value": 33.0}
    # cohesion was NOT overridden -- sourced from the founding layer instead
    assert trace["cohesion_t_m2"]["source"] == "founding layer"
    assert trace["cohesion_t_m2"]["value"] == 3.0  # the founding layer's own cohesion


def test_no_overrides_everything_sourced_from_layer():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    trace = row["parameter_trace"]
    for key in ("cohesion_t_m2", "friction_angle_deg", "bulk_density_t_m3", "specific_gravity", "moisture_content_pct"):
        assert trace[key]["source"] == "founding layer"
    assert trace["water_table_depth_m"] == {"source": "borehole", "value": WATER_TABLE}
    assert row["overrides_applied"] == {}


# ---------------------------------------------------------------------------
# Test 6: Method -- actual method used is recorded.
# ---------------------------------------------------------------------------

def test_method_recorded_matches_what_was_requested():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None, method="IS_6403",
    )["combinations"][0]
    assert row["method"] == "IS_6403"
    assert "IS:6403" in row["governing"] or "IS:8009" in row["governing"]


# ---------------------------------------------------------------------------
# Test 7: Configuration -- method + configuration + version recorded
# (configuration_id IS the version-stamped identifier, e.g. ..-V2).
# ---------------------------------------------------------------------------

def test_configuration_and_resolved_parameters_recorded():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        fos=3.0, configuration_id="IS_6403-PROJECT_A-V2",
    )["combinations"][0]
    assert row["configuration_id"] == "IS_6403-PROJECT_A-V2"
    assert row["resolved_parameters"]["fos"] == 3.0


# ---------------------------------------------------------------------------
# Test 8: Historical version -- calculate with v1, "create v2" (simulated by
# just calling again with a different configuration_id/fos), verify the
# OLD row's own trace still shows v1's own values, never silently updated.
# ---------------------------------------------------------------------------

def test_old_trace_unaffected_by_a_later_differently_configured_run():
    row_v1 = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        fos=3.0, configuration_id="IS_6403-PROJECT_A-V1",
    )["combinations"][0]
    row_v1_snapshot = dict(row_v1)

    # simulate "v2 now exists and is used for a NEW run" -- v1's own row,
    # already computed above, must never change as a result.
    run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        fos=3.5, configuration_id="IS_6403-PROJECT_A-V2",
    )

    assert row_v1 == row_v1_snapshot
    assert row_v1["configuration_id"] == "IS_6403-PROJECT_A-V1"
    assert row_v1["resolved_parameters"]["fos"] == 3.0


# ---------------------------------------------------------------------------
# Test 9: Intermediate values -- existing calculation steps available where
# the engine already provides them (shear_steps, settlement_layer_report).
# ---------------------------------------------------------------------------

def test_intermediate_calculation_steps_present():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert isinstance(row["shear_steps"], list) and len(row["shear_steps"]) > 0
    assert "settlement_layer_report" in row


# ---------------------------------------------------------------------------
# Test 10: Final result -- trace matches the actual returned result (no
# separate "trace" copy that could silently disagree with the real numbers).
# ---------------------------------------------------------------------------

def test_final_result_fields_are_the_single_source_of_truth():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
    )["combinations"][0]
    assert row["recommended_sbc"] == round(min(row["shear_sbc"], row["settlement_sbc"]), 2)


# ---------------------------------------------------------------------------
# Test 11: Error trace -- invalid case retains useful error information.
# ---------------------------------------------------------------------------

def test_error_case_retains_partial_trace():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": -1.5, "depth_m": 1.5}],  # invalid width
    )["combinations"][0]
    assert "error" in row
    # everything set BEFORE the failure point must still be present:
    assert row["case_id"] == "C001"
    assert row["method"] == "IS_6403"
    assert row["overrides_applied"] == {}
    assert row["original_soil_profile"][0]["classification"] == "CI"
    # everything set AFTER the failure point must be absent, not fabricated:
    assert "shear_sbc" not in row
    assert "parameter_trace" not in row  # width validation fails before parameter_trace is populated


def test_error_deep_in_calculation_retains_more_context():
    """An error from missing water table (fails AFTER soil/replacement/
    parameter resolution) should retain parameter_trace too, since that
    step completed before the failure. Calls the shared per-case engine
    directly -- run_batch_cases' own upfront request-level guard (batch-wide
    "no water table at all" check) would otherwise reject this before any
    case-level code runs; this test targets the case-level fallback inside
    _run_one_batch_case itself, a different, deeper check."""
    from app.services.calculators import _run_one_batch_case
    row = _run_one_batch_case(
        layers=two_layer_borehole(), water_table_depth_m=None,
        width_m=1.5, depth_m=1.5, length_m=None,
        shape="square", fos=2.5, allowable_settlement_mm=25,
        consolidation_type="NCS", rigidity_factor=1.0, overrides={},
        case_id="C001",
    )
    assert "error" in row
    assert "No water table depth" in row["error"]
    assert row["parameter_trace"]["water_table_depth_m"] == {"source": "borehole", "value": None}
    assert row["parameter_trace"]["cohesion_t_m2"]["source"] == "founding layer"  # resolved before the failure


# ---------------------------------------------------------------------------
# Test 12: Case isolation -- C001 trace must not contain C002's data.
# ---------------------------------------------------------------------------

def test_case_isolation_overrides_and_replacement_never_cross_contaminate():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5,
             "overrides": {"cohesion_t_m2": 9.9}, "replacement": GOOD_REPLACEMENT},
            {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5},
        ],
    )
    rows = {c["case_id"]: c for c in result["combinations"]}
    assert rows["C001"]["overrides_applied"] == {"cohesion_t_m2": 9.9}
    assert rows["C002"]["overrides_applied"] == {}
    assert rows["C001"]["replacement_enabled"] is True
    assert rows["C002"]["replacement_enabled"] is False
    assert "replacement_depth_m" not in rows["C002"]
    assert rows["C001"]["parameter_trace"]["cohesion_t_m2"]["value"] == 9.9
    assert rows["C002"]["parameter_trace"]["cohesion_t_m2"]["value"] == 3.0


# ---------------------------------------------------------------------------
# Test 13 / 14: Grid mode and Exact B x D mode both produce full traces.
# ---------------------------------------------------------------------------

def test_grid_mode_produces_full_trace_for_every_combination():
    result = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5, 2.0], depths_m=[1.5, 2.0], length_m=None,
    )
    assert len(result["combinations"]) == 4
    for row in result["combinations"]:
        assert "original_soil_profile" in row and "effective_soil_profile" in row
        assert "parameter_trace" in row


def test_exact_pairs_mode_produces_full_trace_for_every_case():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5},
            {"case_id": "C002", "width_m": 2.0, "depth_m": 2.0},
        ],
    )
    assert len(result["combinations"]) == 2
    for row in result["combinations"]:
        assert "original_soil_profile" in row and "effective_soil_profile" in row
        assert "parameter_trace" in row


# ---------------------------------------------------------------------------
# Test 15: 100+ cases -- trace generation does not mix cases.
# ---------------------------------------------------------------------------

def test_many_cases_no_cross_contamination():
    cases = [
        {"case_id": f"C{i:03d}", "width_m": 1.0 + i * 0.01, "depth_m": 1.5,
         "overrides": {"cohesion_t_m2": float(i)}}
        for i in range(100)
    ]
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE, cases=cases,
    )
    assert result["total"] == 100
    for i, row in enumerate(result["combinations"]):
        assert row["case_id"] == f"C{i:03d}"
        assert row["overrides_applied"]["cohesion_t_m2"] == float(i)
        assert row["parameter_trace"]["cohesion_t_m2"]["value"] == float(i)


# ---------------------------------------------------------------------------
# Test 16-19: Regression -- Step 2/3/5/6 behavior unaffected. The full
# existing suites (test_batch_analysis.py, test_batch_method_selection.py,
# test_configurations.py) are executed alongside this file by the sandbox's
# own test runner -- see PROJECT_STATUS.md Step 7 section for the combined
# pass count. A few targeted checks are repeated here directly too:
# ---------------------------------------------------------------------------

def test_step3_replacement_still_functionally_correct():
    row = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 0.5, "replacement": GOOD_REPLACEMENT}],
    )["combinations"][0]
    assert "error" not in row
    assert row["founding_layer"].startswith("0.0-1.0m")  # founds inside the replacement zone


def test_step5_method_selection_still_functionally_correct():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None, method="IS_6403",
    )["combinations"][0]
    assert row["method"] == "IS_6403"


def test_step6_configuration_still_functionally_correct():
    row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=WATER_TABLE,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        fos=3.0, configuration_id="IS_6403-PROJECT_A-V1",
    )["combinations"][0]
    assert row["resolved_parameters"]["fos"] == 3.0
    assert row["configuration_id"] == "IS_6403-PROJECT_A-V1"
