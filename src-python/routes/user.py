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

user_bp = Blueprint('user_bp', __name__, url_prefix='/users')

@user_bp.route('/register', methods=['POST'])
def register_user():
    try:
        payload = RegistrationPayload(**request.json)
    except ValidationError as e:
        return jsonify({"error": "Invalid payload", "details": e.errors()}), 400

    stage1 = payload.stage1
    
    with get_db() as db:
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
            status=user_status, role='admin' if 'enterprise' in payload.account_type else None
        )
        db.add(new_user)
        db.flush()

        salt = generate_salt()
        hashed_pw = hash_password(stage1.password, salt)
        
        # res = supabase.rpc(issue a new jwt)
        new_auth = Authentication(user_id=new_user.uuid, password_hash=hashed_pw, password_salt=salt, is_logged_in=False, device_id=uuid.uuid4())
        db.add(new_auth)

        new_settings = ApplicationSettings(user_id=new_user.user_id, language='en', other_settings={})
        db.add(new_settings)

        # Invert the logic: Create Subscription first to get its ID
        subscription_status = 'active' if payload.plan_type != 'Free Trial' else 'trial'
        
        new_sub = Subscription(
            user_id=new_user.user_id,
            type=payload.plan_type, 
            status=subscription_status,
            expiration_date=datetime.utcnow() + timedelta(days=30)
        )
        db.add(new_sub)
        db.flush() # Flush to get the new_sub.subscription_id

        receipt_bytes = None
        if payload.stage7.receipt:
            try:
                receipt_b64 = payload.stage7.receipt.split("base64,")[1] if "base64," in payload.stage7.receipt else payload.stage7.receipt
                receipt_bytes = base64.b64decode(receipt_b64)
            except Exception as e:
                print(f"Warning: Could not decode receipt for user {stage1.email}. Error: {e}")
        
        # Now create the payment linked to the subscription
        new_payment = SubscriptionPayment(
            subscription_id=new_sub.subscription_id,
            amount=payload.amount, 
            payment_method=payload.stage6.paymentMethod,
            trx_no=payload.stage7.referenceNumber,
            trx_screenshot=receipt_bytes,
            status='under_processing' if payload.plan_type != 'Free Trial' else 'approved'
        )
        db.add(new_payment)

        db.commit()
        
        return jsonify({"message": "Registration successful", "user_id": new_user.user_id}), 201

@user_bp.route('/', methods=['POST'])
def create_user():
    try:
        # Validate request data using the Pydantic schema
        validated_data = UserCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = User(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@user_bp.route('/<int:item_id>', methods=['PUT'])
def update_user(item_id):
    with get_db() as db:
        item = db.query(User).filter(User.user_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = UserUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@user_bp.route('/', methods=['GET'])
def get_all_user():
    with get_db() as db:
        items = db.query(User).all()
        return jsonify([model_to_dict(i) for i in items])

@user_bp.route('/<int:item_id>', methods=['GET'])
def get_user(item_id):
    with get_db() as db:
        item = db.query(User).filter(User.user_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@user_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_user(item_id):
    with get_db() as db:
        item = db.query(User).filter(User.user_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200