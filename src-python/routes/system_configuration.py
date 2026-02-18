from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import SystemConfiguration, Project
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

@system_configuration_bp.route('/project/<string:project_uuid>', methods=['POST'])
def save_system_configuration_for_project(project_uuid):
    with get_db() as db:
        # Use joinedload to efficiently fetch the related customer
        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        data = request.json
        config_items = data.get('config_items')  # This will be the bleResults.data

        if not config_items:
            return jsonify({"error": "config_items are required"}), 400

        total_wattage = config_items.get('metadata', {}).get('total_peak_power_w')
        if total_wattage is None:
            return jsonify({"error": "total_peak_power_w not found in config_items.metadata"}), 400

        # If an existing config is linked, update it
        if project.system_config_uuid:
            existing_config = db.query(SystemConfiguration).filter(SystemConfiguration.uuid == project.system_config_uuid).first()
            if existing_config:
                existing_config.config_items = config_items
                existing_config.total_wattage = total_wattage
                existing_config.is_dirty = True

                db.commit()
                db.refresh(existing_config)
                db.refresh(project)

                project_dict = model_to_dict(project)
                project_dict['system_config'] = model_to_dict(existing_config)
                if project.customer:
                    project_dict['customer'] = model_to_dict(project.customer)

                return jsonify(project_dict), 200

        # If no existing config, create a new one
        new_system_config = SystemConfiguration(
            config_items=config_items,
            total_wattage=total_wattage,
            is_dirty=True
        )
        db.add(new_system_config)
        db.flush()  # To get the UUID of new_system_config

        project.system_config_uuid = new_system_config.uuid
        project.is_dirty = True
        db.commit()

        db.refresh(new_system_config)
        db.refresh(project)

        project_dict = model_to_dict(project)
        project_dict['system_config'] = model_to_dict(new_system_config)
        if project.customer:
            project_dict['customer'] = model_to_dict(project.customer)

        return jsonify(project_dict), 201

@system_configuration_bp.route('/project/<string:project_uuid>', methods=['GET'])
def get_system_configuration_by_project_uuid(project_uuid):
    with get_db() as db:
        project = db.query(Project).filter(Project.uuid == project_uuid).first()
        if not project:
            return jsonify({"error": "Project not found"}), 404

        if not project.system_config_uuid:
            return jsonify({"message": "No system configuration found for this project"}), 404

        system_config = db.query(SystemConfiguration).filter(SystemConfiguration.uuid == project.system_config_uuid).first()
        if not system_config:
            return jsonify({"message": "System configuration not found"}), 404

        return jsonify(model_to_dict(system_config)), 200

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
