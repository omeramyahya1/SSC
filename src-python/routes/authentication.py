from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import Authentication
from schemas import AuthenticationCreate, AuthenticationUpdate
from serializer import model_to_dict

authentication_bp = Blueprint('authentication_bp', __name__, url_prefix='/authentications')

@authentication_bp.route('/', methods=['POST'])
def create_authentication():
    try:
        # Validate request data using the Pydantic schema
        validated_data = AuthenticationCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Authentication(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

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

@authentication_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_authentication(item_id):
    with get_db() as db:
        item = db.query(Authentication).filter(Authentication.auth_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200