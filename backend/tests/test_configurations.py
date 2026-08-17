"""
Tests for Step 6 (Formula Configuration & Versioning, Aug 2026).

Run from backend/:
    pytest tests/test_configurations.py -v

Two things are tested here, matching the project's established DB-free
testing pattern (see test_batch_analysis.py / test_batch_method_selection.py):

1. `app/services/configurations.py` -- pure validation/resolution logic.
   CalcConfiguration rows are mocked with `types.SimpleNamespace` (same
   technique used for SoilLayer mocks elsewhere), so no sqlalchemy is
   needed.
2. Batch integration (`_run_one_batch_case` / `run_batch_cases`'s per-case
   fos/allowable_settlement_mm/rigidity_factor/consolidation_type override
   plumbing) -- these ARE calculators.py functions, tested directly, since
   that plumbing has no DB dependency at all (the router does the only DB
   work, resolving BEFORE calling into calculators.py -- see
   routers/calculators.py).
"""
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from app.services import configurations as cfg
from app.services.calculators import run_batch_cases, run_batch_matrix


def make_row(**kwargs):
    defaults = dict(
        configuration_id="IS_6403-PROJECT_A-V1", method="IS_6403",
        config_group_id="PROJECT_A", config_name="Project A", project_name=None,
        version=1, parameters_json='{"fos": 3.0}', source_configuration_id=None,
        is_active=True,
    )
    defaults.update(kwargs)
    return types.SimpleNamespace(**defaults)


# ---------------------------------------------------------------------------
# Test 1 (per Step 6 brief): Default configuration -- no configuration_id at
# all produces the existing, untouched result.
# ---------------------------------------------------------------------------

def test_no_configuration_id_returns_no_overrides():
    assert cfg.resolve_configuration(None, "IS_6403", []) == {}


def test_resolve_effective_params_with_no_config_matches_request_values_exactly():
    effective = cfg.resolve_effective_params(
        None, "IS_6403", [],
        fos=2.5, allowable_settlement_mm=25, rigidity_factor=1.0, consolidation_type="NCS",
    )
    assert effective == {
        "fos": 2.5, "allowable_settlement_mm": 25, "rigidity_factor": 1.0, "consolidation_type": "NCS",
    }


# ---------------------------------------------------------------------------
# Test 2: Create custom configuration -- Project A v1 from default; verify
# the override is stored correctly.
# ---------------------------------------------------------------------------

def test_build_new_version_from_default():
    fields = cfg.build_new_version(
        method="IS_6403", config_name="Project A", parameters={"fos": 3.0},
        project_name="Mokama-Munger", base_row=None, existing_group_rows=[],
    )
    assert fields["configuration_id"] == "IS_6403-PROJECT_A-V1"
    assert fields["version"] == 1
    assert fields["source_configuration_id"] is None
    import json
    assert json.loads(fields["parameters_json"]) == {"fos": 3.0}
    assert fields["is_active"] is True


# ---------------------------------------------------------------------------
# Test 3: Default immutability -- creating Project A v1 never mutates
# anything (there is no DEFAULT row to begin with -- see module docstring --
# so this is trivially true, but assert the base_row/existing_group_rows
# arguments themselves are never written to).
# ---------------------------------------------------------------------------

def test_creating_configuration_does_not_mutate_inputs():
    base = make_row(parameters_json='{"fos": 3.0}', version=1)
    import copy
    base_before = copy.deepcopy(vars(base))
    fields = cfg.build_new_version(
        method="IS_6403", config_name="Project A", parameters={"fos": 3.5},
        project_name=None, base_row=base, existing_group_rows=[base],
    )
    assert vars(base) == base_before  # base_row untouched
    assert fields["version"] == 2  # a NEW row, not an edit of base


# ---------------------------------------------------------------------------
# Test 4: Version creation -- v1, modify parameter, v2. v1 != v2 and v1
# remains unchanged.
# ---------------------------------------------------------------------------

def test_v2_differs_from_v1_and_v1_row_itself_is_never_touched():
    v1 = make_row(configuration_id="IS_6403-PROJECT_A-V1", version=1, parameters_json='{"fos": 3.0}')
    v1_snapshot = dict(vars(v1))

    v2_fields = cfg.build_new_version(
        method="IS_6403", config_name="Project A", parameters={"fos": 3.5},
        project_name=None, base_row=v1, existing_group_rows=[v1],
    )

    assert vars(v1) == v1_snapshot  # v1 row itself never mutated
    assert v2_fields["configuration_id"] == "IS_6403-PROJECT_A-V2"
    assert v2_fields["version"] == 2
    assert v2_fields["source_configuration_id"] == "IS_6403-PROJECT_A-V1"
    import json
    assert json.loads(v2_fields["parameters_json"]) == {"fos": 3.5}
    assert json.loads(v1.parameters_json) == {"fos": 3.0}  # v1's own data still says 3.0


def test_v2_inherits_unspecified_parameters_from_v1():
    v1 = make_row(parameters_json='{"fos": 3.0, "rigidity_factor": 1.25}')
    v2_fields = cfg.build_new_version(
        method="IS_6403", config_name="Project A", parameters={"fos": 3.5},
        project_name=None, base_row=v1, existing_group_rows=[v1],
    )
    import json
    merged = json.loads(v2_fields["parameters_json"])
    assert merged == {"fos": 3.5, "rigidity_factor": 1.25}  # rigidity_factor carried over unchanged


# ---------------------------------------------------------------------------
# Test 5: Historical reproducibility -- calculate using v1, create v2,
# re-read v1's own resolved values -- still v1's original parameters.
# ---------------------------------------------------------------------------

def test_v1_resolution_unaffected_by_v2_creation():
    v1 = make_row(configuration_id="IS_6403-PROJECT_A-V1", version=1, parameters_json='{"fos": 3.0}')
    v1_result_before = cfg.resolve_configuration("IS_6403-PROJECT_A-V1", "IS_6403", [v1])

    cfg.build_new_version(  # create v2 -- does not touch v1 at all
        method="IS_6403", config_name="Project A", parameters={"fos": 3.5},
        project_name=None, base_row=v1, existing_group_rows=[v1],
    )

    v1_result_after = cfg.resolve_configuration("IS_6403-PROJECT_A-V1", "IS_6403", [v1])
    assert v1_result_before == v1_result_after == {"fos": 3.0}


def test_batch_result_row_carries_resolved_snapshot_not_a_live_pointer():
    """A Batch result row's `resolved_parameters` is a plain dict baked in
    at calculation time -- this is what makes archiving/new-versioning a
    configuration always safe (see resolve_configuration's docstring)."""
    row = run_batch_matrix(
        layers=[types.SimpleNamespace(
            id="L1", from_m=0.0, to_m=20.0, classification="CI",
            cohesion_t_m2=3.0, friction_angle_deg=0.0, bulk_density_t_m3=1.8,
            specific_gravity=2.7, moisture_content_pct=22.0, n_value=6,
            compression_index_cc=0.28, initial_void_ratio_e0=0.85,
        )],
        water_table_depth_m=3.0, widths_m=[1.5], depths_m=[1.5], length_m=None,
        fos=3.0, configuration_id="IS_6403-PROJECT_A-V1",
    )["combinations"][0]
    assert row["configuration_id"] == "IS_6403-PROJECT_A-V1"
    assert row["resolved_parameters"]["fos"] == 3.0
    # the row's snapshot doesn't change even if the caller's own `fos`
    # variable would later change elsewhere -- it's baked in, not a pointer.


# ---------------------------------------------------------------------------
# Test 6: Unknown configuration -- clear validation error.
# ---------------------------------------------------------------------------

def test_unknown_configuration_id_raises_clear_error():
    with pytest.raises(ValueError, match="Unknown \\(or archived\\) configuration"):
        cfg.resolve_configuration("IS_6403-NONEXISTENT-V1", "IS_6403", [])


def test_archived_configuration_is_treated_as_unknown():
    # the router never passes an inactive row into resolve_configuration
    # (see _fetch_active_config_rows's is_active filter) -- simulate that
    # by passing an empty list, exactly as the router would for an archived id.
    with pytest.raises(ValueError, match="Unknown \\(or archived\\) configuration"):
        cfg.resolve_configuration("IS_6403-PROJECT_A-V1", "IS_6403", [])


# ---------------------------------------------------------------------------
# Test 7: Unknown method -- clear validation error.
# ---------------------------------------------------------------------------

def test_unknown_method_rejected_at_creation():
    with pytest.raises(ValueError, match="Unsupported method"):
        cfg.build_new_version(
            method="TERZAGHI", config_name="Project A", parameters={"fos": 3.0},
            project_name=None, base_row=None, existing_group_rows=[],
        )


def test_configuration_method_mismatch_rejected_at_resolution():
    """A configuration created for one method must never silently apply
    itself when a DIFFERENT method is actually being used (Step 6 section 9
    -- method compatibility)."""
    row = make_row(method="IS_6403")
    with pytest.raises(ValueError, match="was created for method"):
        cfg.resolve_configuration(row.configuration_id, "SOME_OTHER_METHOD", [row])


# ---------------------------------------------------------------------------
# Test 8: Invalid parameter -- clear validation error (unknown key, wrong
# type, NaN, infinity, out of range).
# ---------------------------------------------------------------------------

def test_unknown_parameter_name_rejected():
    with pytest.raises(ValueError, match="Unsupported parameter"):
        cfg.validate_parameters({"nc_coefficient": 5.14})  # an internal formula constant -- must never be accepted


def test_non_numeric_fos_rejected():
    with pytest.raises(ValueError, match="must be a number"):
        cfg.validate_parameters({"fos": "banana"})


def test_nan_fos_rejected():
    with pytest.raises(ValueError, match="NaN or infinite"):
        cfg.validate_parameters({"fos": float("nan")})


def test_infinite_fos_rejected():
    with pytest.raises(ValueError, match="NaN or infinite"):
        cfg.validate_parameters({"fos": float("inf")})


def test_zero_or_negative_fos_rejected():
    with pytest.raises(ValueError, match="greater than zero"):
        cfg.validate_parameters({"fos": 0})
    with pytest.raises(ValueError, match="greater than zero"):
        cfg.validate_parameters({"fos": -1.5})


def test_invalid_consolidation_type_rejected():
    with pytest.raises(ValueError, match="NCS.*OCS"):
        cfg.validate_parameters({"consolidation_type": "XYZ"})


def test_empty_parameters_rejected():
    with pytest.raises(ValueError, match="at least one parameter"):
        cfg.validate_parameters({})


# ---------------------------------------------------------------------------
# Duplicate version identifier -- two configs with the same name/method
# always get different version numbers (never reused, even across archived
# rows).
# ---------------------------------------------------------------------------

def test_next_version_number_never_reused_even_if_archived():
    v1 = make_row(configuration_id="IS_6403-PROJECT_A-V1", version=1, is_active=False)  # archived
    fields = cfg.build_new_version(
        method="IS_6403", config_name="Project A", parameters={"fos": 3.0},
        project_name=None, base_row=None, existing_group_rows=[v1],
    )
    assert fields["version"] == 2  # not 1 again, even though v1 is archived
    assert fields["configuration_id"] == "IS_6403-PROJECT_A-V2"


def test_different_config_group_does_not_collide_versions():
    project_a_v1 = make_row(configuration_id="IS_6403-PROJECT_A-V1", config_group_id="PROJECT_A", version=1)
    fields = cfg.build_new_version(
        method="IS_6403", config_name="Project B", parameters={"fos": 2.8},
        project_name=None, base_row=None, existing_group_rows=[project_a_v1],
    )
    assert fields["version"] == 1  # Project B's own first version, unaffected by Project A's numbering
    assert fields["configuration_id"] == "IS_6403-PROJECT_B-V1"


# ---------------------------------------------------------------------------
# Test 9: Batch integration -- different Batch cases use different valid
# configurations.
# ---------------------------------------------------------------------------

def two_layer_borehole():
    return [
        types.SimpleNamespace(
            id="L1", from_m=0.0, to_m=20.0, classification="CI",
            cohesion_t_m2=3.0, friction_angle_deg=0.0, bulk_density_t_m3=1.8,
            specific_gravity=2.7, moisture_content_pct=22.0, n_value=6,
            compression_index_cc=0.28, initial_void_ratio_e0=0.85,
        ),
    ]


def test_different_cases_can_use_different_effective_fos():
    """Simulates what the router does: pre-resolves each case's effective
    fos (here just directly, since resolution itself is tested above) and
    passes it as a per-case dict key -- confirms run_batch_cases actually
    uses a DIFFERENT fos per case, not the batch-wide one for everybody."""
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=3.0,
        cases=[
            {"case_id": "C001", "width_m": 1.5, "depth_m": 1.5, "fos": 2.5, "configuration_id": None},
            {"case_id": "C002", "width_m": 1.5, "depth_m": 1.5, "fos": 3.0, "configuration_id": "IS_6403-PROJECT_A-V1"},
        ],
        fos=2.5,  # batch-wide default, only C001 actually uses it (explicitly, here)
    )
    rows = {c["case_id"]: c for c in result["combinations"]}
    assert rows["C001"]["resolved_parameters"]["fos"] == 2.5
    assert rows["C002"]["resolved_parameters"]["fos"] == 3.0
    assert rows["C002"]["configuration_id"] == "IS_6403-PROJECT_A-V1"
    assert rows["C001"]["configuration_id"] is None
    # A higher FOS must produce a LOWER (more conservative) recommended SBC
    # for an otherwise-identical case -- confirms the override actually
    # reached the real calculation, not just the record-keeping field.
    assert rows["C002"]["shear_sbc"] < rows["C001"]["shear_sbc"]


def test_case_without_override_falls_back_to_batch_wide_value():
    result = run_batch_cases(
        layers=two_layer_borehole(), water_table_depth_m=3.0,
        cases=[{"case_id": "C001", "width_m": 1.5, "depth_m": 1.5}],  # no fos key at all
        fos=2.5, allowable_settlement_mm=25, rigidity_factor=1.0, consolidation_type="NCS",
    )
    row = result["combinations"][0]
    assert row["resolved_parameters"] == {
        "fos": 2.5, "allowable_settlement_mm": 25, "rigidity_factor": 1.0, "consolidation_type": "NCS",
    }
    assert row["configuration_id"] is None


# ---------------------------------------------------------------------------
# Test 10: Individual vs Batch -- for identical method/params/soil/B/D/
# groundwater, Individual == Batch (mirrors Step 5's equivalent test).
# ---------------------------------------------------------------------------

def test_individual_calculator_matches_batch_with_same_effective_fos():
    from app.services.calculators import bearing_capacity_is6403_shear
    direct = bearing_capacity_is6403_shear(
        length_m=1.5, width_m=1.5, depth_m=1.5,
        cohesion_t_m2=3.0, phi_deg=0.0,
        gamma_avg_above_t_m3=1.8, gamma_at_base_t_m3=1.8,
        specific_gravity=2.7, moisture_content_pct=22.0,
        water_table_depth_m=3.0, shape="square", fos=3.0,  # the "configured" fos
    )
    batch_row = run_batch_matrix(
        layers=two_layer_borehole(), water_table_depth_m=3.0,
        widths_m=[1.5], depths_m=[1.5], length_m=None,
        fos=3.0, configuration_id="IS_6403-PROJECT_A-V1",  # router already resolved fos=3.0 before this call
    )["combinations"][0]
    assert batch_row["shear_sbc"] == direct["result"]


# ---------------------------------------------------------------------------
# Test 11-14: Existing Step 2/3/4/5 regression -- run the full pre-existing
# suites (imported and executed by the sandbox's own test runner alongside
# this file; see PROJECT_STATUS.md Step 6 section for the exact command and
# combined pass count). Nothing in THIS file duplicates those -- they're
# re-run as-is, unmodified, to prove zero regression.
# ---------------------------------------------------------------------------
