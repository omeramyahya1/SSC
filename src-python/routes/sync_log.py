# src-python/routes/sync_log.py
import mimetypes
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from utils import get_db
import models
from serializer import model_to_dict
from supabase_client import get_user_client, get_service_role_client, get_anon_client

sync_log_bp = Blueprint('sync_log_bp', __name__, url_prefix='/sync_logs')

# --- BLOB UPLOAD ---
def upload_blob(blob_data: bytes, bucket_name: str, destination_path: str, use_service_client: bool = False):
    """
    Uploads binary data to a specified Supabase bucket and returns the public URL.
    Raises an exception on failure.
    Can use service role client for initial registration uploads.
    """
    if use_service_client:
        supabase = get_service_role_client()
    else:
        supabase = get_user_client()

    try:
        content_type, _ = mimetypes.guess_type(destination_path)
        content_type = content_type or 'application/octet-stream'

        # supabase-py's upload expects bytes
        supabase.storage.from_(bucket_name).upload(
            file=blob_data,
            path=destination_path,
            file_options={"cache-control": "3600", "upsert": "true", "contentType": content_type}
        )
        public_url = supabase.storage.from_(bucket_name).get_public_url(destination_path)
        return public_url
    except Exception as e:
        # Re-raise as a more specific exception to be handled by the sync loop
        raise Exception(f"Upload to {bucket_name}/{destination_path} failed: {e}")


# --- DATA MAPPERS (Local Model -> Supabase Payload) ---

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
    payload = {
        **_map_common_fields(record),
        "username": record.username,
        "email": record.email,
        "business_name": record.business_name,
        "account_type": record.account_type,
        "location": record.location,
        "business_email": record.business_email,
        "status": record.status,
        "role": record.role,
    }
    if record.business_logo:
        path = f"user_logos/{record.uuid}.png"
        payload["business_logo"] = upload_blob(record.business_logo, "SSC", path)
    return payload

def _map_customer_to_payload(record: models.Customer):
    return {
        **_map_common_fields(record),
        "user_id": record.user_uuid,
        "full_name": record.full_name,
        "phone_number": record.phone_number,
        "email": record.email,
    }

def _map_project_to_payload(record: models.Project):
    return {
        **_map_common_fields(record),
        "user_id": record.user_uuid,
        "customer_id": record.customer_uuid,
        "system_config_id": record.system_config_uuid,
        "status": record.status,
        "project_location": record.project_location,
    }

def _map_document_to_payload(record: models.Document):
    payload = {
        **_map_common_fields(record),
        "project_id": record.project_uuid,
        "doc_type": record.doc_type,
        "file_name": record.file_name,
    }
    if record.file_blob:
        folder = "documents/invoices" if record.doc_type == "Invoice" else "documents/project_breakdowns"
        path = f"{folder}/{record.uuid}_{record.file_name}"
        payload["file_path"] = upload_blob(record.file_blob, "SSC", path)
    return payload

def _map_subscription_payment_to_payload(record: models.SubscriptionPayment):
    payload = {
        **_map_common_fields(record),
        "subscription_id": record.subscription_uuid,
        "amount": record.amount,
        "payment_method": record.payment_method,
        "trx_no": record.trx_no,
        "status": record.status,
    }
    if record.trx_screenshot:
        path = f"payment_screenshots/{record.uuid}.png"
        payload["trx_screenshot"] = upload_blob(record.trx_screenshot, "SSC", path)
    return payload

# Add other mappers here as needed, following the pattern.
# For simplicity, some mappers can be generic if fields match 1:1.
def _generic_mapper(record):
    """
    A more robust generic mapper that cleans the payload for Supabase.
    - Sets remote 'id' from local 'uuid'.
    - Removes the local integer-based primary key.
    - Renames local '*_uuid' foreign keys to remote '*_id' foreign keys.
    """
    payload = model_to_dict(record)

    # Set remote PK `id` from local `uuid` and remove `uuid` from payload
    if 'uuid' in payload:
        payload['id'] = payload.pop('uuid')

    # Get the actual primary key column name(s) for the given record's model
    # and remove them from the payload, as they are local-only.
    model_pk_cols = [c.name for c in record.__table__.primary_key.columns]
    for pk_name in model_pk_cols:
        if pk_name in payload:
             payload.pop(pk_name)

    # Rename local *_uuid FKs to remote *_id FKs by popping the old key
    fk_mappings = {
        'user_uuid': 'user_id',
        'customer_uuid': 'customer_id',
        'project_uuid': 'project_id',
        'system_config_uuid': 'system_config_id',
        'invoice_uuid': 'invoice_id',
        'subscription_uuid': 'subscription_id',
    }
    for local_fk, remote_fk in fk_mappings.items():
        if local_fk in payload:
            payload[remote_fk] = payload.pop(local_fk)

    return payload


# --- SYNC CONFIGURATION ---

SYNC_CONFIG = [
    {"model": models.User, "table_name": "users", "mapper": _map_user_to_payload},
    {"model": models.Customer, "table_name": "customers", "mapper": _map_customer_to_payload},
    {"model": models.SystemConfiguration, "table_name": "system_configurations", "mapper": _generic_mapper},
    {"model": models.Project, "table_name": "projects", "mapper": _map_project_to_payload},
    {"model": models.Appliance, "table_name": "appliances", "mapper": _generic_mapper},
    {"model": models.Subscription, "table_name": "subscriptions", "mapper": _generic_mapper},
    {"model": models.Invoice, "table_name": "invoices", "mapper": _generic_mapper},
    {"model": models.Payment, "table_name": "payments", "mapper": _generic_mapper},
    {"model": models.SubscriptionPayment, "table_name": "subscription_payments", "mapper": _map_subscription_payment_to_payload},
    {"model": models.Document, "table_name": "documents", "mapper": _map_document_to_payload},
    {"model": models.ApplicationSettings, "table_name": "application_settings", "mapper": _generic_mapper},
]

# --- CORE SYNC LOGIC ---

def finalize_sync(db: Session, status: str, table_name: str, sync_type: str, details: str = None):
    """Logs the result of a sync operation."""
    # Using a placeholder user_uuid. In a real app, this would come from the session.
    user = db.query(models.User).first()
    user_uuid = user.uuid if user else None

    sync_log_entry = models.SyncLog(
        sync_type=sync_type,
        table_name=table_name,
        status=status,
        user_uuid=user_uuid, # FK to user.uuid
        details=details
    )
    db.add(sync_log_entry)
    db.commit()

def sync_table(db: Session, model, table_name: str, mapper):
    """Generic worker to sync all dirty records for a given table."""
    dirty_records = db.query(model).filter(model.is_dirty == True).all()
    if not dirty_records:
        return  # No records to sync for this table

    payloads = [mapper(rec) for rec in dirty_records]

    try:
        supabase = get_user_client()
        # response = supabase.table(table_name).upsert(payloads).execute()
        response = supabase.rpc("sync_apply_and_pull", {
            "table_name": table_name,
            "records": payloads
        } ).execute()

        # supabase-py v1 returns data in a Pydantic model
        if hasattr(response, 'data') and response.data:
            for record in dirty_records:
                record.is_dirty = False
            db.commit()
            print(f"Successfully upserted {len(response.data)} records to {table_name}.")
        elif hasattr(response, 'error') and response.error:
            raise Exception(f"Supabase upsert error for {table_name}: {response.error.message}")
        else:
            # This case might happen if the upsert is successful but returns no data (e.g. on conflict with no update)
            # We can assume success and mark as not dirty
            for record in dirty_records:
                record.is_dirty = False
            db.commit()
            print(f"Upsert for {table_name} completed with no data returned, assuming success.")

    except Exception as e:
        raise Exception(f"Failed to sync table {table_name}: {str(e)}")

def push_to_supabase(db: Session):
    """Iterates through SYNC_CONFIG and pushes dirty data for each table."""
    for config in SYNC_CONFIG:
        table_name = config["table_name"]
        try:
            print(f"Pushing dirty records for table: {table_name}...")
            sync_table(db, config["model"], table_name, config["mapper"])
            # finalize_sync(db, "success", table_name, "push")
            print(f"Successfully pushed {table_name}.")
        except Exception as e:
            error_message = str(e)
            print(f"Error pushing table {table_name}: {error_message}")
            # finalize_sync(db, "failed", table_name, "push", details=error_message)
            # Approved: Continue with the next table on error

def get_last_sync_timestamp(db: Session) -> str:
    """Get the timestamp of the last successful sync."""
    last_sync = db.query(models.SyncLog).filter(
        models.SyncLog.status == "success"
    ).order_by(models.SyncLog.created_at.desc()).first()

    if last_sync:
        return last_sync.created_at.isoformat()
    # If no successful syncs, return a time in the distant past
    return datetime(2000, 1, 1).isoformat()

def pull_from_supabase(db: Session):
    """
    Dummy function to simulate pulling incremental changes from Supabase
    and merging them into the local database.
    """
    last_sync_time = get_last_sync_timestamp(db)
    print(f"\n--- Starting Dummy Pull Operation (since {last_sync_time}) ---")

    for config in SYNC_CONFIG:
        table_name = config["table_name"]
        try:
            print(f"Simulating pull for '{table_name}' where updated_at > {last_sync_time}")

            # In a real implementation, you would call Supabase here:
            # supabase = get_user_client()
            # response = supabase.table(table_name).select("*").gt("updated_at", last_sync_time).execute()
            # records_from_supabase = response.data

            # DUMMY DATA: Simulate receiving one record
            records_from_supabase = []
            if not records_from_supabase:
                print(f" -> No new records found for {table_name}.")
                continue

            print(f" -> Received {len(records_from_supabase)} records from {table_name}. Simulating merge...")
            for record_data in records_from_supabase:
                # In a real implementation, you'd have a reverse mapper and use db.merge()
                # or a custom upsert function to update the local DB.
                record_uuid = record_data.get("id")
                print(f"    - Merging record with UUID: {record_uuid}")

            finalize_sync(db, "success", table_name, "pull")

        except Exception as e:
            error_message = str(e)
            print(f"Error pulling table {table_name}: {error_message}")
            finalize_sync(db, "failed", table_name, "pull", details=error_message)

@sync_log_bp.route('/sync', methods=['POST'])
def sync():
    """The main endpoint to trigger the full two-way synchronization process."""
    start_time = datetime.utcnow()
    print(f"Synchronization process started at {start_time.isoformat()} UTC.")

    # Heartbeat check
    try:
        supabase = get_anon_client()
        # A simple heartbeat check could be to get server time
        res = supabase.rpc("get_server_utc").execute()
        print(f"Supabase server time: {res.data}. Heartbeat check passed.")
    except Exception as e:
        return jsonify({"status": "failed", "error": f"Heartbeat check failed: {e}"}), 500

    # Main sync logic
    with get_db() as db:
        try:
            # 1. Push local changes to the cloud
            push_to_supabase(db)

            # 2. Pull remote changes to local
            # pull_from_supabase(db)

            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            print(f"Synchronization process finished successfully in {duration:.2f} seconds.")
            return jsonify({"status": "ok", "duration_seconds": duration}), 200

        except Exception as e:
            # This will catch any unexpected errors during the sync process
            end_time = datetime.utcnow()
            duration = (end_time - start_time).total_seconds()
            print(f"Synchronization process failed after {duration:.2f} seconds.")
            return jsonify({"status": "failed", "error": str(e), "duration_seconds": duration}), 500

@sync_log_bp.route('/', methods=['GET'])
def get_all_logs():
    with get_db() as db:
            items = db.query(models.SyncLog).all()
            return jsonify([model_to_dict(i) for i in items])


