from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import Appliance, Project
from schemas import ApplianceCreate, ApplianceUpdate, ApplianceBatchCreate
from serializer import model_to_dict

appliance_bp = Blueprint('appliance_bp', __name__, url_prefix='/appliances')

@appliance_bp.route('/batch', methods=['POST'])
def create_appliances_batch():
    try:
        data = ApplianceBatchCreate(**request.json)
    except ValidationError as e:
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Find the project by its integer ID to get its UUID
        project = db.query(Project).filter(Project.project_id == data.project_id).first()
        if not project:
            return jsonify({"error": f"Project with ID {data.project_id} not found."}), 404

        project_uuid = project.uuid

        # Delete existing appliances for this project to ensure a clean slate
        db.query(Appliance).filter(Appliance.project_uuid == project_uuid).delete()

        new_appliances = []
        for appliance_data in data.appliances:
            # Create a new dictionary from the Pydantic model, excluding unset values
            payload = appliance_data.dict(exclude_unset=True)
            # Ensure the project_uuid is set correctly for the new appliance
            payload['project_uuid'] = project_uuid
            payload['is_dirty'] = True

            new_item = Appliance(**payload)
            new_appliances.append(new_item)

        if new_appliances:
            db.add_all(new_appliances)

        db.commit()

        # Refresh objects to get DB-assigned values before returning
        for item in new_appliances:
            db.refresh(item)

        return jsonify([model_to_dict(appliance) for appliance in new_appliances]), 201


@appliance_bp.route('', methods=['POST'])
def create_appliance():
    try:
        # Validate request data using the Pydantic schema
        validated_data = ApplianceCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Appliance(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@appliance_bp.route('/<int:item_id>', methods=['PUT'])
def update_appliance(item_id):
    with get_db() as db:
        item = db.query(Appliance).filter(Appliance.appliance_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
            # Validate request data
            validated_data = ApplianceUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)

        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@appliance_bp.route('/project/<string:project_uuid>', methods=['GET'])
def get_appliances_for_project(project_uuid):
    with get_db() as db:
        # Query the database for appliances that match the project_uuid
        project_appliances = db.query(Appliance).filter(Appliance.project_uuid == project_uuid).all()

        # If no appliances are found, it's not an error, just return an empty list
        return jsonify([model_to_dict(appliance) for appliance in project_appliances]), 200


@appliance_bp.route('', methods=['GET'])
def get_all_appliance():
    with get_db() as db:
        items = db.query(Appliance).all()
        return jsonify([model_to_dict(i) for i in items])

@appliance_bp.route('/<int:item_id>', methods=['GET'])
def get_appliance(item_id):
    with get_db() as db:
        item = db.query(Appliance).filter(Appliance.appliance_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@appliance_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_appliance(item_id):
    with get_db() as db:
        item = db.query(Appliance).filter(Appliance.appliance_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
