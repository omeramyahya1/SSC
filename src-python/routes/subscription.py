from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import Subscription, User
from schemas import SubscriptionCreate, SubscriptionUpdate
from serializer import model_to_dict
from datetime import datetime, timedelta
from supabase_client import get_service_role_client
from .sync_log import sync_table, SYNC_CONFIG # Import sync_table and SYNC_CONFIG
import time # Import time for delays
import json # Import json for parsing
from postgrest.exceptions import APIError # Import APIError for specific handling
# ... (rest of imports)

subscription_bp = Blueprint('subscription_bp', __name__, url_prefix='/subscriptions')

@subscription_bp.route('/activate', methods=['POST'])
def activate_license():
    data = request.get_json()
    print(f"Activating license: {data}")
    try:
        service_client = get_service_role_client()
        response = service_client.rpc('activate_license', {
            'p_license_code': data.get('p_license_code'),
            'p_user_uuid': data.get('p_user_uuid')
        }).execute()

        print(f"Supabase response: {response}")

        # If execute() did not raise an APIError, it means response.data should be available
        if response.data:
            return jsonify(response.data), 200
        else:
            # Fallback for unexpected empty response if no APIError was raised
            return jsonify({"error": "Unexpected empty response from Supabase"}), 500

    except APIError as e:
        error_msg = e.message # APIError has a message attribute
        print(f"APIError in activate_license: {error_msg}")

        # Check if this is the "JSON could not be generated" with success in details
        if "JSON could not be generated" in error_msg and hasattr(e, 'details'):
            try:
                # e.details contains the b'{"success" : true, ...}' string
                # Remove the b'...' wrapper and unescape quotes
                details_json_str = e.details.lstrip("b'").rstrip("'").replace('\\"', '"')
                parsed_response = json.loads(details_json_str)
                if parsed_response.get('success'):
                    print(f"Successfully parsed successful JSON from APIError details: {parsed_response}")
                    return jsonify(parsed_response), 200
            except json.JSONDecodeError as parse_error:
                print(f"Failed to parse successful JSON from APIError details: {parse_error}")
            except Exception as other_parse_error:
                print(f"Other error during parsing APIError details: {other_parse_error}")

        # Handle genuine API errors
        if "Invalid license code or user mismatch" in error_msg:
            return jsonify({"error": "Invalid license code"}), 401

        return jsonify({"error": error_msg}), 500

    except Exception as e:
        # Catch any other unexpected exceptions
        error_msg = str(e)
        print(f"General Exception in activate_license: {error_msg}")
        return jsonify({"error": error_msg}), 500

@subscription_bp.route('/latest', methods=['GET'])
def get_latest_subscription():
    user_uuid = request.args.get('user_uuid')
    if not user_uuid:
        return jsonify({"error": "user_uuid is required"}), 400

    with get_db() as db:
        latest = db.query(Subscription).filter(
            Subscription.user_uuid == user_uuid,
            Subscription.deleted_at == None
        ).order_by(Subscription.created_at.desc()).first()

        if not latest:
            return jsonify({"error": "No subscription found"}), 404
        return jsonify(model_to_dict(latest)), 200

@subscription_bp.route('/create-and-sync', methods=['POST'])
def create_and_sync_subscription():
    data = request.get_json()
    user_uuid = data.get('user_uuid')
    plan_type = data.get('plan_type')
    billing_cycle = data.get('billing_cycle') # 'Monthly', 'Annual', 'Lifetime'
    employees = data.get('employees', 1) # For enterprise, default 1

    if not user_uuid or not plan_type or not billing_cycle:
        return jsonify({"error": "Missing user_uuid, plan_type, or billing_cycle"}), 400

    with get_db() as db:
        try:
            # 1. Determine expiration date
            expiration_date = datetime.utcnow()
            if billing_cycle == 'Monthly':
                expiration_date += timedelta(days=30)
            elif billing_cycle == 'Annual':
                expiration_date += timedelta(days=365)
            elif billing_cycle == 'Lifetime':
                expiration_date = None # Lifetime subscriptions might not have a hard expiration

            # 2. Create new Subscription locally
            new_subscription_data = {
                "user_uuid": user_uuid,
                "type": plan_type,
                "status": "pending", # Set to pending until payment is approved
                "expiration_date": expiration_date,
                "grace_period_end": expiration_date + timedelta(days=7) if expiration_date else None, # Example grace period
                "is_dirty": True # Mark as dirty to be pushed
            }
            new_subscription = Subscription(**new_subscription_data)
            db.add(new_subscription)
            db.commit()
            db.refresh(new_subscription)

            # 3. Sync the new subscription to Supabase immediately
            subscription_config = next((config for config in SYNC_CONFIG if config["model"] == Subscription), None)
            if not subscription_config:
                raise Exception("Subscription sync configuration not found.")

            sync_table(db, Subscription, subscription_config["table_name"], subscription_config["mapper"], dirty_only=True)

            # 4. Verify remote availability with retries
            service_client = get_service_role_client()
            retries = 3
            delay = 0.5 # seconds
            remote_subscription_found = False

            for i in range(retries):
                try:
                    # Query Supabase directly to ensure the subscription is visible
                    response = service_client.table('subscriptions').select('id').eq('id', new_subscription.uuid).execute()
                    if response.data and len(response.data) > 0:
                        remote_subscription_found = True
                        break
                except Exception as e:
                    print(f"Attempt {i+1} to verify remote subscription failed: {e}")
                time.sleep(delay)

            if not remote_subscription_found:
                raise Exception(f"New subscription {new_subscription.uuid} not found in remote database after retries.")

            return jsonify({"new_subscription_uuid": new_subscription.uuid}), 200

        except Exception as e:
            db.rollback()
            print(f"Error creating and syncing new subscription: {e}")
            return jsonify({"error": str(e)}), 500

@subscription_bp.route('/', methods=['POST'])
def create_subscription():
    try:
        # Validate request data using the Pydantic schema
        validated_data = SubscriptionCreate(**request.get_json())
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Subscription(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201


@subscription_bp.route('/<string:item_id>', methods=['PUT'])
def update_subscription(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Subscription, Subscription.subscription_id, Subscription.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
            # Validate request data
            validated_data = SubscriptionUpdate(**request.get_json())
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@subscription_bp.route('/', methods=['GET'])
def get_all_subscription():
    with get_db() as db:
        user_uuid = request.args.get('user_uuid')
        print(user_uuid)
        query = db.query(Subscription)
        if user_uuid:
            query = query.filter(Subscription.user_uuid == user_uuid)
        items = query.filter(Subscription.deleted_at == None).all()
        return jsonify([model_to_dict(i) for i in items])

@subscription_bp.route('/<string:item_id>', methods=['GET'])
def get_subscription(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Subscription, Subscription.subscription_id, Subscription.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@subscription_bp.route('/<string:item_id>', methods=['DELETE'])
def delete_subscription(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Subscription, Subscription.subscription_id, Subscription.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
