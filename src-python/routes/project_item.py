from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import ProjectItem
from schemas import ProjectItemCreate, ProjectItemUpdate
from serializer import model_to_dict

project_item_bp = Blueprint('project_item_bp', __name__, url_prefix='/project_items')

@project_item_bp.route('/', methods=['POST'])
def create_project_item():
    try:
        # Validate request data using the Pydantic schema
        validated_data = ProjectItemCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = ProjectItem(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@project_item_bp.route('/<int:item_id>', methods=['PUT'])
def update_project_item(item_id):
    with get_db() as db:
        item = db.query(ProjectItem).filter(ProjectItem.item_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = ProjectItemUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@project_item_bp.route('/', methods=['GET'])
def get_all_project_item():
    with get_db() as db:
        items = db.query(ProjectItem).all()
        return jsonify([model_to_dict(i) for i in items])

@project_item_bp.route('/<int:item_id>', methods=['GET'])
def get_project_item(item_id):
    with get_db() as db:
        item = db.query(ProjectItem).filter(ProjectItem.item_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@project_item_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_project_item(item_id):
    with get_db() as db:
        item = db.query(ProjectItem).filter(ProjectItem.item_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200