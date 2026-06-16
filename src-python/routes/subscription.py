from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import Subscription, User, SubscriptionPayment
from schemas import SubscriptionCreate, SubscriptionUpdate
from serializer import model_to_dict
from datetime import datetime, timedelta, timezone
from supabase_client import get_service_role_client
from .sync_log import sync_table, SYNC_CONFIG, _map_cloud_to_local, _build_sync_scope # Import sync helpers + reverse mapper
import time # Import time for delays
import json # Import json for parsing
from postgrest.exceptions import APIError # Import APIError for specific handling
from utils import get_server_time_or_none
from sqlalchemy import or_

subscription_bp = Blueprint('subscription_bp', __name__, url_prefix='/subscriptions')

def _parse_timestamptz(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        s = value.strip()
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        try:
            dt = datetime.fromisoformat(s)
            parsed = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError as e:
            print(f"Failed to parse timestamp '{value}': {e}")
            return None
    return None

def _compute_statuses(now_utc: datetime, sub: dict):
    sub_status = (sub.get("status") or "").lower()
    sub_type = (sub.get("type") or "").lower()
    expires = _parse_timestamptz(sub.get("expiration_date"))
    grace_end = _parse_timestamptz(sub.get("grace_period_end"))

    print(f"Computing status: Now={now_utc.isoformat()}, Expires={expires.isoformat() if expires else 'None'}, GraceEnd={grace_end.isoformat() if grace_end else 'None'}")

    if expires and grace_end is None:
        grace_end = expires + timedelta(days=7)

    if sub_status == "pending":
        subscription_status = "pending"
    elif expires is None:
        subscription_status = "active"
    elif sub_status == "trial" or sub_type == "trial":
        subscription_status = "expired" if now_utc > expires else "trial"
    else:
        subscription_status = "expired" if now_utc > expires else "active"

    if subscription_status == "trial":
        user_status = "trial"
    elif expires is None:
        user_status = "active"
    elif grace_end and now_utc > grace_end:
        user_status = "expired"
    elif expires and now_utc > expires:
        user_status = "grace"
    else:
        user_status = "active"

    print(f"Calculated: sub_status={subscription_status}, user_status={user_status}")
    return subscription_status, user_status, expires, grace_end

def _enforce_cloud_and_refresh_local(user_uuid: str):
    """
    Enforce subscription + user statuses in Supabase (service role), then upsert the
    resulting cloud rows into local SQLite.
    - subscriptions.status: active|expired|trial|pending (no grace)
    - users.status: active|grace|expired|trial
    """
    print(f"Enforcing subscription status for user {user_uuid}...")
    service_client = get_service_role_client()
    now_utc = get_server_time_or_none() or datetime.now(timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)

    caller_user = (
        service_client.table("users")
        .select("id,organization_id,role")
        .eq("id", user_uuid)
        .single()
        .execute()
    ).data

    if not caller_user:
        print(f"User {user_uuid} not found in cloud.")
        return {"target_owner_id": user_uuid, "org_id": None, "role": None}

    org_id = caller_user.get("organization_id")
    role = caller_user.get("role")
    print(f"Caller role: {role}, OrgID: {org_id}")

    target_owner_id = user_uuid
    if org_id and role in ("admin", "employee"):
        admin_row = (
            service_client.table("users")
            .select("id")
            .eq("organization_id", org_id)
            .eq("role", "admin")
            .single()
            .execute()
        ).data
        if admin_row and admin_row.get("id"):
            target_owner_id = admin_row["id"]
            print(f"Targeting subscription owner (admin): {target_owner_id}")

    sub_rows = (
        service_client.table("subscriptions")
        .select("*")
        .eq("user_id", target_owner_id)
        .neq("status", "pending")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data or []

    if not sub_rows:
        print(f"No non-pending subscriptions found for target user {target_owner_id}")
        return {"target_owner_id": target_owner_id, "org_id": org_id, "role": role}

    subscription_cloud = sub_rows[0]
    subscription_status, user_status, expires, grace_end = _compute_statuses(now_utc, subscription_cloud)

    desired_grace_end = grace_end.isoformat() if grace_end else None

    # Update subscription only if needed (to avoid bumping updated_at unnecessarily).
    if (subscription_cloud.get("status") != subscription_status) or (
        expires is not None and subscription_cloud.get("grace_period_end") is None
    ):
        print(f"Updating cloud subscription status to {subscription_status}")
        service_client.table("subscriptions").update(
            {
                "status": subscription_status,
                "grace_period_end": desired_grace_end,
            }
        ).eq("id", subscription_cloud["id"]).execute()

        # Refresh after update to ensure we upsert the final server state.
        subscription_cloud = (
            service_client.table("subscriptions")
            .select("*")
            .eq("id", subscription_cloud["id"])
            .single()
            .execute()
        ).data

    # Cascade cloud users.status (enterprise) or update just the caller (standard).
    if org_id and role in ("admin", "employee"):
        print(f"Cascading user status {user_status} to all users in org {org_id}")
        service_client.table("users").update({"status": user_status}).eq("organization_id", org_id).execute()
        users_cloud = (
            service_client.table("users")
            .select("*")
            .eq("organization_id", org_id)
            .execute()
        ).data or []
    else:
        print(f"Updating status {user_status} for individual user {user_uuid}")
        service_client.table("users").update({"status": user_status}).eq("id", user_uuid).execute()
        users_cloud = [
            (
                service_client.table("users")
                .select("*")
                .eq("id", user_uuid)
                .single()
                .execute()
            ).data
        ]

    # Upsert cloud rows into local SQLite.
    with get_db() as db:
        print(f"Upserting {len(users_cloud)} cloud users and subscription locally...")
        # Upsert subscription under its true owner (admin for enterprise).
        _upsert_from_cloud(db, Subscription, subscription_cloud)
        for u in users_cloud:
            if u:
                _upsert_from_cloud(db, User, u)
        db.commit()
    return {"target_owner_id": target_owner_id, "org_id": org_id, "role": role}

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
                Subscription.deleted_at.is_(None),
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
            # Resolve user for sync scope
            user = db.query(User).filter(User.uuid == user_uuid).first()
            if not user:
                return jsonify({"error": "User not found locally"}), 404

            scope = _build_sync_scope(db, user)
            print(f"Creating subscription for user {user_uuid} with scope: {scope}")

            # Determine normalized plan identifier stored on subscriptions.type
            normalized_type = billing_cycle.lower()
            if normalized_type not in {"monthly", "annual", "lifetime"}:
                return jsonify({"error": "Invalid billing_cycle"}), 400

            # Idempotency: if there's an existing pending subscription for the same plan, return it.
            owner_uuid = user_uuid
            if user.organization_uuid and user.role in ("admin", "employee"):
                admin = db.query(User).filter(
                    User.organization_uuid == user.organization_uuid,
                    User.role == "admin",
                    User.deleted_at.is_(None)
                ).first()
                if admin:
                    owner_uuid = admin.uuid

            existing_pending_local = db.query(Subscription).filter(
                Subscription.user_uuid == owner_uuid,
                Subscription.status == "pending",
                Subscription.type == normalized_type,
                Subscription.deleted_at.is_(None)
            ).order_by(Subscription.created_at.desc()).first()

            if existing_pending_local:
                return jsonify({"new_subscription_uuid": existing_pending_local.uuid, "message": "Pending subscription already exists for this plan"}), 200

            # Cloud check (prevents duplicates if local is stale)
            try:
                service_client = get_service_role_client()
                existing_pending_cloud = (
                    service_client.table("subscriptions")
                    .select("*")
                    .eq("user_id", owner_uuid)
                    .eq("status", "pending")
                    .eq("type", normalized_type)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                ).data or []
                if existing_pending_cloud:
                    pending_cloud_row = existing_pending_cloud[0]
                    _upsert_from_cloud(db, Subscription, pending_cloud_row)
                    db.commit()
                    return jsonify({"new_subscription_uuid": pending_cloud_row.get("id"), "message": "Pending subscription already exists for this plan"}), 200
            except Exception as e:
                print(f"Warning: Cloud pending-subscription check failed (continuing with local creation): {e}")

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
                # Org-centric model: employees renew under the org admin subscription owner.
                "user_uuid": owner_uuid,
                "type": normalized_type,
                "status": "pending", # Set to pending until payment is approved
                "expiration_date": expiration_date,
                "grace_period_end": expiration_date + timedelta(days=7) if expiration_date else None, # Example grace period
                "is_dirty": True # Mark as dirty to be pushed
            }
            new_subscription = Subscription(**new_subscription_data)
            db.add(new_subscription)
            db.flush()
            print(f"Local subscription record flushed: {new_subscription.uuid}")

            # 3. Sync the new subscription to Supabase immediately with retries
            subscription_config = next((config for config in SYNC_CONFIG if config["model"] == Subscription), None)
            if not subscription_config:
                raise Exception("Subscription sync configuration not found.")

            sync_retries = 3
            sync_success = False
            for attempt in range(sync_retries):
                try:
                    print(f"Pushing subscription to cloud (Attempt {attempt+1}/{sync_retries})...")
                    sync_table(db, service_client, Subscription, subscription_config["table_name"], subscription_config["mapper"], scope=scope, dirty_only=True)
                    sync_success = True
                    break
                except Exception as sync_err:
                    print(f"Sync attempt {attempt+1} failed: {sync_err}")
                    if attempt < sync_retries - 1:
                        time.sleep(1) # Wait before retry

            if not sync_success:
                raise Exception("Failed to sync subscription to cloud after multiple attempts.")

            # 4. Verify remote availability with retries
            service_client = get_service_role_client()
            verify_retries = 5
            verify_delay = 1.0 # seconds
            remote_subscription_found = False

            for i in range(verify_retries):
                try:
                    print(f"Verifying remote availability (Attempt {i+1}/{verify_retries})...")
                    response = service_client.table('subscriptions').select('id').eq('id', new_subscription.uuid).execute()
                    if response.data and len(response.data) > 0:
                        remote_subscription_found = True
                        print("Subscription verified in cloud.")
                        break
                except Exception as e:
                    print(f"Attempt {i+1} to verify remote subscription failed: {e}")
                time.sleep(verify_delay)

            if not remote_subscription_found:
                # Compensate: remove the local row AND best-effort delete any cloud row
                print(f"COMPENSATION: Subscription {new_subscription.uuid} not verified in cloud. Cleaning up...")
                try:
                    service_client.table("subscriptions").delete().eq("id", new_subscription.uuid).execute()
                except Exception as remote_cleanup_error:
                    print(f"Failed to cleanup remote subscription: {remote_cleanup_error}")

                # SQLAlchemy rollback handled by context manager on exception
                raise Exception(f"New subscription {new_subscription.uuid} not found in remote database after verification retries.")

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
        target_owner_id = None
        if user_uuid:
            try:
                result = _enforce_cloud_and_refresh_local(user_uuid) or {}
                target_owner_id = result.get("target_owner_id") or None
            except Exception as e:
                # Fail open: return local data even if enforcement fails (offline, transient errors).
                print(f"Subscription enforcement failed for user_uuid={user_uuid}: {e}")
        query = db.query(Subscription)
        if user_uuid:
            # Organization-centric model: employees are governed by their org admin subscription.
            query = query.filter(Subscription.user_uuid == (target_owner_id or user_uuid))
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

        # Resolve user for sync scope
        user = db.query(User).filter(User.uuid == item.user_uuid).first()
        if not user:
            return jsonify({"error": "Subscription owner not found locally"}), 404

        scope = _build_sync_scope(db, user)

        item.deleted_at = datetime.utcnow()
        item.is_dirty = True

        subscription_config = next((config for config in SYNC_CONFIG if config["model"] == Subscription), None)
        if not subscription_config:
            return jsonify({"error": "Subscription sync configuration not found."}), 500

        try:
            service_client = get_service_role_client()

            sync_table(
                db,
                service_client,
                Subscription,
                subscription_config["table_name"],
                subscription_config["mapper"],
                scope=scope,
                dirty_only=True,
            )
        except Exception as e:
            db.rollback()
            return jsonify({"error": str(e)}), 500

        return jsonify({"status": "ok", "subscription_uuid": item.uuid}), 200
