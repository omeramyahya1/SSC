# src-python/utils.py

from functools import wraps
from flask import g, jsonify
from contextlib import contextmanager
from db_setup import SessionLocal
import hashlib
import os
import string
import secrets
from datetime import datetime, timedelta, timezone
from runtime_env import is_compiled_runtime

def generate_temp_password(length=12):
    """Generates a random alphanumeric temporary password."""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))

# Context manager to get a database session

@contextmanager
def get_db():
    """Provides a transactional scope around a series of operations."""
    db = SessionLocal()
    try:
        # Yield the active session to the caller (e.g., the Flask route)
        yield db
        db.commit() # Commit transaction if no exceptions occurred
    except:
        db.rollback() # Rollback transaction if any exception occurred
        raise
    finally:
        db.close() # Close the session connection

# Dynamic session injection decorator
def inject_db_session(func):
    """
    Decorator that opens a database session and injects it as the first argument (db)
    to the decorated Flask route function.
    """

    @wraps(func)
    def decorated_function(*args, **kwargs):
        # Use the application context global 'g' to store the session if needed
        # But we'll primarily rely on passing it explicitly.
        try:
            with get_db() as db:
                # Pass the active 'db' as the first argument to the route function
                return func(db, *args, **kwargs)
        except Exception as e:
            # Centralized error handling for database issues
            print(f"Database error during route execution: {e}")
            return jsonify({"error": "An internal database error occurred."}), 500

    return decorated_function

# Password Hashing Utilities
def generate_salt():
    """Generates a random salt for password hashing."""
    return os.urandom(16).hex() # 16 bytes = 32 hex characters

def get_resource_path(relative_path):
    """
    Resolves the absolute path to a resource.
    Works for both development and Nuitka --onefile mode.
    """
    # In Nuitka --onefile, os.path.dirname(__file__) points to the temporary extraction directory.
    # utils.py is in the root of src-python, so its dirname is the root of the bundled resources.
    base_dir = os.path.dirname(os.path.abspath(__file__))
    is_frozen = getattr(sys, 'frozen', False) or "__compiled__" in globals()

    # Special case: logo is in public/ in dev, but root in bundle
    if relative_path == "ssc.svg":
<<<<<<< HEAD
        if is_compiled_runtime():
=======
        if is_frozen:
>>>>>>> 11c20b7acc083f6972147cb8926d7c5afddd4d3b
            return os.path.join(base_dir, "ssc.svg")
        else:
            return os.path.abspath(os.path.join(base_dir, "..", "public", "ssc.svg"))

    return os.path.join(base_dir, relative_path)

def hash_password(password, salt):
    """Hashes a password with the given salt using SHA256."""
    # Encode password and salt to bytes before hashing
    password_bytes = password.encode('utf-8')
    salt_bytes = salt.encode('utf-8')
    hashed_password = hashlib.sha256(salt_bytes + password_bytes).hexdigest()
    return hashed_password

def verify_password(password, salt, stored_hash):
    """Verifies a password against a stored hash and salt."""
    return hash_password(password, salt) == stored_hash

# --- ID/UUID lookup helper ---
def get_by_id_or_uuid(db, model, id_column, uuid_column, value):
    """
    Fetch a record by numeric id or uuid string.
    If `value` is an int-like string, it will be matched against `id_column`,
    otherwise it will be matched against `uuid_column`.
    """
    if value is None:
        return None
    try:
        numeric_id = int(value)
    except (TypeError, ValueError):
        return db.query(model).filter(uuid_column == value).first()
    return db.query(model).filter(id_column == numeric_id).first()

# --- New Helper Functions for Offline/Online Login ---

def get_server_time_or_none():
    """
    Attempts to fetch the current UTC time from the Supabase server.
    Serves as a connectivity check.
    Returns a datetime object on success, or None on failure (e.g., no internet).
    """
    from supabase_client import get_service_role_client # Moved import here to break circular dependency
    try:
        service_client = get_service_role_client()
        # The execute method for rpc might not have a timeout parameter in all client versions.
        # The underlying http client (httpx) should have a default timeout.
        response = service_client.rpc('get_server_utc', {}).execute()

        if response.data:
            # The RPC returns a string like '2024-05-23T10:00:00.123456+00:00'
            return datetime.fromisoformat(response.data)
        return None
    except Exception as e:
        print(f"Connectivity check failed: Could not connect to Supabase. Error: {e}")
        return None

def require_internet():
    """
    Connectivity check helper.
    Returns (None, None) if online, or (jsonify_error, status_code) if offline.
    """
    if get_server_time_or_none() is None:
        return jsonify({"error": "Active internet connection required for this action"}), 503
    return None, None

def is_jwt_expired_offline(jwt_issued_at):
    """
    Checks if a JWT is expired based on its issue date using client's local UTC time.
    The expiration is hardcoded to 14 days as per the issue_jwt RPC.
    """
    if not jwt_issued_at:
        return True # If there's no issue date, it's considered expired/invalid

    # Ensure jwt_issued_at from DB is timezone-aware for correct comparison
    # The database stores it as a naive datetime, so we assume it's UTC.
    if jwt_issued_at.tzinfo is None:
        jwt_issued_at = jwt_issued_at.replace(tzinfo=timezone.utc)

    expiration_duration = timedelta(days=14)
    expiration_time = jwt_issued_at + expiration_duration

    # Use client's current UTC time for the check
    return datetime.now(timezone.utc) > expiration_time

def check_session_validity(user_uuid, device_id):
    """Return True if the given (user_uuid, device_id) pair has any active
    authentication row (`is_logged_in=True`) in Supabase.
    Implements a fail-open policy: network or server errors are treated as
    valid to avoid locking the user out when connectivity is intermittent.
    """
    from supabase_client import get_service_role_client
    from postgrest.exceptions import APIError
    import httpx, logging
    logger = logging.getLogger(__name__)

    try:
        supabase = get_service_role_client()
        response = (
            supabase.table('authentications')
            .select('is_logged_in')
            .eq('user_id', user_uuid)
            .eq('device_id', device_id)
            .eq('is_logged_in', True)  # only rows that are still active
            .order('created_at', desc=True)
            .limit(1)
            .execute()
        )
        # If any active row exists → session is valid
        return bool(response.data)
    except httpx.TransportError as e:
        logger.warning(f"Session validation failed (network) - assuming valid: {e}")
        return True  # fail-open
    except APIError as e:
        status = getattr(e, 'status', None)
        code = getattr(e, 'code', None)
        if status in (502, 503, 504) or code in {"PGRST000", "PGRST001", "PGRST002", "PGRST003"}:
            logger.warning(
                f"Session validation failed (server {status or code}) - assuming valid: {e}"
            )
            return True  # fail-open for transient server errors
        logger.error(f"Session validation failed (Supabase) - rejecting: {e}")
        return False
    except Exception as e:
        logger.exception(f"Session validation failed due to unexpected error (fail-closed): {e}")
        return False

# --- Hardware-Bound Device ID Helper ---

def get_device_id():
    """
    Returns a persistent UUID for this machine.
    Stored in a hidden file in the app data directory.
    """
    import uuid
    # Use the same logic as models.py to resolve the app data directory
    db_dir = os.environ.get("SSC_DB_DIR")
    if db_dir:
        data_dir = db_dir
    else:
        # Fallback for manual/standalone execution
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'db')

    os.makedirs(data_dir, exist_ok=True)
    device_id_path = os.path.join(data_dir, '.device_id')

    if os.path.exists(device_id_path):
        try:
            with open(device_id_path, 'r') as f:
                stored_id = f.read().strip()
                # Validate it's a real UUID
                uuid.UUID(stored_id)
                return stored_id
        except Exception as e:
            print(f"Warning: Failed to read device_id from {device_id_path}: {e}")

    # Generate and persist a new one
    new_id = str(uuid.uuid4())
    try:
        with open(device_id_path, 'w') as f:
            f.write(new_id)
    except Exception as e:
        print(f"Warning: Failed to persist device_id to {device_id_path}: {e}")

    return new_id

if __name__ == "__main__":
    password = "Abcd1234"
    salt = generate_salt()
    hash = hash_password(password=password, salt=salt)

    print(salt, '\n', hash)
