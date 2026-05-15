from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import ApplicationSettings, Authentication, User
from schemas import ApplicationSettingsCreate, ApplicationSettingsUpdate
from serializer import model_to_dict

application_settings_bp = Blueprint('application_settings_bp', __name__, url_prefix='/application_settings')

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
        new_item.is_dirty = True
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@application_settings_bp.route('/<string:item_id>', methods=['PUT'])
def update_application_settings(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(
            db,
            ApplicationSettings,
            ApplicationSettings.application_settings_id,
            ApplicationSettings.uuid,
            item_id
        )
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

        item.is_dirty = True
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@application_settings_bp.route('/', methods=['GET'])
def get_all_application_settings():
    with get_db() as db:
        auth_record = (
        db.query(Authentication)
        .filter(Authentication.is_logged_in == True)
        .order_by(Authentication.last_active.desc())
        .first()
        )
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401

        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        items = db.query(ApplicationSettings).filter(ApplicationSettings.user_uuid == current_user.uuid).all()
        return jsonify([model_to_dict(i) for i in items])

@application_settings_bp.route('/<string:item_id>', methods=['GET'])
def get_application_settings(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(
            db,
            ApplicationSettings,
            ApplicationSettings.application_settings_id,
            ApplicationSettings.uuid,
            item_id
        )
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@application_settings_bp.route('/<string:item_id>', methods=['DELETE'])
def delete_application_settings(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(
            db,
            ApplicationSettings,
            ApplicationSettings.application_settings_id,
            ApplicationSettings.uuid,
            item_id
        )
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
