import json
import platform

import cpuinfo
import psutil
from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import ApplicationSettings, Authentication, User
from schemas import ApplicationSettingsCreate, ApplicationSettingsUpdate
from serializer import model_to_dict

application_settings_bp = Blueprint('application_settings_bp', __name__, url_prefix='/application_settings')


def _ensure_dict(value):
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def get_system_specs():
    try:
        info = cpuinfo.get_cpu_info()
        cpu_marketing_name = info.get('brand_raw', 'Unknown CPU')
        cpu_model = platform.processor()
        logical_cores = psutil.cpu_count(logical=True)
        physical_cores = psutil.cpu_count(logical=False)

        cpu_specs = {
            "name": cpu_marketing_name,
            "model": f"{cpu_model} ({physical_cores} Cores / {logical_cores} Threads)",
            "architecture": info.get('arch', 'Unknown'),
            "hz": info.get('hz_actual_friendly', 'Unknown Speed'),
        }

        virtual_mem = psutil.virtual_memory()
        total_ram_gb = round(virtual_mem.total / (1024 ** 3), 2)

        os_name = platform.system()
        os_release = platform.release()
        os_version = platform.version()

        if os_name == "Windows":
            os_display = f"Windows {os_release} (Build {os_version})"
        else:
            os_display = f"{os_name} {os_release}"

        disk = psutil.disk_usage('/')
        total_disk_gb = round(disk.total / (1024 ** 3), 2)

        return {
            "cpu": cpu_specs,
            "ram": f"{total_ram_gb} GB",
            "os": os_display,
            "extra": {
                "architecture": platform.machine(),
                "primary_storage": f"{total_disk_gb} GB",
            },
        }
    except Exception:
        return {}


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
        payload = validated_data.dict()
        other_settings = _ensure_dict(payload.get("other_settings"))
        other_settings["system_specs"] = get_system_specs()
        payload["other_settings"] = other_settings

        new_item = ApplicationSettings(**payload)
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
        if "other_settings" in update_data:
            other_settings = _ensure_dict(update_data.get("other_settings"))
        else:
            other_settings = _ensure_dict(item.other_settings)
        other_settings["system_specs"] = get_system_specs()
        update_data["other_settings"] = other_settings

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
