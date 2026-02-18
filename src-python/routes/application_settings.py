from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import ApplicationSettings, Authentication
from schemas import ApplicationSettingsCreate, ApplicationSettingsUpdate
from serializer import model_to_dict

application_settings_bp = Blueprint('application_settings_bp', __name__, url_prefix='/application_settings')

@application_settings_bp.route('/appliances', methods=['GET'])
def get_appliance_library():
    with get_db() as db:
        # Get current user
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "Unauthorized"}), 401
        
        app_settings = db.query(ApplicationSettings).filter(ApplicationSettings.user_uuid == auth_record.user_uuid).first()

        if app_settings and app_settings.other_settings and 'appliance_library' in app_settings.other_settings:
            return jsonify(app_settings.other_settings['appliance_library'])
        else:
            return jsonify([]), 200

@application_settings_bp.route('/', methods=['POST'])
def create_application_settings():
    try:
        # Validate request data using the Pydantic schema
        validated_data = ApplicationSettingsCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = ApplicationSettings(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@application_settings_bp.route('/<int:item_id>', methods=['PUT'])
def update_application_settings(item_id):
    with get_db() as db:
        item = db.query(ApplicationSettings).filter(ApplicationSettings.id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
            # Validate request data
            validated_data = ApplicationSettingsUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@application_settings_bp.route('/', methods=['GET'])
def get_all_application_settings():
    with get_db() as db:
        items = db.query(ApplicationSettings).all()
        return jsonify([model_to_dict(i) for i in items])

@application_settings_bp.route('/<int:item_id>', methods=['GET'])
def get_application_settings(item_id):
    with get_db() as db:
        item = db.query(ApplicationSettings).filter(ApplicationSettings.id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@application_settings_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_application_settings(item_id):
    with get_db() as db:
        item = db.query(ApplicationSettings).filter(ApplicationSettings.id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
