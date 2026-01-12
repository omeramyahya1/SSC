from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import Branch
from schemas import BranchCreate, BranchUpdate
from serializer import model_to_dict

branch_bp = Blueprint('branch_bp', __name__, url_prefix='/branches')

@branch_bp.route('/', methods=['POST'])
def create_branch():
    try:
        # Validate request data using the Pydantic schema
        validated_data = BranchCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Branch(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@branch_bp.route('/<int:item_id>', methods=['PUT'])
def update_branch(item_id):
    with get_db() as db:
        item = db.query(Branch).filter(Branch.branch_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = BranchUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@branch_bp.route('/', methods=['GET'])
def get_all_branch():
    with get_db() as db:
        items = db.query(Branch).all()
        return jsonify([model_to_dict(i) for i in items])

@branch_bp.route('/<int:item_id>', methods=['GET'])
def get_branch(item_id):
    with get_db() as db:
        item = db.query(Branch).filter(Branch.branch_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@branch_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_branch(item_id):
    with get_db() as db:
        item = db.query(Branch).filter(Branch.branch_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200
