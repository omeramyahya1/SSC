from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, generate_salt, hash_password
from models import User, Authentication, ApplicationSettings, Subscription, SubscriptionPayment
from schemas import UserCreate, UserUpdate
from auth_schemas import RegistrationPayload
from serializer import model_to_dict
from routes.sync_log import sync, upload_blob
import base64
import uuid
from datetime import datetime, timedelta
from supabase_client import get_anon_client, get_service_role_client

user_bp = Blueprint('user_bp', __name__, url_prefix='/users')

@user_bp.route('/pricing', methods=['GET'])
def get_pricing_data():
    """
    Fetches detailed pricing data from the cloud's detailed_pricing view.
    """
    try:
        supabase = get_anon_client()
        response = supabase.table('detailed_pricing').select('*').execute()

        # The supabase-py client v1 wraps the data in a Pydantic model, access via .data
        if not hasattr(response, 'data'):
             raise Exception("Invalid response structure from Supabase client.")

        return jsonify(response.data), 200
    except Exception as e:
        print(f"Error fetching pricing data from Supabase: {e}")
        return jsonify({"error": "Could not retrieve pricing information"}), 500

@user_bp.route('/check-email-uniqueness', methods=['POST'])
def check_email_uniqueness():
    """
    Checks if an email is unique by calling a Supabase RPC.
    """
    data = request.get_json()
    if not data or 'email' not in data:
        return jsonify({"error": "Email is required"}), 400

    email_to_check = data['email']

    try:
        supabase = get_service_role_client()
        # The RPC function `check_email_exists` returns:
        # - `true` if the email does NOT exist (it is unique/available).
        # - `false` if the email DOES exist (it is not unique).
        response = supabase.rpc('check_email_exists', {'email_to_check': email_to_check}).execute()

        # The actual boolean result is in response.data
        is_unique = response.data

        return jsonify({"isUnique": is_unique}), 200

    except Exception as e:
        print(f"Error calling Supabase RPC 'check_email_exists': {e}")
        # In case of an error, it's safer to assume the email is not unique
        # to prevent accidental duplicates on the client side.
        return jsonify({"error": "Failed to verify email uniqueness", "isUnique": False}), 500

@user_bp.route('/bank-accounts', methods=['GET'])
def get_bank_accounts():
    bank_accounts = dict()
    try:
        supabase = get_anon_client()
        response = supabase.table('bank_accounts').select('*').execute()

        if not hasattr(response, 'data'):
             raise Exception("Invalid response structure from Supabase client.")

        for d in response.data:
            bank_accounts[d["bank_name"]] = {
                "account_name": d["account_name"],
                "account_number": d["account_number"],
                "qr_code": d["qr_code"]
            }

        return jsonify(bank_accounts), 200
    except Exception as e:
        print(f"Error fetching bank accounts data from Supabase: {e}")
        return jsonify({"error": "Could not retrieve bank accounts information"}), 500

@user_bp.route('/register', methods=['POST'])
def register_user():
    try:
        payload = RegistrationPayload(**request.json)
    except ValidationError as e:
        return jsonify({"error": "Invalid payload", "details": e.errors()}), 400

    stage1 = payload.stage1

    with get_db() as db:
        # Prepare authentication data
        salt = generate_salt()
        hashed_pw = hash_password(stage1.password, salt)
        device_id = str(uuid.uuid4()) # This device_id is for the current session/device

        # Generate UUIDs upfront for new records (important for RPC calls)
        new_user_uuid = str(uuid.uuid4())
        new_auth_uuid = str(uuid.uuid4()) # UUID for the authentication record
        new_sub_uuid = str(uuid.uuid4())
        new_settings_uuid = str(uuid.uuid4())
        new_payment_uuid = str(uuid.uuid4()) if payload.plan_type != 'Free Trial' else None
        new_device_uuid = str(uuid.UUID(device_id))


        # Prepare user data
        stage4 = payload.stage4
        location = f"{stage4.locationCity}, {stage4.locationState}" if stage4.locationCity and stage4.locationState else None
        user_status = 'trial' if payload.plan_type == "Free Trial" else "active"

        # Handle business logo upload if present (before RPC call)
        logo_url = None
        logo_bytes = None
        if stage4.logo:
            try:
                logo_b64 = stage4.logo.split("base64,")[1] if "base64," in stage4.logo else stage4.logo
                logo_bytes = base64.b64decode(logo_b64)
                path = f"user_logos/{new_user_uuid}.png"
                logo_url = upload_blob(logo_bytes, "SSC", path, use_service_client=True) # Use service client for upload
            except Exception as e:
                print(f"Warning: Could not decode or upload logo for user {stage1.email}. Error: {e}")


        # 2. Call register_user RPC to create User and Auth records in Supabase (Service Role Key context)
        try:
            print("--- Calling register_user RPC ---")
            service_client = get_service_role_client()
            service_client.rpc('register_user', {
                'p_user_uuid': new_user_uuid,
                'p_username': stage1.username,
                'p_email': stage1.email,
                'p_auth_uuid': new_auth_uuid,
                'p_password_hash': hashed_pw,
                'p_password_salt': salt,
                'p_device_id': new_device_uuid
            }).execute()
            print("--- register_user RPC Completed ---")
        except Exception as e:
            print(f"Error calling register_user RPC: {str(e)}")
            return jsonify({"error": "Failed to create user in the cloud using RPC."}), 500

        # 3. Create all local records, marking User and Auth as NOT dirty (since they're now in cloud)
        new_user = User(
            uuid=new_user_uuid, username=stage1.username, email=stage1.email, business_name=stage4.businessName,
            account_type=payload.account_type, location=location, business_logo=logo_bytes, # local storage still gets bytes
            status=user_status, role='admin' if 'enterprise' in payload.account_type else None,
            is_dirty=True # Already created in cloud by RPC
        )
        db.add(new_user)

        new_auth = Authentication(
            uuid=new_auth_uuid, user_uuid=new_user_uuid, password_hash=hashed_pw, password_salt=salt,
            is_logged_in=False, device_id=device_id, is_dirty=True # Already created in cloud by RPC
        )
        db.add(new_auth)

        new_settings = ApplicationSettings(
            uuid=new_settings_uuid, user_uuid=new_user_uuid, language='en',
            other_settings={}, is_dirty=True # Will be synced in full sync
        )
        db.add(new_settings)

        subscription_status = 'active' if payload.plan_type != 'Free Trial' else 'trial'
        new_sub = Subscription(
            uuid=new_sub_uuid, user_uuid=new_user_uuid, type=payload.plan_type, status=subscription_status,
            expiration_date=datetime.utcnow() + timedelta(days=30), is_dirty=True # Will be synced in full sync
        )
        db.add(new_sub)

        if payload.plan_type != 'Free Trial':
            receipt_bytes = None
            if payload.stage7.receipt:
                try:
                    receipt_b64 = payload.stage7.receipt.split("base64,")[1] if "base64," in payload.stage7.receipt else payload.stage7.receipt
                    receipt_bytes = base64.b64decode(receipt_b64)
                except Exception as e:
                    print(f"Warning: Could not decode receipt for user {stage1.email}. Error: {e}")

            new_payment = SubscriptionPayment(
                uuid=new_payment_uuid, subscription_uuid=new_sub_uuid, amount=payload.amount,
                payment_method=payload.stage6.paymentMethod, trx_no=payload.stage7.referenceNumber,
                trx_screenshot=receipt_bytes, status='under_processing', is_dirty=True # Will be synced in full sync
            )
            db.add(new_payment)

        db.commit() # Commit all local records after RPC creation

        # 4. Issue JWT (now that user and auth records exist in cloud)
        jwt_token = None
        try:
            print("--- Issuing JWT ---")
            service_client = get_service_role_client()
            jwt_response = service_client.rpc('issue_jwt', {
                'p_user_id': new_user.uuid,
                'p_device_id': new_auth.device_id
            }).execute()

            if not hasattr(jwt_response, 'data') or not jwt_response.data:
                 raise Exception("Failed to issue JWT: No data returned from RPC.")

            jwt_data = jwt_response.data[0]
            jwt_token = jwt_data['jwt_info']['token']
            jwt_issued_at = datetime.fromisoformat(jwt_data['issued_at'])
            print("--- JWT Issued Successfully ---")
        except Exception as e:
            print(f"Error issuing JWT: {str(e)}")
            return jsonify({"error": "Failed to issue authentication token."}), 500

        # 5. Store JWT locally (already updated remotely by issue_jwt RPC)
        new_auth.current_jwt = jwt_token
        new_auth.jwt_issued_at = jwt_issued_at
        new_auth.is_logged_in = True # User is now logged in on this device
        new_auth.is_dirty = False # The RPC already updated the remote record
        db.commit() # Commit the JWT update locally

        # 6. Full Sync (for Subscription, ApplicationSettings, SubscriptionPayment)
        try:
            print("--- Starting Full Sync for Registration (Remaining Dirty Records) ---")
            sync_response, status_code = sync()
            if status_code >= 400:
                error_details = "Unknown sync error"
                try:
                    error_details = sync_response.get_json().get("error", error_details)
                except Exception:
                    pass
                raise Exception(f"Synchronization failed: {error_details}")
            print("--- Full Sync Completed ---")
        except Exception as e:
            print(f"Error during full sync: {str(e)}")
            return jsonify({"error": "Failed to synchronize remaining data with the cloud."}), 500

        # 7. Final response
        return jsonify({
            "message": "Registration and initial sync successful",
            "user_uuid": new_user.uuid,
            "jwt": jwt_token
        }), 201

@user_bp.route("/", methods=['GET'])
def get_all_users():
    with get_db() as db:
        items = db.query(User).all()
        return jsonify([model_to_dict(i) for i in items])

