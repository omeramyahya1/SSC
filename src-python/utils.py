# src-python/utils.py

from functools import wraps
from flask import g, jsonify
from contextlib import contextmanager
from db_setup import SessionLocal
import hashlib
import os
from datetime import datetime, timedelta, timezone

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

if __name__ == "__main__":
    password = "Abcd1234"
    salt = generate_salt()
    hash = hash_password(password=password, salt=salt)

    print(salt, '\n', hash)
