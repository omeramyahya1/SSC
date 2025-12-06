from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import ApplicationSetting
from schemas import ApplicationSettingCreate, ApplicationSettingUpdate
from serializer import model_to_dict

application_setting_bp = Blueprint('application_setting_bp', __name__, url_prefix='/application_settings')

@application_setting_bp.route('/', methods=['POST'])
def create_application_setting():
    try:
        # Validate request data using the Pydantic schema
        validated_data = ApplicationSettingCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = ApplicationSetting(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@application_setting_bp.route('/<int:item_id>', methods=['PUT'])
def update_application_setting(item_id):
    with get_db() as db:
        item = db.query(ApplicationSetting).filter(ApplicationSetting.setting_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = ApplicationSettingUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@application_setting_bp.route('/', methods=['GET'])
def get_all_application_setting():
    with get_db() as db:
        items = db.query(ApplicationSetting).all()
        return jsonify([model_to_dict(i) for i in items])

@application_setting_bp.route('/<int:item_id>', methods=['GET'])
def get_application_setting(item_id):
    with get_db() as db:
        item = db.query(ApplicationSetting).filter(ApplicationSetting.setting_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@application_setting_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_application_setting(item_id):
    with get_db() as db:
        item = db.query(ApplicationSetting).filter(ApplicationSetting.setting_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200