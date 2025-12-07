from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db
from models import OrganizationUser
from schemas import OrganizationUserCreate, OrganizationUserUpdate
from serializer import model_to_dict

organization_user_bp = Blueprint('organization_user_bp', __name__, url_prefix='/organization_users')

@organization_user_bp.route('/', methods=['POST'])
def create_organization_user():
    try:
        # Validate request data using the Pydantic schema
        validated_data = OrganizationUserCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = OrganizationUser(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@organization_user_bp.route('/<int:item_id>', methods=['PUT'])
def update_organization_user(item_id):
    with get_db() as db:
        item = db.query(OrganizationUser).filter(OrganizationUser.org_user_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = OrganizationUserUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@organization_user_bp.route('/', methods=['GET'])
def get_all_organization_user():
    with get_db() as db:
        items = db.query(OrganizationUser).all()
        return jsonify([model_to_dict(i) for i in items])

@organization_user_bp.route('/<int:item_id>', methods=['GET'])
def get_organization_user(item_id):
    with get_db() as db:
        item = db.query(OrganizationUser).filter(OrganizationUser.org_user_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@organization_user_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_organization_user(item_id):
    with get_db() as db:
        item = db.query(OrganizationUser).filter(OrganizationUser.org_user_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200