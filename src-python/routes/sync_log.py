from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import SyncLog, Customer
from schemas import SyncLogCreate, SyncLogUpdate
from serializer import model_to_dict
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

sync_log_bp = Blueprint('sync_log_bp', __name__, url_prefix='/sync_logs')

# Supabase setup
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def sync_and_pull():
    """
    Pushes dirty records from the local database to Supabase.
    """
    with get_db() as db:
        dirty_customers = db.query(Customer).filter(Customer.is_dirty == True).all()

        if not dirty_customers:
            return # No records to sync

        # Normalize payload for Supabase
        payload = []
        for customer in dirty_customers:
            payload.append({
                "id": customer.uuid,  # Use the UUID for existing records
                "user_id": None, # Faking for now
                "organization_id": None, # Faking for now
                "full_name": customer.full_name,
                "phone_number": customer.phone_number,
                "email": customer.email,
                "created_at": customer.created_at.isoformat() if customer.created_at else None,
                "updated_at": customer.updated_at.isoformat() if customer.updated_at else None,
                "deleted_at": customer.deleted_at.isoformat() if customer.deleted_at else None,
                "is_dirty": False, # Will be set to false on the remote
            })

        try:
            # Call the generic RPC function on Supabase
            response = supabase.rpc('sync_apply_and_pull', {
                'table_name': 'customers',
                'records': payload
            }).execute()

            # Mark local rows as clean ONLY after a successful push
            if response.data: 
                for customer in dirty_customers:
                    customer.is_dirty = False
                db.commit()

        except Exception as e:
            # Handle exceptions from the RPC call
            print(f"Error during Supabase RPC call: {e}")
            db.rollback()
            raise # Re-raise the exception to be caught by the main sync function

def finalize_sync(status: str, table_name: str):
    """
    Logs the result of a sync operation in the sync_log table.
    """
    with get_db() as db:
        # TODO: The user_id should be retrieved from the session/request context.
        # For this example, we'll use a placeholder.
        user_id = 1
        sync_log_entry = SyncLog(
            sync_type="incremental",  # Assuming incremental for this example
            table_name=table_name,
            status=status,
            user_id=user_id
        )
        db.add(sync_log_entry)
        db.commit()

def heartbeat_check() -> bool:
    """
    Checks if the local UTC time is within 2 hours of the Supabase server's UTC time.
    Returns True if the difference is less than 2 hours, False otherwise.
    """
    try:
        # Get server UTC time from Supabase
        res = supabase.rpc("get_server_utc").execute()
        server_utc_str = res.data

        # Parse server UTC string to datetime object. fromisoformat handles 'Z' and '+HH:MM'
        server_time = datetime.fromisoformat(server_utc_str)
        
        # Ensure server_time is UTC timezone-aware and then convert to naive for comparison
        if server_time.tzinfo is None:
            # Assume it's UTC if no tzinfo, and make it aware
            server_time = server_time.replace(tzinfo=timezone.utc)
        else:
            # Convert to UTC
            server_time = server_time.astimezone(timezone.utc)
        
        server_utc_naive = server_time.replace(tzinfo=None)

        # Get local UTC time as naive datetime
        local_utc_naive = datetime.utcnow().replace(tzinfo=None)

        # Calculate the absolute time difference
        time_difference = abs(local_utc_naive - server_utc_naive)

        # Define the 2-hour threshold
        two_hours = timedelta(hours=2)

        if time_difference < two_hours:
            return True
        else:
            return False

    except Exception as e:
        print(f"Error during heartbeat_check: {e}")
        return False

@sync_log_bp.route('/sync', methods=['POST'])
def sync():
    """
    The main endpoint to trigger the synchronization process.
    """
    status = "success"
    error_message = None
    try:
        if not heartbeat_check():
            raise Exception("Heartbeat check failed: Local and server times are out of sync.")
        sync_and_pull()
    except Exception as e:
        status = "failed"
        error_message = str(e)

    finalize_sync(status=status, table_name="customers")  # Hardcoded for customer sync example

    if status == 'success':
        return jsonify({"status": "ok"}), 200
    else:
        return jsonify({"status": "failed", "error": error_message}), 500


@sync_log_bp.route('/', methods=['POST'])
def create_sync_log():
    try:
        # Pydantic will now expect 'table_name' instead of 'data_type'
        validated_data = SyncLogCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        new_item = SyncLog(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@sync_log_bp.route('/', methods=['GET'])
def get_all_sync_logs():
    with get_db() as db:
        items = db.query(SyncLog).all()
        return jsonify([model_to_dict(i) for i in items])