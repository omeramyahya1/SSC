from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import SubscriptionPayment
from schemas import SubscriptionPaymentCreate, SubscriptionPaymentUpdate
from serializer import model_to_dict

import base64
import uuid

from supabase_client import get_service_role_client

subscription_payment_bp = Blueprint('subscription_payment_bp', __name__, url_prefix='/subscription_payments')

@subscription_payment_bp.route('/confirm_remote', methods=['POST'])
def confirm_remote_payment():
    data = request.json
    try:
        service_client = get_service_role_client()
        rpc_params = {
            'p_payment_uuid': data.get('p_payment_uuid'),
            'p_subscription_uuid': data.get('p_subscription_uuid'),
            'p_amount': data.get('p_amount'),
            'p_payment_method': data.get('p_payment_method'),
            'p_trx_no': data.get('p_trx_no'),
            'p_trx_screenshot': data.get('p_trx_screenshot'),
            'p_distributor_id': data.get('p_distributor_id')
        }
        
        response = service_client.rpc('subscription_payment', rpc_params).execute()
        
        if hasattr(response, 'error') and response.error:
            return jsonify({"error": response.error.message}), 500
            
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@subscription_payment_bp.route('/', methods=['POST'])
def create_subscription_payment():
    try:
        # Validate request data using the Pydantic schema
        validated_data = SubscriptionPaymentCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        data_dict = validated_data.dict(exclude_unset=True)
        
        # Handle Base64 decoding for the screenshot
        if data_dict.get('trx_screenshot'):
            try:
                b64_str = data_dict['trx_screenshot']
                if "base64," in b64_str:
                    b64_str = b64_str.split("base64,")[1]
                data_dict['trx_screenshot'] = base64.b64decode(b64_str)
            except Exception as e:
                print(f"Error decoding trx_screenshot: {e}")
                data_dict['trx_screenshot'] = None

        # Ensure uuid is set if provided, else generate one
        if not data_dict.get('uuid'):
            data_dict['uuid'] = str(uuid.uuid4())

        new_item = SubscriptionPayment(**data_dict)
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
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
