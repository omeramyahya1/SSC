from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import SubscriptionPayment, Subscription, User
from schemas import SubscriptionPaymentCreate, SubscriptionPaymentUpdate
from serializer import model_to_dict
from .sync_log import upload_blob

import base64
import uuid

import logging
logger = logging.getLogger(__name__)

from supabase_client import get_service_role_client

subscription_payment_bp = Blueprint('subscription_payment_bp', __name__, url_prefix='/subscription_payments')

@subscription_payment_bp.route('/', methods=['POST'])
def create_subscription_payment():
    data = request.json
    try:
        # Validate request data using the Pydantic schema
        validated_data = SubscriptionPaymentCreate(**data)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        subscription_uuid = validated_data.subscription_uuid

        # Guard: Check if latest subscription payment is already under_processing
        existing_pending = db.query(SubscriptionPayment).filter(
            SubscriptionPayment.subscription_uuid == subscription_uuid,
            SubscriptionPayment.status == 'under_processing'
        ).first()

        if existing_pending:
            return jsonify({"error": "A payment is already under processing for this subscription."}), 400

        # Fetch the user associated with this subscription to get the distributor_id
        subscription = db.query(Subscription).filter(Subscription.uuid == subscription_uuid).first()
        if not subscription:
            return jsonify({"error": "Subscription not found."}), 404

        user = db.query(User).filter(User.uuid == subscription.user_uuid).first()
        if not user:
            return jsonify({"error": "User not found."}), 404

        # Source of Truth: Use existing distributor_id from user table if available
        # This prevents changing the distributor once set.
        final_distributor_id = user.distributor_id

        # If user has no distributor yet, but the request provides one (e.g. first referral)
        incoming_distributor_id = data.get('distributor_id')
        if not final_distributor_id and incoming_distributor_id:
            user.distributor_id = incoming_distributor_id
            user.is_dirty = True
            final_distributor_id = incoming_distributor_id
            db.commit() # Save the distributor linkage to the user

        data_dict = validated_data.dict(exclude_unset=True)

        # Handle Base64 decoding and Storage upload for the screenshot
        screenshot_url = None
        raw_screenshot_bytes = None
        if data_dict.get('trx_screenshot'):
            try:
                b64_str = data_dict['trx_screenshot']
                if "base64," in b64_str:
                    b64_str = b64_str.split("base64,")[1]
                raw_screenshot_bytes = base64.b64decode(b64_str)
            except Exception as e:
                logger.warning(f"Error decoding trx_screenshot: {e}", exc_info=True)
                data_dict['trx_screenshot'] = None

        # Ensure uuid is set if provided, else generate one
        if not data_dict.get('uuid'):
            data_dict['uuid'] = str(uuid.uuid4())

        payment_uuid = data_dict['uuid']

        # 1. Upload screenshot if available
        if raw_screenshot_bytes:
            try:
                path = f"payment_screenshots/{payment_uuid}.png"
                screenshot_url = upload_blob(raw_screenshot_bytes, "SSC", path, use_service_client=True)
                data_dict['trx_screenshot'] = raw_screenshot_bytes
            except Exception as e:
                logger.error(f"Failed to upload screenshot: {e}", exc_info=True)

        # 2. Save Locally
        local_data = dict(data_dict)
        local_data.pop('distributor_id', None)
        new_item = SubscriptionPayment(**local_data)
        db.add(new_item)
        db.commit()
        db.refresh(new_item)

        # 3. Call Remote RPC (Unification)
        try:
            service_client = get_service_role_client()
            rpc_params = {
                'p_payment_uuid': payment_uuid,
                'p_subscription_uuid': subscription_uuid,
                'p_amount': float(validated_data.amount) if validated_data.amount else 0,
                'p_payment_method': validated_data.payment_method,
                'p_trx_no': validated_data.trx_no,
                'p_trx_screenshot': screenshot_url,
                'p_distributor_id': final_distributor_id # Use the verified ID
            }

            rpc_response = service_client.rpc('subscription_payment', rpc_params).execute()

            if hasattr(rpc_response, 'error') and rpc_response.error:
                print(f"Remote RPC Error: {rpc_response.error.message}")
        except Exception as e:
            logger.error(f"Failed to call remote RPC for payment {payment_uuid}: {e}", exc_info=True)
            # Consider whether this should fail the request

        return jsonify(model_to_dict(new_item)), 201

@subscription_payment_bp.route('/<string:item_id>', methods=['PUT'])
def update_subscription_payment(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, SubscriptionPayment, SubscriptionPayment.payment_id, SubscriptionPayment.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
            # Validate request data
            validated_data = SubscriptionPaymentUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@subscription_payment_bp.route('/', methods=['GET'])
def get_all_subscription_payment():
    with get_db() as db:
        items = db.query(SubscriptionPayment).all()
        return jsonify([model_to_dict(i) for i in items])

@subscription_payment_bp.route('/<string:item_id>', methods=['GET'])
def get_subscription_payment(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, SubscriptionPayment, SubscriptionPayment.payment_id, SubscriptionPayment.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@subscription_payment_bp.route('/<string:item_id>', methods=['DELETE'])
def delete_subscription_payment(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, SubscriptionPayment, SubscriptionPayment.payment_id, SubscriptionPayment.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
