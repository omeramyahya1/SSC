from flask import Blueprint, request, jsonify
from pydantic import ValidationError
from sqlalchemy.orm import joinedload
from utils import get_db
from models import Project, Customer, User, Authentication
from schemas import ProjectCreate, ProjectUpdate, ProjectWithCustomerCreate
from serializer import model_to_dict

project_bp = Blueprint('project_bp', __name__, url_prefix='/projects')

@project_bp.route('/create_with_customer', methods=['POST'])
def create_project_with_customer():
    with get_db() as db:
        # 1. Get the current logged-in user
        auth_record = db.query(Authentication).filter(Authentication.is_logged_in == True).order_by(Authentication.last_active.desc()).first()
        if not auth_record:
            return jsonify({"error": "No authenticated user found. Please log in."}), 401
        
        current_user = db.query(User).filter(User.uuid == auth_record.user_uuid).first()
        if not current_user:
            return jsonify({"error": "Authenticated user not found in user table."}), 404

        # 2. Validate the incoming payload
        try:
            data = ProjectWithCustomerCreate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # 3. Create Customer and Project in a transaction
        try:
            new_customer = Customer(
                full_name=data.customer_name,
                phone_number=data.phone_number,
                email=data.email,
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(new_customer)
            db.flush()  # Use flush to get the generated UUID for the customer

            new_project = Project(
                customer_uuid=new_customer.uuid,
                status='planning',
                project_location=data.project_location,
                user_uuid=current_user.uuid,
                organization_uuid=current_user.organization_uuid,
                branch_uuid=current_user.branch_uuid,
                is_dirty=True
            )
            db.add(new_project)
            db.commit() # Commit both customer and project

            # 4. Prepare and return the response
            db.refresh(new_project)
            db.refresh(new_customer)

            project_dict = model_to_dict(new_project)
            project_dict['customer'] = model_to_dict(new_customer)

            return jsonify(project_dict), 201

        except Exception as e:
            db.rollback()
            return jsonify({"error": f"An error occurred during project creation: {str(e)}"}), 500


@project_bp.route('/', methods=['POST'])
def create_project():
    try:
        # Validate request data using the Pydantic schema
        validated_data = ProjectCreate(**request.json)
    except ValidationError as e:
        # Return a 400 Bad Request with validation errors
        return jsonify({"errors": e.errors()}), 400

    with get_db() as db:
        # Create the SQLAlchemy model from validated data
        new_item = Project(**validated_data.dict())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return jsonify(model_to_dict(new_item)), 201

@project_bp.route('/<int:item_id>', methods=['PUT'])
def update_project(item_id):
    with get_db() as db:
        item = db.query(Project).filter(Project.project_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
            
        try:
            # Validate request data
            validated_data = ProjectUpdate(**request.json)
        except ValidationError as e:
            return jsonify({"errors": e.errors()}), 400

        # Use exclude_unset=True to only update fields that were actually provided
        update_data = validated_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(item, key, value)
        
        db.commit()
        db.refresh(item)
        return jsonify(model_to_dict(item))

@project_bp.route('/', methods=['GET'])
def get_all_project():
    with get_db() as db:
        items = db.query(Project).options(joinedload(Project.customer)).order_by(Project.created_at.desc()).all()
        results = []
        for p in items:
            project_dict = model_to_dict(p)
            if p.customer:
                project_dict['customer'] = model_to_dict(p.customer)
            else:
                project_dict['customer'] = None
            results.append(project_dict)
        return jsonify(results)

@project_bp.route('/<int:item_id>', methods=['GET'])
def get_project(item_id):
    with get_db() as db:
        item = db.query(Project).filter(Project.project_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        return jsonify(model_to_dict(item))

@project_bp.route('/<int:item_id>', methods=['DELETE'])
def delete_project(item_id):
    with get_db() as db:
        item = db.query(Project).filter(Project.project_id == item_id).first()
        if not item:
            return jsonify({"error": "Not found"}), 404
        db.delete(item)
        db.commit()
        return jsonify({"message": "Deleted successfully"}), 200