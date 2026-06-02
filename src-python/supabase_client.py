import os
import sys
from supabase import create_client, Client, ClientOptions
from dotenv import load_dotenv
from utils import get_db
import models


if getattr(sys, 'frozen', False):
    # Running as a compiled binary (.deb production environment)
    # This points to the directory where Tauri places the .env resource
    bundle_dir = os.path.dirname(sys.executable)
else:
    # Running as raw script (local development environment)
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

dotenv_path = os.path.join(bundle_dir, '.env')
load_dotenv(dotenv_path)



# These are safe to ship (project URL + publishable anon key).
# They are used only if env vars are not set.
DEFAULT_SUPABASE_URL = "https://igmwwmtacuedbexsslco.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_Wvgufg11pZE9asGjQZxWHQ_eHwDKD8t"
DEFAULT_SUPABASE_SRK_KEY = os.environ.get("SERVICE_ROLE_KEY") # Note: this is not duplication, i need to hard-code the srk here bc bundling will Nuitka

url: str = os.environ.get("SUPABASE_URL") or DEFAULT_SUPABASE_URL
anon_key: str = os.environ.get("SUPABASE_KEY") or DEFAULT_SUPABASE_ANON_KEY
service_role_key: str = os.environ.get("SERVICE_ROLE_KEY") or DEFAULT_SUPABASE_SRK_KEY


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
            .order_by(models.Authentication.created_at.desc())
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
