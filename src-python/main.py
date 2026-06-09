# src-python/main.py
import argparse
import os
import signal
import sys

from pydantic_postgrest_bootstrap import (
    apply_postgrest_pydantic_bootstrap,
    run_postgrest_pydantic_self_test,
)

apply_postgrest_pydantic_bootstrap()

if "--self-test" in sys.argv:
    from dotenv import load_dotenv

    env_candidates = [
        os.path.join(os.path.dirname(sys.executable), ".env"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        os.path.join(os.getcwd(), "src-python", ".env"),
    ]
    for env_path in env_candidates:
        if os.path.exists(env_path):
            load_dotenv(env_path, override=False)

    run_postgrest_pydantic_self_test()
    required_env = ["SUPABASE_URL", "SUPABASE_KEY", "SERVICE_ROLE_KEY"]
    missing_env = [key for key in required_env if not os.environ.get(key)]
    if missing_env:
        raise RuntimeError(f"Sidecar self-test missing env values: {', '.join(missing_env)}")
    print(
        "Sidecar self-test passed. "
        f"PostGREST/Pydantic OK. Env present: {len(required_env)}/{len(required_env)}."
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

    if mode == "dev":
        print("Serving for dev mode")
        app.run(host="127.0.0.1", port=port, debug=True, use_reloader=True)
    else:
        from waitress import serve
        print("Serving for prod mode")
        serve(app, host="127.0.0.1", port=port, threads=12)
