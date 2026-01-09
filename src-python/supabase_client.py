import os
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv
from utils import get_db
import models

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
anon_key: str = os.environ.get("SUPABASE_KEY")
service_role_key: str = os.environ.get("SERVICE_ROLE_KEY")


def get_service_role_client() -> Client:
    if not service_role_key:
        raise ValueError("SERVICE_ROLE_KEY environment variable not set.")
    return create_client(url, service_role_key)


def get_user_client() -> Client:
    """
    Returns a Supabase client authenticated as the currently logged-in user.
    This client respects RLS.
    """
    with get_db() as db:
        auth_entry = (
            db.query(models.Authentication)
            .filter(models.Authentication.is_logged_in.is_(True))
            .first()
        )

        if auth_entry and auth_entry.current_jwt:
            options = ClientOptions(
                headers={
                    # FORCE PostgREST to use this token
                    "Authorization": f"Bearer {auth_entry.current_jwt}"
                }
            )
            return create_client(url, anon_key, options=options)

    # fallback
    return create_client(url, anon_key)


def get_anon_client() -> Client:
    return create_client(url, anon_key)
