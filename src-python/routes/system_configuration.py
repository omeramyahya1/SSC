from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import SystemConfiguration
from schemas import SystemConfigurationCreate, SystemConfigurationUpdate
from serializer import model_to_dict

system_configuration_bp = Blueprint('system_configuration_bp', __name__, url_prefix='/system_configurations')

@system_configuration_bp.route('/', methods=['POST'])
def create_system_configuration():
    try:
        # Validate request data using the Pydantic schema
        validated_data = SystemConfigurationCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = SystemConfiguration(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@system_configuration_bp.route('/<int:item_id>', methods=['PUT'])
def update_system_configuration(item_id):
    with get_db() as db:
        item = db.query(SystemConfiguration).filter(SystemConfiguration.system_config_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = SystemConfigurationUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@system_configuration_bp.route('/', methods=['GET'])
def get_all_system_configuration():
    with get_db() as db:
        items = db.query(SystemConfiguration).all()
        return jsonify([model_to_dict(i) for i in items])

@system_configuration_bp.route('/<int:item_id>', methods=['GET'])
def get_system_configuration(item_id):
    with get_db() as db:
        item = db.query(SystemConfiguration).filter(SystemConfiguration.system_config_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@system_configuration_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_system_configuration(item_id):
    with get_db() as db:
        item = db.query(SystemConfiguration).filter(SystemConfiguration.system_config_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200