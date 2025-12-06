# src-python/main.py

import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from db_setup import SessionLocal
from contextlib import contextmanager
from models import *
from serializer import model_to_dict

# --- Flask App Setup ---
app = Flask(__name__)

# Apply CORS to allow your React frontend (running on a different port) 
# to talk to the Flask server. In production, you'd restrict this to localhost:[Tauri Port].
CORS(app)

# Dependency to get a DB session for each request (or API call)
@contextmanager
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- Health Check (Crucial for Sidecar integration testing) ---
@app.route('/health', methods=['GET'])
def health_check():
    """Returns application status."""
    return jsonify({"status": "ok", "service": "python_backend"}), 200

# --- API Error Handling Example ---
@app.errorhandler(404)
def resource_not_found(e):
    return jsonify(error=str(e)), 404

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

# --- Example API Route ---
@app.route("/")
def hello_world():
    return {"message": "Hello from Python!"}

@app.route('/api/projects', methods=['POST'])
def create_project():
    """[POST] Saves a new project to the SQLite DB."""
    data = request.json
    
    # Validation is required here, but omitted for brevity.
    
    with get_db() as db:
        new_project = Project(
            # NOTE: user_id must be provided by the client or inferred after authentication
            user_id=data.get('user_id', 1), # Placeholder for testing
            client_name=data.get('client_name'),
            project_status=data.get('project_status'),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            # ... other fields ...
        )
        db.add(new_project)
        db.commit()
        db.refresh(new_project)
        return jsonify(model_to_dict(new_project)), 201

@app.route('/api/projects', methods=['GET'])
def get_all_projects():
    """[GET] Retrieves all projects from the SQLite DB."""
    with get_db() as db:
        projects = db.query(Project).all()
        return jsonify([model_to_dict(p) for p in projects]), 200

# Example of a Flask route using the session
@app.route('/api/users', methods=['GET', 'POST'])
def handle_users():
    # Use the context manager to get a fresh session
    with get_db() as db:
        if request.method == 'POST':
            data = request.json
            
            # 1. Create new object
            new_user = User(
                username=data.get('username'), 
                email=data.get('email'), 
                # ... other fields ...
            )
            
            # 2. Add, commit, and refresh (gets the new user_id)
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            
            return jsonify({"message": "User created", "user_id": new_user.user_id}), 201

        elif request.method == 'GET':
            # 1. Query data
            users = db.query(User).all()
            
            # 2. Convert to dictionary for JSON response (requires a helper function 
            # or library like Pydantic, not shown here)
            user_list = [model_to_dict(u) for u in users]
            return jsonify(user_list)
        
# --- Run the Flask app ---
if __name__ == "__main__":
    app.run(port=5000, debug=True)

