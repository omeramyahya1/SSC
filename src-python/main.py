# src-python/main.py
import argparse
import os
import signal
import sys
import cProfile
import pstats
import io

# --- Profiling Setup ---
profile_env = os.environ.get("SSC_PROFILE_BACKEND", "").lower()
do_profile = profile_env in ("1", "true", "once")
profiler = None
flag_file = None

if do_profile:
    # If mode is 'once', check for flag file in the DB directory
    if profile_env == "once":
        db_dir = os.environ.get("SSC_DB_DIR")
        if db_dir:
            flag_file = os.path.join(db_dir, ".profile_done")
            if os.path.exists(flag_file):
                do_profile = False

if do_profile:
    profiler = cProfile.Profile()
    profiler.enable()
    print("PYTHON: Profiling enabled...")

# --- Pydantic PostGREST Bootstrap (Critical for Windows Bundle) ---
# We gate this because it's slow (21s+ on Linux/NTFS) and only strictly 
# needed for Nuitka-bundled Windows executables to prevent stripping.
if getattr(sys, 'frozen', False) and sys.platform == "win32":
    from pydantic_postgrest_bootstrap import apply_postgrest_pydantic_bootstrap
    print("PYTHON: Running Pydantic/PostGREST bootstrap (Frozen Windows mode)")
    apply_postgrest_pydantic_bootstrap()

from flask import Flask, jsonify, request

    from dotenv import load_dotenv
    from utils import get_resource_path

    env_candidates = [
        os.path.join(os.path.dirname(sys.executable), ".env"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.getcwd(), "src-python", ".env"),
    ]
    for env_path in env_candidates:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=False)

    run_postgrest_pydantic_self_test()

    # Verify Data Resources
    resources_to_check = {
        "Geo Dataset": os.path.join("ble", "dataset", "geo_data.csv"),
        "Invoice Template": os.path.join("pdf_engine", "templates", "invoice.html"),
        "Reporting Template": os.path.join("pdf_engine", "templates", "report.html"),
        "PDF Assets Dir": os.path.join("pdf_engine", "assets"),
        "SSC Logo": "ssc.svg"
    }

    missing_resources = []
    for name, rel_path in resources_to_check.items():
        abs_path = get_resource_path(rel_path)
        if not os.path.exists(abs_path):
            missing_resources.append(f"{name} ({abs_path})")

    if missing_resources:
        raise RuntimeError(f"Sidecar self-test failed. Missing resources: {', '.join(missing_resources)}")

    required_env = ["SUPABASE_URL", "SUPABASE_KEY", "SERVICE_ROLE_KEY"]
    missing_env = [key for key in required_env if not os.environ.get(key)]
    if missing_env:
        raise RuntimeError(f"Sidecar self-test missing env values: {', '.join(missing_env)}")

    print(
        "Sidecar self-test passed. "
        "PostGREST/Pydantic OK. "
        f"Resources OK. Env present: {len(required_env)}/{len(required_env)}."
    )
    sys.exit(0)

from flask import Flask, jsonify, request
from flask_cors import CORS
from routes import all_blueprints
from werkzeug.exceptions import HTTPException
from db_setup import create_db_and_tables


# --- Flask App Setup ---
def create_app():
    app = Flask(__name__)
    app.url_map.strict_slashes = False

    # On startup, ensure the database and its tables are created.
    create_db_and_tables()

    # Register all blueprints dynamically
    for bp in all_blueprints:
        app.register_blueprint(bp, url_prefix=bp.url_prefix)

    return app

app = create_app()

# Apply CORS to allow your React frontend (running on a different port)
# to talk to the Flask server. In production, you'd restrict this to localhost:[Tauri Port].
CORS(app)

# --- PDF Generation Endpoints ---


# --- Health Check (Crucial for Sidecar integration testing) ---
@app.route('/health', methods=['GET'])
def health_check():
    """Returns application status."""
    return jsonify({"status": "ok", "service": "python_backend"}), 200

# --- API Not Found Handler ---
@app.errorhandler(404)
def resource_not_found(e):
    return jsonify(error=str(e)), 404

# --- General Exception Handler ---
@app.errorhandler(Exception)
def handle_exception(e):
    # Pass through HTTP errors
    if isinstance(e, HTTPException):
        return e

    # Now you're handling non-HTTP exceptions only
    return jsonify(error=f"An unexpeced error occured: {str(e)}"), 500

# --- API Shutdown Hook (used by Tauri) ---
@app.route('/shutdown', methods=['POST'])
def shutdown():
    os.kill(os.getpid(), signal.SIGTERM)
    return "Shutting down", 200

# --- Run the Flask app ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5000)
    parser.add_argument("--mode", type=str, default=os.environ.get("SSC_MODE", "dev"))
    args = parser.parse_args()

    port = int(args.port)
    mode = (args.mode or "dev").lower()

    if do_profile and profiler:
        profiler.disable()
        s = io.StringIO()
        sortby = 'cumulative'
        ps = pstats.Stats(profiler, stream=s).sort_stats(sortby)
        print("\n" + "="*50)
        print("PYTHON STARTUP PROFILE (TOP 30 FUNCTIONS)")
        print("="*50)
        ps.print_stats(30)
        print(s.getvalue())
        print("="*50 + "\n")
        
        if flag_file and profile_env == "once":
            try:
                with open(flag_file, "w") as f:
                    f.write("done")
                print(f"PYTHON: Profile flag file created at {flag_file}")
            except Exception as e:
                print(f"PYTHON: Failed to create flag file: {e}")

    if mode == "dev":
        print("Serving for dev mode")
        app.run(host="127.0.0.1", port=port, debug=True, use_reloader=True)
    else:
        from waitress import serve
        print("Serving for prod mode")
        serve(app, host="127.0.0.1", port=port, threads=12)
