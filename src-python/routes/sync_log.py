# src-python/routes/sync_log.py
import mimetypes
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from utils import get_db
import models
from supabase_client import get_user_client, get_service_role_client, get_anon_client
from serializer import model_to_dict

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
            return True
        return False # No issue
    except Exception as e:
        print(f"Error during heartbeat check: {e}")
        return False # Fail safe

# --- BLOB UPLOAD ---
def upload_blob(blob_data: bytes, bucket_name: str, destination_path: str, use_service_client: bool = False):
    if use_service_client:
        supabase = get_service_role_client()
    else:
        supabase = get_user_client()
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
        raise Exception(f"Upload to {bucket_name}/{destination_path} failed: {e}")

# --- DATA MAPPERS (PUSH: Local Model -> Supabase Payload) ---

def _to_iso(dt):
    return dt.isoformat() if dt else None

def _map_common_fields(record):
    return {
        "id": record.uuid,
        "created_at": _to_iso(record.created_at),
        "updated_at": _to_iso(record.updated_at),
        "deleted_at": _to_iso(record.deleted_at),
        "is_dirty": False,
    }

def _map_user_to_payload(record: models.User):
    payload = {**_map_common_fields(record), "username": record.username, "email": record.email, "business_name": record.business_name, "account_type": record.account_type, "location": record.location, "business_email": record.business_email, "status": record.status, "organization_id": record.organization_uuid, "branch_id": record.branch_uuid, "role": record.role, "distributor_id": record.distributor_id}
    if record.business_logo:
        path = f"user_logos/{record.uuid}.png"
        payload["business_logo"] = upload_blob(record.business_logo, "SSC", path)
    return payload

def _map_customer_to_payload(record: models.Customer):
    return {**_map_common_fields(record), "user_id": record.user_uuid, "full_name": record.full_name, "phone_number": record.phone_number, "email": record.email, "organization_id": record.organization_uuid, "branch_id": record.branch_uuid}

def _map_project_to_payload(record: models.Project):
    return {**_map_common_fields(record), "user_id": record.user_uuid, "customer_id": record.customer_uuid, "system_config_id": record.system_config_uuid, "status": record.status, "project_location": record.project_location, "organization_id": record.organization_uuid, "branch_id": record.branch_uuid}

def _map_document_to_payload(record: models.Document):
    payload = {**_map_common_fields(record), "project_id": record.project_uuid, "doc_type": record.doc_type, "file_name": record.file_name}
    if record.file_blob:
        folder = "documents/invoices" if record.doc_type == "Invoice" else "documents/project_breakdowns"
        path = f"{folder}/{record.uuid}_{record.file_name}"
        payload["file_path"] = upload_blob(record.file_blob, "SSC", path)
    return payload

def _map_subscription_payment_to_payload(record: models.SubscriptionPayment):
    payload = {**_map_common_fields(record), "subscription_id": record.subscription_uuid, "amount": record.amount, "payment_method": record.payment_method, "trx_no": record.trx_no, "status": record.status}
    if record.trx_screenshot:
        path = f"payment_screenshots/{record.uuid}.png"
        payload["trx_screenshot"] = upload_blob(record.trx_screenshot, "SSC", path)
    return payload

def _generic_mapper(record):
    payload = _map_common_fields(record)
    local_columns = [c.name for c in record.__table__.columns]
    model_pk_cols = [c.name for c in record.__table__.primary_key.columns]
    for col in local_columns:
        if col not in payload and col not in model_pk_cols and col != 'uuid':
            value = getattr(record, col)
            if isinstance(value, datetime):
                payload[col] = _to_iso(value)
            else:
                payload[col] = value
    fk_mappings = {'user_uuid': 'user_id', 'customer_uuid': 'customer_id', 'project_uuid': 'project_id', 'system_config_uuid': 'system_config_id', 'invoice_uuid': 'invoice_id', 'subscription_uuid': 'subscription_id', 'organization_uuid': 'organization_id', 'branch_uuid': 'branch_id'}
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
    fk_mappings = {'user_id': 'user_uuid', 'customer_id': 'customer_uuid', 'project_id': 'project_uuid', 'system_config_id': 'system_config_uuid', 'invoice_id': 'invoice_uuid', 'subscription_id': 'subscription_uuid', 'organization_id': 'organization_uuid', 'branch_id': 'branch_uuid'}
    mapped_payload = {}
    for key, value in payload.items():
        if key == 'id':
            mapped_payload['uuid'] = value
            continue
        if key in fk_mappings:
            mapped_payload[fk_mappings[key]] = value
            continue
        if isinstance(value, str):
            try:
                if value.endswith('Z'):
                    value = value[:-1] + '+00:00'
                dt_obj = datetime.fromisoformat(value)
                mapped_payload[key] = dt_obj
                continue
            except (ValueError, TypeError):
                pass
        mapped_payload[key] = value

    local_columns = {c.name for c in model_class.__table__.columns}
    final_payload = {k: v for k, v in mapped_payload.items() if k in local_columns}

    # Do not process blobs pulled from the cloud for now.
    blob_cols = {col.name for col in model_class.__table__.columns if isinstance(col.type, models.LargeBinary)}
    for col in blob_cols:
        final_payload.pop(col, None)

    return final_payload

# --- SYNC CONFIGURATION ---

SYNC_CONFIG = [
    {"model": models.Organization, "table_name": "organizations", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Branch, "table_name": "branches", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.User, "table_name": "users", "mapper": _map_user_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Authentication, "table_name": "authentications", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Customer, "table_name": "customers", "mapper": _map_customer_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Project, "table_name": "projects", "mapper": _map_project_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.SystemConfiguration, "table_name": "system_configurations", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Appliance, "table_name": "appliances", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Subscription, "table_name": "subscriptions", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Invoice, "table_name": "invoices", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Payment, "table_name": "payments", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local},
    {"model": models.SubscriptionPayment, "table_name": "subscription_payments", "mapper": _map_subscription_payment_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.Document, "table_name": "documents", "mapper": _map_document_to_payload, "reverse_mapper": _map_cloud_to_local},
    {"model": models.ApplicationSettings, "table_name": "application_settings", "mapper": _generic_mapper, "reverse_mapper": _map_cloud_to_local}
]

# --- CORE SYNC LOGIC ---

def sync_table(db: Session, model, table_name: str, mapper, dirty_only=True):
    if dirty_only:
        records = db.query(model).filter(model.is_dirty == True).all()
    else:
        records = db.query(model).all()
    if not records:
        return

    payloads = [mapper(rec) for rec in records]
    print(payloads)
    try:
        supabase = get_user_client()
        # Note: The push RPC is currently named 'sync_apply_and_pull'
        response = supabase.rpc("sync_apply_and_pull", {"p_table_name": table_name, "p_records": payloads}).execute()
        if hasattr(response, 'error') and response.error:
            raise Exception(f"Supabase RPC error for {table_name}: {response.error.message}")
        if hasattr(response, 'data') and response.data:
            for record in records:
                record.is_dirty = False
            db.commit()
            print(f"Successfully pushed {len(response.data)} records to {table_name}.")
        else:
            print(f"Warning: Push for {table_name} completed, but the remote did not confirm processed records. Records will remain dirty.")
    except Exception as e:
        raise Exception(f"Failed to push table {table_name}: {str(e)}")

def push_to_supabase(db: Session, dirty_only: bool = True):
    print("\n--- Starting Push Operation ---")
    for config in SYNC_CONFIG:
        table_name = config["table_name"]
        try:
            print(f"Pushing dirty records for table: {table_name}...")
            sync_table(db, config["model"], table_name, config["mapper"], dirty_only=dirty_only)
        except Exception as e:
            print(f"Error pushing table {table_name}: {str(e)}")
            # Continue with the next table on error

def get_last_sync_timestamp(db: Session) -> str:
    last_sync = db.query(models.SyncLog).filter(models.SyncLog.status == "success").order_by(models.SyncLog.created_at.desc()).first()
    if last_sync:
        # Convert to UTC, then remove timezone info to produce a naive string
        return last_sync.created_at.astimezone(timezone.utc).replace(tzinfo=None).isoformat()
    # For initial sync, create UTC datetime, remove tzinfo
    return datetime(2000, 1, 1, 0, 0, 0, 0, tzinfo=timezone.utc).replace(tzinfo=None).isoformat()

def pull_from_supabase(db: Session):
    last_sync_time = get_last_sync_timestamp(db)
    print(f"\n--- Starting Pull Operation (since {last_sync_time}) ---")
    supabase = get_user_client()
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
                response = supabase.rpc("pull_changes", {"p_table_name": table_name, "p_last_sync_timestamp": last_sync_time}).execute()
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
    finally:
        # Always ensure the flag is reset, even if an error occurs
        setattr(db, 'is_pull_sync_active', False)

def _create_and_push_final_sync_log(db: Session, sync_start_time: datetime):
    print("\n--- Finalizing sync operation ---")
    # Explicitly query for the UUID as a scalar to avoid passing a Row/Tuple object.
    user_uuid_row = db.query(models.User.uuid).first()
    user_uuid = user_uuid_row[0] if user_uuid_row else None

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

    print("Pushing final sync log to remote...")
    try:
        sync_table(db, models.SyncLog, "sync_logs", _generic_mapper, dirty_only=True)
        print("Final sync log pushed successfully.")
    except Exception as e:
        print(f"Warning: Failed to push final sync log to remote: {str(e)}")
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
    with get_db() as db:
        items = db.query(models.SyncLog).all()
        return jsonify([model_to_dict(i) for i in items])

@sync_log_bp.route('/push', methods=['POST'])
def push():
    with get_db() as db:
        try:
            push_to_supabase(db, False)
            return jsonify({"status": "ok"}), 200
        except Exception as e:
            return jsonify({"status": "failed", "error": str(e)}), 500

@sync_log_bp.route('/heart_beat', methods=['GET'])
def push_auth():
    with get_db() as db:
        if not heart_beat(db=db):
            return jsonify({"status": "ok"}), 200
        return jsonify({"status": "failed"}), 500


