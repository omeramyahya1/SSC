from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, generate_salt, hash_password, verify_password
from models import Authentication, User, Subscription # Import User model
from schemas import AuthenticationCreate, AuthenticationUpdate
from auth_schemas import LoginRequest, LoginResponse, LoginResponseUser, LoginResponseAuthentication # Import new schemas
from serializer import model_to_dict
from datetime import datetime
import uuid

authentication_bp = Blueprint('authentication_bp', __name__, url_prefix='/authentications')

def is_valid_uuid(val):
    try:
        uuid.UUID(str(val))
        return True
    except (ValueError, TypeError):
        return False

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

        # Check for tampered subscription before verifying password
        subscription = db.query(Subscription).filter(Subscription.user_uuid == user.uuid).order_by(Subscription.created_at.desc()).first()
        if subscription and subscription.tampered:
            return jsonify({"error": "Account locked due to suspected tampering. Please contact support."}), 403

        # Find the latest authentication entry for this user to get salt and session data
        user_auth = db.query(Authentication).filter_by(user_uuid=user.uuid).order_by(Authentication.created_at.desc()).first()

        if not user_auth or not verify_password(login_data.password, user_auth.password_salt, user_auth.password_hash):
            return jsonify({"error": "Invalid credentials"}), 401

        # --- Authentication successful ---

        # 1. Mark all existing active sessions for this user as logged out
        db.query(Authentication).filter_by(user_uuid=user.uuid, is_logged_in=True).update({"is_logged_in": False, "is_dirty": True})

        # 2. Validate device_id or generate a new one
        device_id = user_auth.device_id
        if not is_valid_uuid(device_id):
            device_id = str(uuid.uuid4())

        # 3. Create a new authentication entry for this login, inheriting previous session data
        new_auth_entry = Authentication(
            user_uuid=user.uuid,
            password_hash=user_auth.password_hash,
            password_salt=user_auth.password_salt,
            is_logged_in=True,
            last_active=datetime.utcnow(),
            # Inherit details from the previous session
            jwt_issued_at=user_auth.jwt_issued_at,
            current_jwt=user_auth.current_jwt,
            device_id=device_id, # Use the validated or newly generated device_id
            is_dirty=True # Mark the new session as dirty for initial sync
        )
        db.add(new_auth_entry)
        db.flush()
        db.refresh(new_auth_entry)

        # Build response
        user_data = model_to_dict(user)
        auth_data = model_to_dict(new_auth_entry)
        auth_data['user_id'] = user.user_id

        try:
            response_user = LoginResponseUser(**user_data)
            response_auth = LoginResponseAuthentication(**auth_data)

            return jsonify(LoginResponse(user=response_user, authentication=response_auth).model_dump()), 200
        except ValidationError as e:
            print(f"Pydantic validation error: {e.errors()}")
            return jsonify({"error": "An unexpected error occurred during response creation."}), 500

@authentication_bp.route('/logout', methods=['POST'])
def logout_user():
    auth_id = request.json.get('auth_id')
    if not auth_id:
        return jsonify({"error": "auth_id is required"}), 400

    with get_db() as db:
        auth_entry = db.query(Authentication).filter(Authentication.auth_id == auth_id).first()

        if not auth_entry:
            return jsonify({"error": "Authentication session not found"}), 404

        # Idempotent: if already logged out, no action needed, return success
        if not auth_entry.is_logged_in:
            return jsonify({"message": "User was already logged out"}), 200

        auth_entry.is_logged_in = False
        auth_entry.last_active = datetime.utcnow()
        auth_entry.is_dirty = True # Mark for syncing
        db.commit()

        return jsonify({"message": "Logout successful"}), 200

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
