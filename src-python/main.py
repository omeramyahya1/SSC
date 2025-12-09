# src-python/main.py

from flask import Flask, jsonify, request
from flask_cors import CORS
from routes import all_blueprints
from werkzeug.exceptions import HTTPException


# --- Flask App Setup ---
def create_app():
    app = Flask(__name__)
    
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

# --- API Shutdown Hook (Useful during development) ---
def shutdown_server():
    func = request.environ.get('werkzeug.server.shutdown')
    if func is None:
        raise RuntimeError('Not running with the Werkzeug Server')
    func()

@app.route('/shutdown', methods=['POST'])
def shutdown():
    shutdown_server()
    return 'Server shutting down...'

# --- Run the Flask app ---
if __name__ == "__main__":
    app.run(port=5000, debug=True)

