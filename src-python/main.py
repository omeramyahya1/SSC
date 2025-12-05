# src-python/main.py

from flask import Flask, jsonify, request
from db_setup import initialize_database
from db_setup import SessionLocal
from models import User

# 1. Initialize DB and get the session maker
db_engine = initialize_database()

# 2. Dependency to get a DB session for each request (or API call)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app = Flask(__name__)

@app.route("/")
def hello_world():
    return {"message": "Hello from Python!"}

if __name__ == "__main__":
    app.run(port=5001, debug=True)

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
            user_list = [{"user_id": u.user_id, "username": u.username} for u in users]
            return jsonify(user_list)
