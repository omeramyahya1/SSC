from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, generate_salt, hash_password
from models import User, Authentication, ApplicationSettings, Subscription, SubscriptionPayment
from schemas import UserCreate, UserUpdate
from auth_schemas import RegistrationPayload
from serializer import model_to_dict
import base64
import uuid
from datetime import datetime, timedelta
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Supabase setup
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

user_bp = Blueprint('user_bp', __name__, url_prefix='/users')

@user_bp.route('/pricing', methods=['GET'])
def get_pricing_data():
    """
    Fetches detailed pricing data from the cloud's detailed_pricing view.
    """
    try:
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

@user_bp.route('/register', methods=['POST'])
def register_user():
    try:
        payload = RegistrationPayload(**request.json)
    except ValidationError as e:
        return jsonify({"error": "Invalid payload", "details": e.errors()}), 400

    stage1 = payload.stage1

    with get_db() as db:
        # Local check remains as a fallback/secondary validation
        if db.query(User).filter((User.email == stage1.email) | (User.username == stage1.username)).first():
            return jsonify({"error": "User with this email or username already exists"}), 409

        stage4 = payload.stage4
        location = f"{stage4.locationCity}, {stage4.locationState}" if stage4.locationCity and stage4.locationState else None

        logo_bytes = None
        if stage4.logo:
            try:
                logo_b64 = stage4.logo.split("base64,")[1] if "base64," in stage4.logo else stage4.logo
                logo_bytes = base64.b64decode(logo_b64)
            except Exception as e:
                print(f"Warning: Could not decode logo for user {stage1.email}. Error: {e}")

        # Determine user status based on plan
        user_status = 'trial' if payload.plan_type == "Free Trial" else "active"

        new_user = User(
            username=stage1.username, email=stage1.email, business_name=stage4.businessName,
            account_type=payload.account_type, location=location, business_logo=logo_bytes,
            status=user_status, role='admin' if 'enterprise' in payload.account_type else None,
            is_dirty=True # Mark as dirty for initial sync
        )
        db.add(new_user)
        db.flush()

        salt = generate_salt()
        hashed_pw = hash_password(stage1.password, salt)

        new_auth = Authentication(
            user_uuid=new_user.uuid, password_hash=hashed_pw, password_salt=salt,
            is_logged_in=False, device_id=str(uuid.uuid4()), is_dirty=True
        )
        db.add(new_auth)

        new_settings = ApplicationSettings(
            user_uuid=new_user.uuid, language='en',
            other_settings={}, is_dirty=True
        )
        db.add(new_settings)

        subscription_status = 'active' if payload.plan_type != 'Free Trial' else 'trial'
        
        new_sub = Subscription(
            user_uuid=new_user.uuid,
            type=payload.plan_type,
            status=subscription_status,
            expiration_date=datetime.utcnow() + timedelta(days=30),
            is_dirty=True
        )
        db.add(new_sub)
        db.flush()

        receipt_bytes = None
        if payload.stage7.receipt:
            try:
                receipt_b64 = payload.stage7.receipt.split("base64,")[1] if "base64," in payload.stage7.receipt else payload.stage7.receipt
                receipt_bytes = base64.b64decode(receipt_b64)
            except Exception as e:
                print(f"Warning: Could not decode receipt for user {stage1.email}. Error: {e}")

        if payload.plan_type != 'Free Trial':
            new_payment = SubscriptionPayment(
                subscription_uuid=new_sub.uuid,
                amount=payload.amount,
                payment_method=payload.stage6.paymentMethod,
                trx_no=payload.stage7.referenceNumber,
                trx_screenshot=receipt_bytes,
                status='under_processing',
                is_dirty=True
            )
            db.add(new_payment)

        db.commit()

        return jsonify({
            "message": "Registration successful, pending initial sync",
            "user_id": new_user.user_id, # Local ID for immediate use
            "user_uuid": new_user.uuid # UUID for future reference
        }), 201
