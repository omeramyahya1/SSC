from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Union


def apply_postgrest_pydantic_bootstrap() -> None:
    """Resolve PostGREST's recursive JSON TypeAdapter under packaged runtimes."""
    import postgrest.types as postgrest_types
    from postgrest.base_request_builder import APIResponse, SingleAPIResponse

    namespace = {
        "JSON": postgrest_types.JSON,
        "Mapping": Mapping,
        "Sequence": Sequence,
        "Union": Union,
    }

    postgrest_types.JSONAdapter.rebuild(force=True, _types_namespace=namespace)
    APIResponse.model_rebuild(force=True, _types_namespace=namespace)
    SingleAPIResponse.model_rebuild(force=True, _types_namespace=namespace)


def run_postgrest_pydantic_self_test() -> None:
    apply_postgrest_pydantic_bootstrap()

    import postgrest.types as postgrest_types

    sample = postgrest_types.JSONAdapter.validate_json(
        b'{"ok": true, "items": [1, "two", null, {"nested": false}]}'
    )
    if not isinstance(sample, dict) or sample.get("ok") is not True:
        raise RuntimeError(
            f"PostGREST JSONAdapter self-test failed. "
            f"Expected dict with 'ok': True, got {type(sample).__name__}: {sample!r}"
        )
