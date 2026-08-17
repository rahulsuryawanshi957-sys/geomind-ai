"""
Step 6 (Formula Configuration & Versioning, Aug 2026) -- resolving and
validating saved calculation-parameter configurations.

Deliberately DB-session-free, same pattern as services/calculators.py's
`layers: list` argument (SQLAlchemy rows OR plain SimpleNamespace mocks) --
this file takes plain "configuration row" objects the ROUTER already
fetched, so it stays testable without sqlalchemy installed (see
backend/tests/test_configurations.py, which mocks rows with
types.SimpleNamespace exactly like test_batch_analysis.py mocks soil
layers). The router (routers/calculators.py) does the actual
`db.query(CalcConfiguration)...` and passes plain rows in here.

WHAT THIS DOES NOT DO (see PROJECT_STATUS.md's Step 6 section for the audit
that led to this scope): this only ever stores/merges a fixed, whitelisted
set of ALREADY-safe, ALREADY-request-level numeric/string knobs (fos,
allowable_settlement_mm, rigidity_factor, consolidation_type) -- every one
of these was already a free-form per-request field before Step 6 existed
(BatchRunRequest.fos, bearing_capacity_is6403_shear's own `fos` kwarg,
etc.). Step 6 only adds a way to NAME, SAVE, and VERSION a reusable bundle
of them so a project doesn't have to retype the same numbers every time,
with full historical reproducibility. It does NOT expose, store, or touch
any internal formula coefficient, IS-code constant, or algorithm structure
-- those stay hard-coded inside services/calculators.py exactly as before,
completely untouched by this file.
"""
import json
import math

from app.services.calculators import BEARING_METHOD_REGISTRY

# The ONLY parameter names a configuration is allowed to override. Every one
# of these was already a plain per-request field (see BatchRunRequest /
# BatchCaseInput / bearing_capacity_is6403_shear's own `fos` kwarg, the
# settlement functions' `allowable_settlement_mm`/`rigidity_factor`, and
# run_settlement_multilayer's `consolidation_type`) before this file
# existed -- this is a whitelist of what was already safe, not a discovery
# list of new things to expose.
ALLOWED_PARAMETERS = {"fos", "allowable_settlement_mm", "rigidity_factor", "consolidation_type"}


def validate_parameters(parameters: dict) -> dict:
    """Validate a raw parameter-override dict (as given by whoever is
    creating a configuration version). Returns a cleaned dict (only known
    keys, correctly typed/ranged) or raises ValueError with a clear,
    specific message -- covers unknown parameter names, missing value,
    wrong type, NaN, infinity, and out-of-range values, per Step 6's
    mandatory validation list."""
    if not isinstance(parameters, dict) or not parameters:
        raise ValueError("Provide at least one parameter to override.")
    unknown = set(parameters) - ALLOWED_PARAMETERS
    if unknown:
        raise ValueError(
            f"Unsupported parameter(s): {', '.join(sorted(unknown))} -- "
            f"supported: {', '.join(sorted(ALLOWED_PARAMETERS))}."
        )
    cleaned: dict = {}
    for key in ("fos", "allowable_settlement_mm", "rigidity_factor"):
        if key not in parameters:
            continue
        raw = parameters[key]
        if isinstance(raw, bool) or raw is None:
            raise ValueError(f"'{key}' must be a number.")
        try:
            v = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"'{key}' must be a number.")
        if math.isnan(v) or math.isinf(v):
            raise ValueError(f"'{key}' cannot be NaN or infinite.")
        if v <= 0:
            raise ValueError(f"'{key}' must be greater than zero.")
        cleaned[key] = v
    if "consolidation_type" in parameters:
        v = str(parameters["consolidation_type"]).strip().upper()
        if v not in ("NCS", "OCS"):
            raise ValueError("'consolidation_type' must be 'NCS' (normally consolidated) or 'OCS' (over-consolidated).")
        cleaned["consolidation_type"] = v
    return cleaned


def make_config_group_id(config_name: str) -> str:
    """A stable slug for a configuration's name, used to group its versions
    together for listing/UI (e.g. "Project A" -> "PROJECT_A"). Purely
    organizational -- a specific version is always resolved by its own
    `configuration_id`, never by this group id, so slugging never affects
    reproducibility."""
    if not config_name or not config_name.strip():
        raise ValueError("Configuration name is required.")
    slug = "".join(c if c.isalnum() else "_" for c in config_name.strip().upper())
    slug = "_".join(filter(None, slug.split("_")))
    if not slug:
        raise ValueError("Configuration name must contain at least one letter or number.")
    return slug


def make_configuration_id(method: str, config_group_id: str, version: int) -> str:
    return f"{method}-{config_group_id}-V{version}"


def resolve_configuration(configuration_id: str | None, method: str, matching_rows: list) -> dict:
    """
    Resolve a configuration_id to its parameter-OVERRIDE dict (NOT merged
    with the request's own values -- just what THIS version explicitly
    overrides; the caller, e.g. the router, merges it over whatever the
    request/schema defaults already provide). This means a configuration
    that only overrides `fos` leaves every other parameter exactly as it
    would have been with no configuration at all -- "all other parameters
    inherit the default unless explicitly overridden," per Step 6's brief.

    `configuration_id=None` -> `{}` (no overrides at all -- the untouched
    DEFAULT behavior, byte-for-byte identical to every request made before
    Step 6 existed).

    `matching_rows`: the rows the caller already fetched for this exact
    `configuration_id` (normally a 0- or 1-item list from a primary-key
    lookup) -- passed in rather than queried here so this function stays
    DB-session-free and unit-testable (see module docstring). An inactive
    (archived) row must NOT be included by the caller -- an archived
    configuration is unknown for the purposes of a NEW calculation (past
    results that already reference it are unaffected either way, since they
    store their own resolved-parameter snapshot, not a live pointer).

    Raises ValueError (-> HTTP 422 at the router) for:
      - unknown configuration_id (no active row found)
      - a configuration whose stored method doesn't match the method being
        used for this calculation (never let a Project A IS:6403 tuning
        silently apply itself to an unrelated method)
    """
    if configuration_id is None:
        return {}
    if not matching_rows:
        raise ValueError(f"Unknown (or archived) configuration '{configuration_id}'.")
    row = matching_rows[0]
    if row.method != method:
        raise ValueError(
            f"Configuration '{configuration_id}' was created for method '{row.method}', "
            f"not '{method}' -- a configuration only applies to the method it was created for."
        )
    return json.loads(row.parameters_json)


def build_new_version(
    method: str, config_name: str, parameters: dict,
    project_name: str | None, base_row, existing_group_rows: list,
) -> dict:
    """
    Compute the fields for a brand-new, immutable configuration version.
    Pure logic only -- does NOT write to the DB (the router does that with
    the actual CalcConfiguration model class); this validates, merges the
    requested overrides ON TOP OF the base version's own already-resolved
    overrides, and picks the next version number. NEVER mutates `base_row`
    or anything in `existing_group_rows` -- always returns data for one NEW
    row, per Step 6's "create a new version, don't mutate" rule.

    `base_row`: the configuration row this new version is created FROM --
    its own `parameters_json` is the merge base. `None` means "based on
    DEFAULT" (merge base = `{}`), the normal case for a config's first
    version. Passing an existing version as `base_row` (e.g. v1) lets a
    later change create v2 without having to repeat every parameter v1
    already set.
    `existing_group_rows`: every existing row (any active state -- archived
    ones still count, so a version number is never reused) sharing this
    configuration's method + group id, used only to pick the next version
    number (max existing + 1, or 1 if none exist yet).

    Raises ValueError for: an unsupported method (must be a real,
    Batch-safe bearing method -- see calculators.BEARING_METHOD_REGISTRY,
    the SAME registry Step 5 built, not a separate list to keep in sync by
    hand) or invalid parameters (see validate_parameters).
    """
    if method not in BEARING_METHOD_REGISTRY:
        supported = ", ".join(sorted(BEARING_METHOD_REGISTRY))
        raise ValueError(f"Unsupported method '{method}' for a configuration -- supported: {supported}.")
    cleaned = validate_parameters(parameters)
    base_overrides = json.loads(base_row.parameters_json) if base_row is not None else {}
    merged = {**base_overrides, **cleaned}
    group_id = make_config_group_id(config_name)
    existing_versions = [r.version for r in existing_group_rows if r.config_group_id == group_id and r.method == method]
    next_version = (max(existing_versions) + 1) if existing_versions else 1
    configuration_id = make_configuration_id(method, group_id, next_version)
    return {
        "configuration_id": configuration_id,
        "method": method,
        "config_group_id": group_id,
        "config_name": config_name.strip(),
        "project_name": project_name,
        "version": next_version,
        "parameters_json": json.dumps(merged),
        "source_configuration_id": base_row.configuration_id if base_row is not None else None,
        "is_active": True,
    }


def resolve_effective_params(
    configuration_id: str | None, method: str, matching_rows: list,
    fos: float, allowable_settlement_mm: float, rigidity_factor: float, consolidation_type: str,
) -> dict:
    """
    Convenience wrapper the router calls once per batch/calculation: resolve
    `configuration_id` (raises ValueError the same way `resolve_configuration`
    does) and merge its overrides on top of the request's own already-supplied
    values -- so with no configuration_id, every returned value is EXACTLY
    the request's own value (byte-for-byte pre-Step-6 behavior), and with one,
    only the parameters that configuration actually overrides differ.
    """
    overrides = resolve_configuration(configuration_id, method, matching_rows)
    return {
        "fos": overrides.get("fos", fos),
        "allowable_settlement_mm": overrides.get("allowable_settlement_mm", allowable_settlement_mm),
        "rigidity_factor": overrides.get("rigidity_factor", rigidity_factor),
        "consolidation_type": overrides.get("consolidation_type", consolidation_type),
    }
