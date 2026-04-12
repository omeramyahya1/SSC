from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import Subscription
from schemas import SubscriptionCreate, SubscriptionUpdate
from serializer import model_to_dict

from supabase_client import get_service_role_client

subscription_bp = Blueprint('subscription_bp', __name__, url_prefix='/subscriptions')

@subscription_bp.route('/activate', methods=['POST'])
def activate_license():
    data = request.json
    try:
        service_client = get_service_role_client()
        response = service_client.rpc('activate_license', {
            'p_license_code': data.get('p_license_code'),
            'p_user_uuid': data.get('p_user_uuid')
        }).execute()
        
        if hasattr(response, 'error') and response.error:
            return jsonify({"error": response.error.message}), 500
            
        return jsonify(response.data), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@subscription_bp.route('/', methods=['POST'])
def create_subscription():
    try:
        # Validate request data using the Pydantic schema
        validated_data = SubscriptionCreate(**request.json)
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
            validated_data = SubscriptionUpdate(**request.json)
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
        items = db.query(Subscription).all()
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
