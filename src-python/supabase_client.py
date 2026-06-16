import os
import sys

from pydantic_postgrest_bootstrap import apply_postgrest_pydantic_bootstrap

apply_postgrest_pydantic_bootstrap()

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
DEFAULT_SUPABASE_SRK_KEY = os.getenv("SERVICE_ROLE_KEY") # Note: this is not duplication, i need to hard-code the srk here bc bundling will Nuitka

url: str = os.getenv("SUPABASE_URL") or DEFAULT_SUPABASE_URL
anon_key: str = os.getenv("SUPABASE_KEY") or DEFAULT_SUPABASE_ANON_KEY
service_role_key: str = os.getenv("SERVICE_ROLE_KEY") or DEFAULT_SUPABASE_SRK_KEY

# =================================================================
# CORRECTION: Explicit Supabase-py Engine Timeout Mapping
# =================================================================
options_object = ClientOptions(
    postgrest_client_timeout=10,  # Limits data table requests
    storage_client_timeout=10,    # Limits asset calculations
    schema="public"
)

# SINGLETON INSTANCES: Initialized once globally to preserve persistent TCP connections
_anon_client_singleton: Client = create_client(url, anon_key, options=options_object)
_srk_client_singleton: Client = None

if service_role_key:
    _srk_client_singleton = create_client(url, service_role_key, options=options_object)


def get_service_role_client() -> Client:
    if not _srk_client_singleton:
        raise ValueError("SERVICE_ROLE_KEY environment variable not set.")
    return _srk_client_singleton


def get_anon_client() -> Client:
    return _anon_client_singleton


def get_user_client(auth_entry=None) -> Client:
    """
    Returns a Supabase client authenticated as the currently logged-in user.
    Modifies headers dynamically on top of our persistent connection client mapping.
    """
    if auth_entry is None:
        with get_db() as db:
            auth_entry = (
                db.query(models.Authentication)
                .filter(models.Authentication.is_logged_in.is_(True))
                .order_by(models.Authentication.created_at.desc())
                .first()
            )

    if auth_entry and auth_entry.current_jwt:
        # OPTIMIZATION: Instead of reconstructing an expensive base client,
        # intercept and swap the active Authorization bearer token directly
        _anon_client_singleton.postgrest.auth(auth_entry.current_jwt)
        return _anon_client_singleton

    # Fallback to anonymous credentials if token validation drops out
    _anon_client_singleton.postgrest.auth(anon_key)
    return _anon_client_singleton
