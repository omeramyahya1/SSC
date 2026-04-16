from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import Subscription, User, SubscriptionPayment
from schemas import SubscriptionCreate, SubscriptionUpdate
from serializer import model_to_dict
from datetime import datetime, timedelta
from supabase_client import get_service_role_client
from .sync_log import sync_table, SYNC_CONFIG, _map_cloud_to_local # Import sync helpers + reverse mapper
import time # Import time for delays
import json # Import json for parsing
from postgrest.exceptions import APIError # Import APIError for specific handling
# ... (rest of imports)

subscription_bp = Blueprint('subscription_bp', __name__, url_prefix='/subscriptions')

def _upsert_from_cloud(db, model_class, payload: dict):
    attrs = _map_cloud_to_local(payload, model_class)
    record_uuid = attrs.get("uuid")
    if not record_uuid:
        raise Exception(f"Cloud payload missing id for {model_class.__name__}")

    existing = db.query(model_class).filter_by(uuid=record_uuid).first()
    if existing:
        for key, value in attrs.items():
            setattr(existing, key, value)
        existing.is_dirty = False
        return existing

    new_instance = model_class(**attrs)
    new_instance.is_dirty = False
    db.add(new_instance)
    return new_instance

def _refresh_local_after_activation(service_client, user_uuid: str, new_subscription_uuid: str):
    subscription_cloud = (
        service_client.table("subscriptions")
        .select("*")
        .eq("id", new_subscription_uuid)
        .single()
        .execute()
    )
    user_cloud = (
        service_client.table("users")
        .select("*")
        .eq("id", user_uuid)
        .single()
        .execute()
    )
    payment_cloud = (
        service_client.table("subscription_payments")
        .select("*")
        .eq("subscription_id", new_subscription_uuid)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    with get_db() as db:
        local_subscription = _upsert_from_cloud(db, Subscription, subscription_cloud.data)
        local_user = _upsert_from_cloud(db, User, user_cloud.data)
        if payment_cloud.data and len(payment_cloud.data) > 0:
            _upsert_from_cloud(db, SubscriptionPayment, payment_cloud.data[0])

        # Enforce required local states (no-op if cloud payload already matches).
        # Do not mark as dirty: the cloud is source of truth for this record.
        local_subscription.status = "active"
        local_user.status = "active"

        previous_subscriptions = (
            db.query(Subscription)
            .filter(
                Subscription.user_uuid == user_uuid,
                Subscription.uuid != new_subscription_uuid,
                Subscription.deleted_at == None,
                Subscription.status != "expired",
            )
            .all()
        )
        for sub in previous_subscriptions:
            sub.status = "expired"
            sub.is_dirty = True

@subscription_bp.route('/activate', methods=['POST'])
def activate_license():
    data = request.get_json() or {}
    user_uuid = data.get('p_user_uuid')
    print(f"Activating license for user_uuid={user_uuid}")
    try:
        service_client = get_service_role_client()
        response = service_client.rpc('activate_license', {
            'p_license_code': data.get('p_license_code'),
            'p_user_uuid': data.get('p_user_uuid')
        }).execute()

        print("Supabase activation RPC completed")

        # If execute() did not raise an APIError, it means response.data should be available
        if not response.data:
            # Fallback for unexpected empty response if no APIError was raised
            return jsonify({"error": "Unexpected empty response from Supabase"}), 500

        parsed_response = response.data

        if not parsed_response.get("success"):
            if "Invalid license code or user mismatch" in (parsed_response.get("message") or ""):
                return jsonify({"error": "Invalid license code"}), 401
            return jsonify(parsed_response), 400

        new_subscription_uuid = parsed_response.get("subscription_id")
        if not user_uuid or not new_subscription_uuid:
            return jsonify({"error": "Activation succeeded but response is missing required ids."}), 500

        # Pull the newly-updated records from the cloud and upsert into local SQLite
        try:
            _refresh_local_after_activation(service_client, user_uuid, new_subscription_uuid)
        except Exception as e:
            # Activation already succeeded in the cloud; surface a clear error for local update issues.
            return jsonify({
                "error": "License activated in cloud but local update failed.",
                "details": str(e),
                "activation": parsed_response
            }), 500

        return jsonify(parsed_response), 200

    except APIError as e:
        error_msg = e.message # APIError has a message attribute
        print(f"APIError in activate_license: {error_msg}")

        # Check if this is the "JSON could not be generated" with success in details
        if "JSON could not be generated" in error_msg and hasattr(e, 'details'):
            try:
                # e.details contains the b'{"success" : true, ...}' string
                # Remove the b'...' wrapper and unescape quotes
                raw = e.details
                if isinstance(raw, (bytes, bytearray)):
                    raw = raw.decode("utf-8", errors="replace")
                elif not isinstance(raw, str):
                    raw = str(raw)
                try:
                    parsed_response = json.loads(raw)
                except json.JSONDecodeError:
                    # Fallback for Python bytes repr like: b'{"success": true, ...}'
                    if raw.startswith("b'") and raw.endswith("'"):
                        raw = raw[2:-1].replace('\\"', '"')
                    parsed_response = json.loads(raw)

                if parsed_response.get('success'):
                    print(f"Successfully parsed successful JSON from APIError details: {parsed_response}")
                    new_subscription_uuid = parsed_response.get("subscription_id")
                    if not user_uuid or not new_subscription_uuid:
                        return jsonify({"error": "Activation succeeded but response is missing required ids."}), 500

                    try:
                        service_client = get_service_role_client()
                        _refresh_local_after_activation(service_client, user_uuid, new_subscription_uuid)
                    except Exception as local_update_error:
                        return jsonify({
                            "error": "License activated in cloud but local update failed.",
                            "details": str(local_update_error),
                            "activation": parsed_response
                        }), 500

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
            normalized_type = billing_cycle.lower()
            if normalized_type not in {"monthly", "annual", "lifetime"}:
                return jsonify({"error": "Invalid billing_cycle"}), 400

            new_subscription_data = {
                "user_uuid": user_uuid,
                "type": normalized_type,
                "status": "pending", # Set to pending until payment is approved
                "expiration_date": expiration_date,
                "grace_period_end": expiration_date + timedelta(days=7) if expiration_date else None, # Example grace period
                "is_dirty": True # Mark as dirty to be pushed
            }
            new_subscription = Subscription(**new_subscription_data)
            db.add(new_subscription)
            # Ensure the new row is visible to subsequent queries within this session
            # without committing early (avoids orphaned committed rows if sync fails).
            db.flush()

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
                # Compensate: remove the local row AND best-effort delete any cloud row
                # that may have been pushed, to avoid orphaned records on either side.
                try:
                    service_client.table("subscriptions").delete().eq("id", new_subscription.uuid).execute()
                except Exception as remote_cleanup_error:
                    print(
                        f"Failed to cleanup remote subscription {new_subscription.uuid} "
                        f"after verification failure: {remote_cleanup_error}"
                    )
                try:
                    local_sub = db.query(Subscription).filter_by(uuid=new_subscription.uuid).first()
                    if local_sub:
                        db.delete(local_sub)
                        db.commit()
                except Exception as cleanup_error:
                    print(
                        f"Failed to cleanup local subscription {new_subscription.uuid} after remote verification failure: {cleanup_error}"
                    )
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

@subscription_bp.route('/<string:item_id>/cancel', methods=['POST'])
def cancel_subscription(item_id):
    """
    Compensating action for partially completed subscription flows.
    Soft-deletes a subscription locally (deleted_at) and syncs that change to Supabase.
    """
    with get_db() as db:
        item = get_by_id_or_uuid(db, Subscription, Subscription.subscription_id, Subscription.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        if item.deleted_at is not None:
            return jsonify({"status": "ok", "subscription_uuid": item.uuid}), 200

        item.deleted_at = datetime.utcnow()
        item.is_dirty = True

        subscription_config = next((config for config in SYNC_CONFIG if config["model"] == Subscription), None)
        if not subscription_config:
            return jsonify({"error": "Subscription sync configuration not found."}), 500

        try:
            sync_table(
                db,
                Subscription,
                subscription_config["table_name"],
                subscription_config["mapper"],
                dirty_only=True,
            )
        except Exception as e:
            db.rollback()
            return jsonify({"error": str(e)}), 500

        return jsonify({"status": "ok", "subscription_uuid": item.uuid}), 200
