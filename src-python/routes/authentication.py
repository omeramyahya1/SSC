from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, generate_salt, hash_password, verify_password
from models import Authentication, User, Subscription # Import User model
from schemas import AuthenticationCreate, AuthenticationUpdate
from auth_schemas import LoginRequest, LoginResponse, LoginResponseUser, LoginResponseAuthentication # Import new schemas
from serializer import model_to_dict
from datetime import datetime
import uuid
from routes.sync_log import sync

authentication_bp = Blueprint('authentication_bp', __name__, url_prefix='/authentications')

from supabase_client import get_service_role_client
from utils import get_server_time_or_none, is_jwt_expired_offline # Import new helpers
import uuid
from routes.sync_log import sync
from datetime import timezone

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
        # --- 1. Initial Local Check ---
        user = db.query(User).filter_by(email=login_data.email).first()

        # --- 1a. User is NOT found locally ---
        if not user:
            # This user must log in online.
            return handle_online_login(db, login_data.email, login_data.password, None)

        # --- 1b. User IS found locally, verify password ---
        subscription = db.query(Subscription).filter(Subscription.user_uuid == user.uuid).order_by(Subscription.created_at.desc()).first()
        if subscription and subscription.tampered:
            sync() # Attempt to sync to get latest state
            return jsonify({"error": "Account locked due to suspected tampering. Please contact support."}), 403

        user_auth = db.query(Authentication).filter_by(user_uuid=user.uuid).order_by(Authentication.created_at.desc()).first()

        # If user exists locally but password doesn't match, it's a hard failure.
        if not user_auth or not verify_password(login_data.password, user_auth.password_salt, user_auth.password_hash):
            return jsonify({"error": "Invalid credentials"}), 401

        # --- Password Verified Locally ---
        # --- 2. Offline vs. Online Path ---

        # Check if the existing JWT is valid for offline login
        if user_auth.current_jwt and not is_jwt_expired_offline(user_auth.jwt_issued_at):
            # --- 2a. OFFLINE LOGIN SUCCESS ---
            print("JWT is valid, performing offline login.")
            # Mark other sessions as logged out and create a new one, reusing the valid JWT
            db.query(Authentication).filter_by(user_uuid=user.uuid, is_logged_in=True).update({"is_logged_in": False, "is_dirty": True})

            new_auth_entry = Authentication(
                user_uuid=user.uuid,
                password_hash=user_auth.password_hash,
                password_salt=user_auth.password_salt,
                current_jwt=user_auth.current_jwt, # Reuse existing valid JWT
                jwt_issued_at=user_auth.jwt_issued_at,
                device_id=user_auth.device_id,
                is_logged_in=True,
                last_active=datetime.utcnow(),
                is_dirty=True
            )
            db.add(new_auth_entry)
            db.commit()
            db.refresh(new_auth_entry)

            # Build and return response
            user_data = model_to_dict(user)
            auth_data = model_to_dict(new_auth_entry)
            auth_data['user_id'] = user.user_id

            response_user = LoginResponseUser(**user_data)
            response_auth = LoginResponseAuthentication(**auth_data)
            return jsonify(LoginResponse(user=response_user, authentication=response_auth).model_dump()), 200
        else:
            # --- 2b. JWT is expired or missing, MUST go online ---
            print("JWT is expired or missing, attempting online login.")
            return handle_online_login(db, login_data.email, login_data.password, user)


def handle_online_login(db, email, password, local_user):
    """
    Handles the logic for both new-device online login and re-authenticating a local user.
    """
    # Define a robust date parsing helper function at the top
    def parse_utc_datetime(date_val):
        if not date_val:
            return None
        if isinstance(date_val, datetime):
            # It's already a datetime object, just ensure it's timezone-aware
            if date_val.tzinfo is None:
                return date_val.replace(tzinfo=timezone.utc)
            return date_val
        if isinstance(date_val, str):
            # It's a string, parse it
            return datetime.fromisoformat(date_val.replace('Z', '+00:00'))
        # If it's some other type, we can't handle it
        raise TypeError(f"Unsupported type for date parsing: {type(date_val)}")

    # Step 1: Check for internet connection
    server_time = get_server_time_or_none()
    if server_time is None:
        return jsonify({"error": "Offline. Please connect to the internet."}), 503

    # If the user exists locally, we just need to refresh their JWT
    if local_user:
        print(f"Refreshing JWT for existing local user: {email}")
        try:
            user_auth = db.query(Authentication).filter_by(user_uuid=local_user.uuid).order_by(Authentication.created_at.desc()).first()
            device_id = user_auth.device_id if user_auth and is_valid_uuid(user_auth.device_id) else str(uuid.uuid4())

            service_client = get_service_role_client()
            jwt_response = service_client.rpc('issue_jwt', {'p_user_id': local_user.uuid, 'p_device_id': device_id}).execute()

            if not hasattr(jwt_response, 'data') or not jwt_response.data:
                raise Exception("Failed to issue JWT: No data returned from RPC.")

            jwt_data = jwt_response.data[0]
            jwt_token = jwt_data['jwt_info']['token']
            jwt_issued_at = parse_utc_datetime(jwt_data.get('issued_at')) # Use robust parser

            # Create new auth entry with the new JWT
            db.query(Authentication).filter_by(user_uuid=local_user.uuid, is_logged_in=True).update({"is_logged_in": False, "is_dirty": True})
            new_auth_entry = Authentication(
                user_uuid=local_user.uuid,
                password_hash=user_auth.password_hash,
                password_salt=user_auth.password_salt,
                current_jwt=jwt_token,
                jwt_issued_at=jwt_issued_at,
                device_id=device_id,
                is_logged_in=True,
                last_active=datetime.utcnow(),
                is_dirty=True
            )
            db.add(new_auth_entry)
            db.commit()
            db.refresh(new_auth_entry)

            # Build and return response
            user_data = model_to_dict(local_user)
            auth_data = model_to_dict(new_auth_entry)
            auth_data['user_id'] = local_user.user_id

            response_user = LoginResponseUser(**user_data)
            response_auth = LoginResponseAuthentication(**auth_data)
            return jsonify(LoginResponse(user=response_user, authentication=response_auth).model_dump()), 200

        except Exception as e:
            print(f"Error refreshing JWT: {str(e)}")
            return jsonify({"error": "Could not refresh your online session."}), 500

    # If the user does NOT exist locally, perform the full online lookup
    else:
        print(f"Performing online lookup for new user: {email}")
        new_device_id = str(uuid.uuid4())
        try:
            service_client = get_service_role_client()
            response = service_client.rpc('log_user_in', {'p_email': email, 'p_device_id': new_device_id}).execute()

            if not hasattr(response, 'data') or not response.data:
                return jsonify({"error": "Invalid credentials"}), 401

            online_data = response.data
        except Exception as e:
            print(f"Error calling log_user_in RPC: {str(e)}")
            return jsonify({"error": "Could not connect to verify credentials online."}), 500

        online_auth = online_data.get('authentication')
        online_user_data = online_data.get('user')
        online_sub = online_data.get('subscription')

        if not online_auth or not online_user_data:
             return jsonify({"error": "Invalid credential data received from server."}), 500

        if not verify_password(password, online_auth['password_salt'], online_auth['password_hash']):
            return jsonify({"error": "Invalid credentials"}), 401

        if online_sub and online_sub.get('tampered'):
            sync()
            return jsonify({"error": "Account locked due to suspected tampering. Please contact support."}), 403

        user_uuid = online_user_data.get('id')
        try:
            service_client = get_service_role_client()
            jwt_response = service_client.rpc('issue_jwt', {'p_user_id': user_uuid, 'p_device_id': new_device_id}).execute()
            if not hasattr(jwt_response, 'data') or not jwt_response.data: raise Exception("No data from JWT RPC")

            jwt_data = jwt_response.data[0]
            jwt_token = jwt_data['jwt_info']['token']
            jwt_issued_at = parse_utc_datetime(jwt_data.get('issued_at')) # Use robust parser
        except Exception as e:
            print(f"Error issuing JWT during online login: {str(e)}")
            return jsonify({"error": "Failed to issue authentication token."}), 500

        # --- "Query, then Update-or-Create" pattern to fix persistence errors ---

        # Handle User object
        user_instance = db.query(User).filter(User.uuid == user_uuid).first()
        if user_instance:
            print("User found locally by UUID, updating.")
            user_instance.username = online_user_data.get('username')
            user_instance.email = online_user_data.get('email')
            user_instance.business_name = online_user_data.get('business_name')
            user_instance.account_type = online_user_data.get('account_type')
            user_instance.location = online_user_data.get('location')
            user_instance.business_email = online_user_data.get('business_email')
            user_instance.status = online_user_data.get('status')
            user_instance.role = online_user_data.get('role')
            user_instance.distributor_id = online_user_data.get('distributor_id')
            user_instance.organization_uuid = online_user_data.get('organization_id')
            user_instance.branch_uuid = online_user_data.get('branch_id')
            user_instance.is_dirty = False
        else:
            print("User not found locally, creating new.")
            user_instance = User(
                uuid=user_uuid,
                username=online_user_data.get('username'),
                email=online_user_data.get('email'),
                business_name=online_user_data.get('business_name'),
                account_type=online_user_data.get('account_type'),
                location=online_user_data.get('location'),
                business_email=online_user_data.get('business_email'),
                status=online_user_data.get('status'),
                role=online_user_data.get('role'),
                distributor_id=online_user_data.get('distributor_id'),
                organization_uuid=online_user_data.get('organization_id'),
                branch_uuid=online_user_data.get('branch_id'),
                is_dirty=False
            )
            db.add(user_instance)

        # Handle Subscription object
        if online_sub:
            sub_instance = db.query(Subscription).filter(Subscription.uuid == online_sub.get('id')).first()
            if sub_instance:
                print("Subscription found locally by UUID, updating.")
                sub_instance.expiration_date=parse_utc_datetime(online_sub.get('expiration_date'))
                sub_instance.grace_period_end=parse_utc_datetime(online_sub.get('grace_period_end'))
                sub_instance.type=online_sub.get('type')
                sub_instance.status=online_sub.get('status')
                sub_instance.license_code=online_sub.get('license_code')
                sub_instance.tampered=online_sub.get('tampered')
                sub_instance.user_uuid=online_sub.get('user_id')
                sub_instance.is_dirty = False
            else:
                print("Subscription not found locally, creating new.")
                sub_instance = Subscription(
                    uuid=online_sub.get('id'),
                    expiration_date=parse_utc_datetime(online_sub.get('expiration_date')),
                    grace_period_end=parse_utc_datetime(online_sub.get('grace_period_end')),
                    type=online_sub.get('type'),
                    status=online_sub.get('status'),
                    license_code=online_sub.get('license_code'),
                    tampered=online_sub.get('tampered'),
                    user_uuid=online_sub.get('user_id'),
                    is_dirty=False
                )
                db.add(sub_instance)

        new_auth_entry = Authentication(
            user_uuid=user_uuid,
            password_hash=online_auth['password_hash'],
            password_salt=online_auth['password_salt'],
            current_jwt=jwt_token,
            jwt_issued_at=jwt_issued_at,
            device_id=new_device_id,
            is_logged_in=True,
            last_active=datetime.utcnow(),
            is_dirty=True
        )
        db.add(new_auth_entry)

        db.commit()
        db.refresh(user_instance)
        db.refresh(new_auth_entry)

        user_data = model_to_dict(user_instance)
        auth_data = model_to_dict(new_auth_entry)
        auth_data['user_id'] = user_instance.user_id

        response_user = LoginResponseUser(**user_data)
        response_auth = LoginResponseAuthentication(**auth_data)
        return jsonify(LoginResponse(user=response_user, authentication=response_auth).model_dump()), 200

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
