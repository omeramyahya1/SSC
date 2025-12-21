from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, generate_salt, hash_password, verify_password
from models import Authentication, User # Import User model
from schemas import AuthenticationCreate, AuthenticationUpdate
from auth_schemas import LoginRequest, LoginResponse, LoginResponseUser, LoginResponseAuthentication # Import new schemas
from serializer import model_to_dict
from datetime import datetime

authentication_bp = Blueprint('authentication_bp', __name__, url_prefix='/authentications')

@authentication_bp.route('/login', methods=['POST'])
def login_user():
    try:
        login_data = LoginRequest(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        user = db.query(User).filter_by(email=login_data.email).first()

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        # Find the authentication entry for this user
        # Note: In a real app, you'd likely retrieve the specific auth record by device_id or other means
        # For simplicity, we'll try to find any existing auth record for this user to get the salt
        user_auth = db.query(Authentication).filter_by(user_id=user.user_id).first()

        if not user_auth or not verify_password(login_data.password, user_auth.password_salt, user_auth.password_hash):
            return jsonify({"error": "Invalid credentials"}), 401
        
        # --- Authentication successful ---

        # 1. Mark all existing active sessions for this user as logged out
        db.query(Authentication).filter_by(user_id=user.user_id, is_logged_in=True).update({"is_logged_in": False})
        db.commit() # Commit this change before adding the new record

        # 2. Create a new authentication entry for this login
        new_auth_entry = Authentication(
            user_id=user.user_id,
            password_hash=user_auth.password_hash, # Reusing the hash
            password_salt=user_auth.password_salt, # Reusing the salt
            is_logged_in=True,
            last_active=datetime.utcnow(),
            jwt_issued_at=datetime.utcnow() # Placeholder
            # device_id could be added from request headers if available
        )
        db.add(new_auth_entry)
        db.commit()
        db.refresh(new_auth_entry)

        # Build response
        user_data = model_to_dict(user)
        auth_data = model_to_dict(new_auth_entry)
        
        response_user = LoginResponseUser(**user_data)
        response_auth = LoginResponseAuthentication(**auth_data)

        return jsonify(LoginResponse(user=response_user, authentication=response_auth).dict()), 200

@authentication_bp.route('/<int:item_id>', methods=['PUT'])
def update_authentication(item_id):
    with get_db() as db:
        item = db.query(Authentication).filter(Authentication.auth_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = AuthenticationUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@authentication_bp.route('/', methods=['GET'])
def get_all_authentication():
    with get_db() as db:
        items = db.query(Authentication).all()
        return jsonify([model_to_dict(i) for i in items])

@authentication_bp.route('/<int:item_id>', methods=['GET'])
def get_authentication(item_id):
    with get_db() as db:
        item = db.query(Authentication).filter(Authentication.auth_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))


@authentication_bp.route('/latest', methods=['GET'])
def get_latest_authentication():
    with get_db() as db:
        latest_auth = db.query(Authentication).order_by(Authentication.updated_at.desc()).first()
        if not latest_auth:
            return jsonify({"error": "No authentication entries found"}), 404
        return jsonify(model_to_dict(latest_auth))


@authentication_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_authentication(item_id):
    with get_db() as db:
        item = db.query(Authentication).filter(Authentication.auth_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200