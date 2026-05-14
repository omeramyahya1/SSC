# src-python/routes/sync_log.py
import mimetypes
from datetime import datetime, timezone
from typing import Optional
from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from utils import get_db
import models
from sqlalchemy import LargeBinary, Numeric
from decimal import Decimal
from supabase_client import get_user_client, get_service_role_client, get_anon_client
from serializer import model_to_dict
from sqlalchemy import or_
from .inventory import _get_current_user

sync_log_bp = Blueprint('sync_log_bp', __name__, url_prefix='/sync_logs')

# --- Heartbeat Check ---

def heart_beat(db: Session, user_uuid: str):
    """
    Compares the local system time with the remote DB time to detect clock tampering.
    Returns True if tampering is detected and flagged, False otherwise.
    """
    try:
        # 1. Get remote DB time
        supabase = get_anon_client()
        res = supabase.rpc("get_server_utc").execute()

        if not hasattr(res, 'data') or not res.data:
            print("Warning: Could not retrieve server time for heartbeat check.")
            return False # Fail safe, don't lock out user if server time is unavailable

        server_time_str = res.data
        server_dt = datetime.fromisoformat(server_time_str).replace(tzinfo=timezone.utc)

        # 2. Get local system time as timezone-aware (UTC)
        local_dt = datetime.now(timezone.utc)

        # 3. Check difference
        if abs((server_dt - local_dt).total_seconds()) > 2 * 3600:
            # Check for an active subscription before flagging
            active_subscription = db.query(models.Subscription).filter(
                models.Subscription.user_uuid == user_uuid,
                models.Subscription.status == 'active'
            ).first()

            if active_subscription:
                print(f"Tampering detected for user {user_uuid}. Local time: {local_dt}, Server time: {server_dt}")
                # 5. Flag as tampered
                active_subscription.tampered = True
                active_subscription.is_dirty = True
                auth = db.query(models.Authentication).filter_by(user_uuid=user_uuid).first()
                if auth:
                    auth.is_logged_in = False
                    auth.is_dirty = True
                db.commit()
                return True # Tampering detected and flagged
            # No active subscription to flag - treat as no tampering since there's nothing to lock
            print(f"Clock drift detected for user {user_uuid}, but no active subscription to flag.")
            return False
        return False # No issue
    except Exception as e:
        print(f"Error during heartbeat check: {e}")
        return False # Fail safe

# --- BLOB UPLOAD ---
def upload_blob(blob_data: bytes, bucket_name: str, destination_path: str, use_service_client: bool = False):
    if use_service_client:
        supabase = get_service_role_client()
    else:
        supabase = get_service_role_client()
    try:
        content_type, _ = mimetypes.guess_type(destination_path)
        content_type = content_type or 'application/octet-stream'
        supabase.storage.from_(bucket_name).upload(
            file=blob_data,
            path=destination_path,
            file_options={"cache-control": "3600", "upsert": "true", "contentType": content_type}
        )
        return supabase.storage.from_(bucket_name).get_public_url(destination_path)
    except Exception as e:
        print(e)
        raise Exception(f"Upload to {bucket_name}/{destination_path} failed: {e}")

# --- DATA MAPPERS (PUSH: Local Model -> Supabase Payload) ---

def _to_iso(dt):
    return dt.isoformat() if dt else None

def _coerce_timestamptz(value) -> Optional[datetime]:
    """
    Best-effort coercion of Supabase RPC timestamptz returns to a timezone-aware datetime (UTC).
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    if isinstance(value, str):
        s = value.strip()
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        try:
            dt = datetime.fromisoformat(s)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    return None

def map_common_fields(record):
    return {
        "id": record.uuid,
        "created_at": _to_iso(record.created_at),
        "updated_at": _to_iso(record.updated_at),
        "deleted_at": _to_iso(record.deleted_at),
        "is_dirty": False,
    }

def map_user_to_payload(record: models.User):
    payload = {**map_common_fields(record), "username": record.username, "email": record.email, "business_name": record.business_name, "account_type": record.account_type, "location": record.location, "business_email": record.business_email, "status": record.status, "organization_id": record.organization_uuid, "branch_id": record.branch_uuid, "role": record.role, "distributor_id": record.distributor_id}
    if record.business_logo:
        path = f"user_logos/{record.uuid}.png"
        payload["business_logo"] = upload_blob(record.business_logo, "SSC", path)
    return payload

def map_customer_to_payload(record: models.Customer):
    return {**map_common_fields(record), "user_id": record.user_uuid, "full_name": record.full_name, "phone_number": record.phone_number, "email": record.email, "organization_id": record.organization_uuid, "branch_id": record.branch_uuid}

def map_project_to_payload(record: models.Project):
    return {**map_common_fields(record), "user_id": record.user_uuid, "customer_id": record.customer_uuid, "system_config_id": record.system_config_uuid, "status": record.status, "project_location": record.project_location, "organization_id": record.organization_uuid, "branch_id": record.branch_uuid}

def map_document_to_payload(record: models.Document):
    payload = {**map_common_fields(record), "project_id": record.project_uuid, "doc_type": record.doc_type, "file_name": record.file_name}
    if record.file_blob:
        folder = "documents/invoices" if record.doc_type == "Invoice" else "documents/project_breakdowns"
        path = f"{folder}/{record.uuid}_{record.file_name}"
        payload["file_path"] = upload_blob(record.file_blob, "SSC", path)
    return payload

def map_subscription_payment_to_payload(record: models.SubscriptionPayment):
    payload = {**map_common_fields(record), "subscription_id": record.subscription_uuid, "amount": float(record.amount), "payment_method": record.payment_method, "trx_no": record.trx_no, "status": record.status}
    if record.trx_screenshot:
        path = f"payment_screenshots/{record.uuid}.png"
        payload["trx_screenshot"] = upload_blob(record.trx_screenshot, "SSC", path)
    return payload

def map_invoice_to_payload(record: models.Invoice):
    """
    Invoice-specific push mapper.
    Local UI relies on `invoice_id` (integer invoice number), but cloud uses `invoice_no`.
    """
    payload = generic_mapper(record)
    payload["invoice_no"] = record.invoice_id
    return payload

def generic_mapper(record):
    payload = map_common_fields(record)
    local_columns = [c.name for c in record.__table__.columns]
    model_pk_cols = [c.name for c in record.__table__.primary_key.columns]
    for col in local_columns:
        if col not in payload and col not in model_pk_cols and col != 'uuid':
            value = getattr(record, col)
            if isinstance(value, datetime):
                payload[col] = _to_iso(value)
            elif isinstance(value, Decimal):
                payload[col] = float(value)
            else:
                payload[col] = value
    fk_mappings = {'user_uuid': 'user_id', 'customer_uuid': 'customer_id', 'project_uuid': 'project_id', 'system_config_uuid': 'system_config_id', 'invoice_uuid': 'invoice_id', 'subscription_uuid': 'subscription_id', 'organization_uuid': 'organization_id', 'branch_uuid': 'branch_id', 'category_uuid': 'category_id', 'item_uuid': 'item_id'}
    for local_fk, remote_fk in fk_mappings.items():
        if local_fk in payload:
            payload[remote_fk] = payload.pop(local_fk)
    return payload

# --- DATA MAPPERS (PULL: Supabase Payload -> Local Model) ---

def _map_cloud_to_local(payload: dict, model_class) -> dict:
    """
    Generic reverse mapper to convert a JSON payload from Supabase to a dictionary
    of attributes for a local SQLAlchemy model.
    """
    fk_mappings = {'user_id': 'user_uuid', 'customer_id': 'customer_uuid', 'project_id': 'project_uuid', 'system_config_id': 'system_config_uuid', 'invoice_id': 'invoice_uuid', 'subscription_id': 'subscription_uuid', 'organization_id': 'organization_uuid', 'branch_id': 'branch_uuid', 'category_id': 'category_uuid', 'item_id': 'item_uuid'}
    local_columns = {c.name for c in model_class.__table__.columns}
    mapped_payload = {}
    for key, value in payload.items():
        if key == 'id':
            local_key = 'uuid'
        elif key in fk_mappings:
            local_key = fk_mappings[key]
        else:
            local_key = key

        if local_key not in local_columns:
            continue

        if isinstance(value, str):
            try:
                if value.endswith('Z'):
                    value = value[:-1] + '+00:00'
                value = datetime.fromisoformat(value)
            except (ValueError, TypeError):
                pass

        mapped_payload[local_key] = value

    final_payload = dict(mapped_payload)

    # Do not process blobs pulled from the cloud for now.
    blob_cols = {col.name for col in model_class.__table__.columns if isinstance(col.type, LargeBinary)}
    for col in blob_cols:
        final_payload.pop(col, None)

    return final_payload

def _map_cloud_to_local_invoice(payload: dict, model_class) -> dict:
    """
    Invoice-specific pull mapper.
    Cloud sends `invoice_no`, local column is `invoice_id`.
    """
    normalized = dict(payload)
    if "invoice_no" in normalized and "invoice_id" not in normalized:
        normalized["invoice_id"] = normalized.pop("invoice_no")
    return _map_cloud_to_local(normalized, model_class)

# --- SYNC CONFIGURATION ---

SYNC_CONFIG = [
    {"model": models.Organization, "table_name": "organizations", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Branch, "table_name": "branches", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.User, "table_name": "users", "mapper": map_user_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Authentication, "table_name": "authentications", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Customer, "table_name": "customers", "mapper": map_customer_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.SystemConfiguration, "table_name": "system_configurations", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Project, "table_name": "projects", "mapper": map_project_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.InventoryCategory, "table_name": "inventory_categories", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.InventoryItem, "table_name": "inventory_items", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.StockAdjustment, "table_name": "stock_adjustments", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.ProjectComponent, "table_name": "project_components", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Appliance, "table_name": "appliances", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Subscription, "table_name": "subscriptions", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Invoice, "table_name": "invoices", "mapper": map_invoice_to_payload, "reverse_mapper": _map_cloud_to_local_invoice},
    {"model": models.Payment, "table_name": "payments", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.SubscriptionPayment, "table_name": "subscription_payments", "mapper": map_subscription_payment_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Document, "table_name": "documents", "mapper": map_document_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.ApplicationSettings, "table_name": "application_settings", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.SyncLog, "table_name": "sync_logs", "mapper": generic_mapper, "reverse_mapper": _map_cloud_to_local}
]

# --- CORE SYNC LOGIC ---

def _get_hq_branch_uuid(db: Session, organization_uuid: str) -> Optional[str]:
    if not organization_uuid:
        return None
    row = (
        db.query(models.Branch.uuid)
        .filter(models.Branch.organization_uuid == organization_uuid)
        .filter(or_(models.Branch.name.ilike("HQ"), models.Branch.name.ilike("الفرع الرئيسي")))
        .first()
    )
    return row[0] if row else None

def _build_sync_scope(db: Session, user: models.User) -> dict:
    """
    Build a sync scope context for role-based filtering.
    Local columns use *_uuid (string UUIDs). Remote uses *_id but we map via mappers.
    """
    role = (user.role or "").lower()
    org_uuid = getattr(user, "organization_uuid", None)
    branch_uuid = getattr(user, "branch_uuid", None)
    return {
        "role": role,
        "user_uuid": user.uuid,
        "organization_uuid": org_uuid,
        "branch_uuid": branch_uuid,
        "hq_branch_uuid": _get_hq_branch_uuid(db, org_uuid),
    }

def _scope_query_for_model(db: Session, model, scope: dict):
    """
    Return a SQLAlchemy query filtered to only records within the allowed scope.
    """
    role = scope["role"]
    user_uuid = scope["user_uuid"]
    org_uuid = scope["organization_uuid"]
    branch_uuid = scope["branch_uuid"]

    q = db.query(model)

    def scoped_projects_query():
        # Projects are the main scoping pivot for many child tables.
        base = db.query(models.Project.uuid)
        if role == "admin":
            return base.filter(models.Project.organization_uuid == org_uuid) if org_uuid else base.filter(False)
        if role == "employee":
            return base.filter(
                models.Project.organization_uuid == org_uuid,
                models.Project.branch_uuid == branch_uuid,
            ) if (org_uuid and branch_uuid) else base.filter(False)
        # user
        return base.filter(models.Project.user_uuid == user_uuid)

    # Always keep Authentication strictly per-user to avoid RLS violations.
    if model is models.Authentication:
        return q.filter(models.Authentication.user_uuid == user_uuid)
    if model is models.ApplicationSettings:
        return q.filter(models.ApplicationSettings.user_uuid == user_uuid)
    if model is models.SyncLog:
        return q.filter(models.SyncLog.user_uuid == user_uuid)

    # Admin: allow org-wide records; employee: branch-only; user: primarily per-user, with org/branch for tables that don't have user_uuid.
    if role == "admin":
        if model is models.Organization:
            return q.filter(models.Organization.uuid == org_uuid) if org_uuid else q.filter(False)
        if model is models.Branch:
            return q.filter(models.Branch.organization_uuid == org_uuid) if org_uuid else q.filter(False)
        if hasattr(model, "organization_uuid") and org_uuid:
            q = q.filter(getattr(model, "organization_uuid") == org_uuid)
        # Child tables that don't carry org/branch directly must be scoped via Projects/Users.
        if model is models.SystemConfiguration:
            return q.filter(models.SystemConfiguration.uuid.in_(scoped_projects_query().with_entities(models.Project.system_config_uuid)))
        if model is models.Appliance:
            return q.filter(models.Appliance.project_uuid.in_(scoped_projects_query()))
        if model is models.Document:
            return q.filter(models.Document.project_uuid.in_(scoped_projects_query()))
        if model is models.Invoice:
            return q.filter(models.Invoice.project_uuid.in_(scoped_projects_query()))
        if model is models.Payment:
            return q.filter(models.Payment.invoice_uuid.in_(db.query(models.Invoice.uuid).filter(models.Invoice.project_uuid.in_(scoped_projects_query()))))
        if model is models.ProjectComponent:
            return q.filter(models.ProjectComponent.project_uuid.in_(scoped_projects_query()))
        return q

    if role == "employee":
        # Employees: strict branch-only, and no CRUD on branches table itself.
        if model is models.Branch:
            return q.filter(False)
        if model is models.Organization:
            # Allow reading/updating their organization only if user needs it; still scoped.
            return q.filter(models.Organization.uuid == org_uuid) if org_uuid else q.filter(False)

        if hasattr(model, "organization_uuid") and org_uuid:
            q = q.filter(getattr(model, "organization_uuid") == org_uuid)
        if hasattr(model, "branch_uuid") and branch_uuid:
            q = q.filter(getattr(model, "branch_uuid") == branch_uuid)

        # Tables without branch_uuid need parent-based scoping.
        if model is models.Payment:
            return q.filter(
                models.Payment.invoice_uuid.in_(
                    db.query(models.Invoice.uuid).filter(
                        models.Invoice.project_uuid.in_(scoped_projects_query())
                    )
                )
            )
        if model is models.Invoice:
            return q.filter(models.Invoice.project_uuid.in_(scoped_projects_query()))
        if model is models.Appliance:
            return q.filter(models.Appliance.project_uuid.in_(scoped_projects_query()))
        if model is models.Document:
            return q.filter(models.Document.project_uuid.in_(scoped_projects_query()))
        if model is models.SystemConfiguration:
            return q.filter(
                models.SystemConfiguration.uuid.in_(
                    scoped_projects_query().with_entities(models.Project.system_config_uuid)
                )
            )
        if model is models.ProjectComponent:
            return q.filter(models.ProjectComponent.project_uuid.in_(scoped_projects_query()))
        if model is models.Subscription:
            # Employee can sync subscriptions for users in their branch/org.
            return q.filter(
                models.Subscription.user_uuid.in_(
                    db.query(models.User.uuid).filter(
                        models.User.organization_uuid == org_uuid,
                        models.User.branch_uuid == branch_uuid,
                    )
                )
            )
        if model is models.SubscriptionPayment:
            return q.filter(
                models.SubscriptionPayment.subscription_uuid.in_(
                    db.query(models.Subscription.uuid).filter(
                        models.Subscription.user_uuid.in_(
                            db.query(models.User.uuid).filter(
                                models.User.organization_uuid == org_uuid,
                                models.User.branch_uuid == branch_uuid,
                            )
                        )
                    )
                )
            )
        # Default: if it doesn't have enough scope columns, safest is exclude.
        return q

    # role == "user" (or fallback)
    if model is models.Organization:
        return q.filter(models.Organization.uuid == org_uuid) if org_uuid else q.filter(False)
    if model is models.Branch:
        return q.filter(models.Branch.uuid == branch_uuid) if branch_uuid else q.filter(False)

    if hasattr(model, "user_uuid"):
        return q.filter(getattr(model, "user_uuid") == user_uuid)

    if hasattr(model, "organization_uuid") and org_uuid:
        q = q.filter(getattr(model, "organization_uuid") == org_uuid)
    if hasattr(model, "branch_uuid") and branch_uuid:
        q = q.filter(getattr(model, "branch_uuid") == branch_uuid)
    if model is models.SystemConfiguration:
        return q.filter(models.SystemConfiguration.uuid.in_(scoped_projects_query().with_entities(models.Project.system_config_uuid)))
    if model is models.Appliance:
        return q.filter(models.Appliance.project_uuid.in_(scoped_projects_query()))
    if model is models.Document:
        return q.filter(models.Document.project_uuid.in_(scoped_projects_query()))
    if model is models.Invoice:
        return q.filter(models.Invoice.user_uuid == user_uuid)
    if model is models.Payment:
        return q.filter(models.Payment.invoice_uuid.in_(db.query(models.Invoice.uuid).filter(models.Invoice.user_uuid == user_uuid)))
    if model is models.ProjectComponent:
        return q.filter(models.ProjectComponent.project_uuid.in_(scoped_projects_query()))
    return q

def sync_table(db: Session, model, table_name: str, mapper, scope: dict, dirty_only=True):
    if dirty_only:
        records = _scope_query_for_model(db, model, scope).filter(model.is_dirty == True).all()
    else:
        records = _scope_query_for_model(db, model, scope).all()
    if not records:
        return

    payloads = [mapper(rec) for rec in records]

    try:
        supabase = get_user_client()
        # Note: The push RPC is currently named 'sync_apply_and_pull'
        response = supabase.rpc("sync_apply_and_pull", {"p_table_name": table_name, "p_records": payloads}).execute()
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Supabase RPC error for {table_name}: {response.error.message}")
        if hasattr(response, 'data'):
            confirmed_ids = set(str(x) for x in (response.data or []))
            if not confirmed_ids:
                # Do not clear local dirty flags without explicit confirmation.
                raise Exception(f"Push for {table_name} returned no confirmed IDs. Local dirty flags were not cleared.")

            confirmed_count = 0
            for record in records:
                if str(record.uuid) in confirmed_ids:
                    record.is_dirty = False
                    confirmed_count += 1

            db.commit()
            print(f"Successfully pushed and confirmed {confirmed_count}/{len(records)} records to {table_name}.")
    except Exception as e:
        print(e)
        raise Exception(f"Failed to push table {table_name}: {str(e)}")

def push_to_supabase(db: Session, dirty_only: bool = True):
    auth_record = (
        db.query(models.Authentication)
        .filter(models.Authentication.is_logged_in.is_(True))
        .order_by(models.Authentication.last_active.desc())
        .first()
    )

    if not auth_record:
        raise Exception("No authenticated user found in local DB.")

    user = db.query(models.User).filter(models.User.uuid == auth_record.user_uuid).first()

    if not user:
        raise Exception("Authenticated user not found in local DB.")

    scope = _build_sync_scope(db, user)
    for config in SYNC_CONFIG:
        table_name = config["table_name"]
        print(f"Pushing dirty records for table: {table_name}...")
        # Re-raise exceptions from sync_table to ensure atomicity of the overall sync
        sync_table(db, config["model"], table_name, config["mapper"], scope=scope, dirty_only=dirty_only)

def _ensure_device_id(db: Session, user_uuid: str) -> str:
    """
    Uses existing Authentication.device_id if present; otherwise generates and persists one.
    """
    auth = (
        db.query(models.Authentication)
        .filter(models.Authentication.user_uuid == user_uuid)
        .order_by(models.Authentication.created_at.desc())
        .first()
    )
    if auth and auth.device_id:
        return str(auth.device_id)

    import uuid as _uuid
    device_id = str(_uuid.uuid4())
    if auth:
        auth.device_id = device_id
        auth.is_dirty = True
        db.commit()
    return device_id

def _get_local_cursor(db: Session, user_uuid: str, device_id: str) -> Optional[datetime]:
    row = (
        db.query(models.SyncState)
        .filter(models.SyncState.user_uuid == user_uuid, models.SyncState.device_id == device_id)
        .first()
    )
    if not row or not row.last_cursor:
        return None
    # Stored as naive UTC in SQLite; treat as UTC.
    return row.last_cursor.replace(tzinfo=timezone.utc) if row.last_cursor.tzinfo is None else row.last_cursor.astimezone(timezone.utc)

def _set_local_cursor(db: Session, user_uuid: str, device_id: str, cursor_utc: datetime):
    cursor_naive = cursor_utc.astimezone(timezone.utc).replace(tzinfo=None)
    row = (
        db.query(models.SyncState)
        .filter(models.SyncState.user_uuid == user_uuid, models.SyncState.device_id == device_id)
        .first()
    )
    if row:
        row.last_cursor = cursor_naive
        row.updated_at = datetime.utcnow()
        row.is_dirty = False
    else:
        row = models.SyncState(user_uuid=user_uuid, device_id=device_id, last_cursor=cursor_naive, is_dirty=False)
        db.add(row)
    db.commit()

def _get_last_sync_cursor(db: Session, user_uuid: str, device_id: str, supabase) -> datetime:
    local_cursor = _get_local_cursor(db, user_uuid, device_id)
    if local_cursor:
        return local_cursor

    # Attempt to bootstrap cursor from server state (if present).
    try:
        server_cursor_res = supabase.rpc("get_sync_cursor", {"p_device_id": device_id}).execute()
        if hasattr(server_cursor_res, 'error') and server_cursor_res.error:
            raise Exception(server_cursor_res.error.message)
        server_cursor = _coerce_timestamptz(getattr(server_cursor_res, 'data', None))
        if server_cursor:
            _set_local_cursor(db, user_uuid, device_id, server_cursor)
            return server_cursor
    except Exception:
        pass

    # Default for initial sync: Jan 1, 2000 UTC.
    return datetime(2000, 1, 1, tzinfo=timezone.utc)

def pull_from_supabase(db: Session):
    auth_record = (
        db.query(models.Authentication)
        .filter(models.Authentication.is_logged_in == True)
        .order_by(models.Authentication.last_active.desc())
        .first()
    )
    if not auth_record:
        return None, (jsonify({"error": "No authenticated user found. Please log in."}), 401)

    current_user = db.query(models.User).filter(models.User.uuid == auth_record.user_uuid).first()
    if not current_user:
        return None, (jsonify({"error": "Authenticated user not found in user table."}), 404)

    user_uuid = current_user.uuid

    supabase = get_user_client()
    device_id = _ensure_device_id(db, user_uuid)
    last_cursor = _get_last_sync_cursor(db, user_uuid, device_id, supabase)

    # Use a server-issued high-water mark to bound the pull window.
    server_time_res = supabase.rpc("get_server_utc").execute()
    if hasattr(server_time_res, 'error') and server_time_res.error:
        raise Exception(f"Failed to retrieve server time: {server_time_res.error.message}")
    high_water_mark = _coerce_timestamptz(getattr(server_time_res, 'data', None))
    if not high_water_mark:
        raise Exception("Failed to parse server time for high-water mark.")

    last_cursor_iso = last_cursor.astimezone(timezone.utc).isoformat()
    high_water_iso = high_water_mark.astimezone(timezone.utc).isoformat()
    print(f"\n--- Starting Pull Operation (window: ({last_cursor_iso}, {high_water_iso}]) ---")
    try:
        # Set a flag on the session to indicate that a pull sync is active.
        # The SQLAlchemy event listener will check this flag.
        setattr(db, 'is_pull_sync_active', True)

        for config in reversed(SYNC_CONFIG):
            table_name = config["table_name"]
            model_class = config["model"]
            reverse_mapper = config.get("reverse_mapper")
            if not reverse_mapper:
                print(f" -> No reverse mapper for {table_name}, skipping pull.")
                continue
            try:
                print(f"Pulling changes for '{table_name}'...")
                response = supabase.rpc(
                    "pull_changes",
                    {
                        "p_table_name": table_name,
                        "p_last_sync_timestamp": last_cursor_iso,
                        "p_high_water_mark": high_water_iso,
                    },
                ).execute()
                if hasattr(response, 'error') and response.error:
                    raise Exception(f"Supabase RPC error for {table_name}: {response.error.message}")

                records_from_supabase = response.data
                if not records_from_supabase:
                    print(f" -> No new records found for {table_name}.")
                    continue

                print(f" -> Received {len(records_from_supabase)} records from {table_name}. Merging...")
                for record_data in records_from_supabase:
                    # 1. Convert cloud payload to a dictionary of local attributes
                    payload_dict = reverse_mapper(record_data, model_class)
                    record_uuid = payload_dict.get('uuid')
                    if not record_uuid:
                        continue

                    # 2. Query for existing local record by UUID
                    existing_record = db.query(model_class).filter_by(uuid=record_uuid).first()

                    if existing_record:
                        incoming_updated_at = payload_dict.get("updated_at")

                        # Last-write-wins: if local is dirty and newer than incoming, keep local edits.
                        if getattr(existing_record, "is_dirty", False) and incoming_updated_at:
                            local_updated_at = getattr(existing_record, "updated_at", None)
                            if local_updated_at:
                                local_aware = local_updated_at.replace(tzinfo=timezone.utc) if local_updated_at.tzinfo is None else local_updated_at.astimezone(timezone.utc)
                                incoming_aware = incoming_updated_at.replace(tzinfo=timezone.utc) if isinstance(incoming_updated_at, datetime) and incoming_updated_at.tzinfo is None else (
                                    incoming_updated_at.astimezone(timezone.utc) if isinstance(incoming_updated_at, datetime) else None
                                )
                                if incoming_aware and local_aware > incoming_aware:
                                    continue

                        # 3a. UPDATE existing record
                        for key, value in payload_dict.items():
                            setattr(existing_record, key, value)
                        existing_record.is_dirty = False
                    else:
                        # 3b. INSERT new record
                        new_instance = model_class(**payload_dict)
                        new_instance.is_dirty = False
                        db.add(new_instance)

                db.commit()
                print(f"    - Successfully merged {len(records_from_supabase)} records for {table_name}.")
            except Exception as e:
                db.rollback()
                print(f"Error pulling table {table_name}: {str(e)}")
                raise

        # Only advance the cursor if the full pull succeeded.
        _set_local_cursor(db, user_uuid, device_id, high_water_mark)
        try:
            supabase.rpc("set_sync_cursor", {"p_device_id": device_id, "p_cursor": high_water_iso}).execute()
        except Exception:
            pass
    finally:
        # Always ensure the flag is reset, even if an error occurs
        setattr(db, 'is_pull_sync_active', False)

def _create_and_push_final_sync_log(db: Session, sync_start_time: datetime):
    print("\n--- Finalizing sync operation ---")
    # Explicitly query for the UUID as a scalar to avoid passing a Row/Tuple object.
    auth_record = (
        db.query(models.Authentication)
        .filter(models.Authentication.is_logged_in == True)
        .order_by(models.Authentication.last_active.desc())
        .first()
    )
    if not auth_record:
        return None, (jsonify({"error": "No authenticated user found. Please log in."}), 401)

    current_user = db.query(models.User).filter(models.User.uuid == auth_record.user_uuid).first()
    if not current_user:
        return None, (jsonify({"error": "Authenticated user not found in user table."}), 404)

    user_uuid = current_user.uuid

    # Determine if this is the first sync to correctly label it 'full' or 'incremental'.
    exists = db.query(models.SyncLog.sync_id).first() is not None
    sync_type = "incremental" if exists else "full"

    sync_log_entry = models.SyncLog(
        sync_type=sync_type,
        table_name="all",
        status="success",
        user_uuid=user_uuid,
        created_at=sync_start_time,
        updated_at=datetime.now(timezone.utc),
        is_dirty=True
    )
    db.add(sync_log_entry)
    db.commit()

    current_user, error_response = _get_current_user(db)
    if error_response:
        return error_response

    print("Pushing final sync log to remote...")
    scope = {
        "role": current_user.role,
        "user_uuid": current_user.uuid,
        "organization_uuid": None,
        "branch_uuid": None,
        "hq_branch_uuid": None
    }
    try:
        sync_table(db, models.SyncLog, "sync_logs", generic_mapper,scope=scope, dirty_only=True)
        print("Final sync log pushed successfully.")
    except Exception as e:
        print(f"Warning: Failed to push final sync log to remote: {str(e)}")

def trigger_immediate_sync(db, user_uuid, table_name):
    """Creates a local sync log and triggers the sync process."""
    new_log = models.SyncLog(
        sync_type='incremental',
        table_name=table_name,
        status='success',
        user_uuid=user_uuid,
        is_dirty=True
    )
    db.add(new_log)
    db.commit()
    sync()

@sync_log_bp.route('/sync', methods=['POST'])
def sync():
    start_time = datetime.now(timezone.utc)
    print(f"Synchronization process started at {start_time.isoformat()} UTC.")

    with get_db() as db:
        user_uuid_row = db.query(models.User.uuid).first()
        if not user_uuid_row:
             return jsonify({"status": "failed", "error": "No user found in local DB."}), 404
        user_uuid = user_uuid_row[0]

        # Check if already tampered
        tampered_subscription = db.query(models.Subscription).filter(
            models.Subscription.user_uuid == user_uuid,
            models.Subscription.tampered == True
        ).first()

        if tampered_subscription:
            try:
                # User is already flagged, only allow pulling for updates.
                print("Account is locked. Performing pull-only sync.")
                pull_from_supabase(db)
                return jsonify({"status": "tamper_lock", "message": "Account locked due to suspected tampering. Only pull sync is allowed."}), 403
            except Exception as e:
                return jsonify({"status": "failed", "error": str(e)}), 500

        # If not tampered, proceed with heartbeat check
        try:
            is_tampered = heart_beat(db, user_uuid)
            if is_tampered:
                # heart_beat has now flagged the user.
                # Push this change to the server immediately.
                print("Tampering detected. Pushing lock status to server.")
                push_to_supabase(db) # This will push the subscription.tampered=True change
                return jsonify({"status": "tamper_detected", "message": "Time discrepancy detected. Account is being locked."}), 403
        except Exception as e:
            return jsonify({"status": "failed", "error": f"Heartbeat check failed: {e}"}), 500

        # If all checks pass, proceed with normal sync
        try:
            push_to_supabase(db)
            pull_from_supabase(db)
            _create_and_push_final_sync_log(db, start_time)

            end_time = datetime.utcnow()
            # duration = (end_time - start_time).total_seconds()
            print(f"Synchronization process finished successfully in {0:.2f} seconds.")
            return jsonify({"status": "ok", "duration_seconds": 0}), 200
        except Exception as e:
            end_time = datetime.utcnow()
            # duration = (end_time - start_time).total_seconds()
            print(f"Synchronization process failed after {0:.2f} seconds.")
            return jsonify({"status": "failed", "error": str(e), "duration_seconds": 0}), 500

@sync_log_bp.route('/', methods=['GET'])
def get_all_logs():
    auth_record = (
        db.query(models.Authentication)
        .filter(models.Authentication.is_logged_in == True)
        .order_by(models.Authentication.last_active.desc())
        .first()
    )
    if not auth_record:
        return jsonify({"error": "No authenticated user found. Please log in."}), 401

    current_user = db.query(models.User).filter(models.User.uuid == auth_record.user_uuid).first()
    if not current_user:
        return jsonify({"error": "Authenticated user not found in user table."}), 404

    with get_db() as db:
        items = db.query(models.SyncLog).filter(models.SyncLog.user_uuid == current_user.uuid).all()
        return jsonify([model_to_dict(i) for i in items])

@sync_log_bp.route('/push', methods=['POST'])
def push():
    with get_db() as db:
        try:
            push_to_supabase(db, False)
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            return jsonify({"status": "failed", "error": str(e)}), 500
