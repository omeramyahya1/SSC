from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy.orm import Session

import models


def canonical_inventory_categories() -> tuple[dict, ...]:
    return models.INVENTORY_CATEGORY_DEFINITIONS


def canonical_inventory_category_uuids() -> tuple[str, ...]:
    return models.INVENTORY_CATEGORY_UUIDS


def _payload_to_local_kwargs(payload: dict) -> dict:
    def _coerce_dt(value):
        if value is None or isinstance(value, datetime):
            return value
        if isinstance(value, str):
            normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
            try:
                parsed = datetime.fromisoformat(normalized)
                return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
            except ValueError:
                return None
        return value

    return {
        "uuid": payload["id"],
        "name": payload["name"],
        "spec_schema": payload.get("spec_schema"),
        "organization_uuid": payload.get("organization_id"),
        "user_uuid": payload.get("user_id"),
        "created_at": _coerce_dt(payload.get("created_at")),
        "updated_at": _coerce_dt(payload.get("updated_at")),
        "deleted_at": _coerce_dt(payload.get("deleted_at")),
        "is_dirty": bool(payload.get("is_dirty", False)),
    }


def _upsert_local_category(db: Session, payload: dict) -> models.InventoryCategory:
    existing = db.query(models.InventoryCategory).filter(models.InventoryCategory.uuid == payload["id"]).first()
    kwargs = _payload_to_local_kwargs(payload)

    if existing:
        for key, value in kwargs.items():
            setattr(existing, key, value)
        existing.is_dirty = False
        return existing

    record = models.InventoryCategory(**kwargs)
    record.is_dirty = False
    db.add(record)
    return record


def ensure_inventory_categories(db: Session, commit: bool = False) -> list[models.InventoryCategory]:
    """
    Ensures the four canonical inventory categories exist in the local cache.
    If any are missing or soft-deleted locally, they are pulled from Supabase
    and restored into the local database.
    """
    required_uuids = canonical_inventory_category_uuids()
    local_rows = (
        db.query(models.InventoryCategory)
        .filter(models.InventoryCategory.uuid.in_(required_uuids))
        .all()
    )
    local_by_uuid = {row.uuid: row for row in local_rows}

    def _is_stale(row: models.InventoryCategory, definition: dict) -> bool:
        return (
            row.deleted_at is not None
            or row.organization_uuid is not None
            or row.user_uuid is not None
            or row.name != definition["name"]
            or row.spec_schema != definition["spec_schema"]
        )

    needs_refresh = False
    for definition in canonical_inventory_categories():
        row = local_by_uuid.get(definition["uuid"])
        if not row or _is_stale(row, definition):
            needs_refresh = True
            break

    if needs_refresh:
        from supabase_client import get_service_role_client
        import httpx
        from postgrest.exceptions import APIError

        try:
            supabase = get_service_role_client()
            response = (
                supabase.table("inventory_categories")
                .select("*")
                .in_("id", list(required_uuids))
                .execute()
            )
        except (APIError, httpx.ConnectError, httpx.TimeoutException) as exc:
            print(f"Warning: using local inventory category cache because Supabase sync failed: {exc}")
            db.rollback()
        else:
            if hasattr(response, "error") and response.error:
                print(
                    "Warning: using local inventory category cache because Supabase sync failed: "
                    f"{response.error.message}"
                )
                db.rollback()
            else:
                remote_rows = getattr(response, "data", None) or []
                remote_by_uuid = {row.get("id"): row for row in remote_rows}

                still_missing = [uuid for uuid in required_uuids if uuid not in remote_by_uuid]
                if still_missing:
                    missing_labels = [
                        entry["name"]
                        for entry in canonical_inventory_categories()
                        if entry["uuid"] in still_missing
                    ]
                    raise RuntimeError(
                        "Supabase inventory_categories is missing canonical rows: "
                        + ", ".join(missing_labels)
                    )

                for uuid in required_uuids:
                    _upsert_local_category(db, remote_by_uuid[uuid])

                db.flush()
                if commit:
                    db.commit()

    final_rows = {
        row.uuid: row
        for row in db.query(models.InventoryCategory)
        .filter(models.InventoryCategory.uuid.in_(required_uuids))
        .all()
    }
    return [
        final_rows[definition["uuid"]]
        for definition in canonical_inventory_categories()
        if definition["uuid"] in final_rows
    ]
