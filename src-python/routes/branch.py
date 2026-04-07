from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from utils import get_db, get_by_id_or_uuid
from models import Branch, Organization, User, Customer, Project, InventoryItem
from schemas import BranchCreate, BranchUpdate
from serializer import model_to_dict
from datetime import datetime

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
        # Check emp_count if needed (as per prompt)
        org = db.query(Organization).filter(Organization.uuid == validated_data.organization_uuid).first()
        if org:
            current_emp_count = db.query(User).filter(User.organization_uuid == org.uuid, User.deleted_at == None).count()
            if current_emp_count >= org.emp_count:
                return jsonify({"error": "Employee limit reached. Cannot create more branches."}), 400

        # Create the SQLAlchemy model from validated data
        new_item = Branch(**validated_data.dict())
        new_item.is_dirty = True
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@branch_bp.route('/<string:item_id>', methods=['DELETE'])
def delete_branch(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Branch, Branch.branch_id, Branch.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        now = datetime.utcnow()
        item.deleted_at = now
        item.is_dirty = True

        # Cascading soft delete
        db.query(User).filter(User.branch_uuid == item.uuid).update({User.deleted_at: now, User.is_dirty: True}, synchronize_session=False)
        db.query(Customer).filter(Customer.branch_uuid == item.uuid).update({Customer.deleted_at: now, Customer.is_dirty: True}, synchronize_session=False)
        db.query(Project).filter(Project.branch_uuid == item.uuid).update({Project.deleted_at: now, Project.is_dirty: True}, synchronize_session=False)
        db.query(InventoryItem).filter(InventoryItem.branch_uuid == item.uuid).update({InventoryItem.deleted_at: now, InventoryItem.is_dirty: True}, synchronize_session=False)

        db.commit()
        return jsonify({"message": "Branch and related data deactivated successfully"}), 200

@branch_bp.route('/<string:item_id>', methods=['PUT'])
def update_branch(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Branch, Branch.branch_id, Branch.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404

        try:
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

@branch_bp.route('/<string:item_id>', methods=['GET'])
def get_branch(item_id):
    with get_db() as db:
        item = get_by_id_or_uuid(db, Branch, Branch.branch_id, Branch.uuid, item_id)
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))
